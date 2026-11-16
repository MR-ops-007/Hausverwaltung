/** Explicit schema preparation only; never invoked by reads or writes. */
function prepareContractSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Vertraege');
  if (!sheet) throw new Error('Vertraege fehlt.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const missing = contractService.fields.filter(field => headers.indexOf(field) === -1);
  if (sheet.getMaxColumns() < headers.length + missing.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length + missing.length - sheet.getMaxColumns());
  }
  if (missing.length) sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  missing.filter(field => field === 'index_basis_monat').forEach(field => {
    sheet.getRange(2, headers.length + missing.indexOf(field) + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  if (!ss.getSheetByName('Mietanpassungen')) {
    ss.insertSheet('Mietanpassungen').getRange(1, 1, 1, contractService.historyHeaders.length)
      .setValues([contractService.historyHeaders]);
  }
  if (!ss.getSheetByName('MieterwechselProtokoll')) {
    ss.insertSheet('MieterwechselProtokoll').getRange(1, 1, 1, contractService.tenantChangeProtocolHeaders.length)
      .setValues([contractService.tenantChangeProtocolHeaders]);
  }
  return { addedHeaders: missing };
}

function contractWriteFailure(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalizeTenantChangeParties(parties) {
  return parties.map((party, index) => ({
    person_id: String(party && party.person_id || '').trim(),
    rolle: String(party && party.rolle || '').trim() || (index === 0 ? 'Hauptmieter' : 'Mitmieter'),
    ordnet: Number(party && party.ordnet) || index + 1,
    vollmacht: party && (party.vollmacht === true || String(party.vollmacht).toLowerCase() === 'true')
  })).sort((a, b) => `${a.person_id}|${a.rolle}|${a.ordnet}`.localeCompare(`${b.person_id}|${b.rolle}|${b.ordnet}`));
}

function tenantChangeRequestFingerprint(contract, parties) {
  const stableContract = {};
  contractService.tenantChangeFields.forEach(field => {
    if (field !== 'aktiv' && field !== 'kaution_ist') {
      stableContract[field] = contract[field] === undefined ? '' : contract[field];
    }
  });
  return contractService.snapshot({ contract: stableContract, parteien: parties });
}

/**
 * Creates a new contract and closes its predecessor as one locked write.
 * The surrounding doPost lock prevents two changes for the same unit from
 * interleaving; the local rollback covers failures while appending rows.
 */
function handleTenantChange(ss, payload) {
  const configuredToken = PropertiesService.getScriptProperties().getProperty('CONTRACT_WRITE_TOKEN');
  if (!configuredToken || payload.token !== configuredToken) {
    throw contractWriteFailure('CONTRACT_WRITE_FORBIDDEN', 'Vertrags-Schreibzugriff nicht freigeschaltet.');
  }
  const contractSheet = ss.getSheetByName('Vertraege');
  const partySheet = ss.getSheetByName('Vertragsparteien');
  const peopleSheet = ss.getSheetByName('Personen');
  const unitSheet = ss.getSheetByName('Einheiten');
  const protocolSheet = ss.getSheetByName('MieterwechselProtokoll');
  if (!contractSheet || !partySheet || !peopleSheet || !unitSheet || !protocolSheet) {
    throw contractWriteFailure('TENANT_CHANGE_SCHEMA_MISSING', 'Mieterwechsel-Schema ist nicht vollständig vorbereitet.');
  }

  const contractRows = contractSheet.getDataRange().getValues();
  if (!contractRows.length) throw contractWriteFailure('TENANT_CHANGE_SCHEMA_MISSING', 'Vertraege enthält keine Kopfzeile.');
  const contractHeaders = contractRows[0].map(String);
  const contractRecords = contractRows.slice(1).map(row => {
    const item = {};
    contractHeaders.forEach((header, index) => { item[header] = row[index]; });
    return item;
  });
  const oldId = String(payload.vertrag_id || '').trim();
  const input = payload.data || {};
  const newId = String(input.vertrag_id || '').trim();
  if (!oldId || !newId) throw contractWriteFailure('TENANT_CHANGE_ID_MISSING', 'Alte und neue Vertrags-ID sind erforderlich.');
  if (oldId === newId) throw contractWriteFailure('TENANT_CHANGE_ID_CONFLICT', 'Die neue Vertrags-ID muss sich von der alten unterscheiden.');

  const oldMatches = contractRecords.map((item, index) => String(item.vertrag_id) === oldId ? index : -1).filter(index => index >= 0);
  if (oldMatches.length !== 1) throw contractWriteFailure('TENANT_CHANGE_SOURCE_NOT_UNIQUE', 'Der bisherige Vertrag ist nicht eindeutig gefunden worden.');
  const oldIndex = oldMatches[0];
  const current = contractRecords[oldIndex];
  ['vertrag_id', 'einheit_id', 'start_datum', 'end_datum', 'aktiv'].forEach(header => {
    if (contractHeaders.indexOf(header) < 0) throw contractWriteFailure('TENANT_CHANGE_SCHEMA_MISSING', 'Vertraege-Spalte fehlt: ' + header);
  });
  const protocolRows = protocolSheet.getDataRange().getValues();
  if (!protocolRows.length) throw contractWriteFailure('TENANT_CHANGE_SCHEMA_MISSING', 'MieterwechselProtokoll enthält keine Kopfzeile.');
  const protocolHeaders = protocolRows[0].map(String);
  contractService.tenantChangeProtocolHeaders.forEach(header => {
    if (protocolHeaders.indexOf(header) < 0) throw contractWriteFailure('TENANT_CHANGE_SCHEMA_MISSING', 'MieterwechselProtokoll-Spalte fehlt: ' + header);
  });
  const protocolRecords = protocolRows.slice(1).map(row => {
    const item = {};
    protocolHeaders.forEach((header, index) => { item[header] = row[index]; });
    return item;
  });
  const newMatches = contractRecords.map((item, index) => String(item.vertrag_id) === newId ? index : -1).filter(index => index >= 0);

  // A completed request is safe to replay. A different payload with the same
  // new ID is a conflict and must never create a second historical branch.
  if (newMatches.length) {
    if (newMatches.length !== 1) throw contractWriteFailure('TENANT_CHANGE_ID_CONFLICT', 'Die neue Vertrags-ID ist nicht eindeutig.');
    const existing = contractRecords[newMatches[0]];
    let candidate;
    try {
      // The predecessor is closed after the first write. Reset that derived
      // field so a retry with omitted end_datum has the same input defaults.
      candidate = contractService.prepareTenantChange(Object.assign({}, current, { end_datum: '' }), input);
    } catch (error) {
      throw contractWriteFailure('TENANT_CHANGE_ID_CONFLICT', 'Die neue Vertrags-ID ist bereits mit ungueltigen oder abweichenden Daten gespeichert.');
    }
    const dateFields = ['start_datum', 'end_datum', 'letzte_anpassung'];
    const compareFields = ['einheit_id', 'hauptperson_id', 'start_datum', 'end_datum', 'mietmodell',
      'erhoehungs_typ', 'letzte_anpassung', 'soll_kaltmiete', 'soll_nebenkosten', 'soll_gesamt',
      'kaution_soll', 'kaution_ist', 'zahlungsziel_typ', 'zahlungsziel_wert', 'vertragsdokument_url',
      'sondervereinbarungen_url', 'vertrag_hinweis', 'nk_betriebskosten', 'nk_heizung_warmwasser',
      'index_basis_monat', 'index_basis_wert', 'index_reihe'];
    const normalize = (field, value) => {
      if (contractService.blank(value)) return '';
      if (dateFields.indexOf(field) >= 0) {
        try { return contractService.iso(contractService.date(value)); } catch (error) { return String(value).trim(); }
      }
      return value;
    };
    const sameContract = compareFields.every(field => contractService.same(normalize(field, existing[field]), normalize(field, candidate[field])));
    const requestedParties = Array.isArray(payload.parteien) ? payload.parteien : [{
      person_id: candidate.hauptperson_id, rolle: 'Hauptmieter', ordnet: 1, vollmacht: false
    }];
    const partySignature = normalizeTenantChangeParties(requestedParties);
    const requestFingerprint = tenantChangeRequestFingerprint(candidate, partySignature);
    const protocol = protocolRecords.find(row => String(row.vertrag_neu_id) === newId);
    const sameProtocol = protocol && String(protocol.request_fingerprint) === requestFingerprint;
    const existingPartyRows = getSheetData(partySheet).filter(row => String(row.vertrag_id) === newId);
    const sameParties = JSON.stringify(normalizeTenantChangeParties(existingPartyRows)) === JSON.stringify(partySignature);
    if (sameProtocol || (!protocol && sameContract && sameParties)) {
      return { status: 'success', message: 'Mieterwechsel war bereits gespeichert.', bereits_vorhanden: true,
        vertrag_alt: current, vertrag_neu: existing };
    }
    throw contractWriteFailure('TENANT_CHANGE_ID_CONFLICT', 'Die neue Vertrags-ID ist bereits mit anderen Daten gespeichert.');
  }

  if (payload.erwarteter_stand !== contractService.snapshot(current)) {
    throw contractWriteFailure('TENANT_CHANGE_STALE', 'Der bisherige Vertrag wurde inzwischen geändert. Bitte neu laden.');
  }
  if (!contractService.isCurrentlyActive(current)) {
    throw contractWriteFailure('TENANT_CHANGE_SOURCE_INACTIVE', 'Der bisherige Vertrag ist nicht aktiv.');
  }

  let next;
  try {
    next = contractService.prepareTenantChange(current, input);
  } catch (error) {
    throw contractWriteFailure('TENANT_CHANGE_INVALID', String(error.message || error));
  }

  const newStart = contractService.iso(contractService.date(next.start_datum));
  let oldStart;
  try {
    oldStart = contractService.iso(contractService.date(current.start_datum));
  } catch (error) {
    throw contractWriteFailure('TENANT_CHANGE_SOURCE_INVALID', 'Der bisherige Vertrag hat kein gültiges Startdatum.');
  }
  let oldEnd = '';
  try {
    oldEnd = contractService.blank(current.end_datum) ? '' : contractService.iso(contractService.date(current.end_datum));
  } catch (error) {
    throw contractWriteFailure('TENANT_CHANGE_SOURCE_INVALID', 'Der bisherige Vertrag hat ein ungültiges Enddatum.');
  }
  if (oldEnd && newStart <= oldEnd) {
    throw contractWriteFailure('CONTRACT_PERIOD_OVERLAP', 'Der neue Mietbeginn überschneidet sich mit dem bisherigen Vertragsende.');
  }
  if (String(next.einheit_id) !== String(current.einheit_id)) {
    throw contractWriteFailure('TENANT_CHANGE_UNIT_MISMATCH', 'Einheit des neuen Vertrags stimmt nicht mit dem Vorgänger überein.');
  }
  const knownUnits = getSheetData(unitSheet);
  if (!knownUnits.some(unit => String(unit.einheit_id).trim() === String(next.einheit_id).trim())) {
    throw contractWriteFailure('TENANT_CHANGE_UNIT_UNKNOWN', 'Die Einheit des Mieterwechsels ist nicht bekannt.');
  }

  const closedEnd = oldEnd || contractService.iso(new Date(contractService.date(newStart).getTime() - 24 * 60 * 60 * 1000));
  const closed = Object.assign({}, current, {
    end_datum: closedEnd,
    aktiv: contractService.isCurrentlyActive({ start_datum: current.start_datum, end_datum: closedEnd, aktiv: current.aktiv })
  });
  const proposed = contractRecords.map((item, index) => index === oldIndex ? closed : item).concat([next]);
  const periodResult = contractService.validateContractPeriods(proposed.filter(item => String(item.einheit_id) === String(current.einheit_id)));
  if (!periodResult.valid) {
    throw contractWriteFailure('CONTRACT_PERIOD_INVALID', 'Der Mieterwechsel erzeugt ungültige Vertragszeiträume.', periodResult.errors);
  }

  const people = getSheetData(peopleSheet);
  const knownPeople = {};
  people.forEach(person => { knownPeople[String(person.person_id).trim()] = true; });
  const requestedParties = Array.isArray(payload.parteien) ? payload.parteien : [{
    person_id: next.hauptperson_id, rolle: 'Hauptmieter', ordnet: 1, vollmacht: false
  }];
  const requestFingerprint = tenantChangeRequestFingerprint(next, normalizeTenantChangeParties(requestedParties));
  if (!requestedParties.length) throw contractWriteFailure('TENANT_CHANGE_PARTIES_MISSING', 'Mindestens eine Vertragspartei ist erforderlich.');
  const parties = requestedParties.map((party, index) => {
    const personId = String(party && party.person_id || '').trim();
    const role = String(party && party.rolle || '').trim() || (index === 0 ? 'Hauptmieter' : 'Mitmieter');
    if (!personId || !knownPeople[personId]) throw contractWriteFailure('TENANT_CHANGE_PERSON_UNKNOWN', 'Vertragspartei verweist auf eine unbekannte Person.');
    return { vertrag_id: newId, person_id: personId, rolle: role, ordnet: party.ordnet || index + 1, vollmacht: party.vollmacht === true || String(party.vollmacht).toLowerCase() === 'true' };
  });
  const partyPersonIds = {};
  parties.forEach(party => {
    if (partyPersonIds[party.person_id]) {
      throw contractWriteFailure('TENANT_CHANGE_PARTIES_DUPLICATE', 'Eine Person darf im neuen Vertrag nur einmal als Vertragspartei vorkommen.');
    }
    partyPersonIds[party.person_id] = true;
  });
  if (!parties.some(party => party.person_id === String(next.hauptperson_id) && party.rolle.toLowerCase() === 'hauptmieter')) {
    throw contractWriteFailure('TENANT_CHANGE_PARTIES_INVALID', 'Die Hauptperson muss als Hauptmieter verknüpft werden.');
  }

  const partyRows = partySheet.getDataRange().getValues();
  if (!partyRows.length) throw contractWriteFailure('TENANT_CHANGE_SCHEMA_MISSING', 'Vertragsparteien enthält keine Kopfzeile.');
  const partyHeaders = partyRows[0].map(String);
  ['vertrag_id', 'person_id', 'rolle'].forEach(header => {
    if (partyHeaders.indexOf(header) < 0) throw contractWriteFailure('TENANT_CHANGE_SCHEMA_MISSING', 'Vertragsparteien-Spalte fehlt: ' + header);
  });
  const contractRowNumber = contractSheet.getLastRow() + 1;
  const partyRowNumber = partySheet.getLastRow() + 1;
  const protocolRowNumber = protocolSheet.getLastRow() + 1;
  const oldEndCell = contractSheet.getRange(oldIndex + 2, contractHeaders.indexOf('end_datum') + 1);
  const oldActiveCell = contractSheet.getRange(oldIndex + 2, contractHeaders.indexOf('aktiv') + 1);
  const previous = {
    end: { value: oldEndCell.getValue(), formula: oldEndCell.getFormula ? oldEndCell.getFormula() : '' },
    active: { value: oldActiveCell.getValue(), formula: oldActiveCell.getFormula ? oldActiveCell.getFormula() : '' }
  };
  const contractValues = contractHeaders.map(header => next[header] === undefined ? '' : next[header]);
  const partyValues = parties.map(party => partyHeaders.map(header => party[header] === undefined ? '' : party[header]));
  const protocolRecord = {
    mieterwechsel_id: Utilities.getUuid(), vertrag_alt_id: oldId, vertrag_neu_id: newId,
    request_fingerprint: requestFingerprint, erfasst_am: new Date().toISOString()
  };
  const protocolValues = protocolHeaders.map(header => protocolRecord[header] === undefined ? '' : protocolRecord[header]);
  try {
    oldEndCell.setValue(closed.end_datum);
    oldActiveCell.setValue(closed.aktiv);
    contractSheet.getRange(contractRowNumber, 1, 1, contractHeaders.length).setValues([contractValues]);
    partySheet.getRange(partyRowNumber, 1, partyValues.length, partyHeaders.length).setValues(partyValues);
    protocolSheet.getRange(protocolRowNumber, 1, 1, protocolHeaders.length).setValues([protocolValues]);
    SpreadsheetApp.flush();
  } catch (error) {
    oldEndCell.setValue(previous.end.formula || previous.end.value);
    oldActiveCell.setValue(previous.active.formula || previous.active.value);
    contractSheet.getRange(contractRowNumber, 1, 1, contractHeaders.length).clearContent();
    partySheet.getRange(partyRowNumber, 1, partyValues.length, partyHeaders.length).clearContent();
    protocolSheet.getRange(protocolRowNumber, 1, 1, protocolHeaders.length).clearContent();
    throw error;
  }

  let viewWarning = '';
  try { updateAktiveMieterView(); } catch (error) { viewWarning = error && error.message ? error.message : String(error); }
  const warnings = periodResult.warnings || [];
  return { status: 'success', message: 'Mieterwechsel gespeichert.', vertrag_alt: closed, vertrag_neu: next,
    parteien: parties, warnings, view_warning: viewWarning };
}

function handleContractWrite(ss, payload) {
  const configuredToken = PropertiesService.getScriptProperties().getProperty('CONTRACT_WRITE_TOKEN');
  if (!configuredToken || payload.token !== configuredToken) throw new Error('Vertrags-Schreibzugriff nicht freigeschaltet.');
  const sheet = ss.getSheetByName('Vertraege');
  const history = ss.getSheetByName('Mietanpassungen');
  if (!sheet || !history) throw new Error('Vertragsschema nicht vorbereitet.');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(String);
  const idColumn = headers.indexOf('vertrag_id');
  const matches = rows.map((row, index) => index > 0 && String(row[idColumn]) === String(payload.vertrag_id) ? index : -1).filter(index => index > 0);
  if (matches.length !== 1) throw new Error('Vertrag nicht eindeutig gefunden.');
  const rowIndex = matches[0];
  const current = {};
  headers.forEach((header, index) => { current[header] = rows[rowIndex][index]; });
  if (payload.erwarteter_stand !== contractService.snapshot(current)) throw new Error('Vertrag wurde inzwischen geaendert. Bitte neu laden.');
  const input = payload.data || {};
  const isIndex = payload.typ === 'INDEX_ANWENDEN';
  const unit = getSheetData(ss.getSheetByName('Einheiten')).find(item => String(item.einheit_id) === String(current.einheit_id));
  const patch = isIndex
    ? contractService.prepareIndex(current, input, unit)
    : contractService.preparePatch(current, input);
  if (isIndex && !contractService.isCurrentlyActive(current)) throw new Error('Vertrag ist nicht aktiv.');
  const rentChanged = String(patch.soll_kaltmiete) !== String(current.soll_kaltmiete);
  if (!isIndex && rentChanged && current.soll_kaltmiete !== '' && current.soll_kaltmiete != null) {
    patch.letzte_anpassung = contractService.iso(contractService.date(new Date()));
  }
  // Write real changes only; a save without changes must not create a history entry.
  Object.keys(patch).forEach(key => { if (contractService.same(patch[key], current[key])) delete patch[key]; });
  if (!Object.keys(patch).length) throw new Error('Keine Aenderungen zu speichern.');
  const keys = Object.keys(patch);
  keys.forEach(key => { if (headers.indexOf(key) < 0) throw new Error('Vertragsspalte fehlt: ' + key); });
  const historyHeaders = history.getRange(1, 1, 1, history.getLastColumn()).getValues()[0];
  contractService.historyHeaders.forEach(header => {
    if (!historyHeaders.includes(header)) throw new Error('Historienspalte fehlt: ' + header);
  });
  const next = Object.assign({}, current, patch);
  const entry = {
    anpassung_id: Utilities.getUuid(), vertrag_id: current.vertrag_id,
    art: isIndex ? 'INDEX' : 'STAMMDATEN', erfasst_am: new Date().toISOString(),
    wirksam_ab: isIndex ? input.wirksam_ab : '', zugang_datum: isIndex ? input.zugang_datum : '',
    erklaerung_url: isIndex ? input.erklaerung_url : '',
    index_neu_monat: isIndex ? input.index_neu_monat : '', index_neu_wert: isIndex ? input.index_neu_wert : '',
    index_reihe: next.index_reihe || '', vorher_json: contractService.snapshot(current), nachher_json: contractService.snapshot(next)
  };
  // Sheets has no transactions. Restore only touched cells (including formulas) on failure.
  const previousCells = keys.map(key => {
    const cell = sheet.getRange(rowIndex + 1, headers.indexOf(key) + 1);
    return { cell: cell, value: cell.getValue(), formula: cell.getFormula() };
  });
  const historyRow = history.getLastRow() + 1;
  try {
    keys.forEach((key, index) => {
      const value = patch[key];
      previousCells[index].cell.setValue(typeof value === 'string' && value.startsWith('=') ? "'" + value : value);
    });
    history.getRange(historyRow, 1, 1, historyHeaders.length).setValues([historyHeaders.map(header => entry[header] === undefined ? '' : entry[header])]);
    SpreadsheetApp.flush();
  } catch (error) {
    previousCells.forEach(previous => { previous.cell.setValue(previous.formula || previous.value); });
    history.getRange(historyRow, 1, 1, historyHeaders.length).clearContent();
    throw error;
  }
  let viewWarning = '';
  try { updateAktiveMieterView(); } catch (error) { viewWarning = error && error.message ? error.message : String(error); }
  return { status: 'success', vertrag: next, anpassung: entry, view_warning: viewWarning };
}

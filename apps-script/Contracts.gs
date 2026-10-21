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
  return { addedHeaders: missing };
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
  if (isIndex && !(current.aktiv === true || String(current.aktiv).toLowerCase() === 'true')) throw new Error('Vertrag ist nicht aktiv.');
  const rentChanged = String(patch.soll_kaltmiete) !== String(current.soll_kaltmiete);
  if (!isIndex && rentChanged && current.soll_kaltmiete !== '' && current.soll_kaltmiete != null) {
    patch.letzte_anpassung = contractService.iso(contractService.date(new Date()));
  }
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
  try { updateAktiveMieterView(); } catch (error) { viewWarning = String(error); }
  return { status: 'success', vertrag: next, anpassung: entry, view_warning: viewWarning };
}

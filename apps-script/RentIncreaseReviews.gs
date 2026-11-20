const RENT_INCREASE_REVIEW_SHEET_NAME = 'MieterhöhungsPrüfungen';

function rentIncreaseReviewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function rentIncreaseReviewDate(value) {
  return Utilities.formatDate(value, 'Europe/Berlin', 'yyyy-MM-dd');
}

function rentIncreaseReviewTimestamp(value) {
  return Utilities.formatDate(value, 'Europe/Berlin', 'yyyy-MM-dd HH:mm:ss');
}

function addRentIncreaseReviewMonths(dateText, months) {
  const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw rentIncreaseReviewError('RENT_REVIEW_DATE_INVALID', 'Wiedervorlage konnte nicht berechnet werden.');
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const target = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return [target.getUTCFullYear(), String(target.getUTCMonth() + 1).padStart(2, '0'), String(safeDay).padStart(2, '0')].join('-');
}

function normalizeRentIncreaseReviewResurface(value, completedDate, now) {
  const text = String(value || '').trim();
  if (!text) return addRentIncreaseReviewMonths(completedDate, 12);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw rentIncreaseReviewError('RENT_REVIEW_DATE_INVALID', 'Wiedervorlage muss ein gültiges Datum sein.');
  }
  const candidate = new Date(text + 'T00:00:00Z');
  if (!Number.isFinite(candidate.getTime()) || rentIncreaseReviewDate(candidate) !== text) {
    throw rentIncreaseReviewError('RENT_REVIEW_DATE_INVALID', 'Wiedervorlage muss ein gültiges Kalenderdatum sein.');
  }
  const today = rentIncreaseReviewDate(now);
  if (text < today) {
    throw rentIncreaseReviewError('RENT_REVIEW_DATE_INVALID', 'Wiedervorlage darf nicht in der Vergangenheit liegen.');
  }
  return text;
}

function rentIncreaseReviewSheet(ss) {
  const sheet = ss.getSheetByName(RENT_INCREASE_REVIEW_SHEET_NAME);
  if (!sheet) throw rentIncreaseReviewError('RENT_REVIEW_SCHEMA_MISSING', 'Mieterhöhungsprüfungen sind im Backend noch nicht eingerichtet.');
  const rows = sheet.getDataRange().getValues();
  if (!rows.length) throw rentIncreaseReviewError('RENT_REVIEW_SCHEMA_MISSING', 'MieterhöhungsPrüfungen enthält keine Kopfzeile.');
  const headers = rows[0].map(String);
  contractService.rentIncreaseReviewHeaders.forEach(header => {
    if (headers.indexOf(header) < 0) throw rentIncreaseReviewError('RENT_REVIEW_SCHEMA_MISSING', 'Spalte fehlt: ' + header);
  });
  return { sheet, headers, rows };
}

function handleRentIncreaseReviewWrite(ss, payload, principal) {
  if (!principal || ['admin', 'erfassen'].indexOf(principal.role) < 0) {
    throw rentIncreaseReviewError('FORBIDDEN', 'Dieser Prüfstatus ist für das angemeldete Gerät nicht freigegeben.');
  }
  const contractId = String(payload.vertrag_id || '').trim();
  const signature = String(payload.signatur || '').trim();
  const action = String(payload.aktion || 'ABSCHLIESSEN').trim().toUpperCase();
  if (!contractId) throw rentIncreaseReviewError('RENT_REVIEW_CONTRACT_MISSING', 'Vertrag für Prüfabschluss fehlt.');
  if (!['ABSCHLIESSEN', 'WIEDER_OEFFNEN'].includes(action)) {
    throw rentIncreaseReviewError('RENT_REVIEW_ACTION_INVALID', 'Unbekannte Aktion für den Prüfstatus.');
  }
  if (action === 'ABSCHLIESSEN' && !signature) {
    throw rentIncreaseReviewError('RENT_REVIEW_SIGNATURE_MISSING', 'Die Prüfsignatur fehlt.');
  }

  const prepared = rentIncreaseReviewSheet(ss);
  const id = 'VERTRAG:' + contractId;
  const now = new Date();
  const completed = action === 'ABSCHLIESSEN';
  const completedDate = completed ? rentIncreaseReviewDate(now) : '';
  const record = {
    pruefung_id: id,
    vertrag_id: contractId,
    signatur: completed ? signature : '',
    status: completed ? 'ERLEDIGT' : 'OFFEN',
    erledigt_am: completed ? rentIncreaseReviewTimestamp(now) : '',
    wiedervorlage_ab: completed ? normalizeRentIncreaseReviewResurface(payload.wiedervorlage_ab, completedDate, now) : '',
    erfasst_von: principal ? String(principal.label || principal.id || '') : '',
    notiz: String(payload.notiz || '').trim().slice(0, 500),
    aktualisiert_am: rentIncreaseReviewTimestamp(now)
  };
  const rowIndex = prepared.rows.findIndex((row, index) => index > 0
    && String(row[prepared.headers.indexOf('pruefung_id')]).trim() === id);
  if (rowIndex >= 0) {
    const existing = {};
    prepared.headers.forEach((header, index) => { existing[header] = prepared.rows[rowIndex][index]; });
    const sameCompletion = completed && existing.status === 'ERLEDIGT'
      && String(existing.signatur || '') === record.signatur
      && String(existing.notiz || '') === record.notiz
      && String(existing.wiedervorlage_ab || '') === record.wiedervorlage_ab;
    const sameReopen = !completed && existing.status === 'OFFEN';
    if (sameCompletion || sameReopen) {
      return {
        status: 'success',
        message: completed ? 'Mieterhöhungsprüfung war bereits gespeichert.' : 'Mieterhöhungsprüfung ist bereits offen.',
        bereits_vorhanden: true,
        review: existing
      };
    }
  }
  const values = prepared.headers.map(header => record[header] === undefined ? '' : record[header]);
  if (rowIndex >= 0) {
    prepared.sheet.getRange(rowIndex + 1, 1, 1, prepared.headers.length).setValues([values]);
  } else {
    prepared.sheet.appendRow(values);
  }
  SpreadsheetApp.flush();
  return {
    status: 'success',
    message: completed ? 'Mieterhöhungsprüfung gespeichert.' : 'Mieterhöhungsprüfung wieder geöffnet.',
    bereits_vorhanden: false,
    review: record
  };
}

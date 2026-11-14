/** Explicit payment schema preparation; never invoked by reads or writes. */
function preparePaymentSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Zahlungen');
  if (!sheet) throw new Error('Zahlungen fehlt.');
  const required = ['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id'];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(value => String(value).trim());
  const normalizedHeaders = headers.map(header => header.toLowerCase());
  const missing = required.filter(field => !normalizedHeaders.includes(field));
  if (sheet.getMaxColumns() < headers.length + missing.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length + missing.length - sheet.getMaxColumns());
  }
  if (missing.length) sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  const existingMonthColumn = normalizedHeaders.indexOf('mietmonat');
  const addedMonthIndex = missing.indexOf('mietmonat');
  const monthColumn = existingMonthColumn >= 0
    ? existingMonthColumn
    : addedMonthIndex >= 0
      ? headers.length + addedMonthIndex
      : -1;
  const rowCount = Math.max(0, Number(sheet.getMaxRows ? sheet.getMaxRows() : 0) - 1);
  if (monthColumn >= 0 && rowCount > 0) {
    const monthRange = sheet.getRange(2, monthColumn + 1, rowCount, 1);
    if (monthRange && typeof monthRange.setNumberFormat === 'function') monthRange.setNumberFormat('@');
  }
  return { addedHeaders: missing };
}

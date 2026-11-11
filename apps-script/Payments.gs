/** Explicit payment schema preparation; never invoked by reads or writes. */
function preparePaymentSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Zahlungen');
  if (!sheet) throw new Error('Zahlungen fehlt.');
  const required = ['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id'];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const missing = required.filter(field => !headers.includes(field));
  if (sheet.getMaxColumns() < headers.length + missing.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length + missing.length - sheet.getMaxColumns());
  }
  if (missing.length) sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  return { addedHeaders: missing };
}

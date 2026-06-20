/**
 * HAUSVERWALTUNG - BACKEND (v4.1 - VOLLSTÄNDIG)
 */
function sendJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  if (!e || !e.postData) return sendJSON({ status: "error", message: "Keine Daten" });
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); 
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const targetSheet = (payload.typ === "ZAHLUNG") ? "Zahlungen" : "Zaehlerstaende";
    const sheet = ss.getSheetByName(targetSheet);
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
    let items = Array.isArray(payload.data) ? payload.data : [payload.data];
    
    items.forEach(item => {
      sheet.appendRow(headers.map(h => item[h] !== undefined ? item[h] : ""));
    });

    // WICHTIG: Cache-Update nach jeder Datenänderung
    updateAktiveMieterView();
    
    return sendJSON({ status: "success", message: "Daten verarbeitet und View aktualisiert" });
  } catch (err) {
    return sendJSON({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const param = e ? e.parameter : {};
  
  if (param.view === "dashboard") {
    const sheetView = ss.getSheetByName("_view_aktive_mieter");
    return sendJSON({ "_view_aktive_mieter": sheetView ? getSheetData(sheetView) : [] });
  }
  
  const data = {};
  ss.getSheets().forEach(s => {
    const name = s.getName();
    if (!name.startsWith("OLD_")) data[name] = getSheetData(s);
  });
  return sendJSON(data);
}

function getSheetData(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const keys = rows[0].map(k => String(k).trim());
  return rows.slice(1).map(row => {
    let obj = {};
    keys.forEach((k, i) => obj[k] = row[i]);
    return obj;
  });
}

/**
 * Kernfunktion für die Performance-View (Caching-Logik)
 */
function updateAktiveMieterView() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const getSheet = (name) => ss.getSheetByName(name);

  const sEinheiten = getSheet("Einheiten");
  const sVertraege = getSheet("Vertraege");
  const sPersonen = getSheet("Personen");
  const sParteien = getSheet("Vertragsparteien");
  const sView = getSheet("_view_aktive_mieter");
  
  if (!sEinheiten || !sVertraege || !sPersonen || !sParteien || !sView) return;

  const einheiten = getSheetData(sEinheiten);
  const vertraege = getSheetData(sVertraege);
  const personen = getSheetData(sPersonen);
  const parteien = getSheetData(sParteien);

  const personenMap = {};
  personen.forEach(p => personenMap[String(p.person_id).trim()] = `${p.name || ''}, ${p.vorname || ''}`);

  const parteienMap = {};
  parteien.forEach(part => {
    if (String(part.rolle).toLowerCase() === "hauptmieter") {
      const vId = String(part.vertrag_id);
      if (!parteienMap[vId]) parteienMap[vId] = [];
      parteienMap[vId].push(personenMap[String(part.person_id).trim()] || "Unbekannt");
    }
  });

  const output = [["einheit_id", "vertrag_id", "mieter_name", "start_datum", "soll_gesamt"]];
  
  einheiten.forEach(e => {
    const v = vertraege.find(v => String(v.einheit_id) === String(e.einheit_id) && String(v.aktiv) === "true");
    if (v) {
      const mieter = (parteienMap[String(v.vertrag_id)] || ["Leerstand"]).join(" / ");
      output.push([e.einheit_id, v.vertrag_id, mieter, v.start_datum, v.soll_gesamt]);
    } else {
      output.push([e.einheit_id, "", "Leerstand", "", 0]);
    }
  });

  sView.clearContents();
  if (output.length > 0) {
    sView.getRange(1, 1, output.length, output[0].length).setValues(output);
  }
}
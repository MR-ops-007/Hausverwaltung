/**
 * KORRIGIERTE MIGRATION DER HISTORISCHEN VERBRAUCHSDATEN (Version 2.2)
 * Fixes: Spaltendreher behoben, saubere IDs, automatische chronologische Sortierung für Menschen.
 */
function migrateOldData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var oldSheet = ss.getSheetByName("OLD_Verbrauchsdaten");
  var staendeSheet = ss.getSheetByName("Zaehlerstaende");
  
  if (!oldSheet || !staendeSheet) {
    throw new Error("Fehler: Bitte stellen Sie sicher, dass die Blätter 'OLD_Verbrauchsdaten' und 'Zaehlerstaende' existieren.");
  }
  
  var oldData = oldSheet.getDataRange().getValues();
  var headers = oldData[0]; // Das sind die Datums-Spalten ab Index 3
  
  var staendeRows = [];
  
  Logger.log("Starte korrigierte Migration der Zählerstände...");
  
  for (var i = 1; i < oldData.length; i++) {
    var row = oldData[i];
    var kategorie = String(row[0]).trim();
    var bereich = String(row[1]).trim();
    
    if (!bereich || bereich === "undefined" || bereich === "NaN" || bereich === "") continue;
    
    // Zähler-Typ ermitteln
    var typ = "";
    if (kategorie.includes("Strom")) {
      typ = bereich.toLowerCase().includes("nt") ? "strom_nt_kwh" : "strom_ht_kwh";
    } else if (kategorie.includes("Kaltwasser") || kategorie.includes("KW")) {
      typ = "kaltwasser_m3";
    } else if (kategorie.includes("Warmwasser") || kategorie.includes("WW")) {
      typ = "warmwasser_m3";
    } else if (kategorie.includes("Heizung")) {
      if (bereich.includes("cm") || bereich.includes("Liter")) typ = "oel_stand_l";
      else continue;
    } else {
      continue; 
    }
    
    // Identische ID-Generierung wie im ersten Schritt
    var safeBereich = bereich.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    var zaehlerId = "Z_" + typ.toUpperCase() + "_" + safeBereich;
    
    // Alle Datumsspalten durchgehen
    for (var j = 3; j < headers.length; j++) {
      var datumStr = headers[j];
      if (!datumStr || datumStr === "Anmerkungen" || String(datumStr).trim() === "") continue;
      
      var wertRaw = row[j];
      if (wertRaw === "" || wertRaw === null || wertRaw === undefined) continue;
      
      var wertStr = String(wertRaw).replace(",", ".").trim();
      var wert = parseFloat(wertStr);
      if (isNaN(wert)) continue; // Textanmerkungen wie "voll" überspringen
      
      // Formatierung des Datums für eine saubere, kompakte ID (YYYYMMDD)
      var dateParts = String(datumStr).split(".");
      var safeDatum = "";
      if (dateParts.length === 3) {
        var jahr = dateParts[2].length === 2 ? "20" + dateParts[2] : dateParts[2];
        safeDatum = jahr + dateParts[1] + dateParts[0];
      } else {
        safeDatum = String(datumStr).replace(/\./g, "");
      }
      
      var standId = "ST_" + zaehlerId + "_" + safeDatum;
      
      // EXAKTE SPALTENORDNUNG FÜR MENSCH UND MASCHINE:
      // stand_id | zaehler_id | wert | zeitstempel | quelle
      staendeRows.push([
        standId,
        zaehlerId,
        wert,         // Wert landet jetzt sauber als Zahl in Spalte C
        datumStr,     // Datum landet jetzt sauber als Text/Datum in Spalte D
        "Migration"
      ]);
    }
  }
  
  // In das Sheet schreiben
  if (staendeRows.length > 0) {
    // Altes Chaos löschen (behält die Kopfzeile in Zeile 1)
    if (staendeSheet.getLastRow() > 1) {
      staendeSheet.getRange(2, 1, staendeSheet.getLastRow() - 1, 5).clearContent();
    }
    
    // Neue, saubere Daten einfügen
    staendeSheet.getRange(2, 1, staendeRows.length, 5).setValues(staendeRows);
    
    // --- NUTZERZENTRIERTE SORTIERUNG ---
    // Spalte D (Zeitstempel/Datum) ist Index 4. 
    // Wir sortieren das gesamte Blatt ab Zeile 2 absteigend nach Datum, damit du die neuesten Werte oben hast.
    var rangeToSort = staendeSheet.getRange(2, 1, staendeRows.length, 5);
    rangeToSort.sort({column: 4, ascending: false});
    
    Logger.log("🎉 Historie erfolgreich korrigiert und chronologisch absteigend sortiert!");
  }
}

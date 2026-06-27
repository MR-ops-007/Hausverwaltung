/**
 * HAUSVERWALTUNG - BACKEND
 * Version: 4.3.0
 * Stand: 2026-06-27
 *
 * Änderungen seit v4.1:
 * - stand_id nutzt zusammengesetzte Zähleridentität
 * - Testbereich für Produktivtests erweitert
 * - _view_aktive_mieter nutzt hauptperson_id als Fallback
 *
 * Änderungen seit v4.2:
 * - Produktive Testzähler auf Wasser, Allgemein und Öl erweitert
 */
const BACKEND_VERSION = "4.3.0";

function sendJSON(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  if (!e || !e.postData) {
    return sendJSON({
      status: "error",
      message: "Keine Daten"
    });
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const targetSheet = payload.typ === "ZAHLUNG"
      ? "Zahlungen"
      : "Zaehlerstaende";

    const sheet = ss.getSheetByName(targetSheet);

    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(h => String(h).trim().toLowerCase());

    const items = Array.isArray(payload.data)
      ? payload.data
      : [payload.data];

    items.forEach(item => {
      const normalizedItem = targetSheet === "Zaehlerstaende"
        ? normalizeZaehlerstandItem(item)
        : item;

      sheet.appendRow(
        headers.map(h => getItemValueForHeader(normalizedItem, h))
      );
    });

    // WICHTIG: Cache-Update nach jeder Datenänderung
    updateAktiveMieterView();

    return sendJSON({
      status: "success",
      message: "Daten verarbeitet und View aktualisiert"
    });
  } catch (err) {
    return sendJSON({
      status: "error",
      message: err.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

function isBlankValue(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseTimestampForStandId(value, fallbackDate) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  if (!isBlankValue(value)) {
    const text = String(value).trim();
    const germanMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);

    if (germanMatch) {
      const day = Number(germanMatch[1]);
      const month = Number(germanMatch[2]);
      const year = Number(germanMatch[3]);
      const hour = Number(germanMatch[4] || 0);
      const minute = Number(germanMatch[5] || 0);

      return new Date(year, month - 1, day, hour, minute);
    }

    const parsed = new Date(text);

    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallbackDate || new Date();
}

function formatStandIdTimestamp(value, fallbackDate) {
  const date = parseTimestampForStandId(value, fallbackDate);

  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join("-") + " " + [
    pad2(date.getHours()),
    pad2(date.getMinutes())
  ].join(":");
}

function buildStandId(item, fallbackDate) {
  const objektId = isBlankValue(item.objekt_id)
    ? "UNKNOWN_OBJEKT"
    : String(item.objekt_id).trim();
  const einheitId = isBlankValue(item.einheit_id)
    ? "UNKNOWN_EINHEIT"
    : String(item.einheit_id).trim();
  const zaehlerId = isBlankValue(item.zaehler_id)
    ? "UNKNOWN_ZAEHLER"
    : String(item.zaehler_id).trim();

  return "ST_" + objektId + "_" + einheitId + "_" + zaehlerId + "_" + formatStandIdTimestamp(item.zeitstempel, fallbackDate);
}

function getItemValueForHeader(item, header) {
  if (item[header] !== undefined) {
    return item[header];
  }

  if (header === "stand.id") {
    return item.stand_id !== undefined ? item.stand_id : "";
  }

  if (header === "stand_id") {
    return item["stand.id"] !== undefined ? item["stand.id"] : "";
  }

  return "";
}

function normalizeZaehlerstandItem(item, fallbackDate) {
  const normalized = Object.assign({}, item);

  const existingStandId = !isBlankValue(normalized.stand_id)
    ? normalized.stand_id
    : normalized["stand.id"];

  if (isBlankValue(existingStandId)) {
    const standId = buildStandId(normalized, fallbackDate);
    normalized.stand_id = standId;
    normalized["stand.id"] = standId;
  } else {
    normalized.stand_id = existingStandId;
    normalized["stand.id"] = existingStandId;
  }

  return normalized;
}

function getProdTestSeedData() {
  return {
    objekte: [
      {
        objekt_id: "TEST",
        bezeichnung: "Test fuer Produktivsystem",
        strasse: "Am Geldspeicher 1",
        plz: "00000",
        ort: "Entenhausen",
        adresszusatz: "Onkel Dagobert Platz",
        besitzer_id: ""
      }
    ],
    einheiten: [
      {
        einheit_id: "TEST_WE_01",
        objekt_id: "TEST",
        typ: "Wohnung",
        nummer: "WE 01 TEST",
        qm: 55,
        personen_standard: 2
      },
      {
        einheit_id: "TEST_WE_02",
        objekt_id: "TEST",
        typ: "Wohnung",
        nummer: "WE 02 TEST Leerstand",
        qm: 45,
        personen_standard: 1
      },
      {
        einheit_id: "TEST_Allgemein",
        objekt_id: "TEST",
        typ: "Allgemein",
        nummer: "Allgemein TEST",
        qm: 0,
        personen_standard: 0
      }
    ],
    zaehler: [
      {
        zaehler_id: "Z_STROM_KWH_WOHNUNG_1",
        objekt_id: "TEST",
        einheit_id: "TEST_WE_01",
        medium: "strom_ht_kwh",
        bezeichnung: "Strom Wohnung 1 (OVAG)",
        einheit: "KWh",
        einbauort: "Elektroraum",
        stellen: 5,
        ueberlauf_erlaubt: false,
        max_plausibler_verbrauch: 100,
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_KALTWASSER_KW_WOHNUNG_1",
        objekt_id: "TEST",
        einheit_id: "TEST_WE_01",
        medium: "kaltwasser_m3",
        bezeichnung: "Kaltwasser Wohnung 1 TEST",
        einheit: "m3",
        einbauort: "Heizung",
        stellen: 4,
        ueberlauf_erlaubt: true,
        max_plausibler_verbrauch: 4,
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_WARMWASSER_WW_WOHNUNG_1",
        objekt_id: "TEST",
        einheit_id: "TEST_WE_01",
        medium: "warmwasser_m3",
        bezeichnung: "Warmwasser Wohnung 1 TEST",
        einheit: "m3",
        einbauort: "Heizung",
        stellen: 4,
        ueberlauf_erlaubt: true,
        max_plausibler_verbrauch: 2,
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_STROM_KWH_WOHNUNG_2",
        objekt_id: "TEST",
        einheit_id: "TEST_WE_02",
        medium: "strom_ht_kwh",
        bezeichnung: "Strom Wohnung 2 TEST Leerstand",
        einheit: "KWh",
        einbauort: "Testbereich",
        stellen: 5,
        ueberlauf_erlaubt: false,
        max_plausibler_verbrauch: 100,
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "Testzaehler fuer Leerstand",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_KALTWASSER_KW_WOHNUNG_2",
        objekt_id: "TEST",
        einheit_id: "TEST_WE_02",
        medium: "kaltwasser_m3",
        bezeichnung: "Kaltwasser Wohnung 2 TEST Leerstand",
        einheit: "m3",
        einbauort: "Testbereich",
        stellen: 4,
        ueberlauf_erlaubt: true,
        max_plausibler_verbrauch: 4,
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "Testzaehler fuer Leerstand",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_WARMWASSER_WW_WOHNUNG_2",
        objekt_id: "TEST",
        einheit_id: "TEST_WE_02",
        medium: "warmwasser_m3",
        bezeichnung: "Warmwasser Wohnung 2 TEST Leerstand",
        einheit: "m3",
        einbauort: "Testbereich",
        stellen: 4,
        ueberlauf_erlaubt: true,
        max_plausibler_verbrauch: 2,
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "Testzaehler fuer Leerstand",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_STROM_KWH_ALLGEMEIN",
        objekt_id: "TEST",
        einheit_id: "TEST_Allgemein",
        medium: "strom_ht_kwh",
        bezeichnung: "Strom Allgemein TEST",
        einheit: "KWh",
        einbauort: "Testbereich Allgemein",
        stellen: 5,
        ueberlauf_erlaubt: false,
        max_plausibler_verbrauch: 100,
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "Testzaehler fuer Allgemeinbereich",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_KALTWASSER_KW_HAUPTZAEHLER",
        objekt_id: "TEST",
        einheit_id: "TEST_Allgemein",
        medium: "kaltwasser_m3",
        bezeichnung: "Kaltwasser Hauptzähler TEST",
        einheit: "m3",
        einbauort: "Testbereich Allgemein",
        stellen: 6,
        ueberlauf_erlaubt: true,
        max_plausibler_verbrauch: 100,
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "Testzaehler fuer Allgemeinbereich",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_WARMWASSER_WW_ZULAUF",
        objekt_id: "TEST",
        einheit_id: "TEST_Allgemein",
        medium: "warmwasser_m3",
        bezeichnung: "Warmwasser (WW Zulauf) TEST",
        einheit: "m3",
        einbauort: "Testbereich Allgemein",
        stellen: 6,
        ueberlauf_erlaubt: true,
        max_plausibler_verbrauch: 100,
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "Testzaehler fuer Allgemeinbereich",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_OEL_STAND_IN_CM",
        objekt_id: "TEST",
        einheit_id: "TEST_Allgemein",
        medium: "oel_stand_cm",
        bezeichnung: "Heizung Ölstand (cm) TEST",
        einheit: "cm",
        einbauort: "Testbereich Allgemein",
        stellen: "",
        ueberlauf_erlaubt: false,
        max_plausibler_verbrauch: "",
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "Testzaehler fuer Oelstand",
        erfassbar: true,
        berechnet: false
      },
      {
        zaehler_id: "Z_OEL_GETANKT_LITER",
        objekt_id: "TEST",
        einheit_id: "TEST_Allgemein",
        medium: "oel_stand_l",
        bezeichnung: "Heizung Oel getankt (Liter) TEST",
        einheit: "l",
        einbauort: "Testbereich Allgemein",
        stellen: "",
        ueberlauf_erlaubt: false,
        max_plausibler_verbrauch: "",
        aktiv: true,
        ersetzt_durch_zaehler_id: "",
        hinweis: "Testzaehler fuer Oellieferung",
        erfassbar: true,
        berechnet: false
      }
    ]
  };
}

function appendIfMissingByKeys(sheet, keyNames, item) {
  const rows = sheet.getDataRange().getValues();

  if (rows.length < 1) {
    throw new Error("Sheet ohne Header: " + sheet.getName());
  }

  const headers = rows[0].map(h => String(h).trim());
  const normalizedHeaders = headers.map(h => h.toLowerCase());
  const normalizedKeyNames = keyNames.map(keyName => String(keyName).toLowerCase());
  const keyIndexes = normalizedKeyNames.map(keyName => normalizedHeaders.indexOf(keyName));

  const missingKeyName = normalizedKeyNames.find((keyName, index) => keyIndexes[index] === -1);

  if (missingKeyName) {
    throw new Error("Key-Spalte nicht gefunden: " + missingKeyName + " in " + sheet.getName());
  }

  const exists = rows.slice(1).some(row =>
    keyIndexes.every((keyIndex, index) => {
      const keyName = keyNames[index];
      return String(row[keyIndex]).trim() === String(item[keyName]).trim();
    })
  );

  if (exists) {
    return false;
  }

  sheet.appendRow(
    normalizedHeaders.map(h => getItemValueForHeader(item, h))
  );

  return true;
}

function appendIfMissingByKey(sheet, keyName, item) {
  return appendIfMissingByKeys(sheet, [keyName], item);
}

function ensureProdTestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seed = getProdTestSeedData();

  const sObjekte = ss.getSheetByName("Objekte");
  const sEinheiten = ss.getSheetByName("Einheiten");
  const sZaehler = ss.getSheetByName("Zaehler");

  if (!sObjekte || !sEinheiten || !sZaehler) {
    throw new Error("Mindestens ein Stammdaten-Sheet fehlt: Objekte, Einheiten oder Zaehler");
  }

  let created = 0;

  seed.objekte.forEach(row => {
    if (appendIfMissingByKey(sObjekte, "objekt_id", row)) created++;
  });

  seed.einheiten.forEach(row => {
    if (appendIfMissingByKey(sEinheiten, "einheit_id", row)) created++;
  });

  seed.zaehler.forEach(row => {
    if (appendIfMissingByKeys(sZaehler, ["objekt_id", "einheit_id", "zaehler_id"], row)) created++;
  });

  updateAktiveMieterView();

  return {
    status: "success",
    created: created,
    message: "Prod-Testdaten geprueft/angelegt"
  };
}

function getMieterNameForVertrag(vertrag, parteienMap, personenMap) {
  const parteienMieter = parteienMap[String(vertrag.vertrag_id)];

  if (parteienMieter && parteienMieter.length > 0) {
    return parteienMieter.join(" / ");
  }

  if (!isBlankValue(vertrag.hauptperson_id)) {
    return personenMap[String(vertrag.hauptperson_id).trim()] || "Unbekannt";
  }

  return "Leerstand";
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const param = e ? e.parameter : {};

  if (param.view === "dashboard") {
    const sheetView = ss.getSheetByName("_view_aktive_mieter");

    return sendJSON({
      "_view_aktive_mieter": sheetView ? getSheetData(sheetView) : []
    });
  }

  const data = {};

  ss.getSheets().forEach(s => {
    const name = s.getName();

    if (!name.startsWith("OLD_")) {
      data[name] = getSheetData(s);
    }
  });

  return sendJSON(data);
}

function getSheetData(sheet) {
  const rows = sheet.getDataRange().getValues();

  if (rows.length < 2) {
    return [];
  }

  const keys = rows[0].map(k => String(k).trim());

  return rows.slice(1).map(row => {
    const obj = {};

    keys.forEach((k, i) => {
      obj[k] = row[i];
    });

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

  if (!sEinheiten || !sVertraege || !sPersonen || !sParteien || !sView) {
    return;
  }

  const einheiten = getSheetData(sEinheiten);
  const vertraege = getSheetData(sVertraege);
  const personen = getSheetData(sPersonen);
  const parteien = getSheetData(sParteien);

  const personenMap = {};

  personen.forEach(p => {
    personenMap[String(p.person_id).trim()] = `${p.name || ""}, ${p.vorname || ""}`;
  });

  const parteienMap = {};

  parteien.forEach(part => {
    if (String(part.rolle).toLowerCase() === "hauptmieter") {
      const vId = String(part.vertrag_id);

      if (!parteienMap[vId]) {
        parteienMap[vId] = [];
      }

      parteienMap[vId].push(
        personenMap[String(part.person_id).trim()] || "Unbekannt"
      );
    }
  });

  const output = [
    [
      "einheit_id",
      "vertrag_id",
      "mieter_name",
      "start_datum",
      "soll_gesamt"
    ]
  ];

  einheiten.forEach(e => {
    const v = vertraege.find(v =>
      String(v.einheit_id) === String(e.einheit_id) &&
      String(v.aktiv) === "true"
    );

    if (v) {
      const mieter = getMieterNameForVertrag(v, parteienMap, personenMap);

      output.push([
        e.einheit_id,
        v.vertrag_id,
        mieter,
        v.start_datum,
        v.soll_gesamt
      ]);
    } else {
      output.push([
        e.einheit_id,
        "",
        "Leerstand",
        "",
        0
      ]);
    }
  });

  sView.clearContents();

  if (output.length > 0) {
    sView
      .getRange(1, 1, output.length, output[0].length)
      .setValues(output);
  }
}

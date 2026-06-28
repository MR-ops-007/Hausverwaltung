/**
 * HAUSVERWALTUNG - BACKEND
 * Version: 4.5.2
 * Stand: 2026-06-28
 *
 * Änderungen seit v4.1:
 * - stand_id nutzt zusammengesetzte Zähleridentität
 * - Testbereich für Produktivtests erweitert
 * - _view_aktive_mieter nutzt hauptperson_id als Fallback
 *
 * Änderungen seit v4.2:
 * - Produktive Testzähler auf Wasser, Allgemein und Öl erweitert
 *
 * Änderungen seit v4.3:
 * - JavaScript-Date-Strings werden für stand_id zeitzonenstabil geparst
 *
 * Änderungen seit v4.3.1:
 * - Preview-/Apply-Migration für Bestands-Zaehlerstaende ergänzt
 *
 * Änderungen seit v4.4:
 * - Report-Sheet für stand_id-Migrationsanalyse ergänzt
 *
 * Änderungen seit v4.4.1:
 * - Bestandsmigration lernt eindeutige zaehler_id/einheit_id-Mappings aus Zaehlerstaende
 *
 * Änderungen seit v4.4.2:
 * - Bekannte fehlerhafte Bestands-Mappings werden per Override aufgelöst
 *
 * Änderungen seit v4.4.3:
 * - Virtueller Warmwasser-Gesamtzähler für historische Migration ergänzt
 *
 * Änderungen seit v4.4.4:
 * - Duplikat-Report für stand_id-Migration ergänzt
 *
 * Änderungen seit v4.4.5:
 * - Historische Doppelwerte werden als Zählerstand plus berechneter Verbrauch aufgelöst
 *
 * Änderungen seit v4.4.6:
 * - LOK-Zählerstruktur und Eingangs-Stammdaten ergänzt
 *
 * Änderungen seit v4.5.0:
 * - LOK Wohnung 10 in 10 A, 10 B und 10 S aufgeteilt
 * - ensureLokStructureData legt fehlende LOK-Einheiten an
 *
 * Änderungen seit v4.5.1:
 * - LOK zaehler_id wird einheitgebunden aus einheit_id, medium und optionalem Messpunkt gebildet
 * - Alte LOK-Kurz-IDs werden deaktiviert und auf die neue zaehler_id verwiesen
 */
const BACKEND_VERSION = "4.5.2";

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

function parseJavaScriptDateStringForStandId(text) {
  const jsDateMatch = text.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+GMT[+-]\d{4}/);

  if (!jsDateMatch) {
    return null;
  }

  const monthNumbers = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11
  };

  const month = monthNumbers[jsDateMatch[1]];

  if (month === undefined) {
    return null;
  }

  return new Date(
    Number(jsDateMatch[3]),
    month,
    Number(jsDateMatch[2]),
    Number(jsDateMatch[4]),
    Number(jsDateMatch[5]),
    Number(jsDateMatch[6] || 0)
  );
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

    const jsDate = parseJavaScriptDateStringForStandId(text);

    if (jsDate) {
      return jsDate;
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

function getLokEinheitEntranceMapping() {
  return {
    LOK_WE_01: "A",
    LOK_WE_02: "A",
    LOK_WE_03: "A",
    LOK_WE_04: "A",
    LOK_WE_05: "A",
    LOK_WE_06: "B",
    LOK_WE_07: "B",
    LOK_WE_08: "B",
    LOK_WE_09: "B",
    LOK_WE_10_A: "B",
    LOK_WE_10_B: "B",
    LOK_WE_10_S: "B",
    LOK_WE_11: "C",
    LOK_WE_12: "C",
    LOK_WE_13: "C",
    LOK_WE_14: "C",
    LOK_WE_15: "C",
    LOK_GE_01: "A",
    LOK_Allgemein: "Allgemein"
  };
}

function getLokEinheitDisplayName(einheitId) {
  const explicitNames = {
    LOK_WE_10_A: "Wohnung 10 A",
    LOK_WE_10_B: "Wohnung 10 B",
    LOK_WE_10_S: "Wohnung 10 S",
    LOK_GE_01: "Gewerbe 1",
    LOK_Allgemein: "Allgemein"
  };

  if (explicitNames[einheitId]) {
    return explicitNames[einheitId];
  }

  const wohnungMatch = String(einheitId).match(/^LOK_WE_(\d{2})$/);

  if (wohnungMatch) {
    return "Wohnung " + Number(wohnungMatch[1]);
  }

  return String(einheitId).replace("LOK_", "").replace(/_/g, " ");
}

function getLokEinheitTyp(einheitId) {
  if (einheitId === "LOK_Allgemein") {
    return "Allgemein";
  }

  if (String(einheitId).indexOf("LOK_GE_") === 0) {
    return "Gewerbe";
  }

  return "Wohnung";
}

function getLokEinheitSeedData() {
  const entranceMapping = getLokEinheitEntranceMapping();

  return Object.keys(entranceMapping).map(einheitId => ({
    einheit_id: einheitId,
    objekt_id: "LOK",
    typ: getLokEinheitTyp(einheitId),
    nummer: getLokEinheitDisplayName(einheitId),
    qm: "",
    personen_standard: "",
    eingang: entranceMapping[einheitId]
  }));
}

function buildLokZaehlerId(einheitId, medium, messpunkt) {
  return [
    "Z",
    einheitId,
    medium,
    messpunkt || ""
  ].filter(part => !isBlankValue(part)).join("_");
}

function createLokWohnungMeters(einheitId, entrance) {
  const label = getLokEinheitDisplayName(einheitId);
  const location = entrance === "Allgemein"
    ? "Allgemein"
    : "Eingang " + entrance;

  return [
    {
      zaehler_id: buildLokZaehlerId(einheitId, "strom_ht_kwh"),
      objekt_id: "LOK",
      einheit_id: einheitId,
      medium: "strom_ht_kwh",
      bezeichnung: "Strom " + label,
      einheit: "kWh",
      einbauort: location,
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
      zaehler_id: buildLokZaehlerId(einheitId, "kaltwasser_m3"),
      objekt_id: "LOK",
      einheit_id: einheitId,
      medium: "kaltwasser_m3",
      bezeichnung: "Kaltwasser " + label,
      einheit: "m3",
      einbauort: location,
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
      zaehler_id: buildLokZaehlerId(einheitId, "warmwasser_m3"),
      objekt_id: "LOK",
      einheit_id: einheitId,
      medium: "warmwasser_m3",
      bezeichnung: "Warmwasser " + label,
      einheit: "m3",
      einbauort: location,
      stellen: 4,
      ueberlauf_erlaubt: true,
      max_plausibler_verbrauch: 2,
      aktiv: true,
      ersetzt_durch_zaehler_id: "",
      hinweis: "",
      erfassbar: true,
      berechnet: false
    }
  ];
}

function getLokSeedData() {
  const entranceMapping = getLokEinheitEntranceMapping();
  const einheiten = getLokEinheitSeedData();
  const wohnungAndGewerbeUnitIds = einheiten
    .filter(einheit => einheit.einheit_id !== "LOK_Allgemein")
    .map(einheit => einheit.einheit_id);
  const zaehler = [];

  wohnungAndGewerbeUnitIds.forEach(einheitId => {
    createLokWohnungMeters(einheitId, entranceMapping[einheitId]).forEach(row => zaehler.push(row));
  });

  [
    {
      zaehler_id: buildLokZaehlerId("LOK_Allgemein", "strom_ht_kwh"),
      medium: "strom_ht_kwh",
      bezeichnung: "Strom Allgemein",
      einheit: "kWh",
      einbauort: "Allgemein",
      stellen: 5,
      ueberlauf_erlaubt: false,
      max_plausibler_verbrauch: 100,
      hinweis: "Allgemeinstrom Lokschuppen"
    },
    {
      zaehler_id: buildLokZaehlerId("LOK_Allgemein", "strom_nt_kwh"),
      medium: "strom_nt_kwh",
      bezeichnung: "Strom NT Allgemein",
      einheit: "kWh",
      einbauort: "Allgemein",
      stellen: 5,
      ueberlauf_erlaubt: false,
      max_plausibler_verbrauch: 100,
      hinweis: "Niedertarif Allgemein Lokschuppen"
    },
    {
      zaehler_id: buildLokZaehlerId("LOK_Allgemein", "kaltwasser_m3", "hauptzaehler"),
      medium: "kaltwasser_m3",
      bezeichnung: "Kaltwasser Hauptzähler",
      einheit: "m3",
      einbauort: "Allgemein",
      stellen: 6,
      ueberlauf_erlaubt: true,
      max_plausibler_verbrauch: 100,
      hinweis: "Hauptzähler Lokschuppen"
    },
    {
      zaehler_id: buildLokZaehlerId("LOK_Allgemein", "warmwasser_m3", "zulauf"),
      medium: "warmwasser_m3",
      bezeichnung: "Warmwasser Zulauf",
      einheit: "m3",
      einbauort: "Allgemein",
      stellen: 6,
      ueberlauf_erlaubt: true,
      max_plausibler_verbrauch: 100,
      hinweis: "Warmwasser-Zulauf Lokschuppen"
    },
    {
      zaehler_id: buildLokZaehlerId("LOK_Allgemein", "oel_stand_cm"),
      medium: "oel_stand_cm",
      bezeichnung: "Heizung Ölstand (cm)",
      einheit: "cm",
      einbauort: "Heizung",
      stellen: "",
      ueberlauf_erlaubt: false,
      max_plausibler_verbrauch: "",
      hinweis: "Rückläufiger Füllstand"
    },
    {
      zaehler_id: buildLokZaehlerId("LOK_Allgemein", "oel_stand_l"),
      medium: "oel_stand_l",
      bezeichnung: "Heizung Öl getankt (Liter)",
      einheit: "l",
      einbauort: "Heizung",
      stellen: "",
      ueberlauf_erlaubt: false,
      max_plausibler_verbrauch: "",
      hinweis: "Erfassung von Öllieferungen"
    }
  ].forEach(row => {
    zaehler.push(Object.assign({
      objekt_id: "LOK",
      einheit_id: "LOK_Allgemein",
      aktiv: true,
      ersetzt_durch_zaehler_id: "",
      erfassbar: true,
      berechnet: false
    }, row));
  });

  return {
    objekte: [
      {
        objekt_id: "LOK",
        eingange: "A,B,C"
      }
    ],
    einheiten: einheiten,
    zaehler: zaehler
  };
}

function ensureSheetHeaders(sheet, headerNames) {
  const lastColumn = sheet.getLastColumn();
  const existingHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(header => String(header).trim())
    : [];
  const normalizedExistingHeaders = existingHeaders.map(header => header.toLowerCase());
  const missingHeaders = headerNames.filter(headerName =>
    normalizedExistingHeaders.indexOf(String(headerName).toLowerCase()) === -1
  );

  if (missingHeaders.length === 0) {
    return [];
  }

  sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);

  return missingHeaders;
}

function updateExistingRowBlankFieldsByKey(sheet, keyName, item, fieldNames) {
  const rows = sheet.getDataRange().getValues();

  if (rows.length < 1) {
    throw new Error("Sheet ohne Header: " + sheet.getName());
  }

  const headers = rows[0].map(header => String(header).trim());
  const normalizedHeaders = headers.map(header => header.toLowerCase());
  const keyIndex = normalizedHeaders.indexOf(String(keyName).toLowerCase());

  if (keyIndex === -1) {
    throw new Error("Key-Spalte nicht gefunden: " + keyName + " in " + sheet.getName());
  }

  const rowIndex = rows.findIndex((row, index) =>
    index > 0 && String(row[keyIndex]).trim() === String(item[keyName]).trim()
  );

  if (rowIndex === -1) {
    return false;
  }

  let changed = false;

  fieldNames.forEach(fieldName => {
    const columnIndex = normalizedHeaders.indexOf(String(fieldName).toLowerCase());

    if (columnIndex === -1) {
      return;
    }

    const currentValue = rows[rowIndex][columnIndex];

    if (isBlankValue(currentValue) && !isBlankValue(item[fieldName])) {
      sheet.getRange(rowIndex + 1, columnIndex + 1).setValue(item[fieldName]);
      changed = true;
    }
  });

  return changed;
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

function getLokReplacementZaehlerId(einheitId, oldZaehlerId) {
  const oldId = String(oldZaehlerId || "").trim();

  if (oldId === "STROM") {
    return buildLokZaehlerId(einheitId, "strom_ht_kwh");
  }

  if (oldId === "KW") {
    return buildLokZaehlerId(einheitId, "kaltwasser_m3");
  }

  if (oldId === "WW") {
    return buildLokZaehlerId(einheitId, "warmwasser_m3");
  }

  const allgemeinReplacement = {
    STROM_ALLGEMEIN: buildLokZaehlerId("LOK_Allgemein", "strom_ht_kwh"),
    STROM_NT: buildLokZaehlerId("LOK_Allgemein", "strom_nt_kwh"),
    KW_HAUPTZAEHLER: buildLokZaehlerId("LOK_Allgemein", "kaltwasser_m3", "hauptzaehler"),
    WW_ZULAUF: buildLokZaehlerId("LOK_Allgemein", "warmwasser_m3", "zulauf"),
    OEL_STAND_CM: buildLokZaehlerId("LOK_Allgemein", "oel_stand_cm"),
    OEL_GETANKT_L: buildLokZaehlerId("LOK_Allgemein", "oel_stand_l")
  };

  return allgemeinReplacement[oldId] || "";
}

function setRowFieldValue(sheet, rowNumber, rowValues, normalizedHeaders, fieldName, value) {
  const columnIndex = normalizedHeaders.indexOf(String(fieldName).toLowerCase());

  if (columnIndex === -1) {
    return false;
  }

  if (String(rowValues[columnIndex]) === String(value)) {
    return false;
  }

  sheet.getRange(rowNumber, columnIndex + 1).setValue(value);
  return true;
}

function deactivateObsoleteLokShortCodeMeters(sheet) {
  const rows = sheet.getDataRange().getValues();

  if (rows.length < 2) {
    return 0;
  }

  const headers = rows[0].map(header => String(header).trim());
  const normalizedHeaders = headers.map(header => header.toLowerCase());
  const objektIndex = normalizedHeaders.indexOf("objekt_id");
  const einheitIndex = normalizedHeaders.indexOf("einheit_id");
  const zaehlerIndex = normalizedHeaders.indexOf("zaehler_id");

  if (objektIndex === -1 || einheitIndex === -1 || zaehlerIndex === -1) {
    throw new Error("Pflichtspalten fehlen in Zaehler: objekt_id, einheit_id oder zaehler_id");
  }

  let changedRows = 0;

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const objektId = String(row[objektIndex]).trim();
    const einheitId = String(row[einheitIndex]).trim();
    const zaehlerId = String(row[zaehlerIndex]).trim();
    const replacementId = objektId === "LOK"
      ? getLokReplacementZaehlerId(einheitId, zaehlerId)
      : "";

    if (!replacementId || replacementId === zaehlerId) {
      return;
    }

    const changed = [
      setRowFieldValue(sheet, rowNumber, row, normalizedHeaders, "aktiv", false),
      setRowFieldValue(sheet, rowNumber, row, normalizedHeaders, "erfassbar", false),
      setRowFieldValue(sheet, rowNumber, row, normalizedHeaders, "ersetzt_durch_zaehler_id", replacementId),
      setRowFieldValue(sheet, rowNumber, row, normalizedHeaders, "hinweis", "Veraltete LOK-Kurz-ID; ersetzt durch einheitgebundene zaehler_id.")
    ].some(Boolean);

    if (changed) {
      changedRows++;
    }
  });

  return changedRows;
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

function ensureLokStructureData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seed = getLokSeedData();

  const sObjekte = ss.getSheetByName("Objekte");
  const sEinheiten = ss.getSheetByName("Einheiten");
  const sZaehler = ss.getSheetByName("Zaehler");

  if (!sObjekte || !sEinheiten || !sZaehler) {
    throw new Error("Mindestens ein Stammdaten-Sheet fehlt: Objekte, Einheiten oder Zaehler");
  }

  const addedObjectHeaders = ensureSheetHeaders(sObjekte, ["eingange"]);
  const addedUnitHeaders = ensureSheetHeaders(sEinheiten, ["eingang"]);
  let updatedObjects = 0;
  let createdUnits = 0;
  let updatedUnits = 0;
  let createdMeters = 0;

  seed.objekte.forEach(row => {
    if (updateExistingRowBlankFieldsByKey(sObjekte, "objekt_id", row, ["eingange"])) {
      updatedObjects++;
    }
  });

  seed.einheiten.forEach(row => {
    if (appendIfMissingByKey(sEinheiten, "einheit_id", row)) {
      createdUnits++;
    } else if (updateExistingRowBlankFieldsByKey(sEinheiten, "einheit_id", row, ["eingang"])) {
      updatedUnits++;
    }
  });

  seed.zaehler.forEach(row => {
    if (appendIfMissingByKeys(sZaehler, ["objekt_id", "einheit_id", "zaehler_id"], row)) {
      createdMeters++;
    }
  });

  const deactivatedObsoleteMeters = deactivateObsoleteLokShortCodeMeters(sZaehler);

  updateAktiveMieterView();

  Logger.log("LOK-Struktur aktualisiert: " + JSON.stringify({
    addedObjectHeaders: addedObjectHeaders,
    addedUnitHeaders: addedUnitHeaders,
    updatedObjects: updatedObjects,
    createdUnits: createdUnits,
    updatedUnits: updatedUnits,
    createdMeters: createdMeters,
    deactivatedObsoleteMeters: deactivatedObsoleteMeters
  }));

  return {
    status: "success",
    addedObjectHeaders: addedObjectHeaders,
    addedUnitHeaders: addedUnitHeaders,
    updatedObjects: updatedObjects,
    createdUnits: createdUnits,
    updatedUnits: updatedUnits,
    createdMeters: createdMeters,
    deactivatedObsoleteMeters: deactivatedObsoleteMeters,
    expectedMeters: seed.zaehler.length,
    message: "LOK-Struktur geprueft/angelegt"
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

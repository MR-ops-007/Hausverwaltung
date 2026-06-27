const STAND_ID_MIGRATION_DEFAULT_OBJEKT_ID = "Ra-HS-29";

const STAND_ID_MIGRATION_EINHEIT_OVERRIDES = {
  Z_STROM_KWH_PRIVAT_NT: "Ra-HS-29_GE_02",
  Z_STROM_KWH_PRIVAT_HT: "Ra-HS-29_GE_02",
  Z_MASCHINENSTUNDEN_PRIVAT: "Ra-HS-29_GE_02",
  Z_STROM_KWH_FLUR: "Ra-HS-29_Allgemein_Flur",
  Z_STROM_KWH_HEIZUNG: "Ra-HS-29_Allgemein_Heizung",
  Z_WARMWASSER_WW_GESAMT_BERECHNET: "Ra-HS-29_Allgemein_Heizung",
  Z_WARMWASSER_WW_WOHNUNG_10: "Ra-HS-29_WE_10",
  Z_WARMWASSER_WW_WOHNUNG_11: "Ra-HS-29_WE_11"
};

function getHistoricalCalculatedMeterSeedData() {
  return [
    {
      zaehler_id: "Z_WARMWASSER_WW_GESAMT_BERECHNET",
      objekt_id: "Ra-HS-29",
      einheit_id: "Ra-HS-29_Allgemein_Heizung",
      medium: "warmwasser_m3",
      bezeichnung: "Warmwasser gesamt berechnet",
      einheit: "m3",
      einbauort: "berechneter Wert, kein Zaehler",
      stellen: "",
      ueberlauf_erlaubt: false,
      max_plausibler_verbrauch: "",
      aktiv: true,
      ersetzt_durch_zaehler_id: "",
      hinweis: "Historischer berechneter Wert: Warmwasser gesamt abzüglich Verbrauch Wohnung 4 KW",
      erfassbar: false,
      berechnet: true
    }
  ];
}

function ensureHistoricalCalculatedMeters() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Zaehler");

  if (!sheet) {
    throw new Error("Sheet 'Zaehler' fehlt.");
  }

  let created = 0;

  getHistoricalCalculatedMeterSeedData().forEach(row => {
    if (appendIfMissingByKeys(sheet, ["objekt_id", "einheit_id", "zaehler_id"], row)) {
      created++;
    }
  });

  Logger.log("Historische berechnete Zähler angelegt: " + created);

  return {
    created: created
  };
}

function normalizeMigrationKey(value) {
  return String(value || "").trim().toUpperCase();
}

function deriveEinheitIdFromLegacyZaehlerId(zaehlerId, objektId) {
  const objectId = isBlankValue(objektId)
    ? STAND_ID_MIGRATION_DEFAULT_OBJEKT_ID
    : String(objektId).trim();
  const key = normalizeMigrationKey(zaehlerId);

  if (isBlankValue(key)) {
    return "";
  }

  if (STAND_ID_MIGRATION_EINHEIT_OVERRIDES[key]) {
    return STAND_ID_MIGRATION_EINHEIT_OVERRIDES[key];
  }

  const wohnungMatch = key.match(/(?:^|_)WOHNUNG_(\d+)(?:_|$)/);

  if (wohnungMatch) {
    return objectId + "_WE_" + pad2(Number(wohnungMatch[1]));
  }

  const weMatch = key.match(/(?:^|_)WE_(\d+)(?:_|$)/);

  if (weMatch) {
    return objectId + "_WE_" + pad2(Number(weMatch[1]));
  }

  const gewerbeMatch = key.match(/(?:^|_)(?:GEWERBE|GE)_(\d+)(?:_|$)/);

  if (gewerbeMatch) {
    return objectId + "_GE_" + pad2(Number(gewerbeMatch[1]));
  }

  if (
    key.indexOf("ALLGEMEIN") !== -1 ||
    key.indexOf("HAUPTZAEHLER") !== -1 ||
    key.indexOf("ZULAUF") !== -1 ||
    key.indexOf("OEL") !== -1 ||
    key.indexOf("HEIZUNG") !== -1
  ) {
    return objectId + "_Allgemein";
  }

  return "";
}

function getMigrationMappingKey(objektId, zaehlerId) {
  return normalizeMigrationKey(objektId) + "|" + normalizeMigrationKey(zaehlerId);
}

function buildExistingEinheitMappingFromRows(headers, rows, options) {
  const opts = options || {};
  const indexes = getMigrationHeaderIndexes(headers);
  const mappingCandidates = {};
  const mapping = {};
  const conflicts = [];

  if (indexes.zaehler_id === undefined || indexes.einheit_id === undefined) {
    return {
      mapping: mapping,
      conflicts: conflicts
    };
  }

  rows.forEach((row, index) => {
    const zaehlerId = row[indexes.zaehler_id];
    const einheitId = row[indexes.einheit_id];
    const objektId = indexes.objekt_id === undefined || isBlankValue(row[indexes.objekt_id])
      ? (opts.defaultObjektId || STAND_ID_MIGRATION_DEFAULT_OBJEKT_ID)
      : row[indexes.objekt_id];

    if (isBlankValue(zaehlerId) || isBlankValue(einheitId)) {
      return;
    }

    const key = getMigrationMappingKey(objektId, zaehlerId);

    if (!mappingCandidates[key]) {
      mappingCandidates[key] = {
        objekt_id: String(objektId).trim(),
        zaehler_id: String(zaehlerId).trim(),
        einheit_ids: {},
        rows: []
      };
    }

    mappingCandidates[key].einheit_ids[String(einheitId).trim()] = true;
    mappingCandidates[key].rows.push(index + 2);
  });

  Object.keys(mappingCandidates).forEach(key => {
    const candidate = mappingCandidates[key];
    const einheitIds = Object.keys(candidate.einheit_ids);

    if (STAND_ID_MIGRATION_EINHEIT_OVERRIDES[normalizeMigrationKey(candidate.zaehler_id)]) {
      mapping[key] = STAND_ID_MIGRATION_EINHEIT_OVERRIDES[normalizeMigrationKey(candidate.zaehler_id)];
    } else if (einheitIds.length === 1) {
      mapping[key] = einheitIds[0];
    } else if (einheitIds.length > 1) {
      conflicts.push({
        key: key,
        objekt_id: candidate.objekt_id,
        zaehler_id: candidate.zaehler_id,
        einheit_ids: einheitIds.join(", "),
        rows: candidate.rows.join(", ")
      });
    }
  });

  return {
    mapping: mapping,
    conflicts: conflicts
  };
}

function getMigrationHeaderIndexes(headers) {
  const indexes = {};

  headers.forEach((header, index) => {
    indexes[String(header).trim().toLowerCase()] = index;
  });

  return indexes;
}

function getMigrationItemFromRow(row, headers) {
  const item = {};

  headers.forEach((header, index) => {
    item[String(header).trim().toLowerCase()] = row[index];
  });

  return item;
}

function buildMigratedZaehlerstandItem(item, options) {
  const opts = options || {};
  const objektId = isBlankValue(item.objekt_id)
    ? (opts.defaultObjektId || STAND_ID_MIGRATION_DEFAULT_OBJEKT_ID)
    : String(item.objekt_id).trim();
  const existingMapping = opts.existingEinheitMapping || {};
  const mappedEinheitId = existingMapping[getMigrationMappingKey(objektId, item.zaehler_id)];
  const einheitId = isBlankValue(item.einheit_id)
    ? (mappedEinheitId || deriveEinheitIdFromLegacyZaehlerId(item.zaehler_id, objektId))
    : String(item.einheit_id).trim();

  if (isBlankValue(item.zaehler_id)) {
    return {
      status: "unresolved",
      reason: "MISSING_ZAEHLER_ID",
      item: item
    };
  }

  if (isBlankValue(item.zeitstempel)) {
    return {
      status: "unresolved",
      reason: "MISSING_ZEITSTEMPEL",
      item: item
    };
  }

  if (isBlankValue(einheitId)) {
    return {
      status: "unresolved",
      reason: "UNKNOWN_EINHEIT_ID",
      item: item
    };
  }

  const migrated = Object.assign({}, item, {
    objekt_id: objektId,
    einheit_id: einheitId
  });
  const newStandId = buildStandId(migrated);

  migrated.stand_id = newStandId;
  migrated["stand.id"] = newStandId;

  return {
    status: "ok",
    oldStandId: item.stand_id || item["stand.id"] || "",
    newStandId: newStandId,
    item: migrated,
    changed: String(item.stand_id || item["stand.id"] || "") !== String(newStandId) ||
      String(item.objekt_id || "") !== String(objektId) ||
      String(item.einheit_id || "") !== String(einheitId)
  };
}

function analyzeStandIdMigrationRows(headers, rows, options) {
  const indexes = getMigrationHeaderIndexes(headers);
  const requiredHeaders = ["stand_id", "objekt_id", "einheit_id", "zaehler_id", "zeitstempel"];
  const missingHeaders = requiredHeaders.filter(header => indexes[header] === undefined);
  const result = {
    totalRows: rows.length,
    migratableRows: 0,
    changedRows: 0,
    unchangedRows: 0,
    unresolvedRows: 0,
    duplicateRows: 0,
    missingHeaders: missingHeaders,
    mappingConflictRows: 0,
    mappingConflicts: [],
    unresolved: [],
    duplicates: [],
    changes: []
  };

  if (missingHeaders.length > 0) {
    return result;
  }

  const seenStandIds = {};
  const mappingResult = buildExistingEinheitMappingFromRows(headers, rows, options);
  const migrationOptions = Object.assign({}, options || {}, {
    existingEinheitMapping: mappingResult.mapping
  });

  result.mappingConflicts = mappingResult.conflicts;
  result.mappingConflictRows = mappingResult.conflicts.length;

  rows.forEach((row, index) => {
    const sheetRow = index + 2;
    const item = getMigrationItemFromRow(row, headers);
    const migration = buildMigratedZaehlerstandItem(item, migrationOptions);

    if (migration.status !== "ok") {
      result.unresolvedRows++;
      result.unresolved.push({
        row: sheetRow,
        reason: migration.reason,
        stand_id: item.stand_id || "",
        zaehler_id: item.zaehler_id || "",
        zeitstempel: item.zeitstempel || ""
      });
      return;
    }

    result.migratableRows++;

    if (seenStandIds[migration.newStandId]) {
      result.duplicateRows++;
      result.duplicates.push({
        row: sheetRow,
        duplicateOfRow: seenStandIds[migration.newStandId],
        stand_id: migration.newStandId
      });
    } else {
      seenStandIds[migration.newStandId] = sheetRow;
    }

    if (migration.changed) {
      result.changedRows++;
      result.changes.push({
        row: sheetRow,
        oldStandId: migration.oldStandId,
        newStandId: migration.newStandId,
        objekt_id: migration.item.objekt_id,
        einheit_id: migration.item.einheit_id,
        zaehler_id: migration.item.zaehler_id
      });
    } else {
      result.unchangedRows++;
    }
  });

  return result;
}

function previewStandIdMigration(options) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Zaehlerstaende");

  if (!sheet) {
    throw new Error("Sheet 'Zaehlerstaende' fehlt.");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return analyzeStandIdMigrationRows([], [], options);
  }

  const headers = values[0].map(header => String(header).trim().toLowerCase());
  const rows = values.slice(1);
  const result = analyzeStandIdMigrationRows(headers, rows, options);

  Logger.log(JSON.stringify({
    totalRows: result.totalRows,
    migratableRows: result.migratableRows,
    changedRows: result.changedRows,
    unchangedRows: result.unchangedRows,
    unresolvedRows: result.unresolvedRows,
    duplicateRows: result.duplicateRows,
    mappingConflictRows: result.mappingConflictRows,
    missingHeaders: result.missingHeaders
  }));

  return result;
}

function applyStandIdMigration(options) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Zaehlerstaende");

  if (!sheet) {
    throw new Error("Sheet 'Zaehlerstaende' fehlt.");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return previewStandIdMigration(options);
  }

  const headers = values[0].map(header => String(header).trim().toLowerCase());
  const rows = values.slice(1);
  const preview = analyzeStandIdMigrationRows(headers, rows, options);

  if (preview.missingHeaders.length > 0) {
    throw new Error("Fehlende Spalten: " + preview.missingHeaders.join(", "));
  }

  if (preview.unresolvedRows > 0 || preview.duplicateRows > 0 || preview.mappingConflictRows > 0) {
    throw new Error("Migration abgebrochen: " + preview.unresolvedRows + " unklare Zeilen, " + preview.duplicateRows + " doppelte neue stand_id, " + preview.mappingConflictRows + " Mapping-Konflikte.");
  }

  const indexes = getMigrationHeaderIndexes(headers);
  const mappingResult = buildExistingEinheitMappingFromRows(headers, rows, options);
  const migrationOptions = Object.assign({}, options || {}, {
    existingEinheitMapping: mappingResult.mapping
  });
  const migratedRows = rows.map(row => {
    const item = getMigrationItemFromRow(row, headers);
    const migration = buildMigratedZaehlerstandItem(item, migrationOptions);
    const nextRow = row.slice();

    nextRow[indexes.stand_id] = migration.item.stand_id;
    nextRow[indexes.objekt_id] = migration.item.objekt_id;
    nextRow[indexes.einheit_id] = migration.item.einheit_id;

    return nextRow;
  });

  sheet.getRange(2, 1, migratedRows.length, headers.length).setValues(migratedRows);

  return preview;
}

function getOrCreateStandIdMigrationReportSheet(ss) {
  const sheetName = "_migration_stand_id_report";
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clear();
  return sheet;
}

function writeStandIdMigrationSection(sheet, startRow, title, headers, rows) {
  sheet.getRange(startRow, 1).setValue(title);
  sheet.getRange(startRow, 1).setFontWeight("bold");

  if (headers.length > 0) {
    sheet.getRange(startRow + 1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(startRow + 1, 1, 1, headers.length).setFontWeight("bold");
  }

  if (rows.length > 0) {
    sheet.getRange(startRow + 2, 1, rows.length, headers.length).setValues(rows);
  }

  return startRow + Math.max(rows.length, 1) + 4;
}

function writeStandIdMigrationReport(options) {
  const preview = previewStandIdMigration(options);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = getOrCreateStandIdMigrationReportSheet(ss);
  let nextRow = 1;

  const summaryRows = [
    ["totalRows", preview.totalRows],
    ["migratableRows", preview.migratableRows],
    ["changedRows", preview.changedRows],
    ["unchangedRows", preview.unchangedRows],
    ["unresolvedRows", preview.unresolvedRows],
    ["duplicateRows", preview.duplicateRows],
    ["mappingConflictRows", preview.mappingConflictRows],
    ["missingHeaders", preview.missingHeaders.join(", ")]
  ];

  nextRow = writeStandIdMigrationSection(
    reportSheet,
    nextRow,
    "Summary",
    ["metric", "value"],
    summaryRows
  );

  nextRow = writeStandIdMigrationSection(
    reportSheet,
    nextRow,
    "Unresolved Rows",
    ["row", "reason", "stand_id", "zaehler_id", "zeitstempel"],
    preview.unresolved.map(item => [
      item.row,
      item.reason,
      item.stand_id,
      item.zaehler_id,
      item.zeitstempel
    ])
  );

  nextRow = writeStandIdMigrationSection(
    reportSheet,
    nextRow,
    "Mapping Conflicts",
    ["key", "objekt_id", "zaehler_id", "einheit_ids", "rows"],
    preview.mappingConflicts.map(item => [
      item.key,
      item.objekt_id,
      item.zaehler_id,
      item.einheit_ids,
      item.rows
    ])
  );

  nextRow = writeStandIdMigrationSection(
    reportSheet,
    nextRow,
    "Duplicate New stand_id Rows",
    ["row", "duplicateOfRow", "new stand_id"],
    preview.duplicates.map(item => [
      item.row,
      item.duplicateOfRow,
      item.stand_id
    ])
  );

  writeStandIdMigrationSection(
    reportSheet,
    nextRow,
    "Changed Rows",
    ["row", "oldStandId", "newStandId", "objekt_id", "einheit_id", "zaehler_id"],
    preview.changes.map(item => [
      item.row,
      item.oldStandId,
      item.newStandId,
      item.objekt_id,
      item.einheit_id,
      item.zaehler_id
    ])
  );

  reportSheet.autoResizeColumns(1, 6);
  Logger.log("Migrationsreport geschrieben: _migration_stand_id_report");

  return {
    sheetName: "_migration_stand_id_report",
    totalRows: preview.totalRows,
    migratableRows: preview.migratableRows,
    changedRows: preview.changedRows,
    unresolvedRows: preview.unresolvedRows,
    duplicateRows: preview.duplicateRows,
    mappingConflictRows: preview.mappingConflictRows
  };
}

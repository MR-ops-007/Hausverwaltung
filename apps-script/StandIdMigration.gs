const STAND_ID_MIGRATION_DEFAULT_OBJEKT_ID = "Ra-HS-29";

const STAND_ID_MIGRATION_EINHEIT_OVERRIDES = {
  Z_STROM_KWH_PRIVAT_NT: "Ra-HS-29_GE_02",
  Z_STROM_KWH_PRIVAT_HT: "Ra-HS-29_GE_02",
  Z_MASCHINENSTUNDEN_PRIVAT: "Ra-HS-29_GE_02"
};

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
  const einheitId = isBlankValue(item.einheit_id)
    ? deriveEinheitIdFromLegacyZaehlerId(item.zaehler_id, objektId)
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
    unresolved: [],
    duplicates: [],
    changes: []
  };

  if (missingHeaders.length > 0) {
    return result;
  }

  const seenStandIds = {};

  rows.forEach((row, index) => {
    const sheetRow = index + 2;
    const item = getMigrationItemFromRow(row, headers);
    const migration = buildMigratedZaehlerstandItem(item, options);

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

  if (preview.unresolvedRows > 0 || preview.duplicateRows > 0) {
    throw new Error("Migration abgebrochen: " + preview.unresolvedRows + " unklare Zeilen, " + preview.duplicateRows + " doppelte neue stand_id.");
  }

  const indexes = getMigrationHeaderIndexes(headers);
  const migratedRows = rows.map(row => {
    const item = getMigrationItemFromRow(row, headers);
    const migration = buildMigratedZaehlerstandItem(item, options);
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
    duplicateRows: preview.duplicateRows
  };
}

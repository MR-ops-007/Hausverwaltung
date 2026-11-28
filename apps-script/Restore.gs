/**
 * Rücksicherung der Hausverwaltungs-Tabelle aus einer Backup-Kopie (P1.3b, ab Backend 4.8.19).
 *
 * Nur im Apps-Script-Editor auszuführen. doGet und doPost rufen nichts aus dieser Datei auf,
 * und die Web-App liefert keine HTML-Oberfläche aus, über die Skriptfunktionen aus dem Browser
 * aufrufbar wären; Tests in tests/restore.test.js sichern beides ab.
 * Vorbereitet wird im Backup-Projekt mit prepareRestore(); Ablauf in docs/backup-restore.md.
 *
 * Zustand in der Script-Property HV_RESTORE_STATE (Code.gs: readRestoreState):
 * - prepared:  Prüfungen laufen oder sind vor dem ersten Schreiben gescheitert; keine Sperre
 * - running:   es wird geschrieben; alle Schreibwege melden MAINTENANCE
 * - failed:    Fehler nach dem ersten Schreiben; Sperre und Restore-IDs bleiben, damit derselbe
 *              Lauf wiederholt oder mit cancelRestore() bewusst abgebrochen werden kann
 * - completed: Inhalt per Hash geprüft, Ansichten und Datenstempel erneuert; IDs gelöscht
 * - abgebrochen: cancelRestore(); IDs gelöscht, Sperre aufgehoben
 */
const RESTORE_PROPERTY = {
  backupId: 'RESTORE_BACKUP_ID',
  preCopyId: 'RESTORE_PRE_COPY_ID'
};

// ---------------------------------------------------------------- reine Funktionen

function isRestoreDataSheet(name) {
  return String(name).charAt(0) !== '_';
}

function restoreTrimmedHeader(header) {
  const cells = (header || []).map(cell => String(cell).trim());
  while (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/**
 * Passt die Kopie zum heutigen Schema? `current`/`backup`: [{ name, header }]. Nur
 * Datenblätter; gleiche Prüfung wie restoreSchemaIssues im Backup-Projekt. Leer heißt passend.
 */
function restoreSchemaIssues(current, backup) {
  const issues = [];
  const backupByName = new Map(backup.filter(sheet => isRestoreDataSheet(sheet.name)).map(sheet => [sheet.name, sheet]));
  current.filter(sheet => isRestoreDataSheet(sheet.name)).forEach(sheet => {
    const other = backupByName.get(sheet.name);
    if (!other) { issues.push('fehlt in der Kopie: ' + sheet.name); return; }
    if (JSON.stringify(restoreTrimmedHeader(other.header)) !== JSON.stringify(restoreTrimmedHeader(sheet.header))) {
      issues.push('Kopfzeile weicht ab: ' + sheet.name);
    }
    backupByName.delete(sheet.name);
  });
  backupByName.forEach((sheet, name) => issues.push('nicht mehr in der Tabelle: ' + name));
  return issues;
}

/** Je Zelle die Formel, wenn eine da ist, sonst der Wert. */
function mergeFormulasAndValues(values, formulas) {
  return values.map((row, r) => row.map((value, c) => {
    const formula = formulas && formulas[r] ? formulas[r][c] : '';
    return formula ? formula : value;
  }));
}

/**
 * Was zurückgeschrieben wird: Formeln als Formeln. setValues liest Text wie eine Eingabe
 * (aus `2026-05` würde ein Datum, aus `0012` die Zahl 12, aus `=x` eine Formel); Text in
 * Zellen ohne Textformat (`@`) bekommt deshalb ein führendes Apostroph, das Sheets nicht
 * speichert. Leere Zellen bleiben leer.
 */
function restoreWriteValues(values, formulas, formats) {
  return values.map((row, r) => row.map((value, c) => {
    const formula = formulas && formulas[r] ? formulas[r][c] : '';
    if (formula) return formula;
    const format = formats && formats[r] ? formats[r][c] : '';
    if (typeof value === 'string' && value !== '' && format !== '@') return "'" + value;
    return value;
  }));
}

// ---------------------------------------------------------------- Apps Script

function restoreDataSheets_(spreadsheet) {
  return spreadsheet.getSheets().filter(sheet => isRestoreDataSheet(sheet.getName()));
}

function restoreSheetContent_(sheet) {
  const range = sheet.getDataRange();
  return mergeFormulasAndValues(range.getValues(), range.getFormulas());
}

function restoreSummaries_(sheets) {
  return sheets.map(sheet => ({ name: sheet.getName(), header: restoreSheetContent_(sheet)[0] || [] }));
}

function restoreSha256_(text) {
  return Utilities.base64Encode(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8
  ));
}

/** Je Datenblatt ein Hash über Formeln und Werte; Rohdaten verlassen die Funktion nicht. */
function restoreHashes_(spreadsheet) {
  const hashes = {};
  restoreDataSheets_(spreadsheet).forEach(sheet => {
    hashes[sheet.getName()] = restoreSha256_(JSON.stringify(restoreSheetContent_(sheet)));
  });
  return hashes;
}

function restoreHashMismatches_(expected, actual) {
  const names = Object.keys(expected).concat(Object.keys(actual).filter(name => !(name in expected))).sort();
  return names.filter(name => expected[name] !== actual[name]);
}

function writeRestoreState_(state) {
  state.aktualisiert = new Date(Date.now()).toISOString();
  PropertiesService.getScriptProperties().setProperty(RESTORE_STATE_PROPERTY, JSON.stringify(state));
}

function restoreLog_(result) {
  if (typeof Logger !== 'undefined') Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Überschreibt die Inhalte eines Blatts mit denen von `source`. Zahlenformate kommen aus der
 * Kopie (damit Text Text bleibt); übrige Formatierung und Datenvalidierung bleiben stehen.
 */
function writeRestoredSheet_(target, source) {
  const range = source.getDataRange();
  const values = range.getValues();
  const formats = range.getNumberFormats();
  const content = restoreWriteValues(values, range.getFormulas(), formats);
  const rows = content.length;
  const columns = rows ? content[0].length : 0;
  const lastRow = target.getLastRow();
  const lastColumn = target.getLastColumn();
  if (lastRow > rows) target.getRange(rows + 1, 1, lastRow - rows, Math.max(lastColumn, columns, 1)).clearContent();
  if (lastColumn > columns && rows) target.getRange(1, columns + 1, rows, lastColumn - columns).clearContent();
  if (!rows || !columns) return;
  if (target.getMaxRows() < rows) target.insertRowsAfter(target.getMaxRows(), rows - target.getMaxRows());
  if (target.getMaxColumns() < columns) target.insertColumnsAfter(target.getMaxColumns(), columns - target.getMaxColumns());
  const targetRange = target.getRange(1, 1, rows, columns);
  targetRange.setNumberFormats(formats);
  targetRange.setValues(content);
}

/**
 * Schritt 2 der Rücksicherung, nur im Editor: setzt die Tabelle vollständig auf die Kopie aus
 * RESTORE_BACKUP_ID zurück. Voraussetzung: RESTORE_PRE_COPY_ID aus prepareRestore() und eine
 * unveränderte Tabelle seit dieser Vor-Restore-Kopie.
 */
function restoreFromBackup() {
  if (arguments.length) throw new Error('restoreFromBackup() wird ohne Argumente im Apps-Script-Editor ausgeführt.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return restoreLog_({ status: 'skipped', reason: 'LOCK_BUSY' });
  try {
    return restoreLog_(restoreFromBackupLocked_());
  } finally {
    lock.releaseLock();
  }
}

function restoreFromBackupLocked_() {
  const props = PropertiesService.getScriptProperties();
  const backupId = String(props.getProperty(RESTORE_PROPERTY.backupId) || '').trim();
  const preCopyId = String(props.getProperty(RESTORE_PROPERTY.preCopyId) || '').trim();
  if (!backupId || !preCopyId) {
    throw new Error('Script-Properties ' + RESTORE_PROPERTY.backupId + ' und ' + RESTORE_PROPERTY.preCopyId +
      ' fehlen. Zuerst im Backup-Projekt prepareRestore() ausführen.');
  }
  const previous = readRestoreState();
  const retry = Boolean(previous && (previous.state === 'failed' || previous.state === 'running'));
  if (retry && (previous.backup_id !== backupId || previous.pre_copy_id !== preCopyId)) {
    throw new Error('Eine abgebrochene Rücksicherung mit anderen IDs ist offen (' + previous.backup_id +
      '). Mit denselben IDs wiederholen oder cancelRestore() ausführen.');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (backupId === preCopyId || backupId === ss.getId() || preCopyId === ss.getId()) {
    throw new Error('Backup, Vor-Restore-Kopie und Tabelle müssen drei verschiedene Dateien sein.');
  }

  const state = {
    state: 'prepared',
    backup_id: backupId,
    pre_copy_id: preCopyId,
    backend_version: BACKEND_VERSION,
    versuch: retry ? (Number(previous.versuch) || 1) + 1 : 1,
    gestartet: new Date(Date.now()).toISOString()
  };
  let written = retry; // Nach einem Fehler kann die Tabelle bereits gemischt sein.
  try {
    writeRestoreState_(state);
    const backup = SpreadsheetApp.openById(backupId);
    const backupSheets = restoreDataSheets_(backup);
    const schema = restoreSchemaIssues(restoreSummaries_(restoreDataSheets_(ss)), restoreSummaries_(backupSheets));
    if (schema.length) throw new Error('Schema passt nicht zur Kopie: ' + schema.join('; '));
    if (!retry) {
      const preCopy = SpreadsheetApp.openById(preCopyId);
      if (restoreHashMismatches_(restoreHashes_(preCopy), restoreHashes_(ss)).length) {
        throw new Error('Die Tabelle wurde seit der Vor-Restore-Kopie geändert. Im Backup-Projekt prepareRestore() erneut ausführen.');
      }
    }

    state.state = 'running';
    writeRestoreState_(state); // ab hier Wartungssperre
    const expected = {};
    backupSheets.forEach(sheet => {
      expected[sheet.getName()] = restoreSha256_(JSON.stringify(restoreSheetContent_(sheet)));
      written = true;
      writeRestoredSheet_(ss.getSheetByName(sheet.getName()), sheet);
    });
    SpreadsheetApp.flush();
    const mismatches = restoreHashMismatches_(expected, restoreHashes_(ss));
    if (mismatches.length) throw new Error('Inhalt nach dem Schreiben weicht ab: ' + mismatches.join(', '));

    updateAktiveMieterView();
    updateVerbrauchViews();
    bumpDatenstandSafe(DATENSTAND_KINDS);

    state.state = 'completed';
    state.abgeschlossen = new Date(Date.now()).toISOString();
    state.blaetter = backupSheets.length;
    writeRestoreState_(state);
    props.deleteProperty(RESTORE_PROPERTY.backupId);
    props.deleteProperty(RESTORE_PROPERTY.preCopyId);
    return {
      status: 'success', state: 'completed', backend_version: BACKEND_VERSION,
      backup: backup.getName() + ' (' + backupId + ')', vor_restore_kopie: preCopyId,
      blaetter: backupSheets.map(sheet => sheet.getName()), versuch: state.versuch
    };
  } catch (error) {
    state.state = written ? 'failed' : 'prepared';
    state.fehler = error && error.message ? error.message : String(error);
    writeRestoreState_(state);
    return {
      status: 'error', state: state.state, backend_version: BACKEND_VERSION, fehler: state.fehler,
      wartungssperre: written,
      naechster_schritt: written
        ? 'Die Tabelle kann teilweise zurückgesetzt sein; die Wartungssperre bleibt. Ursache beheben und restoreFromBackup() ' +
          'mit denselben IDs erneut ausführen. Nur bewusst: cancelRestore().'
        : 'Es wurde nichts geschrieben. Ursache beheben und restoreFromBackup() erneut ausführen.'
    };
  }
}

/** Zustand der letzten Rücksicherung (Ausführungslog). */
function restoreStatus() {
  const props = PropertiesService.getScriptProperties();
  return restoreLog_({
    restore: readRestoreState(),
    wartungssperre: isMaintenanceActive(),
    restore_backup_id: props.getProperty(RESTORE_PROPERTY.backupId) || null,
    restore_pre_copy_id: props.getProperty(RESTORE_PROPERTY.preCopyId) || null
  });
}

/**
 * Bewusster Abbruch: löscht die Restore-IDs und hebt die Wartungssperre auf. Nach einem
 * Fehler mitten im Schreiben kann die Tabelle dann gemischt sein; sicherer ist, die
 * Vor-Restore-Kopie über prepareRestore() zurückzusichern.
 */
function cancelRestore() {
  if (arguments.length) throw new Error('cancelRestore() wird ohne Argumente im Apps-Script-Editor ausgeführt.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return restoreLog_({ status: 'skipped', reason: 'LOCK_BUSY' });
  try {
    const props = PropertiesService.getScriptProperties();
    const previous = readRestoreState();
    const wasWriting = Boolean(previous && (previous.state === 'failed' || previous.state === 'running'));
    props.deleteProperty(RESTORE_PROPERTY.backupId);
    props.deleteProperty(RESTORE_PROPERTY.preCopyId);
    writeRestoreState_(Object.assign({}, previous || {}, { state: 'abgebrochen', vorher: previous ? previous.state : null }));
    bumpDatenstandSafe(DATENSTAND_KINDS);
    return restoreLog_({
      status: 'success', state: 'abgebrochen',
      warnung: wasWriting
        ? 'Die Tabelle kann teilweise zurückgesetzt sein. Vor-Restore-Kopie ' + previous.pre_copy_id + ' prüfen oder zurücksichern.'
        : null
    });
  } finally {
    lock.releaseLock();
  }
}

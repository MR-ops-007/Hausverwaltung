/**
 * Hausverwaltung · Backup
 * Version: 1.0.0
 *
 * Eigenes Apps-Script-Projekt ohne Web-App (Entscheidung 2026-11-27): Nur dieses Projekt
 * hat Drive-Zugriff; die öffentlich erreichbare Web-App bleibt ohne. Es liest die
 * Hausverwaltungs-Tabelle, legt Kopien in einem privaten Drive-Ordner ab und rotiert die
 * automatischen Kopien. Es schreibt nie in die Quelltabelle.
 *
 * Einmalig: Script-Property SOURCE_SPREADSHEET_ID (und BACKUP_LABEL, z. B. TEST oder
 * PROD) setzen, dann setupBackup() ausführen. Ablauf in docs/backup-restore.md.
 */
const BACKUP_VERSION = '1.0.0';
const BACKUP_TIME_ZONE = 'Europe/Berlin';
const BACKUP_MARKER = {
  auto: 'hv-backup:auto',
  manual: 'hv-backup:manuell',
  restore: 'hv-backup:restore-test'
};
// Neben der neuesten Kopie bleibt eine mittlere (bis 49 Tage) und eine ältere. Überschreitet
// die mittlere die Grenze, ersetzt sie die ältere. Bei wöchentlichen Kopien ist die mittlere
// damit 1–7 und die ältere 7–14 Wochen alt (Entscheidung 2026-11-27: neu, ~1, ~3 Monate).
const BACKUP_PROMOTE_AFTER_DAYS = 49;
const BACKUP_MAX_AUTO = 3;
const BACKUP_DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_PROPERTY = {
  source: 'SOURCE_SPREADSHEET_ID',
  label: 'BACKUP_LABEL',
  folder: 'BACKUP_FOLDER_ID',
  fingerprint: 'BACKUP_LAST_FINGERPRINT'
};
const BACKUP_TRIGGER_HANDLER = 'runWeeklyBackup';

// ---------------------------------------------------------------- reine Funktionen

/**
 * Welche automatischen Kopien bleiben? `backups`: [{ id, createdAt (ms) }].
 * Behalten werden die neueste, die jüngste Kopie älter als BACKUP_PROMOTE_AFTER_DAYS
 * (die „ältere“) und die älteste Kopie bis zu dieser Grenze (die „mittlere“). Freie Plätze
 * füllen die jüngsten übrigen. Höchstens BACKUP_MAX_AUTO.
 */
function selectBackupsToKeep(backups, now) {
  const sorted = backups.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (!sorted.length) return { keep: [], remove: [] };
  const limit = BACKUP_PROMOTE_AFTER_DAYS * BACKUP_DAY_MS;
  const rest = sorted.slice(1);
  const keep = [sorted[0]];
  const older = rest.filter(item => now - item.createdAt > limit)[0];
  const middle = rest.filter(item => now - item.createdAt <= limit).pop();
  [older, middle].concat(rest).forEach(item => {
    if (item && keep.length < BACKUP_MAX_AUTO && keep.indexOf(item) === -1) keep.push(item);
  });
  return {
    keep: keep.map(item => item.id),
    remove: sorted.filter(item => keep.indexOf(item) === -1).map(item => item.id)
  };
}

/**
 * Inhalt, über den „Datenbestand geändert?“ entschieden wird: alle Blätter außer den
 * abgeleiteten (`_view_*`, `_migration_*` usw., Name beginnt mit `_`), nach Namen sortiert.
 * Mit `includeDerived` zählen alle Blätter (Restore-Vergleich).
 */
function backupFingerprintSource(sheets, includeDerived) {
  return JSON.stringify(sheets
    .filter(sheet => includeDerived || String(sheet.name).charAt(0) !== '_')
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(sheet => [sheet.name, sheet.values]));
}

function backupFileName(label, kind, stamp) {
  return 'HV-Backup ' + label + ' ' + stamp + ' ' + kind;
}

/** Freigabe-Prüfung: `info` = { access, privateAccess, owner, editors: [], viewers: [] }. */
function backupSharingIssues(info) {
  const issues = [];
  if (info.access !== info.privateAccess) issues.push('Linkfreigabe ist aktiv (' + info.access + ')');
  const others = list => list.filter(email => email && email !== info.owner);
  if (others(info.editors).length) issues.push('Bearbeiter: ' + others(info.editors).join(', '));
  if (others(info.viewers).length) issues.push('Betrachter: ' + others(info.viewers).join(', '));
  return issues;
}

/**
 * Vergleicht Blätter zweier Tabellen: [{ name, rows, columns, header }].
 * Liefert eine Liste von Abweichungen; leer heißt gleich.
 */
function compareSheetSummaries(expected, actual) {
  const problems = [];
  const byName = new Map(actual.map(sheet => [sheet.name, sheet]));
  expected.forEach(sheet => {
    const other = byName.get(sheet.name);
    if (!other) { problems.push('fehlt: ' + sheet.name); return; }
    if (other.rows !== sheet.rows || other.columns !== sheet.columns) {
      problems.push(sheet.name + ': ' + other.rows + '×' + other.columns + ' statt ' + sheet.rows + '×' + sheet.columns);
    }
    if (JSON.stringify(other.header) !== JSON.stringify(sheet.header)) problems.push(sheet.name + ': Kopfzeile weicht ab');
    byName.delete(sheet.name);
  });
  byName.forEach((sheet, name) => problems.push('zusätzlich: ' + name));
  return problems;
}

// ---------------------------------------------------------------- Apps Script

function backupProperties_() {
  return PropertiesService.getScriptProperties();
}

function backupConfig_() {
  const props = backupProperties_();
  const sourceId = props.getProperty(BACKUP_PROPERTY.source);
  if (!sourceId) throw new Error('Script-Property ' + BACKUP_PROPERTY.source + ' fehlt.');
  return {
    sourceId,
    label: props.getProperty(BACKUP_PROPERTY.label) || 'OHNE-LABEL',
    folderId: props.getProperty(BACKUP_PROPERTY.folder) || ''
  };
}

function backupStamp_(date) {
  return Utilities.formatDate(date, BACKUP_TIME_ZONE, 'yyyy-MM-dd HH-mm');
}

function backupLog_(message) {
  if (typeof Logger !== 'undefined') Logger.log(message);
}

function emailsOf_(users) {
  return (users || []).map(user => String(user.getEmail() || '').toLowerCase());
}

function sharingIssuesOf_(item) {
  const owner = item.getOwner();
  return backupSharingIssues({
    access: String(item.getSharingAccess()),
    privateAccess: String(DriveApp.Access.PRIVATE),
    owner: owner ? String(owner.getEmail() || '').toLowerCase() : '',
    editors: emailsOf_(item.getEditors()),
    viewers: emailsOf_(item.getViewers())
  });
}

function backupFolder_(config) {
  if (!config.folderId) throw new Error('Kein Backup-Ordner eingerichtet. Zuerst setupBackup() ausführen.');
  const folder = DriveApp.getFolderById(config.folderId);
  const issues = sharingIssuesOf_(folder);
  if (issues.length) throw new Error('Backup-Ordner ist nicht privat: ' + issues.join('; '));
  return folder;
}

function sheetValues_(spreadsheet) {
  return spreadsheet.getSheets().map(sheet => ({
    name: sheet.getName(),
    values: sheet.getDataRange().getValues()
  }));
}

function sheetSummaries_(spreadsheet) {
  return spreadsheet.getSheets().map(sheet => {
    const rows = sheet.getLastRow();
    const columns = sheet.getLastColumn();
    return {
      name: sheet.getName(),
      rows,
      columns,
      header: rows && columns ? sheet.getRange(1, 1, 1, columns).getValues()[0].map(String) : []
    };
  });
}

function sha256_(text) {
  return Utilities.base64Encode(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8
  ));
}

function sourceFingerprint_(spreadsheet) {
  return sha256_(backupFingerprintSource(sheetValues_(spreadsheet)));
}

/** Je Blatt ein Hash über alle Zellwerte; Rohdaten verlassen die Funktion nicht. */
function sheetContentHashes_(spreadsheet) {
  const hashes = {};
  sheetValues_(spreadsheet).forEach(sheet => {
    hashes[sheet.name] = sha256_(backupFingerprintSource([sheet], true));
  });
  return hashes;
}

/** Namen der Blätter, deren Inhalt abweicht (fehlende Blätter meldet der Strukturvergleich). */
function contentMismatches(expected, actual) {
  return Object.keys(expected).sort()
    .filter(name => name in actual && actual[name] !== expected[name])
    .map(name => 'Inhalt weicht ab: ' + name);
}

function withScriptLock_(name, fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    backupLog_(name + ' übersprungen: Script-Lock ist belegt.');
    return { status: 'skipped', reason: 'LOCK_BUSY' };
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Prüft die Einzelfreigaben aller gekennzeichneten Dateien im Backup-Ordner. */
function auditBackupSharing_(folder) {
  const issues = [];
  [BACKUP_MARKER.auto, BACKUP_MARKER.manual, BACKUP_MARKER.restore].forEach(marker => {
    filesWithMarker_(folder, marker).forEach(file => {
      sharingIssuesOf_(file).forEach(issue => issues.push(file.getName() + ': ' + issue));
    });
  });
  return issues;
}

function filesWithMarker_(folder, marker) {
  const files = [];
  const iterator = folder.getFiles();
  while (iterator.hasNext()) {
    const file = iterator.next();
    if (!file.isTrashed() && file.getDescription() === marker) files.push(file);
  }
  return files;
}

function createCopy_(config, folder, kind, marker, now) {
  const source = DriveApp.getFileById(config.sourceId);
  const copy = source.makeCopy(backupFileName(config.label, kind, backupStamp_(new Date(now))), folder);
  copy.setDescription(marker);
  const issues = sharingIssuesOf_(copy);
  if (issues.length) {
    copy.setTrashed(true);
    throw new Error('Kopie wäre nicht privat, in den Papierkorb gelegt: ' + issues.join('; '));
  }
  return copy;
}

/** Löscht überzählige automatische Kopien (Papierkorb, 30 Tage wiederherstellbar). */
function rotateAutomaticBackups_(folder, now) {
  const files = filesWithMarker_(folder, BACKUP_MARKER.auto);
  const byId = new Map(files.map(file => [file.getId(), file]));
  const plan = selectBackupsToKeep(
    files.map(file => ({ id: file.getId(), createdAt: file.getDateCreated().getTime() })),
    now
  );
  plan.remove.forEach(id => byId.get(id).setTrashed(true));
  return {
    kept: plan.keep.map(id => byId.get(id).getName()),
    trashed: plan.remove.map(id => byId.get(id).getName())
  };
}

/**
 * Einmalig im Backup-Projekt ausführen: prüft die Quelle, legt den privaten Ordner an
 * (falls noch keiner eingetragen ist) und richtet genau einen Wochen-Trigger ein.
 */
function setupBackup() {
  const config = backupConfig_();
  const source = SpreadsheetApp.openById(config.sourceId);
  const props = backupProperties_();
  let createdFolder = false;
  if (!config.folderId) {
    const folder = DriveApp.createFolder('Hausverwaltung Backups ' + config.label);
    folder.setDescription('Automatische und manuelle Kopien der Hausverwaltung (' + config.label + '). Nicht freigeben.');
    config.folderId = folder.getId();
    props.setProperty(BACKUP_PROPERTY.folder, config.folderId);
    createdFolder = true;
  }
  const folder = backupFolder_(config);

  let exists = false;
  let removedDuplicates = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() !== BACKUP_TRIGGER_HANDLER) return;
    if (exists) {
      ScriptApp.deleteTrigger(trigger);
      removedDuplicates++;
    } else {
      exists = true;
    }
  });
  if (!exists) {
    ScriptApp.newTrigger(BACKUP_TRIGGER_HANDLER)
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(3)
      .create();
  }
  const result = {
    status: 'success',
    backup_version: BACKUP_VERSION,
    label: config.label,
    source: source.getName(),
    folder: folder.getName(),
    folder_url: folder.getUrl(),
    created_folder: createdFolder,
    trigger_already_present: exists,
    removed_duplicate_triggers: removedDuplicates
  };
  backupLog_(JSON.stringify(result));
  return result;
}

/** Wochen-Trigger: Kopie nur bei geändertem Datenbestand, danach Rotation. */
function runWeeklyBackup() {
  return withScriptLock_('runWeeklyBackup', () => {
    const config = backupConfig_();
    const folder = backupFolder_(config);
    // Fällt eine einzeln freigegebene Kopie auf, schlägt der Lauf fehl; Apps Script meldet
    // fehlgeschlagene Trigger per E-Mail an den Eigentümer.
    const sharing = auditBackupSharing_(folder);
    if (sharing.length) throw new Error('Kopien im Backup-Ordner sind freigegeben: ' + sharing.join('; '));
    const props = backupProperties_();
    const fingerprint = sourceFingerprint_(SpreadsheetApp.openById(config.sourceId));
    const hasAutomatic = filesWithMarker_(folder, BACKUP_MARKER.auto).length > 0;
    if (hasAutomatic && fingerprint === props.getProperty(BACKUP_PROPERTY.fingerprint)) {
      const skipped = { status: 'skipped', reason: 'UNCHANGED', backup_version: BACKUP_VERSION };
      backupLog_(JSON.stringify(skipped));
      return skipped;
    }
    const now = Date.now();
    const copy = createCopy_(config, folder, 'auto', BACKUP_MARKER.auto, now);
    // Der Fingerabdruck stammt von vor der Kopie. Ändert sich dazwischen etwas, enthält die
    // Kopie den neueren Stand und nächste Woche entsteht eine weitere Kopie; nie umgekehrt.
    props.setProperty(BACKUP_PROPERTY.fingerprint, fingerprint);
    const rotation = rotateAutomaticBackups_(folder, now);
    const result = {
      status: 'success', backup_version: BACKUP_VERSION, created: copy.getName(),
      kept: rotation.kept, trashed: rotation.trashed
    };
    backupLog_(JSON.stringify(result));
    return result;
  });
}

/**
 * Manuelle Kopie vor einem Release oder einer Migration. Unabhängig vom Datenbestand
 * und außerhalb der Rotation; wird nie automatisch gelöscht.
 */
function createManualBackup() {
  return withScriptLock_('createManualBackup', () => {
    const config = backupConfig_();
    const copy = createCopy_(config, backupFolder_(config), 'manuell', BACKUP_MARKER.manual, Date.now());
    const result = { status: 'success', backup_version: BACKUP_VERSION, created: copy.getName(), url: copy.getUrl() };
    backupLog_(JSON.stringify(result));
    return result;
  });
}

/** Übersicht aller Kopien im Backup-Ordner, neueste zuerst. */
function listBackups() {
  const config = backupConfig_();
  const folder = backupFolder_(config);
  const rows = [];
  [BACKUP_MARKER.auto, BACKUP_MARKER.manual, BACKUP_MARKER.restore].forEach(marker => {
    filesWithMarker_(folder, marker).forEach(file => rows.push({
      name: file.getName(), art: marker.replace('hv-backup:', ''), erstellt: file.getDateCreated().toISOString()
    }));
  });
  rows.sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1));
  const result = { kopien: rows, freigabe_warnungen: auditBackupSharing_(folder) };
  backupLog_(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Restore-Test: kopiert die neueste Kopie (automatisch oder manuell) in eine neue,
 * separate Testdatei und vergleicht Blätter, Größen, Kopfzeilen und je Blatt einen Hash
 * über alle Zellwerte. Erfolg nur bei vollständiger Übereinstimmung; geloggt werden nur
 * Blattnamen und Größen, keine Zellinhalte. Die Quelltabelle wird weder gelesen noch
 * verändert. Das Ergebnis wird nach docs/backup-restore.md protokolliert.
 */
function restoreLatestBackupToTestFile() {
  return withScriptLock_('restoreLatestBackupToTestFile', restoreLatestBackupToTestFile_);
}

function restoreLatestBackupToTestFile_() {
  const config = backupConfig_();
  const folder = backupFolder_(config);
  const candidates = filesWithMarker_(folder, BACKUP_MARKER.auto)
    .concat(filesWithMarker_(folder, BACKUP_MARKER.manual))
    .sort((a, b) => b.getDateCreated().getTime() - a.getDateCreated().getTime());
  if (!candidates.length) throw new Error('Keine Kopie im Backup-Ordner gefunden.');
  const backup = candidates[0];
  const target = backup.makeCopy('HV-Restore-Test ' + config.label + ' ' + backupStamp_(new Date(Date.now())), folder);
  target.setDescription(BACKUP_MARKER.restore);
  const issues = sharingIssuesOf_(target);
  if (issues.length) {
    target.setTrashed(true);
    throw new Error('Restore-Ziel wäre nicht privat, in den Papierkorb gelegt: ' + issues.join('; '));
  }
  const backupSheet = SpreadsheetApp.openById(backup.getId());
  const targetSheet = SpreadsheetApp.openById(target.getId());
  const expected = sheetSummaries_(backupSheet);
  const problems = compareSheetSummaries(expected, sheetSummaries_(targetSheet))
    .concat(contentMismatches(sheetContentHashes_(backupSheet), sheetContentHashes_(targetSheet)));
  const result = {
    status: problems.length ? 'error' : 'success',
    backup_version: BACKUP_VERSION,
    quelle: backup.getName() + ' (' + backup.getId() + ')',
    ziel: target.getName() + ' (' + target.getId() + ')',
    ziel_url: target.getUrl(),
    datenstand: backup.getDateCreated().toISOString(),
    blaetter: expected.map(sheet => sheet.name + ' ' + sheet.rows + '×' + sheet.columns),
    abweichungen: problems
  };
  backupLog_(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Hausverwaltung · Backup
 * Version: 1.1.0
 *
 * Eigenes Apps-Script-Projekt ohne Web-App (Entscheidung 2026-11-27): Nur dieses Projekt
 * hat Drive-Zugriff; die öffentlich erreichbare Web-App bleibt ohne. Es liest die
 * Hausverwaltungs-Tabelle, legt Kopien in einem privaten Drive-Ordner ab und rotiert die
 * automatischen Kopien. Es schreibt nie in die Quelltabelle. `SpreadsheetApp.openById`
 * verlangt den Scope `spreadsheets` (der Lese-Scope reicht dafür nicht); dass der Code nur
 * liest, sichert ein Test in tests/backup.test.js ab.
 *
 * Einmalig: Script-Property SOURCE_SPREADSHEET_ID (und BACKUP_LABEL, z. B. TEST oder
 * PROD) setzen, dann setupBackup() ausführen. Ablauf in docs/backup-restore.md.
 *
 * Rücksicherung (ab 1.1.0): Dieses Projekt bereitet nur vor (prepareRestore: Probe-Restore,
 * Schema-Prüfung, Vor-Restore-Kopie). Geschrieben wird ausschließlich von der Web-App
 * (apps-script/Restore.gs) unter ihrem eigenen Lock und mit Wartungssperre.
 */
const BACKUP_VERSION = '1.1.0';
const BACKUP_TIME_ZONE = 'Europe/Berlin';
const BACKUP_MARKER = {
  auto: 'hv-backup:auto',
  manual: 'hv-backup:manuell',
  restore: 'hv-backup:restore-test',
  preRestore: 'hv-backup:vor-restore'
};
// Kopien, aus denen zurückgesichert werden darf (Restore-Testdateien nicht).
const BACKUP_RESTORABLE = [BACKUP_MARKER.auto, BACKUP_MARKER.manual, BACKUP_MARKER.preRestore];
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
  fingerprint: 'BACKUP_LAST_FINGERPRINT',
  restoreId: 'RESTORE_BACKUP_ID'
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

function isDataSheetName(name) {
  return String(name).charAt(0) !== '_';
}

function trimmedHeader_(header) {
  const cells = (header || []).map(cell => String(cell).trim());
  while (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/**
 * Passt eine Kopie zum heutigen Schema? `current`/`backup`: [{ name, header }]. Verglichen
 * werden nur Datenblätter (abgeleitete `_`-Blätter werden nach dem Restore neu berechnet).
 * Leer heißt kompatibel. Gleiche Prüfung in apps-script/Restore.gs.
 */
function restoreSchemaIssues(current, backup) {
  const issues = [];
  const backupByName = new Map(backup.filter(sheet => isDataSheetName(sheet.name)).map(sheet => [sheet.name, sheet]));
  current.filter(sheet => isDataSheetName(sheet.name)).forEach(sheet => {
    const other = backupByName.get(sheet.name);
    if (!other) { issues.push('fehlt in der Kopie: ' + sheet.name); return; }
    if (JSON.stringify(trimmedHeader_(other.header)) !== JSON.stringify(trimmedHeader_(sheet.header))) {
      issues.push('Kopfzeile weicht ab: ' + sheet.name);
    }
    backupByName.delete(sheet.name);
  });
  backupByName.forEach((sheet, name) => issues.push('nicht mehr in der Tabelle: ' + name));
  return issues;
}

/** Was eine Rücksicherung verändert: Datenzeilen je Datenblatt jetzt und danach. */
function restoreImpact(current, backup) {
  const backupRows = new Map(backup.map(sheet => [sheet.name, sheet.rows]));
  return current.filter(sheet => isDataSheetName(sheet.name)).map(sheet => ({
    blatt: sheet.name,
    zeilen_jetzt: Math.max(sheet.rows - 1, 0),
    zeilen_danach: Math.max((backupRows.get(sheet.name) || 0) - 1, 0)
  })).filter(item => item.zeilen_jetzt !== item.zeilen_danach);
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
  Object.keys(BACKUP_MARKER).map(key => BACKUP_MARKER[key]).forEach(marker => {
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
  return withScriptLock_('setupBackup', setupBackup_);
}

function setupBackup_() {
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

/**
 * Übersicht aller Kopien im Backup-Ordner, neueste zuerst. Für Kopien, aus denen
 * zurückgesichert werden kann, mit Datei-ID, Fingerabdruck (Datenblätter) und
 * Blattübersicht; keine Zellinhalte. Die ID ist die Eingabe für RESTORE_BACKUP_ID.
 */
function listBackups() {
  const config = backupConfig_();
  const folder = backupFolder_(config);
  const rows = [];
  BACKUP_RESTORABLE.forEach(marker => {
    filesWithMarker_(folder, marker).forEach(file => {
      const spreadsheet = SpreadsheetApp.openById(file.getId());
      rows.push({
        id: file.getId(),
        name: file.getName(),
        umgebung: config.label,
        art: marker.replace('hv-backup:', ''),
        erstellt: file.getDateCreated().toISOString(),
        fingerabdruck: sourceFingerprint_(spreadsheet).slice(0, 12),
        blaetter: sheetSummaries_(spreadsheet).map(sheet => sheet.name + ' ' + sheet.rows + '×' + sheet.columns)
      });
    });
  });
  filesWithMarker_(folder, BACKUP_MARKER.restore).forEach(file => rows.push({
    id: file.getId(), name: file.getName(), umgebung: config.label, art: 'restore-test',
    erstellt: file.getDateCreated().toISOString()
  }));
  rows.sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1));
  const result = { kopien: rows, freigabe_warnungen: auditBackupSharing_(folder) };
  backupLog_(JSON.stringify(result, null, 2));
  return result;
}

/** Eine Kopie aus dem Backup-Ordner über ihre Datei-ID; nie ein stiller Standard. */
function restorableBackupById_(config, folder, id) {
  const wanted = String(id || '').trim();
  if (!wanted) {
    throw new Error('Script-Property ' + BACKUP_PROPERTY.restoreId + ' fehlt. Die Datei-ID steht in listBackups().');
  }
  if (wanted === config.sourceId) throw new Error('Die Quelltabelle selbst ist keine Kopie.');
  let found = null;
  BACKUP_RESTORABLE.forEach(marker => {
    filesWithMarker_(folder, marker).forEach(file => { if (file.getId() === wanted) found = file; });
  });
  if (!found) {
    throw new Error('Keine wiederherstellbare Kopie mit der ID ' + wanted + ' im Backup-Ordner ' + config.label + '.');
  }
  return found;
}

/**
 * Kopiert `backup` in eine neue Testdatei und vergleicht Blätter, Größen, Kopfzeilen und
 * je Blatt einen Hash über alle Zellwerte. Liest und ändert die Quelltabelle nicht.
 */
function probeRestore_(config, folder, backup) {
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
  return {
    target,
    result: {
      status: problems.length ? 'error' : 'success',
      backup_version: BACKUP_VERSION,
      quelle: backup.getName() + ' (' + backup.getId() + ')',
      ziel: target.getName() + ' (' + target.getId() + ')',
      ziel_url: target.getUrl(),
      datenstand: backup.getDateCreated().toISOString(),
      blaetter: expected.map(sheet => sheet.name + ' ' + sheet.rows + '×' + sheet.columns),
      abweichungen: problems
    }
  };
}

/**
 * Restore-Test der neuesten Kopie (automatisch oder manuell) in eine neue Testdatei.
 * Ungefährlich, deshalb mit Standard „neueste“. Für eine bestimmte Kopie:
 * restoreBackupToTestFile(). Das Ergebnis wird nach docs/backup-restore.md protokolliert.
 */
function restoreLatestBackupToTestFile() {
  return withScriptLock_('restoreLatestBackupToTestFile', () => {
    const config = backupConfig_();
    const folder = backupFolder_(config);
    const candidates = filesWithMarker_(folder, BACKUP_MARKER.auto)
      .concat(filesWithMarker_(folder, BACKUP_MARKER.manual))
      .sort((a, b) => b.getDateCreated().getTime() - a.getDateCreated().getTime());
    if (!candidates.length) throw new Error('Keine Kopie im Backup-Ordner gefunden.');
    const result = probeRestore_(config, folder, candidates[0]).result;
    backupLog_(JSON.stringify(result, null, 2));
    return result;
  });
}

/** Restore-Test der Kopie aus der Script-Property RESTORE_BACKUP_ID in eine neue Testdatei. */
function restoreBackupToTestFile() {
  return withScriptLock_('restoreBackupToTestFile', () => {
    const config = backupConfig_();
    const folder = backupFolder_(config);
    const backup = restorableBackupById_(config, folder, backupProperties_().getProperty(BACKUP_PROPERTY.restoreId));
    const result = probeRestore_(config, folder, backup).result;
    backupLog_(JSON.stringify(result, null, 2));
    return result;
  });
}

/**
 * Schritt 1 der Rücksicherung (Ablauf docs/backup-restore.md). Für die Kopie aus
 * RESTORE_BACKUP_ID: Probe-Restore mit Inhaltsvergleich, Schema-Prüfung gegen die heutige
 * Tabelle, Übersicht der Auswirkung und eine Vor-Restore-Kopie des heutigen Stands, deren
 * Datenblätter mit der Tabelle übereinstimmen müssen. Schreibt nicht in die Tabelle.
 * Schritt 2 ist restoreFromBackup() in der Web-App (Datei Restore.gs).
 */
function prepareRestore() {
  return withScriptLock_('prepareRestore', prepareRestore_);
}

function prepareRestore_() {
  const config = backupConfig_();
  const folder = backupFolder_(config);
  const props = backupProperties_();
  const backup = restorableBackupById_(config, folder, props.getProperty(BACKUP_PROPERTY.restoreId));
  const fail = (schritt, abweichungen, extra) => {
    const result = Object.assign({ status: 'error', backup_version: BACKUP_VERSION, schritt, abweichungen }, extra || {});
    backupLog_(JSON.stringify(result, null, 2));
    return result;
  };

  const probe = probeRestore_(config, folder, backup);
  if (probe.result.status !== 'success') {
    return fail('Probe-Restore', probe.result.abweichungen, { probe: probe.result.ziel });
  }

  const source = SpreadsheetApp.openById(config.sourceId);
  const backupSpreadsheet = SpreadsheetApp.openById(backup.getId());
  const currentSummaries = sheetSummaries_(source);
  const backupSummaries = sheetSummaries_(backupSpreadsheet);
  const schema = restoreSchemaIssues(currentSummaries, backupSummaries);
  if (schema.length) return fail('Schema', schema);

  const preCopy = createCopy_(config, folder, 'vor-restore', BACKUP_MARKER.preRestore, Date.now());
  if (sourceFingerprint_(SpreadsheetApp.openById(preCopy.getId())) !== sourceFingerprint_(source)) {
    preCopy.setTrashed(true);
    return fail('Vor-Restore-Kopie', ['Die Tabelle hat sich während der Kopie geändert. prepareRestore() erneut ausführen.']);
  }
  probe.target.setTrashed(true);
  // Die Freigabe gilt für genau diesen Lauf; eine spätere Vorbereitung braucht die ID erneut.
  props.deleteProperty(BACKUP_PROPERTY.restoreId);

  const datenstand = backup.getDateCreated().toISOString();
  const result = {
    status: 'prepared',
    backup_version: BACKUP_VERSION,
    umgebung: config.label,
    backup: backup.getName() + ' (' + backup.getId() + ')',
    datenstand,
    vor_restore_kopie: preCopy.getName() + ' (' + preCopy.getId() + ')',
    warnung: 'Alle Änderungen seit ' + datenstand + ' gehen verloren; sie bleiben in der Vor-Restore-Kopie erhalten.',
    auswirkung: restoreImpact(currentSummaries, backupSummaries),
    naechster_schritt: 'In der Web-App (Projekt der Tabelle) die Script-Properties RESTORE_BACKUP_ID=' + backup.getId() +
      ' und RESTORE_PRE_COPY_ID=' + preCopy.getId() + ' setzen und in der Datei Restore.gs restoreFromBackup() ausführen. ' +
      'Bis dahin darf sich in der Tabelle nichts ändern, sonst lehnt die Web-App ab.'
  };
  backupLog_(JSON.stringify(result, null, 2));
  return result;
}

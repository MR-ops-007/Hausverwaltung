import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../apps-script-backup/Backup.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../apps-script-backup/appsscript.json', import.meta.url), 'utf8'));
const DAY = 24 * 60 * 60 * 1000;

const EXPORTS = [
  'BACKUP_VERSION', 'BACKUP_MARKER', 'selectBackupsToKeep', 'backupFingerprintSource', 'backupFileName',
  'backupSharingIssues', 'compareSheetSummaries', 'contentMismatches', 'listBackups', 'setupBackup', 'runWeeklyBackup', 'createManualBackup',
  'restoreLatestBackupToTestFile'
];

function load(globals = {}) {
  const names = ['PropertiesService', 'DriveApp', 'SpreadsheetApp', 'ScriptApp', 'LockService', 'Utilities', 'Logger'];
  const factory = new Function(...names, `${code}; return { ${EXPORTS.join(', ')} };`);
  return factory(...names.map(name => globals[name]));
}

const pure = load();

describe('Backup: Rotation', () => {
  const now = 200 * DAY;
  const backup = (id, ageDays) => ({ id, createdAt: now - ageDays * DAY });

  it('behält die neueste, die älteste bis 49 Tage und die jüngste ältere', () => {
    const plan = pure.selectBackupsToKeep(
      [backup('a', 0), backup('b', 7), backup('c', 42), backup('d', 56), backup('e', 90), backup('f', 120)],
      now
    );
    expect(plan.keep).toEqual(['a', 'd', 'c']);
    expect(plan.remove).toEqual(['b', 'e', 'f']);
  });

  it('füllt freie Plätze mit den jüngsten übrigen Kopien', () => {
    expect(pure.selectBackupsToKeep([backup('a', 0), backup('x', 150), backup('y', 300)], now))
      .toEqual({ keep: ['a', 'x', 'y'], remove: [] });
    expect(pure.selectBackupsToKeep([backup('a', 0), backup('b', 3), backup('c', 10), backup('x', 150)], now))
      .toEqual({ keep: ['a', 'x', 'c'], remove: ['b'] });
    expect(pure.selectBackupsToKeep([backup('a', 0), backup('b', 3), backup('c', 10)], now))
      .toEqual({ keep: ['a', 'c', 'b'], remove: [] });
    expect(pure.selectBackupsToKeep([], now)).toEqual({ keep: [], remove: [] });
  });

  for (const every of [7, 14, 21]) {
    it(`staffelt bei Kopien alle ${every} Tage lückenlos: mittlere bis 7, ältere bis 14 Wochen`, () => {
      let files = [];
      for (let day = 0; day < 730; day += every) {
        files.push({ id: `d${day}`, createdAt: day * DAY });
        const plan = pure.selectBackupsToKeep(files, day * DAY);
        files = files.filter(file => plan.keep.includes(file.id));
        expect(files.length).toBeLessThanOrEqual(3);
        if (day >= 120) {
          const ages = files.map(file => (day * DAY - file.createdAt) / DAY).sort((a, b) => a - b);
          expect(ages[0]).toBe(0);
          expect(ages[1]).toBeLessThanOrEqual(49);
          expect(ages[2]).toBeGreaterThan(49);
          expect(ages[2]).toBeLessThanOrEqual(98 + every);
        }
      }
    });
  }
});

describe('Backup: Datenbestand und Freigabe', () => {
  it('Fingerabdruck ignoriert abgeleitete Blätter und die Reihenfolge der Blätter', () => {
    const a = pure.backupFingerprintSource([
      { name: 'Zahlungen', values: [['id'], [1]] },
      { name: '_view_verbrauch_monat', values: [['x'], [1]] },
      { name: 'Objekte', values: [['id'], ['LOK']] }
    ]);
    const b = pure.backupFingerprintSource([
      { name: 'Objekte', values: [['id'], ['LOK']] },
      { name: '_view_verbrauch_monat', values: [['x'], [2]] },
      { name: 'Zahlungen', values: [['id'], [1]] }
    ]);
    const changed = pure.backupFingerprintSource([
      { name: 'Objekte', values: [['id'], ['LOK']] },
      { name: 'Zahlungen', values: [['id'], [2]] }
    ]);
    expect(a).toBe(b);
    expect(changed).not.toBe(a);
  });

  it('nur privat ohne weitere Personen gilt als sicher; der Eigentümer zählt nicht', () => {
    const base = { access: 'PRIVATE', privateAccess: 'PRIVATE', owner: 'po@example.org', editors: ['po@example.org'], viewers: [] };
    expect(pure.backupSharingIssues(base)).toEqual([]);
    expect(pure.backupSharingIssues({ ...base, access: 'ANYONE_WITH_LINK' })).toEqual(['Linkfreigabe ist aktiv (ANYONE_WITH_LINK)']);
    expect(pure.backupSharingIssues({ ...base, viewers: ['x@example.org'] })).toEqual(['Betrachter: x@example.org']);
  });

  it('Restore-Vergleich meldet fehlende, zusätzliche und veränderte Blätter', () => {
    const sheet = (name, rows, header = ['id']) => ({ name, rows, columns: header.length, header });
    expect(pure.compareSheetSummaries([sheet('A', 3)], [sheet('A', 3)])).toEqual([]);
    expect(pure.compareSheetSummaries(
      [sheet('A', 3), sheet('B', 2), sheet('C', 1)],
      [sheet('A', 4), sheet('B', 2, ['ID']), sheet('D', 1)]
    )).toEqual(['A: 4×1 statt 3×1', 'B: Kopfzeile weicht ab', 'fehlt: C', 'zusätzlich: D']);
  });

  it('benennt Kopien eindeutig nach Umgebung, Zeit und Art', () => {
    expect(pure.backupFileName('PROD', 'auto', '2026-11-29 03-00')).toBe('HV-Backup PROD 2026-11-29 03-00 auto');
  });
});

describe('Backup: Projekt-Manifest', () => {
  it('hat keine Web-App und nur die nötigen Berechtigungen', () => {
    expect(manifest.webapp).toBeUndefined();
    expect(manifest.timeZone).toBe('Europe/Berlin');
    expect(manifest.oauthScopes.sort()).toEqual([
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/script.scriptapp',
      'https://www.googleapis.com/auth/spreadsheets'
    ]);
  });

  it('liest Tabellen nur: keine schreibenden Tabellen-Aufrufe im Backup-Code', () => {
    // Der Scope `spreadsheets` erlaubt Schreiben (openById verlangt ihn); der Code nutzt es nicht.
    const writes = /\.(setValues?|setFormulas?|appendRow|insertSheet|deleteSheet|deleteRows?|deleteColumns?|insertRows?|insertColumns?|clear\w*|setName|copyTo|moveTo|setFrozen\w*|merge\w*)\(/;
    expect(code).not.toMatch(writes);
    // Range.sort(spalte) sortiert in der Tabelle; Array.sort bekommt hier nur Vergleichsfunktionen.
    expect(code).not.toMatch(/\.sort\((?!\(|\))/);
    expect(code).not.toMatch(/SpreadsheetApp\.(create|flush)/);
    expect(code).not.toMatch(/\b(UrlFetchApp|MailApp|GmailApp)\b/);
  });

  it('die Web-App im Projekt apps-script nutzt kein DriveApp', () => {
    for (const name of ['Code.gs', 'Contracts.gs', 'ContractService.js', 'Payments.gs', 'PaymentRules.js', 'RentIncreaseReviews.gs', 'StandIdMigration.gs', 'Migration.gs.gs']) {
      const source = readFileSync(new URL(`../apps-script/${name}`, import.meta.url), 'utf8');
      expect(source, name).not.toMatch(/\bDriveApp\b/);
    }
  });
});

// ---------------------------------------------------------------- Abläufe mit nachgebauten Diensten

function fakeEnvironment({ sheets, properties = {}, folderAccess = 'PRIVATE', folderViewers = [], lockFree = true, onCopy = null }) {
  let clock = Date.parse('2026-11-29T02:00:00Z');
  const props = { ...properties };
  const triggers = [];
  const files = [];
  const owner = { getEmail: () => 'po@example.org' };
  const user = email => ({ getEmail: () => email });
  const sharing = (access, viewers = []) => ({
    getOwner: () => owner,
    getSharingAccess: () => access,
    getEditors: () => [owner],
    getViewers: () => viewers.map(user)
  });
  const fileSharing = file => ({
    getOwner: () => owner,
    getSharingAccess: () => file.access,
    getEditors: () => [owner],
    getViewers: () => file.viewers.map(user)
  });

  const makeFile = (name, folder, content) => {
    const file = {
      id: `f${files.length + 1}`, name, description: '', trashed: false, created: new Date(clock), content, folder,
      getId: () => file.id, getName: () => file.name, getUrl: () => `https://drive/${file.id}`,
      getDescription: () => file.description, setDescription: text => { file.description = text; return file; },
      isTrashed: () => file.trashed, setTrashed: value => { file.trashed = value; return file; },
      getDateCreated: () => file.created,
      makeCopy: (copyName, target) => {
        const copy = makeFile(copyName, target, JSON.parse(JSON.stringify(file.content)));
        if (onCopy) onCopy(copy);
        return copy;
      },
      access: folder ? folder.access : 'PRIVATE', viewers: []
    };
    Object.assign(file, fileSharing(file));
    files.push(file);
    return file;
  };
  const folder = {
    id: 'folder1', access: folderAccess,
    getId: () => 'folder1', getName: () => 'Hausverwaltung Backups TEST', getUrl: () => 'https://drive/folder1',
    setDescription: () => folder,
    getFiles: () => {
      const list = files.filter(file => file.folder === folder);
      let i = 0;
      return { hasNext: () => i < list.length, next: () => list[i++] };
    },
    ...sharing(folderAccess, folderViewers)
  };
  const source = makeFile('Hausverwaltung', null, JSON.parse(JSON.stringify(sheets)));

  const spreadsheetOf = file => ({
    getName: () => file.name,
    getSheets: () => file.content.map(sheet => ({
      getName: () => sheet.name,
      getDataRange: () => ({ getValues: () => sheet.values }),
      getLastRow: () => sheet.values.length,
      getLastColumn: () => (sheet.values[0] || []).length,
      getRange: (row, col, rows, cols) => ({ getValues: () => [sheet.values[0].slice(0, cols)] })
    }))
  });

  const globals = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => (key in props ? props[key] : null),
        setProperty: (key, value) => { props[key] = value; }
      })
    },
    DriveApp: {
      Access: { PRIVATE: 'PRIVATE' },
      createFolder: () => folder,
      getFolderById: id => {
        if (id !== 'folder1') throw new Error('unbekannter Ordner');
        return folder;
      },
      getFileById: id => files.find(file => file.id === id)
    },
    SpreadsheetApp: { openById: id => spreadsheetOf(files.find(file => file.id === id)) },
    ScriptApp: {
      WeekDay: { SUNDAY: 'SUNDAY' },
      getProjectTriggers: () => triggers,
      deleteTrigger: trigger => triggers.splice(triggers.indexOf(trigger), 1),
      newTrigger: handler => {
        const builder = {
          timeBased: () => builder, onWeekDay: () => builder, atHour: () => builder,
          create: () => triggers.push({ getHandlerFunction: () => handler })
        };
        return builder;
      }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => lockFree, releaseLock: () => undefined }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (alg, text) => [...text].map(char => char.charCodeAt(0)),
      base64Encode: bytes => String(bytes.reduce((sum, value, index) => (sum * 31 + value + index) % 1e12, 7)),
      formatDate: date => date.toISOString().slice(0, 16).replace('T', ' ').replace(':', '-')
    },
    Logger: { log: () => undefined }
  };

  return {
    globals, props, triggers, files, folder, source,
    advance: days => { clock += days * DAY; },
    now: () => clock,
    autoCopies: () => files.filter(file => file.description === 'hv-backup:auto' && !file.trashed)
  };
}

const SHEETS = [
  { name: 'Objekte', values: [['objekt_id', 'name'], ['LOK', 'Lokstedt']] },
  { name: 'Zahlungen', values: [['zahlung_id', 'betrag'], ['z1', 500]] },
  { name: '_view_verbrauch_monat', values: [['x'], [1]] }
];

function withClock(env, fn) {
  const realNow = Date.now;
  Date.now = () => env.now();
  try { return fn(); } finally { Date.now = realNow; }
}

describe('Backup: Einrichtung', () => {
  it('legt Ordner und genau einen Wochen-Trigger an und ist wiederholbar', () => {
    const env = fakeEnvironment({ sheets: SHEETS, properties: { SOURCE_SPREADSHEET_ID: 'f1', BACKUP_LABEL: 'TEST' } });
    const backup = load(env.globals);
    expect(backup.setupBackup()).toMatchObject({ status: 'success', created_folder: true, trigger_already_present: false, source: 'Hausverwaltung' });
    expect(env.props.BACKUP_FOLDER_ID).toBe('folder1');
    expect(backup.setupBackup()).toMatchObject({ created_folder: false, trigger_already_present: true });
    expect(env.triggers.map(trigger => trigger.getHandlerFunction())).toEqual(['runWeeklyBackup']);
  });

  it('bricht ohne Quelle oder bei freigegebenem Ordner ab', () => {
    expect(() => load(fakeEnvironment({ sheets: SHEETS }).globals).setupBackup()).toThrow(/SOURCE_SPREADSHEET_ID/);
    const shared = fakeEnvironment({
      sheets: SHEETS, folderViewers: ['x@example.org'],
      properties: { SOURCE_SPREADSHEET_ID: 'f1', BACKUP_FOLDER_ID: 'folder1' }
    });
    expect(() => load(shared.globals).runWeeklyBackup()).toThrow(/nicht privat: Betrachter: x@example.org/);
    expect(shared.files).toHaveLength(1);
  });
});

describe('Backup: wöchentlicher Lauf', () => {
  const setup = () => {
    const env = fakeEnvironment({ sheets: SHEETS, properties: { SOURCE_SPREADSHEET_ID: 'f1', BACKUP_LABEL: 'TEST', BACKUP_FOLDER_ID: 'folder1' } });
    return { env, backup: load(env.globals) };
  };

  it('kopiert beim ersten Lauf, danach nur bei geändertem Datenbestand', () => {
    const { env, backup } = setup();
    expect(withClock(env, () => backup.runWeeklyBackup())).toMatchObject({ status: 'success', created: 'HV-Backup TEST 2026-11-29 02-00 auto' });
    env.advance(7);
    expect(withClock(env, () => backup.runWeeklyBackup())).toMatchObject({ status: 'skipped', reason: 'UNCHANGED' });
    env.source.content[2].values[1][0] = 99; // nur abgeleitete View geändert
    env.advance(7);
    expect(withClock(env, () => backup.runWeeklyBackup())).toMatchObject({ status: 'skipped' });
    env.source.content[1].values.push(['z2', 650]);
    env.advance(7);
    expect(withClock(env, () => backup.runWeeklyBackup())).toMatchObject({ status: 'success' });
    expect(env.autoCopies()).toHaveLength(2);
    expect(env.source.description).toBe('');
  });

  it('rotiert nur automatische Kopien und lässt manuelle Kopien stehen', () => {
    const { env, backup } = setup();
    backup.createManualBackup();
    for (let week = 0; week < 10; week++) {
      env.source.content[1].values.push([`w${week}`, week]);
      withClock(env, () => backup.runWeeklyBackup());
      env.advance(7);
    }
    expect(env.autoCopies()).toHaveLength(3);
    expect(env.files.filter(file => file.description === 'hv-backup:auto' && file.trashed)).toHaveLength(7);
    expect(env.files.filter(file => file.description === 'hv-backup:manuell' && !file.trashed)).toHaveLength(1);
    expect(env.source.trashed).toBe(false);
  });

  it('überspringt bei belegtem Lock', () => {
    const env = fakeEnvironment({ sheets: SHEETS, lockFree: false, properties: { SOURCE_SPREADSHEET_ID: 'f1', BACKUP_FOLDER_ID: 'folder1' } });
    expect(load(env.globals).runWeeklyBackup()).toEqual({ status: 'skipped', reason: 'LOCK_BUSY' });
  });
});

describe('Backup: Inhaltsvergleich', () => {
  it('nennt nur Blätter mit abweichendem Inhalt', () => {
    expect(pure.contentMismatches({ A: 'h1', B: 'h2', C: 'h3' }, { A: 'h1', B: 'x', D: 'h4' }))
      .toEqual(['Inhalt weicht ab: B']);
  });
});

describe('Backup: Freigabe bestehender Kopien und Lock', () => {
  const props = { SOURCE_SPREADSHEET_ID: 'f1', BACKUP_LABEL: 'TEST', BACKUP_FOLDER_ID: 'folder1' };

  it('eine nachträglich einzeln freigegebene Kopie lässt den Wochenlauf fehlschlagen und erscheint in listBackups', () => {
    const env = fakeEnvironment({ sheets: SHEETS, properties: props });
    const backup = load(env.globals);
    withClock(env, () => backup.runWeeklyBackup());
    env.autoCopies()[0].viewers.push('x@example.org');
    env.source.content[1].values.push(['z9', 1]);
    expect(() => withClock(env, () => backup.runWeeklyBackup())).toThrow(/freigegeben: HV-Backup TEST .* auto: Betrachter: x@example.org/);
    expect(env.autoCopies()).toHaveLength(1);
    expect(backup.listBackups().freigabe_warnungen).toHaveLength(1);
  });

  it('Einrichtung, manuelle Kopie und Restore-Test überspringen bei belegtem Lock', () => {
    const env = fakeEnvironment({ sheets: SHEETS, lockFree: false, properties: props });
    const backup = load(env.globals);
    expect(backup.setupBackup()).toEqual({ status: 'skipped', reason: 'LOCK_BUSY' });
    expect(backup.createManualBackup()).toEqual({ status: 'skipped', reason: 'LOCK_BUSY' });
    expect(backup.restoreLatestBackupToTestFile()).toEqual({ status: 'skipped', reason: 'LOCK_BUSY' });
    expect(env.files).toHaveLength(1);
  });
});

describe('Backup: Restore-Test', () => {
  it('stellt die neueste Kopie in eine neue Testdatei wieder her und vergleicht sie', () => {
    const env = fakeEnvironment({ sheets: SHEETS, properties: { SOURCE_SPREADSHEET_ID: 'f1', BACKUP_LABEL: 'TEST', BACKUP_FOLDER_ID: 'folder1' } });
    const backup = load(env.globals);
    withClock(env, () => backup.runWeeklyBackup());
    const result = backup.restoreLatestBackupToTestFile();
    expect(result).toMatchObject({ status: 'success', abweichungen: [] });
    expect(result.quelle).toMatch(/^HV-Backup TEST .* auto \(f2\)$/);
    expect(result.ziel).toMatch(/^HV-Restore-Test TEST /);
    expect(result.blaetter).toEqual(['Objekte 2×2', 'Zahlungen 2×2', '_view_verbrauch_monat 2×1']);
    expect(env.files.filter(file => file.description === 'hv-backup:restore-test')).toHaveLength(1);
  });

  it('schlägt fehl, wenn die Restore-Datei bei gleicher Struktur andere Zellinhalte hat', () => {
    const env = fakeEnvironment({
      sheets: SHEETS,
      properties: { SOURCE_SPREADSHEET_ID: 'f1', BACKUP_LABEL: 'TEST', BACKUP_FOLDER_ID: 'folder1' },
      onCopy: copy => { if (copy.name.startsWith('HV-Restore-Test')) copy.content[1].values[1][1] = 501; }
    });
    const backup = load(env.globals);
    withClock(env, () => backup.runWeeklyBackup());
    const result = backup.restoreLatestBackupToTestFile();
    expect(result.status).toBe('error');
    expect(result.abweichungen).toEqual(['Inhalt weicht ab: Zahlungen']);
    // Keine Rohdaten im Ergebnis
    expect(JSON.stringify(result)).not.toMatch(/501|500/);
  });

  it('meldet einen fehlenden Backup-Bestand', () => {
    const env = fakeEnvironment({ sheets: SHEETS, properties: { SOURCE_SPREADSHEET_ID: 'f1', BACKUP_FOLDER_ID: 'folder1' } });
    expect(() => load(env.globals).restoreLatestBackupToTestFile()).toThrow(/Keine Kopie/);
  });
});

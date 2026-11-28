import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../apps-script/${name}`, import.meta.url), 'utf8');
const paymentRules = read('PaymentRules.js');
const code = read('Code.gs');
const restore = read('Restore.gs');
const KEY = 'test-only-key';

// Zelle mit '=' am Anfang gilt als Formel; ihr Wert ist 'calc:<Formel>'. Wie Sheets liest
// setValues Text als Eingabe: '2026-05' ohne Textformat wird zum Datum, ein führendes
// Apostroph erzwingt Text und wird nicht gespeichert.
function fakeSheet(name, cells, { maxRows, failWrites } = {}) {
  const sheet = { name, cells: cells.map(row => row.slice()), formats: {}, maxRows: maxRows || Math.max(cells.length, 3), maxColumns: 6, writes: 0, failWrites };
  const formatOf = (r, c) => sheet.formats[`${r}:${c}`] || (name === 'Zahlungen' && c === 3 ? '@' : 'General');
  const lastRow = () => {
    for (let r = sheet.cells.length; r > 0; r--) if ((sheet.cells[r - 1] || []).some(cell => cell !== '')) return r;
    return 0;
  };
  const lastColumn = () => sheet.cells.reduce((max, row) => {
    for (let c = row.length; c > 0; c--) if (row[c - 1] !== '') return Math.max(max, c);
    return max;
  }, 0);
  const cell = (r, c) => (sheet.cells[r] && sheet.cells[r][c] !== undefined ? sheet.cells[r][c] : '');
  const range = (row, column, rows, columns) => ({
    getValues: () => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => {
      const value = cell(row - 1 + r, column - 1 + c);
      return typeof value === 'string' && value.startsWith('=') ? 'calc:' + value : value;
    })),
    getFormulas: () => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => {
      const value = cell(row - 1 + r, column - 1 + c);
      return typeof value === 'string' && value.startsWith('=') ? value : '';
    })),
    getNumberFormats: () => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => formatOf(row - 1 + r, column - 1 + c))),
    setNumberFormats: formats => formats.forEach((line, r) => line.forEach((format, c) => { sheet.formats[`${row - 1 + r}:${column - 1 + c}`] = format; })),
    setValues: values => {
      if (sheet.failWrites && sheet.writes >= sheet.failWrites - 1) throw new Error('Schreiben fehlgeschlagen');
      if (row - 1 + rows > sheet.maxRows) throw new Error('Bereich außerhalb des Blatts');
      sheet.writes++;
      values.forEach((line, r) => line.forEach((value, c) => {
        while (sheet.cells.length < row + r) sheet.cells.push([]);
        let stored = value;
        if (typeof value === 'string' && value.startsWith("'")) stored = value.slice(1);
        else if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) && formatOf(row - 1 + r, column - 1 + c) !== '@') stored = new Date(value + '-01T00:00:00Z');
        sheet.cells[row - 1 + r][column - 1 + c] = stored;
      }));
    },
    clearContent: () => {
      for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
        if (sheet.cells[row - 1 + r]) sheet.cells[row - 1 + r][column - 1 + c] = '';
      }
    },
    setNumberFormat: () => undefined
  });
  Object.assign(sheet, {
    getName: () => name,
    getLastRow: lastRow,
    getLastColumn: lastColumn,
    getMaxRows: () => sheet.maxRows,
    getMaxColumns: () => sheet.maxColumns,
    insertRowsAfter: (after, count) => { sheet.maxRows += count; },
    insertColumnsAfter: (after, count) => { sheet.maxColumns += count; },
    getDataRange: () => range(1, 1, Math.max(lastRow(), 1), Math.max(lastColumn(), 1)),
    getRange: (row, column, rows = 1, columns = 1) => range(row, column, rows, columns)
  });
  return sheet;
}

function fakeSpreadsheet(id, sheets) {
  const list = sheets.map(([name, cells, options]) => fakeSheet(name, cells, options));
  return {
    id, list,
    getId: () => id,
    getName: () => `Datei ${id}`,
    getSheets: () => list,
    getSheetByName: name => list.find(sheet => sheet.getName() === name) || null,
    cellsOf: name => list.find(sheet => sheet.getName() === name).cells.map(row => row.slice())
  };
}

const CURRENT = [
  ['Objekte', [['objekt_id', 'name'], ['LOK', 'Lokstedt']]],
  ['Zahlungen', [['zahlung_id', 'betrag', 'summe'], ['z1', 500, '=B2'], ['z2', 650, '=B3'], ['z3', 700, '=B4']]],
  ['_view_aktive_mieter', [['name'], ['heute']]]
];
const BACKUP = [
  ['Objekte', [['objekt_id', 'name'], ['LOK', 'Lokstedt'], ['0012', '2026-05']]],
  ['Zahlungen', [['zahlung_id', 'betrag', 'summe'], ['z1', 500, '=B2']]],
  ['_view_aktive_mieter', [['name'], ['damals']]]
];

function backend({ current = CURRENT, backup = BACKUP, preCopy = current, properties = {}, lockFree = true, failWrites } = {}) {
  const ss = fakeSpreadsheet('source', current.map(([name, cells]) => [name, cells, name === 'Zahlungen' && failWrites ? { failWrites } : {}]));
  const files = { source: ss, backup1: fakeSpreadsheet('backup1', backup), pre1: fakeSpreadsheet('pre1', preCopy) };
  const props = { APP_ACCESS_KEY: KEY, ...properties };
  const calls = { viewUpdates: [], flushes: 0, logs: [] };
  const globals = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: name => (name in props ? props[name] : null),
      setProperty: (name, value) => { props[name] = String(value); },
      deleteProperty: name => { delete props[name]; }
    }) },
    CacheService: undefined,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (alg, text) => [...text].map(char => char.charCodeAt(0)),
      base64Encode: bytes => String(bytes.reduce((sum, value, index) => (sum * 31 + value + index) % 1e12, 7))
    },
    ContentService: { createTextOutput: text => ({ text, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => ({ tryLock: () => lockFree, waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: id => { if (!files[id]) throw new Error('Datei nicht gefunden'); return files[id]; },
      flush: () => { calls.flushes++; }
    },
    Logger: { log: text => calls.logs.push(text) }
  };
  const factory = new Function(...Object.keys(globals), 'calls', `${paymentRules}; ${code}; ${restore}
    updateAktiveMieterView = () => { calls.viewUpdates.push('aktive_mieter'); };
    updateVerbrauchViews = () => { calls.viewUpdates.push('verbrauch'); return { status: 'success' }; };
    return { doGet, doPost, restoreFromBackup, cancelRestore, restoreStatus, refreshAktiveMieterViewDaily,
      isMaintenanceActive, readRestoreState, restoreSchemaIssues, mergeFormulasAndValues, restoreWriteValues };`);
  const api = factory(...Object.values(globals), calls);
  return {
    ...api, ss, files, props, calls,
    post: payload => JSON.parse(api.doPost({ postData: { contents: JSON.stringify({ key: KEY, ...payload }) } }).text),
    state: () => api.readRestoreState()
  };
}

const IDS = { RESTORE_BACKUP_ID: 'backup1', RESTORE_PRE_COPY_ID: 'pre1' };
const payment = { typ: 'ZAHLUNG', data: { zahlung_id: 'z9', betrag: 1 } };

describe('Restore: reine Funktionen', () => {
  it('Schema-Prüfung: fehlende, zusätzliche Datenblätter und abweichende Kopfzeilen blockieren; _-Blätter zählen nicht', () => {
    const s = (name, header) => ({ name, header });
    expect(backend().restoreSchemaIssues(
      [s('A', ['id', 'x']), s('B', ['id']), s('C', ['id']), s('_view', ['neu'])],
      [s('A', ['id', 'x', '']), s('B', ['ID']), s('D', ['id']), s('_view', ['alt'])]
    )).toEqual(['Kopfzeile weicht ab: B', 'fehlt in der Kopie: C', 'nicht mehr in der Tabelle: D']);
  });

  it('übernimmt je Zelle die Formel, sonst den Wert', () => {
    expect(backend().mergeFormulasAndValues([[1, 'calc:=A1'], ['x', '']], [['', '=A1'], ['', '']]))
      .toEqual([[1, '=A1'], ['x', '']]);
  });

  it('schützt Text vor dem Einlesen als Datum, Zahl oder Formel, außer in Textformat-Zellen', () => {
    expect(backend().restoreWriteValues(
      [['2026-05', '0012', '=kein', '', 7, 'calc:=A1', '2026-06']],
      [['', '', '', '', '', '=A1', '']],
      [['General', 'General', 'General', 'General', '0.00', 'General', '@']]
    )).toEqual([["'2026-05", "'0012", "'=kein", '', 7, '=A1', '2026-06']]);
  });
});

describe('Restore: Freigabe und Vorprüfung', () => {
  it('ohne Restore-IDs bricht der Lauf ab und schreibt nichts', () => {
    const api = backend();
    expect(() => api.restoreFromBackup()).toThrow(/RESTORE_BACKUP_ID und RESTORE_PRE_COPY_ID fehlen/);
    expect(api.ss.cellsOf('Zahlungen')).toHaveLength(4);
    expect(api.isMaintenanceActive()).toBe(false);
  });

  it('lehnt ab, wenn sich die Tabelle seit der Vor-Restore-Kopie geändert hat; keine Sperre, IDs bleiben', () => {
    const changed = CURRENT.map(([name, cells]) => [name, name === 'Zahlungen' ? cells.concat([['z4', 1, '']]) : cells]);
    const api = backend({ preCopy: changed, properties: IDS });
    expect(api.restoreFromBackup()).toMatchObject({ status: 'error', state: 'prepared', wartungssperre: false });
    expect(api.state().fehler).toMatch(/seit der Vor-Restore-Kopie geändert/);
    expect(api.ss.cellsOf('Zahlungen')).toHaveLength(4);
    expect(api.isMaintenanceActive()).toBe(false);
    expect(api.props).toMatchObject(IDS);
    expect(api.post(payment).code).not.toBe('MAINTENANCE');
  });

  it('blockiert ein inkompatibles Schema vor dem ersten Schreiben', () => {
    const oldSchema = BACKUP.map(([name, cells]) => [name, name === 'Zahlungen' ? [['zahlung_id', 'betrag']].concat(cells.slice(1)) : cells]);
    const api = backend({ backup: oldSchema, properties: IDS });
    expect(api.restoreFromBackup()).toMatchObject({ status: 'error', state: 'prepared' });
    expect(api.state().fehler).toMatch(/Kopfzeile weicht ab: Zahlungen/);
    expect(api.ss.list.every(sheet => sheet.writes === 0)).toBe(true);
  });

  it('Backup, Vor-Restore-Kopie und Tabelle müssen verschiedene Dateien sein', () => {
    expect(() => backend({ properties: { RESTORE_BACKUP_ID: 'pre1', RESTORE_PRE_COPY_ID: 'pre1' } }).restoreFromBackup())
      .toThrow(/drei verschiedene Dateien/);
    expect(() => backend({ properties: { RESTORE_BACKUP_ID: 'source', RESTORE_PRE_COPY_ID: 'pre1' } }).restoreFromBackup())
      .toThrow(/drei verschiedene Dateien/);
  });

  it('überspringt bei belegtem Lock und ändert nichts', () => {
    const api = backend({ properties: IDS, lockFree: false });
    expect(api.restoreFromBackup()).toEqual({ status: 'skipped', reason: 'LOCK_BUSY' });
    expect(api.state()).toBeNull();
  });
});

describe('Restore: vollständige Rücksicherung', () => {
  it('setzt alle Datenblätter zurück, behält Formeln, baut Ansichten neu und löscht die IDs', () => {
    const api = backend({ properties: IDS });
    const before = { ...api.props };
    const result = api.restoreFromBackup();
    expect(result).toMatchObject({ status: 'success', state: 'completed', versuch: 1, blaetter: ['Objekte', 'Zahlungen'] });
    expect(api.ss.cellsOf('Zahlungen').filter(row => row.some(cell => cell !== ''))).toEqual([['zahlung_id', 'betrag', 'summe'], ['z1', 500, '=B2']]);
    expect(api.ss.cellsOf('Objekte')[2]).toEqual(['0012', '2026-05']); // Text bleibt Text
    expect(api.ss.cellsOf('_view_aktive_mieter')).toEqual([['name'], ['heute']]); // nicht kopiert, neu berechnet
    expect(api.calls.viewUpdates).toEqual(['aktive_mieter', 'verbrauch']);
    expect(api.calls.flushes).toBe(1);
    expect(api.props.HV_DATENSTAND_DATEN).not.toBe(before.HV_DATENSTAND_DATEN);
    expect(api.props.HV_DATENSTAND_VERBRAUCH).toBeDefined();
    expect(api.props.RESTORE_BACKUP_ID).toBeUndefined();
    expect(api.props.RESTORE_PRE_COPY_ID).toBeUndefined();
    expect(api.isMaintenanceActive()).toBe(false);
    expect(api.post(payment).code).not.toBe('MAINTENANCE');
    // Keine Zellinhalte im Ergebnis oder Log
    expect(JSON.stringify(result) + api.calls.logs.join('')).not.toMatch(/Lokstedt|650|z1/);
  });

  it('fügt fehlende Zeilen an, wenn die Kopie länger ist als das Blatt', () => {
    const longBackup = BACKUP.map(([name, cells]) => [name, name === 'Zahlungen'
      ? cells.concat([['z2', 650, '=B3'], ['z3', 700, '=B4'], ['z4', 800, '=B5'], ['z5', 900, '=B6']]) : cells]);
    const small = CURRENT.map(([name, cells]) => [name, cells]);
    const api = backend({ backup: longBackup, current: small, preCopy: small, properties: IDS });
    expect(api.restoreFromBackup()).toMatchObject({ status: 'success' });
    expect(api.ss.cellsOf('Zahlungen')).toHaveLength(6);
  });
});

describe('Restore: Fehler mitten im Schreiben und Wiederholung', () => {
  it('Fehler nach dem ersten Schreiben: Zustand failed, Sperre und IDs bleiben, Lesen geht weiter', () => {
    const api = backend({ properties: IDS, failWrites: 1 });
    const result = api.restoreFromBackup();
    expect(result).toMatchObject({ status: 'error', state: 'failed', wartungssperre: true });
    expect(api.props).toMatchObject(IDS);
    expect(api.isMaintenanceActive()).toBe(true);
    for (const typ of ['ZAHLUNG', 'ZAEHLERSTAND_NEU', 'VERTRAG_AKTUALISIEREN', 'INDEX_ANWENDEN', 'MIETERWECHSEL_ANLEGEN',
      'MIETERHOEHUNG_PRUEFUNG_SPEICHERN', 'VERBRAUCH_VIEWS_AKTUALISIEREN']) {
      expect(api.post({ typ, data: {} }), typ).toMatchObject({ status: 'error', code: 'MAINTENANCE', transient: true });
    }
    expect(api.post({ typ: 'LESEN', view: 'zaehlerstaende' }).code).not.toBe('MAINTENANCE');
    expect(api.refreshAktiveMieterViewDaily()).toEqual({ status: 'skipped', reason: 'MAINTENANCE' });
    expect(api.calls.viewUpdates).toEqual([]);
  });

  it('wiederholt mit denselben IDs ohne erneuten Vergleich mit der Vor-Restore-Kopie', () => {
    const api = backend({ properties: IDS, failWrites: 1 });
    api.restoreFromBackup();
    api.ss.getSheetByName('Zahlungen').failWrites = 0;
    expect(api.restoreFromBackup()).toMatchObject({ status: 'success', state: 'completed', versuch: 2 });
    expect(api.isMaintenanceActive()).toBe(false);
  });

  it('nach einem Abbruch ohne catch (Zustand running) gilt die Sperre und derselbe Lauf ist wiederholbar', () => {
    const api = backend({ properties: { ...IDS, HV_RESTORE_STATE: JSON.stringify({ state: 'running', backup_id: 'backup1', pre_copy_id: 'pre1', versuch: 1 }) } });
    expect(api.post(payment).code).toBe('MAINTENANCE');
    expect(api.restoreFromBackup()).toMatchObject({ status: 'success', versuch: 2 });
  });

  it('andere IDs bei offenem Fehlerzustand werden abgelehnt', () => {
    const api = backend({ properties: { RESTORE_BACKUP_ID: 'backup1', RESTORE_PRE_COPY_ID: 'pre1',
      HV_RESTORE_STATE: JSON.stringify({ state: 'failed', backup_id: 'andere', pre_copy_id: 'pre1' }) } });
    expect(() => api.restoreFromBackup()).toThrow(/anderen IDs ist offen/);
    expect(api.isMaintenanceActive()).toBe(true);
  });

  it('cancelRestore hebt die Sperre bewusst auf, löscht die IDs und warnt vor gemischtem Stand', () => {
    const api = backend({ properties: IDS, failWrites: 1 });
    api.restoreFromBackup();
    expect(api.cancelRestore()).toMatchObject({ status: 'success', state: 'abgebrochen', warnung: expect.stringMatching(/pre1/) });
    expect(api.isMaintenanceActive()).toBe(false);
    expect(api.props.RESTORE_BACKUP_ID).toBeUndefined();
  });

  it('ein nicht lesbarer Restore-Zustand sperrt das Schreiben (fail-closed)', () => {
    const api = backend({ properties: { HV_RESTORE_STATE: '{kaputt' } });
    expect(api.isMaintenanceActive()).toBe(true);
    expect(api.post(payment).code).toBe('MAINTENANCE');
  });
});

describe('Restore: nur im Editor auslösbar', () => {
  it('weder doGet noch doPost erreichen Restore-Funktionen', () => {
    const api = backend({ properties: IDS });
    for (const typ of ['RESTORE', 'RESTORE_FROM_BACKUP', 'restoreFromBackup', 'cancelRestore']) {
      expect(api.post({ typ }), typ).toMatchObject({ status: 'error' });
    }
    expect(JSON.parse(api.doGet({ parameter: { action: 'restoreFromBackup' } }).text).code).toBe('UNAUTHORIZED');
    expect(api.state()).toBeNull();
    expect(api.ss.list.every(sheet => sheet.writes === 0)).toBe(true);
    expect(api.props).toMatchObject(IDS);
  });

  it('kein Aufruf aus Code.gs oder anderen Web-App-Dateien, kein HtmlService', () => {
    for (const name of ['Code.gs', 'Contracts.gs', 'ContractService.js', 'Payments.gs', 'PaymentRules.js', 'RentIncreaseReviews.gs', 'StandIdMigration.gs', 'Migration.gs.gs']) {
      const source = read(name);
      expect(source, name).not.toMatch(/restoreFromBackup|cancelRestore|restoreFromBackupLocked_/);
      expect(source, name).not.toMatch(/HtmlService|google\.script\.run/);
    }
    expect(restore).not.toMatch(/HtmlService|DriveApp|UrlFetchApp/);
  });

  it('mit Argument (z. B. Trigger-Ereignis) wird nicht ausgeführt', () => {
    const api = backend({ properties: IDS });
    expect(() => api.restoreFromBackup({ triggerUid: '1' })).toThrow(/ohne Argumente/);
    expect(() => api.cancelRestore({})).toThrow(/ohne Argumente/);
    expect(api.state()).toBeNull();
  });
});

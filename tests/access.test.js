import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const KEY = 'test-only-key';

function backend({ key } = {}) {
  const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const calls = { locks: 0, viewUpdates: 0, contractWrites: [] };
  const rows = {
    Zaehlerstaende: [['stand_id', 'zaehler_id', 'wert']],
    Zahlungen: [['zahlung_id', 'betrag']]
  };
  const makeSheet = (name, values) => ({
    getName: () => name,
    getDataRange: () => ({ getValues: () => values.map(row => row.slice()) }),
    getLastColumn: () => values[0].length,
    getRange: () => ({ getValues: () => [values[0].slice()] }),
    appendRow: row => { values.push(row); }
  });
  const sheets = {
    Zaehlerstaende: makeSheet('Zaehlerstaende', rows.Zaehlerstaende),
    Zahlungen: makeSheet('Zahlungen', rows.Zahlungen),
    Mieter: makeSheet('Mieter', [['name'], ['Max Muster']]),
    OLD_Mieter: makeSheet('OLD_Mieter', [['name'], ['Alt Archiv']]),
    _view_aktive_mieter: makeSheet('_view_aktive_mieter', [['name'], ['Aktiv Mieter']])
  };
  const ss = { getSheets: () => Object.values(sheets), getSheetByName: name => sheets[name] || null };
  const properties = key === undefined ? {} : { APP_ACCESS_KEY: key };
  const globals = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => properties[name] ?? null }) },
    ContentService: { createTextOutput: text => ({ text, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => { calls.locks++; return { waitLock() {}, releaseLock() {} }; } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss }
  };
  const factory = new Function(...Object.keys(globals), 'calls', `${code}
    updateAktiveMieterView = () => { calls.viewUpdates++; };
    handleContractWrite = (spreadsheet, payload) => { calls.contractWrites.push(payload); return { status: 'success', vertrag: {}, anpassung: {} }; };
    return { doGet, doPost, constantTimeEquals };`);
  const api = factory(...Object.values(globals), calls);
  const parse = output => JSON.parse(output.text);
  return {
    ...api, calls, rows,
    get: parameter => parse(api.doGet({ parameter: parameter || {} })),
    raw: payload => api.doPost({ postData: { contents: JSON.stringify(payload) } }),
    post: payload => parse(api.doPost({ postData: { contents: JSON.stringify(payload) } }))
  };
}

const meter = { stand_id: 'ST_TEST', zaehler_id: 'Z_TEST', wert: 5 };

describe('Übergangsmodus ohne APP_ACCESS_KEY (Verhalten wie 4.7.0)', () => {
  it('liefert Daten per GET, aber keine archivierten OLD_-Blätter', () => {
    const data = backend().get();
    expect(data.Mieter).toEqual([{ name: 'Max Muster' }]);
    expect(data.OLD_Mieter).toBeUndefined();
  });

  it('liest per POST ohne Schlüssel und meldet den ungeschützten Zustand', () => {
    const api = backend();
    expect(api.post({ typ: 'LESEN', view: 'alle' }).Mieter).toHaveLength(1);
    expect(api.post({ typ: 'LESEN', view: 'vertrag_capabilities' })).toMatchObject({ contract_writes: true, access_protected: false });
  });

  it('erlaubt das Schreiben ohne Schlüssel', () => {
    const api = backend();
    expect(api.post({ typ: 'ZAEHLERSTAND_NEU', data: [meter] }).status).toBe('success');
    expect(api.rows.Zaehlerstaende).toHaveLength(2);
  });

  it('behandelt eine leere Script Property wie nicht gesetzt', () => {
    expect(backend({ key: '' }).post({ typ: 'LESEN', view: 'alle' }).Mieter).toHaveLength(1);
  });
});

describe('Zugriff mit gesetztem APP_ACCESS_KEY', () => {
  it('liefert per GET keine Daten mehr', () => {
    const api = backend({ key: KEY });
    const output = api.get();
    expect(output).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
    expect(JSON.stringify(output)).not.toContain('Max Muster');
    expect(api.get({ view: 'dashboard' }).code).toBe('UNAUTHORIZED');
    expect(api.get({ view: 'verbrauch' }).code).toBe('UNAUTHORIZED');
    expect(api.get({ view: 'vertrag_capabilities' }).code).toBe('UNAUTHORIZED');
  });

  it('weist Lesen ohne, mit falschem oder leerem Schlüssel ab', () => {
    const api = backend({ key: KEY });
    for (const key of [undefined, '', 'falsch', KEY.slice(0, -1), KEY + 'x']) {
      const text = api.raw({ typ: 'LESEN', view: 'alle', key }).text;
      expect(JSON.parse(text)).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
      expect(text).not.toContain('Max Muster');
    }
  });

  it('liest mit richtigem Schlüssel alle Ansichten', () => {
    const api = backend({ key: KEY });
    expect(api.post({ typ: 'LESEN', view: 'alle', key: KEY }).Mieter).toHaveLength(1);
    expect(api.post({ typ: 'LESEN', view: 'dashboard', key: KEY })).toEqual({ _view_aktive_mieter: [{ name: 'Aktiv Mieter' }] });
    expect(Object.keys(api.post({ typ: 'LESEN', view: 'verbrauch', key: KEY })).sort()).toEqual([
      '_view_verbrauch_audit', '_view_verbrauch_bilanz_jahr', '_view_verbrauch_jahr', '_view_verbrauch_monat'
    ]);
    expect(api.post({ typ: 'LESEN', view: 'vertrag_capabilities', key: KEY })).toMatchObject({ access_protected: true });
  });

  it('lehnt Schreibzugriffe ohne Schlüssel ab, ohne zu schreiben, zu sperren oder Views zu aktualisieren', () => {
    const api = backend({ key: KEY });
    for (const payload of [
      { typ: 'ZAEHLERSTAND_NEU', data: [meter] },
      { typ: 'ZAHLUNG', data: { zahlung_id: 'Z1', betrag: 10 } },
      { typ: 'VERTRAG_AKTUALISIEREN', token: 'egal', data: {} },
      { typ: 'ZAEHLERSTAND_NEU', data: [meter], key: 'falsch' }
    ]) {
      expect(api.post(payload)).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
    }
    expect(api.rows.Zaehlerstaende).toHaveLength(1);
    expect(api.rows.Zahlungen).toHaveLength(1);
    expect(api.calls).toEqual({ locks: 0, viewUpdates: 0, contractWrites: [] });
  });

  it('schreibt mit richtigem Schlüssel und reicht Vertragsänderungen weiter', () => {
    const api = backend({ key: KEY });
    expect(api.post({ typ: 'ZAEHLERSTAND_NEU', data: [meter], key: KEY }).status).toBe('success');
    expect(api.rows.Zaehlerstaende[1]).toEqual(['ST_TEST', 'Z_TEST', 5]);
    expect(api.post({ typ: 'ZAHLUNG', data: { zahlung_id: 'Z1', betrag: 10 }, key: KEY }).status).toBe('success');
    expect(api.rows.Zahlungen[1]).toEqual(['Z1', 10]);
    expect(api.calls.viewUpdates).toBe(2);
    api.post({ typ: 'INDEX_ANWENDEN', token: 'vertrag', data: {}, key: KEY });
    expect(api.calls.contractWrites).toHaveLength(1);
  });
});

describe('Schreibtypen und Eingaben', () => {
  it.each([undefined, { key: KEY }])('schreibt bei unbekanntem oder fehlendem Typ nichts', protectedMode => {
    const api = backend(protectedMode);
    const key = protectedMode ? KEY : undefined;
    for (const typ of ['IRGENDWAS', 'LESEN_ALLES', undefined]) {
      expect(api.post({ typ, data: [meter], key })).toMatchObject({ status: 'error', message: 'Unbekannter Typ.' });
    }
    expect(api.rows.Zaehlerstaende).toHaveLength(1);
    expect(api.rows.Zahlungen).toHaveLength(1);
    expect(api.calls.viewUpdates).toBe(0);
  });

  it('beantwortet ungültiges JSON mit einem Fehler statt mit einer Ausnahme', () => {
    const api = backend({ key: KEY });
    const output = JSON.parse(api.doPost({ postData: { contents: '{kaputt' } }).text);
    expect(output.status).toBe('error');
    expect(api.doPost(undefined).text).toContain('Keine Daten');
  });
});

describe('Schlüsselvergleich', () => {
  it('vergleicht vollständig und ohne Typ-Überraschungen', () => {
    const { constantTimeEquals } = backend();
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
    expect(constantTimeEquals('abcd', 'abc')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
    expect(constantTimeEquals(undefined, 'abc')).toBe(false);
    expect(constantTimeEquals(null, '')).toBe(true);
    expect(constantTimeEquals(123, '123')).toBe(true);
  });
});

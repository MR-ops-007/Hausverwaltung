import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const KEY = 'test-only-key';

function backend({ key, accessKeys, paymentRows } = {}) {
  const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const calls = { locks: 0, viewUpdates: 0, contractWrites: [] };
  const rows = {
    Zaehlerstaende: [['stand_id', 'zaehler_id', 'wert']],
    Zahlungen: paymentRows || [['zahlung_id', 'betrag']]
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
  const properties = {};
  if (key !== undefined) properties.APP_ACCESS_KEY = key;
  if (accessKeys !== undefined) properties.APP_ACCESS_KEYS_JSON = JSON.stringify(accessKeys);
  const globals = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => properties[name] ?? null }) },
    ContentService: { createTextOutput: text => ({ text, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => { calls.locks++; return { waitLock() {}, releaseLock() {} }; } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss }
  };
  const factory = new Function(...Object.keys(globals), 'calls', `${code}
    updateAktiveMieterView = () => { calls.viewUpdates++; };
    updateVerbrauchViews = () => { calls.viewUpdates++; return { status: 'success', message: 'Verbrauchsviews aktualisiert' }; };
    handleContractWrite = (spreadsheet, payload) => { calls.contractWrites.push(payload); return { status: 'success', vertrag: {}, anpassung: {} }; };
    return { doGet, doPost, constantTimeEquals, getAccessPrincipal };`);
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

describe('Fail-closed ohne konfigurierte Zugangsschlüssel', () => {
  it('liefert per GET keine Daten', () => {
    const data = backend().get();
    expect(data).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
    expect(JSON.stringify(data)).not.toContain('Max Muster');
  });

  it('weist Lesen und Schreiben ohne Konfiguration ab', () => {
    const api = backend();
    expect(api.post({ typ: 'LESEN', view: 'alle' })).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
    expect(api.post({ typ: 'ZAEHLERSTAND_NEU', data: [meter] })).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
    expect(api.rows.Zaehlerstaende).toHaveLength(1);
  });

  it('behandelt eine leere Script Property ebenfalls als geschlossen', () => {
    expect(backend({ key: '' }).post({ typ: 'LESEN', view: 'alle' })).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
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
    expect(api.post({ typ: 'LESEN', view: 'vertrag_capabilities', key: KEY })).toMatchObject({ access_protected: true, access_role: 'admin' });
  });

  it('meldet die Zahlungsfähigkeit und fehlende Zahlungsspalten explizit', () => {
    const incomplete = backend({ key: KEY, paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art']] });
    expect(incomplete.post({ typ: 'LESEN', view: 'vertrag_capabilities', key: KEY })).toMatchObject({
      payment_writes: true,
      payment_schema_ready: false,
      payment_schema_missing: ['mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id']
    });

    const ready = backend({
      key: KEY,
      paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id']]
    });
    expect(ready.post({ typ: 'LESEN', view: 'vertrag_capabilities', key: KEY })).toMatchObject({
      payment_writes: true,
      payment_schema_ready: true,
      payment_schema_missing: []
    });
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

  it('behandelt Zahlungen über zahlung_id idempotent und weist abweichende Wiederholungen ab', () => {
    const api = backend({
      key: KEY,
      paymentRows: [
        ['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art'],
        ['P_EXISTING', 'V1', '2026-11-01', 650, 'Miete']
      ]
    });

    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'P_EXISTING', vertrag_id: 'V1', datum: '2026-11-01', betrag: 650, art: 'Miete' }]
    })).toMatchObject({ status: 'success', angelegt: 0, bereits_vorhanden: 1 });
    expect(api.rows.Zahlungen).toHaveLength(2);

    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'P_EXISTING', vertrag_id: 'V1', datum: '2026-11-01', betrag: 700, art: 'Miete' }]
    })).toMatchObject({ status: 'error', code: 'PAYMENT_ID_CONFLICT' });
    expect(api.rows.Zahlungen).toHaveLength(2);
  });

  it('akzeptiert negative Zahlungsbeträge nur als gültiges Storno', () => {
    const api = backend({
      key: KEY,
      paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art'],
        ['ORIGINAL_1', 'V1', '2026-11-10', 650, 'Miete', '2026-11', '', '']]
    });
    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'NEGATIVE_Miete', vertrag_id: 'V1', datum: '2026-11-11', betrag: -650, art: 'Miete' }]
    })).toMatchObject({ status: 'error' });

    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'STORNO_1', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-11', betrag: -650, art: 'Storno', storno_von: 'ORIGINAL_1', gegen_art: 'Miete' }]
    })).toMatchObject({ status: 'success', angelegt: 1 });
  });

  it('verhindert ein zweites Storno derselben Originalzahlung', () => {
    const api = backend({
      key: KEY,
      paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art'],
        ['ORIGINAL_1', 'V1', '2026-11-10', 650, 'Miete', '2026-11', '', ''],
        ['STORNO_1', 'V1', '2026-11-11', -650, 'Storno', '2026-11', 'ORIGINAL_1', 'Miete']]
    });
    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'STORNO_2', vertrag_id: 'V1', datum: '2026-11-12', mietmonat: '2026-11', betrag: -650, art: 'Storno', storno_von: 'ORIGINAL_1', gegen_art: 'Miete' }]
    })).toMatchObject({ status: 'error', code: 'PAYMENT_ALREADY_STORNOED' });
  });

  it('übernimmt Mietmonat und Zahlungsgruppe beim Storno aus dem Original', () => {
    const api = backend({
      key: KEY,
      paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id'],
        ['ORIGINAL_1', 'V1', '2026-11-10', 250, 'Miete', '2026-02', '', '', 'ZG_1']]
    });

    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'STORNO_1', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-11', betrag: -250, art: 'Storno', storno_von: 'ORIGINAL_1', gegen_art: 'Kaution', zahlungsgruppe_id: 'WRONG_GROUP' }]
    })).toMatchObject({ status: 'success', angelegt: 1 });

    expect(api.rows.Zahlungen[2]).toEqual(['STORNO_1', 'V1', '2026-11-11', -250, 'Storno', '2026-02', 'ORIGINAL_1', 'Miete', 'ZG_1']);
  });

  it('ordnet das Storno einer historischen Altzahlung dem Eingangsmonat zu', () => {
    const api = backend({
      key: KEY,
      paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id'],
        ['LEGACY_1', 'V1', '2026-03-05', 650, 'Miete', '', '', '', '']]
    });

    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'STORNO_LEGACY_1', vertrag_id: 'V1', datum: '2026-11-12', mietmonat: '2026-11', betrag: -650, art: 'Storno', storno_von: 'LEGACY_1', gegen_art: 'Kaution' }]
    })).toMatchObject({ status: 'success', angelegt: 1 });

    expect(api.rows.Zahlungen[2]).toEqual(['STORNO_LEGACY_1', 'V1', '2026-11-12', -650, 'Storno', '2026-03', 'LEGACY_1', 'Miete', '']);
  });

  it('akzeptiert einen Retry desselben Stornos auch mit ungeeigneten Client-Metadaten', () => {
    const api = backend({
      key: KEY,
      paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id'],
        ['ORIGINAL_1', 'V1', '2026-02-05', 250, 'Miete', '', '', '', '']]
    });
    const payload = { typ: 'ZAHLUNG', key: KEY, data: [{ zahlung_id: 'STORNO_1', vertrag_id: 'V1', datum: '2026-11-12', mietmonat: '2026-11', betrag: -250, art: 'Storno', storno_von: 'ORIGINAL_1', gegen_art: 'Kaution' }] };

    expect(api.post(payload)).toMatchObject({ status: 'success', angelegt: 1 });
    expect(api.post(payload)).toMatchObject({ status: 'success', angelegt: 0, bereits_vorhanden: 1 });
  });

  it('validiert den fachlichen Mietmonat und den Originalbetrag eines Stornos', () => {
    const api = backend({
      key: KEY,
      paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art'],
        ['ORIGINAL_1', 'V1', '2026-11-10', 650, 'Miete', '2026-11', '', '']]
    });
    expect(api.post({
      typ: 'ZAHLUNG', key: KEY,
      data: [{ zahlung_id: 'BAD_MONTH', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: 'November', betrag: 10, art: 'Miete' }]
    })).toMatchObject({ status: 'error', code: 'PAYMENT_MONTH_INVALID' });
    expect(api.post({
      typ: 'ZAHLUNG', key: KEY,
      data: [{ zahlung_id: 'BAD_STORNO', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-11', betrag: -100, art: 'Storno', storno_von: 'ORIGINAL_1', gegen_art: 'Miete' }]
    })).toMatchObject({ status: 'error', code: 'STORNO_AMOUNT_MISMATCH' });
  });

  it('speichert fachlichen Mietmonat und negative Erstattung nur mit erweitertem Zahlungen-Schema', () => {
    const api = backend({
      key: KEY,
      paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art']]
    });
    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'FEB_1', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-02', betrag: 150, art: 'Miete' }]
    })).toMatchObject({ status: 'success', angelegt: 1 });
    expect(api.rows.Zahlungen[1]).toEqual(['FEB_1', 'V1', '2026-11-11', 150, 'Miete', '2026-02', '', '']);

    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'REFUND_1', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-02', betrag: -25, art: 'Erstattung' }]
    })).toMatchObject({ status: 'success', angelegt: 1 });

    expect(api.post({
      typ: 'ZAHLUNG',
      key: KEY,
      data: [{ zahlung_id: 'REFUND_2', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-02', betrag: 25, art: 'Erstattung' }]
    })).toMatchObject({ status: 'error' });
  });

  it('aktualisiert Verbrauchsviews nur mit richtigem Schlüssel', () => {
    const api = backend({ key: KEY });
    expect(api.post({ typ: 'VERBRAUCH_VIEWS_AKTUALISIEREN', key: 'falsch' })).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
    expect(api.calls.locks).toBe(0);
    expect(api.post({ typ: 'VERBRAUCH_VIEWS_AKTUALISIEREN', key: KEY })).toMatchObject({ status: 'success', message: 'Verbrauchsviews aktualisiert' });
    expect(api.calls.locks).toBe(1);
  });
});

describe('Schreibtypen und Eingaben', () => {
  it('schreibt bei unbekanntem oder fehlendem Typ nichts', () => {
    const api = backend({ key: KEY });
    for (const typ of ['IRGENDWAS', 'LESEN_ALLES', undefined]) {
      expect(api.post({ typ, data: [meter], key: KEY })).toMatchObject({ status: 'error', message: 'Unbekannter Typ.' });
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

describe('Geräteschlüssel und Rollen', () => {
  const accessKeys = [
    { id: 'iphone-michael', label: 'iPhone Michael', key: 'admin-key', role: 'admin', aktiv: true },
    { id: 'ipad-vater', label: 'iPad Vater', key: 'capture-key', role: 'erfassen', aktiv: true },
    { id: 'altes-geraet', label: 'Altes Gerät', key: 'old-key', role: 'erfassen', aktiv: false }
  ];

  it('erlaubt Erfassen Lesen, Zählerstände und Zahlungen, aber keine Verträge', () => {
    const api = backend({ accessKeys });
    expect(api.getAccessPrincipal('capture-key')).toMatchObject({ id: 'ipad-vater', label: 'iPad Vater', role: 'erfassen' });
    expect(api.post({ typ: 'LESEN', view: 'vertrag_capabilities', key: 'capture-key' })).toMatchObject({
      contract_writes: false,
      access_role: 'erfassen'
    });
    expect(api.post({ typ: 'ZAEHLERSTAND_NEU', data: [meter], key: 'capture-key' }).status).toBe('success');
    expect(api.post({ typ: 'ZAHLUNG', data: { zahlung_id: 'Z2', betrag: 10 }, key: 'capture-key' }).status).toBe('success');
    expect(api.post({ typ: 'VERTRAG_AKTUALISIEREN', token: 'vertrag', data: {}, key: 'capture-key' })).toMatchObject({ status: 'error', code: 'FORBIDDEN' });
    expect(api.calls.contractWrites).toHaveLength(0);
  });

  it('erlaubt Vertragsänderungen nur für Admin-Geräte', () => {
    const api = backend({ accessKeys });
    expect(api.post({ typ: 'VERTRAG_AKTUALISIEREN', token: 'vertrag', data: {}, key: 'admin-key' }).status).toBe('success');
    expect(api.calls.contractWrites).toHaveLength(1);
  });

  it('ignoriert deaktivierte Geräte und unlesbare Schlüsselkonfigurationen', () => {
    const api = backend({ accessKeys });
    expect(api.post({ typ: 'LESEN', view: 'alle', key: 'old-key' })).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
    expect(backend({ accessKeys: [{ id: 'kaputt', key: 'x', role: 'unbekannt' }] }).post({ typ: 'LESEN', view: 'alle', key: 'x' })).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
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

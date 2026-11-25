import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

const KEY = 'test-only-key';

function backend({ key, accessKeys, paymentRows, cacheService, utilities } = {}) {
  const paymentRules = readFileSync(new URL('../apps-script/PaymentRules.js', import.meta.url), 'utf8');
  const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const calls = { locks: 0, viewUpdates: 0, sheetReads: 0, contractWrites: [], tenantChanges: [] };
  const rows = {
    Zaehlerstaende: [['stand_id', 'zaehler_id', 'wert']],
    Zahlungen: paymentRows || [['zahlung_id', 'betrag']]
  };
  const makeSheet = (name, values) => ({
    getName: () => name,
    getDataRange: () => ({ getValues: () => { calls.sheetReads++; return values.map(row => row.slice()); } }),
    getLastColumn: () => values[0].length,
    getLastRow: () => values.length,
    getRange: (...args) => {
      if (args.length === 0) return { getValues: () => [values[0].slice()] };
      const row = args[0] || 1;
      const column = args[1] || 1;
      const rowCount = args[2] || 1;
      const columnCount = args[3] || 1;
      return {
        getValues: () => values.slice(row - 1, row - 1 + rowCount)
          .map(currentRow => currentRow.slice(column - 1, column - 1 + columnCount)),
        setNumberFormat: () => {},
        setValue: value => { values[row - 1][column - 1] = value; }
      };
    },
    appendRow: row => { values.push(row); }
  });
  const sheets = {
    Zaehlerstaende: makeSheet('Zaehlerstaende', rows.Zaehlerstaende),
    Zahlungen: makeSheet('Zahlungen', rows.Zahlungen),
    Mieter: makeSheet('Mieter', [['name'], ['Max Muster']]),
    OLD_Mieter: makeSheet('OLD_Mieter', [['name'], ['Alt Archiv']]),
    _view_aktive_mieter: makeSheet('_view_aktive_mieter', [['name'], ['Aktiv Mieter']]),
    _view_verbrauch_jahr: makeSheet('_view_verbrauch_jahr', [['objekt_id', 'jahr'], ['O1', 2026]])
  };
  const ss = { getSheets: () => Object.values(sheets), getSheetByName: name => sheets[name] || null };
  const properties = {};
  if (key !== undefined) properties.APP_ACCESS_KEY = key;
  if (accessKeys !== undefined) properties.APP_ACCESS_KEYS_JSON = JSON.stringify(accessKeys);
  const globals = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: name => properties[name] ?? null,
      setProperty: (name, value) => { properties[name] = String(value); }
    }) },
    CacheService: cacheService,
    Utilities: utilities,
    ContentService: { createTextOutput: text => ({ text, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => { calls.locks++; return { waitLock() {}, releaseLock() {} }; } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss }
  };
  const factory = new Function(...Object.keys(globals), 'calls', `${paymentRules}; ${code}
    updateAktiveMieterView = () => { calls.viewUpdates++; };
    updateVerbrauchViews = () => { calls.viewUpdates++; return { status: 'success', message: 'Verbrauchsviews aktualisiert' }; };
    handleContractWrite = (spreadsheet, payload) => { calls.contractWrites.push(payload); return { status: 'success', vertrag: {}, anpassung: {} }; };
    handleTenantChange = (spreadsheet, payload) => { calls.tenantChanges.push(payload); return { status: 'success', vertrag_neu: payload.data }; };
    return { doGet, doPost, constantTimeEquals, getAccessPrincipal, canWriteType, onEdit, getDatenstand, bumpDatenstand, datenstandKindsForSheet, DATENSTAND_MAX_AGE_MS };`);
  const api = factory(...Object.values(globals), calls);
  const parse = output => JSON.parse(output.text);
  return {
    ...api, calls, rows, properties, sheets,
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

  it('liefert mit stammdaten nur die vom Frontend genutzten Blätter', () => {
    const api = backend({ key: KEY });
    const data = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY });
    // Im Test-Spreadsheet existieren nur Zaehlerstaende und Zahlungen aus der Liste;
    // Mieter, OLD_- und _view_-Blätter gehören nicht zum Startabruf.
    expect(Object.keys(data).sort()).toEqual(['Zaehlerstaende', 'Zahlungen', '_datenstand']);
    expect(JSON.stringify(data)).not.toContain('Aktiv Mieter');
    expect(api.post({ typ: 'LESEN', view: 'vertrag_capabilities', key: KEY })).toMatchObject({ stammdaten_view: true });
  });

  it('schützt auch die stammdaten-Ansicht', () => {
    expect(backend({ key: KEY }).post({ typ: 'LESEN', view: 'stammdaten', key: 'falsch' })).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' });
  });

  it('liest mit richtigem Schlüssel alle Ansichten', () => {
    const api = backend({ key: KEY });
    expect(api.post({ typ: 'LESEN', view: 'alle', key: KEY }).Mieter).toHaveLength(1);
    expect(api.post({ typ: 'LESEN', view: 'dashboard', key: KEY })).toEqual({ _view_aktive_mieter: [{ name: 'Aktiv Mieter' }] });
    expect(Object.keys(api.post({ typ: 'LESEN', view: 'verbrauch', key: KEY })).sort()).toEqual([
      '_datenstand', '_view_verbrauch_audit', '_view_verbrauch_bilanz_jahr', '_view_verbrauch_jahr', '_view_verbrauch_monat'
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
    expect(api.calls).toEqual({ locks: 0, viewUpdates: 0, sheetReads: 0, contractWrites: [], tenantChanges: [] });
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

  it('routet Mieterwechsel nur für Admin-Geräte und meldet die Capability', () => {
    const admin = backend({ key: KEY });
    expect(admin.post({ typ: 'MIETERWECHSEL_ANLEGEN', key: KEY, token: 'vertrag', vertrag_id: 'ALT',
      data: { vertrag_id: 'NEU' } })).toMatchObject({ status: 'success' });
    expect(admin.calls.tenantChanges).toHaveLength(1);
    expect(admin.post({ typ: 'LESEN', view: 'vertrag_capabilities', key: KEY })).toMatchObject({ tenant_change_writes: true });

    const capture = backend({ accessKeys: [{ id: 'father', key: 'capture-key', role: 'erfassen', aktiv: true }] });
    expect(capture.post({ typ: 'MIETERWECHSEL_ANLEGEN', key: 'capture-key', token: 'vertrag', vertrag_id: 'ALT',
      data: { vertrag_id: 'NEU' } })).toMatchObject({ status: 'error', code: 'FORBIDDEN' });
    expect(capture.calls.tenantChanges).toHaveLength(0);
    expect(capture.post({ typ: 'LESEN', view: 'vertrag_capabilities', key: 'capture-key' })).toMatchObject({ tenant_change_writes: false });
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

  it('weist leere und ungültige Beträge im echten Apps-Script-Schreibweg ab', () => {
    const headers = ['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id'];
    for (const [index, betrag] of [undefined, '', ' ', null, 'abc', 0, '0,00'].entries()) {
      const api = backend({ key: KEY, paymentRows: [headers] });
      const data = { zahlung_id: `INVALID_AMOUNT_${index}`, vertrag_id: 'V1', datum: '2026-11-17', mietmonat: '2026-11', art: 'Miete' };
      if (betrag !== undefined) data.betrag = betrag;

      expect(api.post({ typ: 'ZAHLUNG', key: KEY, data })).toMatchObject({
        status: 'error',
        code: 'PAYMENT_AMOUNT_INVALID'
      });
      expect(api.rows.Zahlungen).toHaveLength(1);
    }

    const valid = backend({ key: KEY, paymentRows: [headers] });
    expect(valid.post({
      typ: 'ZAHLUNG', key: KEY,
      data: { zahlung_id: 'GERMAN_THOUSANDS', vertrag_id: 'V1', datum: '2026-11-17', mietmonat: '2026-11', betrag: '1.250', art: 'Miete' }
    })).toMatchObject({ status: 'success', angelegt: 1 });
    expect(valid.rows.Zahlungen[1][3]).toBe(1250);

    const deposit = backend({ key: KEY, paymentRows: [headers] });
    expect(deposit.post({
      typ: 'ZAHLUNG', key: KEY,
      data: { zahlung_id: 'DEPOSIT_MONTH', vertrag_id: 'V1', datum: '2026-11-17', mietmonat: '2026-11', betrag: '2.000,00', art: 'Kaution' }
    })).toMatchObject({ status: 'success', angelegt: 1 });
    expect(deposit.rows.Zahlungen[1][5]).toBe('');
  });

  it('speichert neue Mietmonate als Text und nicht als Sheet-Datum', () => {
    const api = backend({
      key: KEY,
      paymentRows: [['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id']]
    });

    expect(api.post({
      typ: 'ZAHLUNG', key: KEY,
      data: [{ zahlung_id: 'TEXT_MONTH', vertrag_id: 'V1', datum: '2026-11-13', mietmonat: '2026-09', betrag: 150, art: 'Miete' }]
    })).toMatchObject({ status: 'success', angelegt: 1 });
    expect(api.rows.Zahlungen[1][5]).toBe('2026-09');
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
      rent_increase_review_writes: true,
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

// --- Datenstand-Stempel und Zwischenspeicher (4.8.18) ------------------------------

function memoryCacheService({ failPut = false } = {}) {
  const store = new Map();
  const calls = { putAll: 0, getAll: 0 };
  return {
    store, calls,
    getScriptCache: () => ({
      get: key => store.get(key) ?? null,
      getAll: keys => { calls.getAll++; return Object.fromEntries(keys.filter(key => store.has(key)).map(key => [key, store.get(key)])); },
      putAll: (entries, ttl) => {
        calls.putAll++;
        if (failPut) throw new Error('Argument too large');
        expect(ttl).toBeLessThanOrEqual(21600);
        Object.entries(entries).forEach(([key, value]) => {
          expect(String(value).length).toBeLessThanOrEqual(100 * 1024);
          store.set(key, value);
        });
      }
    })
  };
}

const blob = bytes => ({ getBytes: () => bytes, getDataAsString: () => Buffer.from(bytes).toString('utf8') });
const nodeUtilities = {
  newBlob: (data) => blob(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)),
  gzip: input => blob(gzipSync(Buffer.from(input.getBytes()))),
  ungzip: input => blob(gunzipSync(Buffer.from(input.getBytes()))),
  base64Encode: bytes => Buffer.from(bytes).toString('base64'),
  base64Decode: text => Buffer.from(text, 'base64')
};

describe('Datenstand-Stempel', () => {
  it('antwortet mit unverändert, solange sich nichts geändert hat', () => {
    const api = backend({ key: KEY });
    const first = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY });
    expect(first._datenstand).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    const second = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY, known_stamp: first._datenstand });
    expect(second).toEqual({ unchanged: true, _datenstand: first._datenstand });
  });

  it('liefert nach einem Schreibvorgang wieder vollständige Daten', () => {
    const api = backend({ key: KEY });
    const before = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY })._datenstand;
    const verbrauchBefore = api.post({ typ: 'LESEN', view: 'verbrauch', key: KEY })._datenstand;
    api.post({ typ: 'ZAEHLERSTAND_NEU', data: [meter], key: KEY });
    const after = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY, known_stamp: before });
    expect(after.unchanged).toBeUndefined();
    expect(after._datenstand).not.toBe(before);
    expect(after.Zaehlerstaende).toHaveLength(1);
    // Zählerstände ändern die Verbrauchs-Views erst nach einer Neuberechnung.
    expect(api.post({ typ: 'LESEN', view: 'verbrauch', key: KEY, known_stamp: verbrauchBefore }).unchanged).toBe(true);
  });

  it('erneuert nach der Neuberechnung nur den Verbrauchsstand', () => {
    const api = backend({ key: KEY });
    const daten = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY })._datenstand;
    const verbrauch = api.post({ typ: 'LESEN', view: 'verbrauch', key: KEY })._datenstand;
    api.post({ typ: 'VERBRAUCH_VIEWS_AKTUALISIEREN', key: KEY });
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY, known_stamp: daten }).unchanged).toBe(true);
    expect(api.post({ typ: 'LESEN', view: 'verbrauch', key: KEY, known_stamp: verbrauch }).unchanged).toBeUndefined();
  });

  it('legt Verbrauchsdaten nicht im Zwischenspeicher ab', () => {
    const cacheService = memoryCacheService();
    const api = backend({ key: KEY, cacheService, utilities: nodeUtilities });
    api.post({ typ: 'LESEN', view: 'verbrauch', key: KEY });
    expect(cacheService.calls.putAll).toBe(0);
  });

  it('liest bei bekanntem Stempel kein einziges Blatt', () => {
    const api = backend({ key: KEY });
    const daten = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY })._datenstand;
    const verbrauch = api.post({ typ: 'LESEN', view: 'verbrauch', key: KEY })._datenstand;
    expect(api.calls.sheetReads).toBeGreaterThan(0);
    api.calls.sheetReads = 0;
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY, known_stamp: daten }).unchanged).toBe(true);
    expect(api.post({ typ: 'LESEN', view: 'verbrauch', key: KEY, known_stamp: verbrauch }).unchanged).toBe(true);
    expect(api.calls.sheetReads).toBe(0);
  });

  it('erneuert den Stempel nach einem fehlgeschlagenen Schreibversuch, nicht nach einem unbekannten Typ', () => {
    const api = backend({ key: KEY });
    const before = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY })._datenstand;
    api.post({ typ: 'GIBT_ES_NICHT', key: KEY });
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY, known_stamp: before }).unchanged).toBe(true);
    const failed = api.post({ typ: 'ZAHLUNG', data: [{ zahlung_id: '' }], key: KEY });
    expect(failed.status).toBe('error');
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY, known_stamp: before }).unchanged).toBeUndefined();
  });

  it('ordnet manuelle Änderungen im Sheet dem betroffenen Stempel zu', () => {
    const api = backend({ key: KEY });
    const edit = name => api.onEdit({ range: { getSheet: () => ({ getName: () => name }) } });
    let daten = api.getDatenstand('DATEN');
    let verbrauch = api.getDatenstand('VERBRAUCH');
    edit('Zahlungen');
    expect(api.getDatenstand('DATEN')).not.toBe(daten);
    expect(api.getDatenstand('VERBRAUCH')).toBe(verbrauch);

    daten = api.getDatenstand('DATEN');
    edit('_view_verbrauch_jahr');
    expect(api.getDatenstand('DATEN')).toBe(daten);
    expect(api.getDatenstand('VERBRAUCH')).not.toBe(verbrauch);

    // Ohne erkennbares Blatt vorsichtshalber beide.
    daten = api.getDatenstand('DATEN');
    verbrauch = api.getDatenstand('VERBRAUCH');
    api.onEdit({});
    expect(api.getDatenstand('DATEN')).not.toBe(daten);
    expect(api.getDatenstand('VERBRAUCH')).not.toBe(verbrauch);
    expect(api.datenstandKindsForSheet('Zaehlerstaende')).toEqual(['DATEN']);
  });

  it('läuft nach der Höchstdauer ab, damit nicht erfasste Änderungen sichtbar werden', () => {
    const api = backend({ key: KEY });
    const now = Date.now();
    api.bumpDatenstand('DATEN', now - api.DATENSTAND_MAX_AGE_MS - 1000);
    const stale = JSON.parse(api.properties.HV_DATENSTAND_DATEN).v;
    expect(api.getDatenstand('DATEN', now)).not.toBe(stale);
    const fresh = api.getDatenstand('DATEN', now);
    expect(api.getDatenstand('DATEN', now + 1000)).toBe(fresh);
  });

  it('gibt ohne gültigen Schlüssel weder Daten noch Stempel preis', () => {
    const api = backend({ key: KEY });
    const stamp = api.getDatenstand('DATEN');
    const text = api.raw({ typ: 'LESEN', view: 'stammdaten', key: 'falsch', known_stamp: stamp }).text;
    expect(JSON.parse(text)).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(text).not.toContain(stamp);
  });

  it('meldet den Datenstand in den Capabilities', () => {
    expect(backend({ key: KEY }).post({ typ: 'LESEN', view: 'vertrag_capabilities', key: KEY })).toMatchObject({ datenstand: true });
  });
});

describe('Zwischenspeicher der Lese-Antworten', () => {
  it('liefert die zweite Anfrage aus dem Zwischenspeicher, bis sich der Stempel ändert', () => {
    const cacheService = memoryCacheService();
    const api = backend({ key: KEY, cacheService, utilities: nodeUtilities, paymentRows: [['zahlung_id', 'betrag', 'notiz'], ['Z1', 100, 'Prüfung übernommen – Größe']] });
    const first = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY });
    expect(first.Zahlungen).toEqual([{ zahlung_id: 'Z1', betrag: 100, notiz: 'Prüfung übernommen – Größe' }]);
    expect(cacheService.calls.putAll).toBe(1);

    // Sheet ändert sich ohne Stempel: die Antwort kommt nachweislich aus dem Zwischenspeicher.
    api.rows.Zahlungen.push(['Z2', 50, 'neu']);
    const cached = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY });
    expect(cached).toEqual(first);
    expect(cacheService.calls.putAll).toBe(1);

    api.onEdit({});
    const fresh = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY });
    expect(fresh.Zahlungen).toHaveLength(2);
    expect(fresh._datenstand).not.toBe(first._datenstand);
  });

  it('baut die Antwort neu, wenn ein Stück im Zwischenspeicher fehlt', () => {
    const cacheService = memoryCacheService();
    const rows = [['zahlung_id', 'notiz']];
    for (let index = 0; index < 4000; index++) rows.push([`Z${index}`, randomBytes(32).toString('hex')]);
    const api = backend({ key: KEY, cacheService, utilities: nodeUtilities, paymentRows: rows });
    const first = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY });
    const chunkKeys = [...cacheService.store.keys()].filter(key => !key.endsWith('_meta'));
    cacheService.store.delete(chunkKeys[1]);
    api.calls.sheetReads = 0;
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY })).toEqual(first);
    expect(api.calls.sheetReads).toBeGreaterThan(0);
  });

  it('liest bei einem Treffer im Zwischenspeicher kein Blatt', () => {
    const cacheService = memoryCacheService();
    const api = backend({ key: KEY, cacheService, utilities: nodeUtilities });
    const first = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY });
    api.calls.sheetReads = 0;
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY })).toEqual(first);
    expect(api.calls.sheetReads).toBe(0);
  });

  it('teilt große Antworten in Stücke unter 100 KB', () => {
    const cacheService = memoryCacheService();
    const rows = [['zahlung_id', 'notiz']];
    for (let index = 0; index < 4000; index++) rows.push([`Z${index}`, randomBytes(32).toString('hex')]);
    const api = backend({ key: KEY, cacheService, utilities: nodeUtilities, paymentRows: rows });
    const first = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY });
    const chunkKeys = [...cacheService.store.keys()].filter(key => !key.endsWith('_meta'));
    expect(chunkKeys.length).toBeGreaterThan(1);
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY })).toEqual(first);
  });

  it('funktioniert weiter, wenn der Zwischenspeicher nicht schreiben kann', () => {
    const cacheService = memoryCacheService({ failPut: true });
    const api = backend({ key: KEY, cacheService, utilities: nodeUtilities });
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY }).Zahlungen).toEqual([]);
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY }).Zahlungen).toEqual([]);
  });

  it('ignoriert unvollständige Einträge im Zwischenspeicher', () => {
    const cacheService = memoryCacheService();
    const api = backend({ key: KEY, cacheService, utilities: nodeUtilities });
    const first = api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY });
    const chunk = [...cacheService.store.keys()].find(key => key.endsWith('_0'));
    cacheService.store.delete(chunk);
    expect(api.post({ typ: 'LESEN', view: 'stammdaten', key: KEY })).toEqual(first);
  });
});

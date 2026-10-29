import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const shared = readFileSync(new URL('../apps-script/ContractService.js', import.meta.url), 'utf8');
const service = new Function(`${shared}; return contractService;`)();
const now = new Date('2026-10-21T12:00:00Z');
const current = {
  vertrag_id: 'V_TEST', einheit_id: 'TEST_WE_01', aktiv: true,
  start_datum: '2024-03-01', mietmodell: 'Pauschal', erhoehungs_typ: 'Index',
  letzte_anpassung: '',
  soll_kaltmiete: 600, soll_nebenkosten: 200, soll_gesamt: 800,
  index_basis_monat: '2024-03', index_basis_wert: 100, index_reihe: 'VPI Deutschland 2020=100'
};
const input = {
  index_neu_monat: '2026-07', index_neu_wert: 110, index_reihe: current.index_reihe,
  zugang_datum: '2026-07-15', wirksam_ab: '2026-09-01',
  erklaerung_url: 'https://drive.google.com/file/d/fictional/view', bestaetigt: true, textform_bestaetigt: true
};
const unit = { einheit_id: current.einheit_id, typ: 'Wohnung' };

describe('contract domain rules', () => {
  it.each(['Pauschal', 'Warmmiete', 'Kalt+NK'])('preserves %s and authoritative total costs', mietmodell => {
    const patch = service.preparePatch({ ...current, mietmodell, erhoehungs_typ: 'Normal' }, {
      nk_betriebskosten: 20, nk_heizung_warmwasser: 30, vertragsdokument_url: input.erklaerung_url
    });
    expect(patch.soll_nebenkosten).toBe(200);
    expect(patch.soll_gesamt).toBe(800);
    expect(patch.vertragsdokument_url).toBe(input.erklaerung_url);
  });
  it('supports legacy rows without new fields and preserves deposit fields', () => {
    const legacy = { ...current, erhoehungs_typ: 'Staffel', kaution_ist: 300 };
    delete legacy.index_basis_wert;
    const patch = service.preparePatch(legacy, { vertrag_hinweis: 'Test', soll_nebenkosten: '210,50' });
    expect(patch.soll_gesamt).toBe(810.5);
    expect({ ...legacy, ...patch }.kaution_ist).toBe(300);
    expect(patch).not.toHaveProperty('aktiv');
  });
  it('calculates only net rent without mutation or automatic application', () => {
    const saved = service.snapshot(current);
    const result = service.previewIndex(current, input, unit, now);
    expect(result.prozent).toBeCloseTo(10);
    expect(result.kalt_neu).toBe(660);
    expect(result.nebenkosten).toBe(200);
    expect(result.gesamt_neu).toBe(860);
    expect(service.snapshot(current)).toBe(saved);
    expect(result.fruehestens_ab).toBe('2026-09-01');
  });
  it('applies confirmed effective changes and advances the index baseline', () => {
    const patch = service.prepareIndex(current, input, unit, now);
    expect(patch).toMatchObject({ soll_kaltmiete: 660, soll_nebenkosten: 200, soll_gesamt: 860,
      letzte_anpassung: '2026-09-01', index_basis_wert: 110, index_basis_monat: '2026-07' });
  });
  it('supports a falling index', () => {
    expect(service.prepareIndex(current, { ...input, index_neu_wert: 90 }, unit, now).soll_kaltmiete).toBe(540);
  });
  it('enforces annual rent stability and calendar month effectiveness', () => {
    const recent = { ...current, letzte_anpassung: '2026-01-15' };
    expect(service.previewIndex(recent, input, unit, now).fruehestens_ab).toBe('2027-02-01');
    expect(() => service.prepareIndex(recent, input, unit, now)).toThrow();
  });
  it.each([
    { bestaetigt: false }, { textform_bestaetigt: false }, { erklaerung_url: '' },
    { zugang_datum: '' }, { wirksam_ab: '2026-08-01' }, { wirksam_ab: '2026-09-02' },
    { zugang_datum: '2026-11-01' }, { wirksam_ab: '2027-01-01' },
    { zugang_datum: '2025-07-15', wirksam_ab: '2025-09-01' },
    { index_reihe: 'Andere Reihe' }, { index_neu_wert: 0 }, { index_neu_monat: '2024-02' }
  ])('rejects invalid or unconfirmed index application %j', change => {
    expect(() => service.prepareIndex(current, { ...input, ...change }, unit, now)).toThrow();
  });
  it('does not apply residential rules to commercial contracts or other increase models', () => {
    expect(() => service.previewIndex(current, input, { typ: 'Gewerbe' }, now)).toThrow();
    expect(() => service.previewIndex({ ...current, erhoehungs_typ: 'Staffel' }, input, unit, now)).toThrow();
  });
  it('uses an assumed access today for preview without claiming an old effective date', () => {
    expect(service.previewIndex(current, { ...input, zugang_datum: '' }, unit, now).fruehestens_ab).toBe('2026-12-01');
  });
  it('rejects identity changes, unsafe links and direct index rent edits', () => {
    expect(() => service.preparePatch(current, { vertrag_id: 'OTHER' })).toThrow();
    expect(() => service.preparePatch(current, { vertragsdokument_url: 'javascript:alert(1)' })).toThrow();
    expect(() => service.preparePatch(current, { soll_kaltmiete: 660 })).toThrow();
    expect(() => service.preparePatch(current, { index_basis_wert: 110 })).toThrow();
    expect(() => service.preparePatch({ ...current, soll_nebenkosten: '' }, {})).toThrow();
  });
  it('compares sheet values and form strings by value', () => {
    expect(service.same(600, '600')).toBe(true);
    expect(service.same(600, '600,00')).toBe(true);
    expect(service.same('', undefined)).toBe(true);
    expect(service.same(600, '')).toBe(false);
    expect(service.same('2024-03', '2024-03')).toBe(true);
  });
  it('diffs only changed editable fields', () => {
    const form = Object.fromEntries(service.editable.map(key => [key, current[key] === undefined ? '' : String(current[key])]));
    expect(service.diff(current, form)).toEqual({});
    expect(service.diff(current, { ...form, vertrag_hinweis: 'Neu', soll_nebenkosten: '210' }))
      .toEqual({ vertrag_hinweis: 'Neu', soll_nebenkosten: '210' });
  });
  it('lets an empty index series be completed but never changes a stored index basis', () => {
    const legacy = { ...current, index_reihe: '' };
    expect(service.preparePatch(legacy, { index_basis_wert: '100', index_basis_monat: '2024-03', index_reihe: 'VPI Deutschland 2020=100' }))
      .toMatchObject({ index_reihe: 'VPI Deutschland 2020=100' });
    expect(() => service.preparePatch(current, { index_reihe: 'Andere Reihe' })).toThrow(/Indexbasis/);
    expect(() => service.preparePatch(current, { index_basis_wert: '101' })).toThrow(/Indexbasis/);
    expect(() => service.preparePatch(current, { index_basis_monat: '2024-04' })).toThrow(/Indexbasis/);
  });
  it('parses Berlin Sheets dates and validates calendar dates', () => {
    expect(service.iso(service.date('2024-02-29T23:00:00.000Z'))).toBe('2024-03-01');
    expect(service.iso(service.date('01.03.2024'))).toBe('2024-03-01');
    expect(() => service.date('2025-02-29')).toThrow();
  });
});

function backendFixture({ token = 'test-only', writeFailure = false } = {}) {
  const headers = Object.keys(current).concat(service.fields.filter(key => !(key in current)), ['kaution_ist']);
  const row = headers.map(key => current[key] === undefined ? '' : current[key]);
  const grid = [headers, row];
  const log = [service.historyHeaders.slice()];
  const makeSheet = values => ({
    getDataRange: () => ({ getValues: () => values.map(row => row.slice()) }),
    getLastColumn: () => values[0].length, getLastRow: () => values.length,
    getRange(r, c, h = 1, w = 1) {
      return {
        getValues: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => values[r - 1 + i]?.[c - 1 + j] ?? '')),
        getValue: () => values[r - 1]?.[c - 1] ?? '', getFormula: () => '',
        setValue(value) { values[r - 1][c - 1] = value; },
        setValues(rows) {
          if (values === log && writeFailure) throw new Error('History write failed');
          rows.forEach((row, i) => { values[r - 1 + i] ||= []; row.forEach((value, j) => { values[r - 1 + i][c - 1 + j] = value; }); });
        },
        clearContent() { if (r <= values.length) values.splice(r - 1, 1); }
      };
    }
  });
  const sheets = { Vertraege: makeSheet(grid), Mietanpassungen: makeSheet(log), Einheiten: makeSheet([Object.keys(unit), Object.values(unit)]) };
  let viewUpdates = 0;
  const source = readFileSync(new URL('../apps-script/Contracts.gs', import.meta.url), 'utf8');
  const factory = new Function('PropertiesService', 'Utilities', 'SpreadsheetApp', 'getSheetData', 'updateAktiveMieterView', `${shared};${source};return handleContractWrite;`);
  const write = factory({ getScriptProperties: () => ({ getProperty: () => token }) }, { getUuid: () => 'test-history-id' }, { flush() {} },
    sheet => { const rows = sheet.getDataRange().getValues(); return rows.slice(1).map(row => Object.fromEntries(rows[0].map((key, i) => [key, row[i]]))); },
    () => { viewUpdates++; });
  const ss = { getSheetByName: name => sheets[name] };
  const original = Object.fromEntries(headers.map((key, i) => [key, row[i]]));
  return { grid, log, original, headers, updates: () => viewUpdates,
    write: payload => write(ss, { token: 'test-only', vertrag_id: current.vertrag_id,
      erwarteter_stand: service.snapshot(original), ...payload }) };
}

describe('contract backend persistence', () => {
  it('updates by contract id after sorting, not by the old row position', () => {
    const fixture = backendFixture();
    const other = fixture.grid[1].slice();
    other[fixture.headers.indexOf('vertrag_id')] = 'V_DIFFERENT';
    fixture.grid.splice(1, 0, other);
    const result = fixture.write({ data: { vertrag_hinweis: 'Found by id' } });
    expect(result.vertrag.vertrag_id).toBe(current.vertrag_id);
    expect(fixture.grid[1][fixture.headers.indexOf('vertrag_hinweis')]).toBe('');
    expect(fixture.grid[2][fixture.headers.indexOf('vertrag_hinweis')]).toBe('Found by id');
  });
  it('rejects duplicate contract ids rather than updating an arbitrary row', () => {
    const fixture = backendFixture();
    fixture.grid.push(fixture.grid[1].slice());
    expect(() => fixture.write({ data: { vertrag_hinweis: 'No save' } })).toThrow(/eindeutig/);
    expect(fixture.log).toHaveLength(1);
  });
  it('persists an index adjustment and preserves existing history on the next write', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      const fixture = backendFixture();
      const result = fixture.write({ typ: 'INDEX_ANWENDEN', data: input });
      expect(result.vertrag.soll_kaltmiete).toBe(660);
      expect(result.vertrag.soll_nebenkosten).toBe(200);
      expect(result.anpassung.art).toBe('INDEX');
      expect(JSON.parse(result.anpassung.vorher_json).index_basis_wert).toBe(100);
      expect(JSON.parse(result.anpassung.nachher_json).index_basis_wert).toBe(110);
      fixture.write({ typ: 'VERTRAG_AKTUALISIEREN', data: { vertrag_hinweis: 'Second change' },
        erwarteter_stand: service.snapshot(result.vertrag) });
      expect(fixture.log).toHaveLength(3);
      expect(fixture.log[1][service.historyHeaders.indexOf('art')]).toBe('INDEX');
    } finally { vi.useRealTimers(); }
  });
  it('updates only the existing contract and appends old/new history', () => {
    const fixture = backendFixture();
    const result = fixture.write({ typ: 'VERTRAG_AKTUALISIEREN', data: { vertrag_hinweis: 'Test note', vertragsdokument_url: input.erklaerung_url } });
    expect(fixture.grid).toHaveLength(2);
    expect(fixture.log).toHaveLength(2);
    expect(result.vertrag.vertrag_hinweis).toBe('Test note');
    expect(result.vertrag.vertragsdokument_url).toBe(input.erklaerung_url);
    expect(JSON.parse(result.anpassung.vorher_json).soll_kaltmiete).toBe(600);
    expect(JSON.parse(result.anpassung.nachher_json).soll_nebenkosten).toBe(200);
    expect(fixture.updates()).toBe(1);
  });
  it('rejects a save without real changes and writes no history entry', () => {
    const fixture = backendFixture();
    expect(() => fixture.write({ typ: 'VERTRAG_AKTUALISIEREN', data: { vertrag_hinweis: '', soll_nebenkosten: '200,00' } }))
      .toThrow(/Keine Aenderungen/);
    expect(fixture.log).toHaveLength(1);
    expect(Object.fromEntries(fixture.headers.map((key, i) => [key, fixture.grid[1][i]]))).toEqual(fixture.original);
  });
  it('completes a missing index series on a legacy contract', () => {
    const fixture = backendFixture();
    fixture.grid[1][fixture.headers.indexOf('index_reihe')] = '';
    const stand = service.snapshot(Object.fromEntries(fixture.headers.map((key, i) => [key, fixture.grid[1][i]])));
    const result = fixture.write({ typ: 'VERTRAG_AKTUALISIEREN', erwarteter_stand: stand,
      data: { index_basis_wert: '100', index_basis_monat: '2024-03', index_reihe: 'VPI Deutschland 2020=100' } });
    expect(result.vertrag.index_reihe).toBe('VPI Deutschland 2020=100');
    expect(fixture.log).toHaveLength(2);
  });
  it('rejects concurrent edits and unconfigured access before writing', () => {
    const fixture = backendFixture();
    expect(() => fixture.write({ data: {}, erwarteter_stand: 'stale' })).toThrow(/inzwischen/);
    expect(fixture.log).toHaveLength(1);
    expect(() => backendFixture({ token: '' }).write({ data: {} })).toThrow(/freigeschaltet/);
  });
  it('restores the original contract if the history write fails', () => {
    const fixture = backendFixture({ writeFailure: true });
    expect(() => fixture.write({ data: { vertrag_hinweis: 'No save' } })).toThrow(/History/);
    expect(Object.fromEntries(fixture.headers.map((key, i) => [key, fixture.grid[1][i]]))).toEqual(fixture.original);
    expect(fixture.log).toHaveLength(1);
  });
});

describe('contract client data access', () => {
  const cloudSource = readFileSync(new URL('../cloud-service.js', import.meta.url), 'utf8');
  const store = { hv_access_key: 'test-key' };
  const localStorage = { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; } };
  const loadCloud = fetch => new Function('CONFIG', 'fetch', 'localStorage', 'navigator', `${cloudSource};return cloudService;`)(
    { API_URL: 'https://example.test/api' }, fetch, localStorage, { onLine: true });
  const reply = body => ({ ok: true, text: async () => JSON.stringify(body) });
  it('loads legacy contracts, new fields and history through the existing state', () => {
    const source = readFileSync(new URL('../data-service.js', import.meta.url), 'utf8');
    const data = new Function(`${source};return dataService;`)();
    data.setInitialData({ Vertraege: [{ ...current, vertragsdokument_url: input.erklaerung_url }], Mietanpassungen: [{ anpassung_id: 'TEST_LOG' }] });
    expect(data.state.vertraege[0].vertragsdokument_url).toBe(input.erklaerung_url);
    expect(data.state.mietanpassungen).toHaveLength(1);
    data.setInitialData({ Vertraege: [current] });
    expect(data.state.mietanpassungen).toEqual([]);
  });
  it('does not POST contract writes to an old backend', async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ Vertraege: [] }));
    await expect(loadCloud(fetch).saveContract({ typ: 'VERTRAG_AKTUALISIEREN' })).rejects.toThrow(/noch nicht/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('requires a real acknowledgement and sends financial edits only once', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply({ contract_writes: true }))
      .mockResolvedValueOnce(reply({ status: 'success', vertrag: current, anpassung: { art: 'INDEX' } }));
    const payload = { typ: 'INDEX_ANWENDEN', vertrag_id: current.vertrag_id, data: input };
    expect((await loadCloud(fetch).saveContract(payload)).vertrag).toEqual(current);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ ...payload, key: 'test-key' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ typ: 'LESEN', view: 'vertrag_capabilities', key: 'test-key' });
  });
  it('does not turn network or backend failures into queued success', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply({ contract_writes: true }))
      .mockRejectedValueOnce(new Error('Network failure'));
    await expect(loadCloud(fetch).saveContract({})).rejects.toThrow('Network failure');
    const errorFetch = vi.fn()
      .mockResolvedValueOnce(reply({ contract_writes: true }))
      .mockResolvedValueOnce(reply({ status: 'error', message: 'Conflict' }));
    await expect(loadCloud(errorFetch).saveContract({})).rejects.toThrow('Conflict');
  });
});

describe('contract view', () => {
  it('saves the original selected contract even if selection changes during the request', async () => {
    const source = readFileSync(new URL('../contract-ui.js', import.meta.url), 'utf8');
    let resolveSave;
    const saveContract = vi.fn(() => new Promise(resolve => { resolveSave = resolve; }));
    const first = { ...current, erhoehungs_typ: 'Normal' };
    const second = { ...first, vertrag_id: 'V_OTHER' };
    const dataService = { state: { vertraege: [first, second], einheiten: [unit], mietanpassungen: [],
      view_aktive_mieter: [{ vertrag_id: first.vertrag_id, soll_gesamt: 800 }] } };
    const fields = Object.fromEntries(service.editable.map(key => ['contract-' + key, { value: first[key] ?? '' }]));
    fields['contract-token'] = { value: 'test-only' };
    fields['contract-message'] = { textContent: '' };
    fields['contract-soll_nebenkosten'].value = '220';
    const ui = new Function('dataService', 'contractService', 'cloudService', 'document', `${source};return contractUiService;`)(
      dataService, service, { saveContract }, { getElementById: id => fields[id] });
    ui.selectedId = first.vertrag_id;
    ui.loadedSnapshot = service.snapshot(first);
    ui.render = vi.fn();
    const pending = ui.save(false);
    ui.selectedId = second.vertrag_id;
    const changed = { ...first, soll_nebenkosten: 220, soll_gesamt: 820 };
    resolveSave({ vertrag: changed, anpassung: { anpassung_id: 'TEST_LOG' } });
    await pending;
    expect(saveContract.mock.calls[0][0].vertrag_id).toBe(first.vertrag_id);
    expect(saveContract.mock.calls[0][0].data.soll_nebenkosten).toBe('220');
    expect(dataService.state.vertraege[0].soll_gesamt).toBe(820);
    expect(dataService.state.vertraege[1]).toEqual(second);
    expect(dataService.state.view_aktive_mieter[0].soll_gesamt).toBe(820);
    expect(dataService.state.mietanpassungen).toHaveLength(1);
    expect(ui.busy).toBe(false);
    expect(fields['contract-message'].textContent).toMatch(/Gespeichert/);
    expect(fields['contract-message'].className).toContain('contract-status-success');
  });
  it('reports a failed save as an error message', async () => {
    const source = readFileSync(new URL('../contract-ui.js', import.meta.url), 'utf8');
    const first = { ...current, erhoehungs_typ: 'Normal' };
    const dataService = { state: { vertraege: [first], einheiten: [unit], mietanpassungen: [], view_aktive_mieter: [] } };
    const fields = Object.fromEntries(service.editable.map(key => ['contract-' + key, { value: first[key] ?? '' }]));
    fields['contract-token'] = { value: 'falsch' };
    fields['contract-message'] = { textContent: '' };
    fields['contract-soll_nebenkosten'].value = '220';
    const saveContract = vi.fn().mockRejectedValue(new Error('Vertrags-Schreibzugriff nicht freigeschaltet.'));
    const ui = new Function('dataService', 'contractService', 'cloudService', 'document', `${source};return contractUiService;`)(
      dataService, service, { saveContract }, { getElementById: id => fields[id] });
    ui.selectedId = first.vertrag_id;
    ui.loadedSnapshot = service.snapshot(first);
    ui.render = vi.fn();
    await ui.save(false);
    expect(fields['contract-message'].textContent).toMatch(/nicht freigeschaltet/);
    expect(fields['contract-message'].className).toContain('contract-status-error');
    expect(ui.busy).toBe(false);
  });
  it('fades out success messages but keeps errors, even when messages replace each other', () => {
    vi.useFakeTimers();
    const source = readFileSync(new URL('../contract-ui.js', import.meta.url), 'utf8');
    const element = { textContent: '', className: '', setAttribute: vi.fn() };
    const ui = new Function('dataService', 'contractService', 'cloudService', 'document', `${source};return contractUiService;`)(
      {}, service, {}, { getElementById: () => element });
    ui.message('✓ Gespeichert', 'success');
    expect(element.setAttribute).toHaveBeenLastCalledWith('role', 'status');
    vi.advanceTimersByTime(6000);
    expect(element.textContent).toBe('');
    ui.message('Erste', 'success');
    vi.advanceTimersByTime(3000);
    ui.message('Zweite', 'success');
    vi.advanceTimersByTime(3500);
    expect(element.textContent).toBe('Zweite');
    vi.advanceTimersByTime(3000);
    expect(element.textContent).toBe('');
    ui.message('Fehler', 'error');
    expect(element.setAttribute).toHaveBeenLastCalledWith('role', 'alert');
    vi.advanceTimersByTime(60000);
    expect(element.textContent).toBe('Fehler');
    vi.useRealTimers();
  });
  it('does not send or require a token when nothing was changed', async () => {
    const source = readFileSync(new URL('../contract-ui.js', import.meta.url), 'utf8');
    const saveContract = vi.fn();
    const first = { ...current, erhoehungs_typ: 'Normal' };
    const dataService = { state: { vertraege: [first], einheiten: [unit], mietanpassungen: [], view_aktive_mieter: [] } };
    const fields = Object.fromEntries(service.editable.map(key => ['contract-' + key, { value: first[key] ?? '' }]));
    fields['contract-token'] = { value: '' };
    fields['contract-message'] = { textContent: '' };
    const ui = new Function('dataService', 'contractService', 'cloudService', 'document', `${source};return contractUiService;`)(
      dataService, service, { saveContract }, { getElementById: id => fields[id] });
    ui.selectedId = first.vertrag_id;
    await ui.save(false);
    expect(saveContract).not.toHaveBeenCalled();
    expect(fields['contract-message'].textContent).toMatch(/Keine Änderungen/);
    expect(ui.busy).toBe(false);
  });
  it('renders existing document links, contract fields and adjustment history safely', () => {
    const source = readFileSync(new URL('../contract-ui.js', import.meta.url), 'utf8');
    const fields = {};
    const getElementById = id => fields[id] ||= { innerHTML: '', textContent: '', value: '', addEventListener() {} };
    const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const dataService = { state: { vertraege: [{ ...current, vertragsdokument_url: input.erklaerung_url, vertrag_hinweis: '<script>bad</script>' }],
      einheiten: [unit], personen: [], vertragsparteien: [], mietanpassungen: [
        { vertrag_id: current.vertrag_id, art: 'INDEX', vorher_json: JSON.stringify(current), nachher_json: JSON.stringify({ ...current, soll_kaltmiete: 660 }) }
      ] } };
    const ui = new Function('dataService', 'contractService', 'uiService', 'document', `${source};return contractUiService;`)(
      dataService, service, { escapeHtml: escape, isTrueValue: Boolean, formatDashboardNumber: String }, { getElementById });
    ui.render();
    const html = fields['contracts-output'].innerHTML;
    expect(html).toContain(`href="${input.erklaerung_url}"`);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).toContain('contract-soll_nebenkosten');
    expect(html).toContain('600 → 660 EUR');
    expect(html).toContain('noch nicht freigeschaltet');
  });
});

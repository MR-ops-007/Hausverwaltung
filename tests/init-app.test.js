import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// Startablauf aus index.html (initApp samt Hilfsfunktionen) mit echtem dataService und
// localCache, aber nachgebildetem Backend.
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const startSource = index.slice(index.indexOf('function renderVisibleDataViews()'), index.indexOf('// Ladezeit-Diagnose'));
const dataSource = readFileSync(new URL('../data-service.js', import.meta.url), 'utf8');
const cacheSource = readFileSync(new URL('../local-cache.js', import.meta.url), 'utf8');

const completeStammdaten = (extra = {}) => ({
  Objekte: [{ objekt_id: 'O1' }], Einheiten: [], Personen: [], Vertraege: [{ vertrag_id: 'V1' }],
  Vertragsparteien: [], Mietanpassungen: [], 'MieterhöhungsPrüfungen': [{ vertrag_id: 'V1' }], Zaehler: [],
  Zaehlerstaende: [], Zahlungen: [{ zahlung_id: 'Z1' }], Parameter: [], Fixkosten: [], Haustechnik: [],
  _datenstand: 'stempel-1', ...extra
});

function setup({ dashboard, stammdaten, stored } = {}) {
  const CONFIG = { API_CONFIGURED: true, ENVIRONMENT: 'test' };
  const dataService = new Function('CONFIG', `${dataSource};return dataService;`)(CONFIG);
  const store = new Map();
  const localCache = new Function('CONFIG', `${cacheSource};return localCache;`)(CONFIG);
  localCache.backend = {
    get: async key => (store.has(key) ? structuredClone(store.get(key)) : undefined),
    put: async (key, value) => { store.set(key, structuredClone(value)); },
    delete: async key => { store.delete(key); },
    keys: async () => [...store.keys()]
  };
  if (stored) store.set('snapshot:test', { format: 1, environment: 'test', savedAt: new Date().toISOString(), dashboard: {}, ...stored });

  const status = { textContent: '', style: {} };
  const document = { getElementById: id => (id === 'sync-status' ? status : null) };
  const cloudService = {
    loadDashboardData: vi.fn(dashboard || (async () => ({ _view_aktive_mieter: [{ name: 'Frisch' }] }))),
    loadBackgroundData: vi.fn(stammdaten || (async () => completeStammdaten())),
    loadCapabilities: vi.fn(async () => ({ backend_version: '4.8.18', access_protected: true }))
  };
  const uiService = { renderAll: vi.fn(), renderSyncQueueStatus: vi.fn(), prefetchConsumptionData: vi.fn() };
  const environmentService = { render: vi.fn(), setBackendVersion: vi.fn() };
  const run = new Function('CONFIG', 'document', 'dataService', 'localCache', 'cloudService', 'uiService',
    'environmentService', 'paymentUiService', 'contractUiService', 'console',
    `${startSource}; return initApp;`)(CONFIG, document, dataService, localCache, cloudService, uiService,
    environmentService, { render: vi.fn() }, { render: vi.fn() }, { log() {}, warn() {}, error() {} });
  return { initApp: run, dataService, localCache, store, cloudService, status };
}

describe('App-Start', () => {
  it('übernimmt die Stammdaten, auch wenn der Dashboard-Abruf scheitert', async () => {
    const env = setup({ dashboard: async () => { throw new Error('Zeitüberschreitung'); } });
    await env.initApp();
    expect(env.dataService.state.fullDataLoaded).toBe(true);
    expect(env.dataService.state.vertraege).toEqual([{ vertrag_id: 'V1' }]);
    expect(env.status.textContent).toContain('System vollständig geladen');
    expect(env.status.textContent).toContain('Mieterliste nicht aktualisiert');
    expect((await env.localCache.load()).stammdaten.Vertraege).toEqual([{ vertrag_id: 'V1' }]);
  });

  it('übernimmt die Stammdaten, ohne auf ein langsames Dashboard zu warten', async () => {
    let releaseDashboard;
    const env = setup({ dashboard: () => new Promise(resolve => { releaseDashboard = () => resolve({ _view_aktive_mieter: [{ name: 'Spät' }] }); }) });
    const done = env.initApp();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(env.dataService.state.fullDataLoaded).toBe(true);
    expect(env.dataService.state.vertraege).toEqual([{ vertrag_id: 'V1' }]);
    expect(env.status.textContent).toContain('System vollständig geladen');

    releaseDashboard();
    await done;
    // Das späte Dashboard ersetzt nur die Mieterliste und setzt die Stammdaten nicht zurück.
    expect(env.dataService.state.fullDataLoaded).toBe(true);
    expect(env.dataService.state.view_aktive_mieter).toEqual([{ name: 'Spät' }]);
    expect(env.status.textContent).toContain('System vollständig geladen');
    expect((await env.localCache.load()).dashboard._view_aktive_mieter).toEqual([{ name: 'Spät' }]);
  });

  it('bricht bei abgelehntem Schlüssel im Dashboard-Abruf ab, ohne auf die Stammdaten zu warten', async () => {
    const unauthorized = Object.assign(new Error('Schlüssel'), { code: 'UNAUTHORIZED' });
    const env = setup({ dashboard: async () => { throw unauthorized; }, stammdaten: () => new Promise(() => {}) });
    await env.initApp();
    expect(env.status.textContent).toContain('Zugangsschlüssel erforderlich');
  });

  it('bricht bei abgelehntem Schlüssel im Dashboard-Abruf sofort ab', async () => {
    const unauthorized = Object.assign(new Error('Schlüssel'), { code: 'UNAUTHORIZED' });
    const env = setup({ dashboard: async () => { throw unauthorized; }, stammdaten: async () => { throw unauthorized; } });
    await env.initApp();
    expect(env.dataService.state.fullDataLoaded).toBe(false);
    expect(env.status.textContent).toContain('Zugangsschlüssel erforderlich');
  });

  it('bestätigt einen vollständigen gespeicherten Stand als aktuell', async () => {
    const env = setup({ stored: { stammdaten: completeStammdaten() }, stammdaten: async () => ({ unchanged: true, _datenstand: 'stempel-1' }) });
    await env.initApp();
    expect(env.cloudService.loadBackgroundData).toHaveBeenCalledWith('stempel-1');
    expect(env.dataService.state.dataStale).toBe(false);
    expect(env.status.textContent).toContain('keine Änderungen');
  });

  it.each(['Zahlungen', 'MieterhöhungsPrüfungen', 'Parameter'])('verwendet einen gespeicherten Stand ohne %s nicht und lädt alles neu', async missing => {
    const incomplete = completeStammdaten();
    delete incomplete[missing];
    const env = setup({ stored: { stammdaten: incomplete } });
    await env.initApp();
    expect(env.cloudService.loadBackgroundData).toHaveBeenCalledWith('');
    expect(env.dataService.state.zahlungen).toEqual([{ zahlung_id: 'Z1' }]);
    expect(env.dataService.state.mieterhoehungspruefungen).toEqual([{ vertrag_id: 'V1' }]);
    expect(env.dataService.state.dataStale).toBe(false);
  });

  it('bestätigt einen gespeicherten Stand ohne das optionale Blatt Haustechnik', async () => {
    const withoutOptional = completeStammdaten();
    delete withoutOptional.Haustechnik;
    const env = setup({ stored: { stammdaten: withoutOptional }, stammdaten: async () => ({ unchanged: true, _datenstand: 'stempel-1' }) });
    await env.initApp();
    expect(env.cloudService.loadBackgroundData).toHaveBeenCalledWith('stempel-1');
    expect(env.status.textContent).toContain('keine Änderungen');
  });
});

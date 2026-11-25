import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const uiSource = readFileSync(new URL('../ui-service.js', import.meta.url), 'utf8');
const cacheSource = readFileSync(new URL('../local-cache.js', import.meta.url), 'utf8');

const views = (marker = 'frisch') => ({
  _view_verbrauch_jahr: [{ objekt_id: 'O1', jahr: 2026, berechnet_am: '2026-11-24 06:00:00', marker }],
  _view_verbrauch_monat: [],
  _view_verbrauch_audit: [],
  _view_verbrauch_bilanz_jahr: []
});

function memoryCache() {
  const store = new Map();
  const cache = new Function('CONFIG', `${cacheSource};return localCache;`)({ ENVIRONMENT: 'test' });
  cache.backend = {
    get: async key => (store.has(key) ? structuredClone(store.get(key)) : undefined),
    put: async (key, value) => { store.set(key, structuredClone(value)); },
    delete: async key => { store.delete(key); },
    keys: async () => [...store.keys()]
  };
  return { cache, store };
}

function setup({ cachedAt = null, loadImpl } = {}) {
  const { cache, store } = memoryCache();
  const dataService = {
    state: { view_verbrauch_jahr: [], view_verbrauch_monat: [], view_verbrauch_audit: [], view_verbrauch_bilanz_jahr: [] },
    setConsumptionData(data) {
      this.state.view_verbrauch_jahr = data._view_verbrauch_jahr || [];
      this.state.view_verbrauch_monat = data._view_verbrauch_monat || [];
    }
  };
  const loadConsumptionData = vi.fn(loadImpl || (async () => views('frisch')));
  const status = { textContent: '' };
  const section = { style: { display: 'none' } };
  const document = {
    getElementById: id => (id === 'consumption-view-refresh-status' ? status : id === 'consumption-dashboard-section' ? section : null)
  };
  const ui = new Function('dataService', 'cloudService', 'window', 'document', 'alert', 'confirm', 'localCache',
    `${uiSource}; return uiService;`)(dataService, { loadConsumptionData }, {}, document, () => {}, () => true, cache);
  ui.renderConsumptionDashboard = vi.fn();
  const seed = async savedAt => {
    if (savedAt) await cache.saveConsumption(views('gespeichert'), new Date(savedAt));
  };
  return { ui, cache, store, dataService, loadConsumptionData, status, section, seed: seed(cachedAt) };
}

describe('Verbrauchsdaten aus dem lokalen Speicher', () => {
  it('zeigt einen frischen gespeicherten Stand sofort und lädt nicht nach', async () => {
    const env = setup({ cachedAt: new Date(Date.now() - 60 * 60 * 1000) });
    await env.seed;
    await env.ui.ensureConsumptionViewData();
    expect(env.dataService.state.view_verbrauch_jahr[0].marker).toBe('gespeichert');
    expect(env.loadConsumptionData).not.toHaveBeenCalled();
    expect(env.status.textContent).toContain('Verbrauchsdaten zuletzt aktualisiert: 24.11.2026 06:00');
    expect(env.status.textContent).toContain('abgerufen');
  });

  it('zeigt einen veralteten Stand sofort und aktualisiert im Hintergrund', async () => {
    const env = setup({ cachedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) });
    await env.seed;
    env.section.style.display = 'block';
    await env.ui.ensureConsumptionViewData();
    expect(env.dataService.state.view_verbrauch_jahr[0].marker).toBe('gespeichert');
    expect(env.status.textContent).toContain('wird geladen');
    await env.ui.consumptionFetchPromise;
    await Promise.resolve();
    expect(env.loadConsumptionData).toHaveBeenCalledOnce();
    expect(env.dataService.state.view_verbrauch_jahr[0].marker).toBe('frisch');
    expect(env.ui.renderConsumptionDashboard).toHaveBeenCalled();
    expect((await env.cache.loadConsumption()).data._view_verbrauch_jahr[0].marker).toBe('frisch');
  });

  it('lädt ohne gespeicherten Stand direkt und speichert das Ergebnis', async () => {
    const env = setup();
    await env.ui.ensureConsumptionViewData();
    expect(env.loadConsumptionData).toHaveBeenCalledOnce();
    expect(env.dataService.state.view_verbrauch_jahr[0].marker).toBe('frisch');
    expect(env.store.has('verbrauch:test')).toBe(true);
  });

  it('lädt beim Vorladen nur ohne oder mit veraltetem Stand und nie doppelt', async () => {
    const fresh = setup({ cachedAt: new Date(Date.now() - 60 * 1000) });
    await fresh.seed;
    await fresh.ui.prefetchConsumptionData();
    expect(fresh.loadConsumptionData).not.toHaveBeenCalled();

    let release;
    const slow = setup({ loadImpl: () => new Promise(resolve => { release = () => resolve(views()); }) });
    const first = slow.ui.prefetchConsumptionData();
    await Promise.resolve();
    await Promise.resolve();
    const second = slow.ui.ensureConsumptionViewData();
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    expect(slow.loadConsumptionData).toHaveBeenCalledOnce();
  });

  it('behält bei einem Fehler im Hintergrund den gespeicherten Stand und meldet es', async () => {
    const env = setup({ cachedAt: new Date(Date.now() - 7 * 60 * 60 * 1000), loadImpl: async () => { throw new Error('offline'); } });
    await env.seed;
    env.section.style.display = 'block';
    await env.ui.ensureConsumptionViewData();
    await env.ui.consumptionFetchPromise?.catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(env.dataService.state.view_verbrauch_jahr[0].marker).toBe('gespeichert');
    expect(env.status.textContent).toContain('Aktualisierung fehlgeschlagen');
  });
});

describe('Lokaler Speicher: Verbrauchseintrag', () => {
  it('wird zusammen mit dem Startstand der Umgebung gelöscht', async () => {
    const { cache, store } = memoryCache();
    await cache.save({}, { Objekte: [], Vertraege: [] });
    await cache.saveConsumption(views());
    expect([...store.keys()].sort()).toEqual(['snapshot:test', 'verbrauch:test']);
    await cache.clear();
    expect(store.size).toBe(0);
  });

  it('verwirft unvollständige Verbrauchseinträge', async () => {
    const { cache, store } = memoryCache();
    expect(await cache.saveConsumption({ _view_verbrauch_monat: [] })).toBe(false);
    store.set('verbrauch:test', { format: 1, savedAt: new Date().toISOString(), data: {} });
    expect(await cache.loadConsumption()).toBeNull();
  });
});

describe('Verbrauchsdaten mit Datenstand-Stempel (ab Backend 4.8.18)', () => {
  const stamped = (marker, stamp) => ({ ...views(marker), _datenstand: stamp });

  async function stampedSetup({ savedMinutesAgo, reply }) {
    const env = setup({ loadImpl: async knownStamp => reply(knownStamp) });
    await env.cache.saveConsumption(stamped('gespeichert', 'S1'), new Date(Date.now() - savedMinutesAgo * 60 * 1000));
    return env;
  }

  it('fragt bei gestempeltem Stand nach fünf Minuten günstig nach und behält ihn bei „unverändert“', async () => {
    const env = await stampedSetup({ savedMinutesAgo: 10, reply: () => ({ unchanged: true, _datenstand: 'S1' }) });
    env.section.style.display = 'block';
    await env.ui.ensureConsumptionViewData();
    await env.ui.consumptionFetchPromise;
    await Promise.resolve();
    expect(env.loadConsumptionData).toHaveBeenCalledWith('S1');
    expect(env.dataService.state.view_verbrauch_jahr[0].marker).toBe('gespeichert');
    expect(env.ui.renderConsumptionDashboard).not.toHaveBeenCalled();
    const entry = await env.cache.loadConsumption();
    expect(Date.now() - Date.parse(entry.savedAt)).toBeLessThan(5000);
    expect(entry.data._datenstand).toBe('S1');
  });

  it('übernimmt neue Daten, wenn sich der Stempel geändert hat', async () => {
    const env = await stampedSetup({ savedMinutesAgo: 10, reply: () => stamped('neu', 'S2') });
    env.section.style.display = 'block';
    await env.ui.ensureConsumptionViewData();
    await env.ui.consumptionFetchPromise;
    await Promise.resolve();
    expect(env.dataService.state.view_verbrauch_jahr[0].marker).toBe('neu');
    expect(env.ui.renderConsumptionDashboard).toHaveBeenCalled();
    expect((await env.cache.loadConsumption()).data._datenstand).toBe('S2');
  });

  it('fragt innerhalb von fünf Minuten nicht erneut nach', async () => {
    const env = await stampedSetup({ savedMinutesAgo: 2, reply: () => ({ unchanged: true, _datenstand: 'S1' }) });
    await env.ui.ensureConsumptionViewData();
    expect(env.loadConsumptionData).not.toHaveBeenCalled();
  });

  it('prüft beim Vorladen nach dem Start mit dem gespeicherten Stempel, ohne Daten anzuzeigen', async () => {
    const env = await stampedSetup({ savedMinutesAgo: 30, reply: () => ({ unchanged: true, _datenstand: 'S1' }) });
    await env.ui.prefetchConsumptionData();
    expect(env.loadConsumptionData).toHaveBeenCalledWith('S1');
    expect(env.dataService.state.view_verbrauch_jahr).toEqual([]);
    await env.ui.ensureConsumptionViewData();
    expect(env.loadConsumptionData).toHaveBeenCalledOnce();
    expect(env.dataService.state.view_verbrauch_jahr[0].marker).toBe('gespeichert');
  });
});

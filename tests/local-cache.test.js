import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const cacheSource = readFileSync(new URL('../local-cache.js', import.meta.url), 'utf8');
const dataSource = readFileSync(new URL('../data-service.js', import.meta.url), 'utf8');
const cloudSource = readFileSync(new URL('../cloud-service.js', import.meta.url), 'utf8');

function memoryBackend() {
  const store = new Map();
  return {
    store,
    get: async key => (store.has(key) ? structuredClone(store.get(key)) : undefined),
    put: async (key, value) => { store.set(key, structuredClone(value)); },
    delete: async key => { store.delete(key); },
    keys: async () => [...store.keys()]
  };
}

function loadCache(environment = 'test', backend = memoryBackend()) {
  const cache = new Function('CONFIG', `${cacheSource};return localCache;`)({ ENVIRONMENT: environment });
  cache.backend = backend;
  return cache;
}

const stammdaten = { Objekte: [{ objekt_id: 'O1' }], Vertraege: [{ vertrag_id: 'V1' }], Zahlungen: [] };
const dashboard = { _view_aktive_mieter: [{ name: 'Donald' }] };

describe('Lokaler Zwischenspeicher', () => {
  it('speichert und lädt den Stand je Umgebung', async () => {
    const backend = memoryBackend();
    const test = loadCache('test', backend);
    const prod = loadCache('production', backend);
    await test.save(dashboard, stammdaten, new Date('2026-11-25T07:15:00Z'));
    const snapshot = await test.load(Date.parse('2026-11-25T08:00:00Z'));
    expect(snapshot).toMatchObject({ format: 1, environment: 'test', dashboard, stammdaten });
    expect(await prod.load(Date.parse('2026-11-25T08:00:00Z'))).toBeNull();
    expect([...backend.store.keys()]).toEqual(['snapshot:test']);
  });

  it('verwirft zu alte, fremde oder unvollständige Stände', async () => {
    const backend = memoryBackend();
    const cache = loadCache('test', backend);
    await cache.save(dashboard, stammdaten, new Date('2026-10-01T00:00:00Z'));
    expect(await cache.load(Date.parse('2026-11-25T00:00:00Z'))).toBeNull();
    backend.store.set('snapshot:test', { format: 99, savedAt: new Date().toISOString(), stammdaten });
    expect(await cache.load()).toBeNull();
    backend.store.set('snapshot:test', { format: 1, savedAt: new Date().toISOString(), stammdaten: { Objekte: [] } });
    expect(await cache.load()).toBeNull();
  });

  it('meldet Speicherfehler nicht an die App weiter', async () => {
    const cache = loadCache('test', {
      get: async () => { throw new Error('kaputt'); },
      put: async () => { throw new Error('voll'); },
      delete: async () => { throw new Error('gesperrt'); },
      keys: async () => { throw new Error('gesperrt'); }
    });
    expect(await cache.load()).toBeNull();
    expect(await cache.save(dashboard, stammdaten)).toBe(false);
    expect(await cache.clear({ all: true })).toBe(false);
  });

  it('löscht eine oder alle Umgebungen', async () => {
    const backend = memoryBackend();
    await loadCache('test', backend).save(dashboard, stammdaten);
    await loadCache('production', backend).save(dashboard, stammdaten);
    backend.store.set('fremd', 1);
    await loadCache('test', backend).clear();
    expect([...backend.store.keys()].sort()).toEqual(['fremd', 'snapshot:production']);
    await loadCache('test', backend).clear({ all: true });
    expect([...backend.store.keys()]).toEqual(['fremd']);
  });

  it('formatiert den Zeitpunkt für die Statuszeile', () => {
    const cache = loadCache();
    const savedAt = new Date(2026, 10, 25, 8, 5).toISOString();
    expect(cache.formatSavedAt({ savedAt })).toBe('25.11. 08:05');
    expect(cache.formatSavedAt({ savedAt: 'kaputt' })).toBe('');
  });
});

describe('Datenstand aus dem Zwischenspeicher', () => {
  const loadData = () => new Function('CONFIG', `${dataSource};return dataService;`)({});

  it('zeigt den gespeicherten Stand als veraltet an, bis frische Daten kommen', () => {
    const data = loadData();
    expect(data.applySnapshot({ savedAt: '2026-11-25T07:15:00Z', dashboard, stammdaten })).toBe(true);
    expect(data.state).toMatchObject({ dataStale: true, cachedAt: '2026-11-25T07:15:00Z', fullDataLoaded: true });
    expect(data.state.vertraege).toEqual(stammdaten.Vertraege);
    data.setActiveTenants({ _view_aktive_mieter: [{ name: 'Daisy' }] });
    expect(data.state.vertraege).toEqual(stammdaten.Vertraege);
    expect(data.state.view_aktive_mieter).toEqual([{ name: 'Daisy' }]);
    data.setInitialData({ ...stammdaten, Vertraege: [{ vertrag_id: 'V2' }] });
    expect(data.state).toMatchObject({ dataStale: false, cachedAt: '' });
    expect(data.state.vertraege).toEqual([{ vertrag_id: 'V2' }]);
  });

  it('leert nach einem abgelehnten Schlüssel alle angezeigten Daten', () => {
    const data = loadData();
    data.applySnapshot({ savedAt: '2026-11-25T07:15:00Z', dashboard, stammdaten });
    data.reset();
    expect(data.state.vertraege).toEqual([]);
    expect(data.state.objekte).toEqual([]);
    expect(data.state).toMatchObject({ dataStale: false, fullDataLoaded: false });
  });
});

describe('Schreiben auf zwischengespeichertem Stand', () => {
  const reply = body => ({ ok: true, text: async () => JSON.stringify(body) });
  function loadCloud(dataStale) {
    const store = { 'hv_access_key:test': 'k' };
    const localStorage = { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; } };
    const fetch = vi.fn().mockResolvedValue(reply({ status: 'success', message: 'ok' }));
    const dataService = { state: { dataStale } };
    const cloud = new Function('CONFIG', 'fetch', 'localStorage', 'navigator', 'dataService', `${cloudSource};return cloudService;`)(
      { API_URL: 'https://example.test/api', ENVIRONMENT: 'test' }, fetch, localStorage, { onLine: true }, dataService);
    return { cloud, fetch };
  }

  it('sperrt Zahlungen, Verträge und Prüfabschlüsse, bis frische Daten da sind', async () => {
    const { cloud, fetch } = loadCloud(true);
    await expect(cloud.saveTransaction({ typ: 'ZAHLUNG', data: [] })).rejects.toMatchObject({ code: 'DATA_STALE' });
    await expect(cloud.saveContract({ typ: 'VERTRAG_AKTUALISIEREN' })).rejects.toMatchObject({ code: 'DATA_STALE' });
    await expect(cloud.saveRentIncreaseReview({ typ: 'MIETERHOEHUNG_PRUEFUNG_SPEICHERN' })).rejects.toMatchObject({ code: 'DATA_STALE' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('erlaubt Zählerstände auch auf dem zwischengespeicherten Stand', async () => {
    const { cloud, fetch } = loadCloud(true);
    const result = await cloud.saveTransaction({ typ: 'ZAEHLERSTAND_NEU', data: [{ zaehler_id: 'Z1', wert: 5 }] });
    expect(result.status).toBe('success');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('lässt alle Schreibvorgänge mit frischen Daten unverändert durch', async () => {
    const { cloud, fetch } = loadCloud(false);
    expect((await cloud.saveTransaction({ typ: 'ZAHLUNG', data: [] })).status).toBe('success');
    expect(fetch).toHaveBeenCalledOnce();
  });
});

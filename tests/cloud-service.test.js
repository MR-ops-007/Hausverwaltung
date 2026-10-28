import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const reply = body => ({ ok: true, text: async () => JSON.stringify(body) });
const unauthorized = () => reply({ status: 'error', code: 'UNAUTHORIZED', message: 'Zugangsschlüssel fehlt oder ist falsch.' });
const bodyOf = (fetch, index) => JSON.parse(fetch.mock.calls[index][1].body);

function loadCloud({ key = '', online = true, accessUi } = {}) {
  const source = readFileSync(new URL('../cloud-service.js', import.meta.url), 'utf8');
  const store = key ? { hv_access_key: key } : {};
  const localStorage = {
    getItem: name => store[name] ?? null,
    setItem: (name, value) => { store[name] = String(value); },
    removeItem: name => { delete store[name]; }
  };
  const fetch = vi.fn();
  const navigator = { onLine: online };
  const console = { warn: vi.fn() };
  const cloud = new Function('CONFIG', 'fetch', 'localStorage', 'navigator', 'accessUi', 'console', `${source};return cloudService;`)(
    { API_URL: 'https://example.test/api' }, fetch, localStorage, navigator, accessUi, console);
  const queue = name => JSON.parse(store[name] || '[]');
  return { cloud, fetch, store, navigator, queue };
}

const transaction = { typ: 'ZAEHLERSTAND_NEU', data: [{ zaehler_id: 'Z1', wert: 5 }] };

describe('Lesen per POST mit Zugangsschlüssel', () => {
  it('sendet Typ, Ansicht und Schlüssel und liefert die Daten', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ _view_aktive_mieter: [{ name: 'A' }] }));
    expect(await cloud.loadDashboardData()).toEqual({ _view_aktive_mieter: [{ name: 'A' }] });
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(bodyOf(fetch, 0)).toEqual({ typ: 'LESEN', view: 'dashboard', data: [], key: 'k1' });
  });

  it.each([
    ['loadConsumptionData', 'verbrauch'],
    ['loadBackgroundData', 'alle'],
    ['loadCapabilities', 'vertrag_capabilities']
  ])('%s liest die Ansicht %s', async (method, view) => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ daten: [] }));
    await cloud[method]();
    expect(bodyOf(fetch, 0)).toMatchObject({ typ: 'LESEN', view });
  });

  it('erkennt ein älteres Backend, das die Anfrage nur als Schreibvorgang beantwortet', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ status: 'success', message: 'Daten verarbeitet und View aktualisiert' }));
    await expect(cloud.loadDashboardData()).rejects.toThrow(/4\.8\.0/);
  });

  it('gibt Fehlermeldungen des Backends weiter', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ status: 'error', message: 'Boom' }));
    await expect(cloud.loadDashboardData()).rejects.toThrow('Boom');
  });

  it('fragt bei UNAUTHORIZED nach, speichert den neuen Schlüssel und wiederholt die Anfrage', async () => {
    const accessUi = { prompt: vi.fn().mockResolvedValue('neu') };
    const { cloud, fetch, store } = loadCloud({ key: 'alt', accessUi });
    fetch.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(reply({ Mieter: [] }));
    expect(await cloud.loadBackgroundData()).toEqual({ Mieter: [] });
    expect(accessUi.prompt).toHaveBeenCalledTimes(1);
    expect(accessUi.prompt.mock.calls[0][0]).toMatch(/abgelehnt/);
    expect(bodyOf(fetch, 0).key).toBe('alt');
    expect(bodyOf(fetch, 1).key).toBe('neu');
    expect(store.hv_access_key).toBe('neu');
  });

  it('fragt ohne gespeicherten Schlüssel mit anderem Text nach', async () => {
    const accessUi = { prompt: vi.fn().mockResolvedValue('neu') };
    const { cloud, fetch } = loadCloud({ accessUi });
    fetch.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(reply({ Mieter: [] }));
    await cloud.loadBackgroundData();
    expect(accessUi.prompt.mock.calls[0][0]).toMatch(/wird der Zugangsschlüssel benötigt/);
  });

  it('meldet UNAUTHORIZED und verwirft den abgelehnten Schlüssel, wenn die Eingabe abgebrochen wird', async () => {
    const accessUi = { prompt: vi.fn().mockResolvedValue(null) };
    const { cloud, fetch, store } = loadCloud({ key: 'falsch', accessUi });
    fetch.mockResolvedValue(unauthorized());
    await expect(cloud.loadDashboardData()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(store.hv_access_key).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('meldet UNAUTHORIZED ohne Dialog, wenn keiner verfügbar ist', async () => {
    const { cloud, fetch } = loadCloud({ key: 'x' });
    fetch.mockResolvedValue(unauthorized());
    await expect(cloud.loadDashboardData()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('gibt nach wiederholt abgelehnten Schlüsseln auf', async () => {
    const accessUi = { prompt: vi.fn().mockResolvedValue('immer-falsch') };
    const { cloud, fetch } = loadCloud({ accessUi });
    fetch.mockResolvedValue(unauthorized());
    await expect(cloud.loadDashboardData()).rejects.toThrow(/mehrfach/);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('prüft Vertragsänderungen über dieselbe geschützte Leseroute', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValueOnce(reply({ contract_writes: true }))
      .mockResolvedValueOnce(reply({ status: 'success', vertrag: { id: 1 }, anpassung: { id: 2 } }));
    await cloud.saveContract({ typ: 'VERTRAG_AKTUALISIEREN', token: 't' });
    expect(bodyOf(fetch, 0)).toMatchObject({ typ: 'LESEN', view: 'vertrag_capabilities', key: 'k1' });
    expect(bodyOf(fetch, 1)).toMatchObject({ typ: 'VERTRAG_AKTUALISIEREN', token: 't', key: 'k1' });
  });
});

describe('Zählerstände speichern', () => {
  it('sendet den Schlüssel mit und meldet Erfolg', async () => {
    const { cloud, fetch, queue } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ status: 'success', message: 'Daten verarbeitet' }));
    expect(await cloud.saveTransaction(transaction)).toEqual({ status: 'success', message: 'Daten verarbeitet' });
    expect(bodyOf(fetch, 0)).toMatchObject({ ...transaction, key: 'k1' });
    expect(queue('offline_queue')).toEqual([]);
  });

  it('legt Einträge offline und bei Netzwerkfehlern in die Queue', async () => {
    const offline = loadCloud({ key: 'k1', online: false });
    expect((await offline.cloud.saveTransaction(transaction)).message).toBe('Offline gespeichert');
    expect(offline.queue('offline_queue')).toEqual([transaction]);
    expect(offline.fetch).not.toHaveBeenCalled();

    const network = loadCloud({ key: 'k1' });
    network.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await network.cloud.saveTransaction(transaction)).message).toBe('In Queue verschoben');
    expect(network.queue('offline_queue')).toEqual([transaction]);
  });

  it('queued vorübergehende Serverfehler, aber keine Ablehnungen', async () => {
    const server = loadCloud({ key: 'k1' });
    server.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => '' });
    expect((await server.cloud.saveTransaction(transaction)).status).toBe('success');
    expect(server.queue('offline_queue')).toHaveLength(1);

    const client = loadCloud({ key: 'k1' });
    client.fetch.mockResolvedValue({ ok: false, status: 400, text: async () => '' });
    expect((await client.cloud.saveTransaction(transaction)).status).toBe('error');
    expect(client.queue('offline_queue')).toEqual([]);
  });

  it('meldet Fehler des Backends als Fehler und queued sie nicht', async () => {
    const { cloud, fetch, queue } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ status: 'error', message: 'Unbekannter Typ.' }));
    expect(await cloud.saveTransaction(transaction)).toEqual({ status: 'error', message: 'Unbekannter Typ.' });
    expect(queue('offline_queue')).toEqual([]);
  });

  it('meldet einen abgelehnten Schlüssel als Fehler statt als gespeicherten Erfolg', async () => {
    const accessUi = { prompt: vi.fn().mockResolvedValue(null) };
    const { cloud, fetch, queue } = loadCloud({ key: 'falsch', accessUi });
    fetch.mockResolvedValue(unauthorized());
    const result = await cloud.saveTransaction(transaction);
    expect(result.status).toBe('error');
    expect(result.message).toMatch(/Zugangsschlüssel/);
    expect(queue('offline_queue')).toEqual([]);
  });

  it('speichert nach erfolgreicher Neueingabe des Schlüssels', async () => {
    const accessUi = { prompt: vi.fn().mockResolvedValue('richtig') };
    const { cloud, fetch, queue } = loadCloud({ key: 'falsch', accessUi });
    fetch.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(reply({ status: 'success', message: 'OK' }));
    expect((await cloud.saveTransaction(transaction)).status).toBe('success');
    expect(bodyOf(fetch, 1).key).toBe('richtig');
    expect(queue('offline_queue')).toEqual([]);
  });
});

describe('Offline-Queue', () => {
  const item = n => ({ typ: 'ZAEHLERSTAND_NEU', data: [{ zaehler_id: 'Z' + n }] });
  const withQueue = (items, options) => {
    const setup = loadCloud({ key: 'k1', ...options });
    setup.store.offline_queue = JSON.stringify(items);
    return setup;
  };

  it('entfernt nur vom Backend bestätigte Einträge', async () => {
    const { cloud, fetch, queue } = withQueue([item(1), item(2)]);
    fetch.mockResolvedValue(reply({ status: 'success' }));
    await cloud.processOfflineQueue();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(queue('offline_queue')).toEqual([]);
    expect(bodyOf(fetch, 0).key).toBe('k1');
  });

  it('verliert Einträge nicht, wenn das Backend mit HTTP 200 einen Fehler meldet', async () => {
    const { cloud, fetch, queue } = withQueue([item(1), item(2), item(3)]);
    fetch.mockResolvedValueOnce(reply({ status: 'success' }))
      .mockResolvedValueOnce(reply({ status: 'error', message: 'Abgelehnt' }))
      .mockResolvedValueOnce(reply({ status: 'success' }));
    await cloud.processOfflineQueue();
    expect(queue('offline_queue')).toEqual([]);
    expect(queue('offline_queue_failed')).toEqual([item(2)]);
  });

  it('behält den Rest bei Netzwerkproblemen', async () => {
    const { cloud, fetch, queue } = withQueue([item(1), item(2), item(3)]);
    fetch.mockResolvedValueOnce(reply({ status: 'success' })).mockRejectedValueOnce(new TypeError('offline'));
    await cloud.processOfflineQueue();
    expect(queue('offline_queue')).toEqual([item(2), item(3)]);
    expect(queue('offline_queue_failed')).toEqual([]);
  });

  it('behält die Queue bei abgelehntem Schlüssel und öffnet dabei keinen Dialog', async () => {
    const accessUi = { prompt: vi.fn() };
    const { cloud, fetch, queue } = withQueue([item(1), item(2)], { accessUi });
    fetch.mockResolvedValue(unauthorized());
    await cloud.processOfflineQueue();
    expect(accessUi.prompt).not.toHaveBeenCalled();
    expect(queue('offline_queue')).toEqual([item(1), item(2)]);
    expect(queue('offline_queue_failed')).toEqual([]);
  });

  it('behält Einträge, die während des Durchlaufs neu dazukommen', async () => {
    const { cloud, fetch, store, queue } = withQueue([item(1)]);
    fetch.mockImplementation(async () => {
      store.offline_queue = JSON.stringify([item(1), item(9)]);
      return reply({ status: 'success' });
    });
    await cloud.processOfflineQueue();
    expect(queue('offline_queue')).toEqual([item(9)]);
  });

  it('sendet bei gleichzeitigen Aufrufen nichts doppelt', async () => {
    const { cloud, fetch } = withQueue([item(1)]);
    fetch.mockResolvedValue(reply({ status: 'success' }));
    await Promise.all([cloud.processOfflineQueue(), cloud.processOfflineQueue()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('tut offline oder bei leerer Queue nichts', async () => {
    const offline = withQueue([item(1)], { online: false });
    await offline.cloud.processOfflineQueue();
    expect(offline.fetch).not.toHaveBeenCalled();
    const empty = loadCloud({ key: 'k1' });
    await empty.cloud.processOfflineQueue();
    expect(empty.fetch).not.toHaveBeenCalled();
  });

  it('lädt Hintergrunddaten zuerst und verarbeitet danach die Queue', async () => {
    const { cloud, fetch, queue } = withQueue([item(1)]);
    fetch.mockResolvedValueOnce(reply({ Mieter: [] })).mockResolvedValueOnce(reply({ status: 'success' }));
    expect(await cloud.loadBackgroundData()).toEqual({ Mieter: [] });
    expect(bodyOf(fetch, 0)).toMatchObject({ typ: 'LESEN', view: 'alle' });
    expect(bodyOf(fetch, 1)).toMatchObject(item(1));
    expect(queue('offline_queue')).toEqual([]);
  });
});

describe('Zugangsschlüssel-Dialog', () => {
  function fakeDom() {
    const node = () => {
      const listeners = {};
      return { listeners, value: '', textContent: '', focus: vi.fn(), remove: vi.fn(),
        addEventListener(type, handler) { listeners[type] = handler; },
        click() { listeners.click && listeners.click(); } };
    };
    const nodes = { '.access-message': node(), '#access-key': node(), '.access-save': node(), '.access-cancel': node() };
    const overlay = { className: '', innerHTML: '', remove: vi.fn(), querySelector: selector => nodes[selector] };
    const appended = [];
    const document = { createElement: () => overlay, body: { appendChild: element => appended.push(element) } };
    const accessUi = new Function('document', `${readFileSync(new URL('../access-ui.js', import.meta.url), 'utf8')};return accessUi;`)(document);
    return { accessUi, nodes, overlay, appended };
  }

  it('zeigt die Meldung und liefert den getrimmten Schlüssel', async () => {
    const { accessUi, nodes, overlay, appended } = fakeDom();
    const promise = accessUi.prompt('Bitte eingeben');
    expect(nodes['.access-message'].textContent).toBe('Bitte eingeben');
    expect(appended).toEqual([overlay]);
    expect(nodes['#access-key'].focus).toHaveBeenCalled();
    nodes['#access-key'].value = '  geheim  ';
    nodes['.access-save'].click();
    expect(await promise).toBe('geheim');
    expect(overlay.remove).toHaveBeenCalled();
    expect(accessUi.pending).toBeNull();
  });

  it('akzeptiert keine leere Eingabe', async () => {
    const { accessUi, nodes, overlay } = fakeDom();
    const promise = accessUi.prompt('x');
    nodes['.access-save'].click();
    expect(overlay.remove).not.toHaveBeenCalled();
    nodes['#access-key'].value = 'k';
    nodes['#access-key'].listeners.keydown({ key: 'Enter' });
    expect(await promise).toBe('k');
  });

  it('liefert null bei Abbruch oder Escape', async () => {
    const first = fakeDom();
    const cancelled = first.accessUi.prompt('x');
    first.nodes['.access-cancel'].click();
    expect(await cancelled).toBeNull();

    const second = fakeDom();
    const escaped = second.accessUi.prompt('x');
    second.nodes['#access-key'].listeners.keydown({ key: 'Escape' });
    expect(await escaped).toBeNull();
  });

  it('öffnet bei gleichzeitigen Aufrufen nur einen Dialog', async () => {
    const { accessUi, nodes, appended } = fakeDom();
    const first = accessUi.prompt('a');
    const second = accessUi.prompt('b');
    expect(second).toBe(first);
    expect(appended).toHaveLength(1);
    nodes['.access-cancel'].click();
    await first;
  });

  it('bindet den Dialog vor dem Cloud-Service in die Seite ein', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html.indexOf('access-ui.js')).toBeGreaterThan(-1);
    expect(html.indexOf('access-ui.js')).toBeLessThan(html.indexOf('cloud-service.js'));
  });
});

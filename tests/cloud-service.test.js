import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const reply = body => ({ ok: true, text: async () => JSON.stringify(body) });
const unauthorized = () => reply({ status: 'error', code: 'UNAUTHORIZED', message: 'Zugangsschlüssel fehlt oder ist falsch.' });
const bodyOf = (fetch, index) => JSON.parse(fetch.mock.calls[index][1].body);

function loadCloud({ key = '', online = true, accessUi, failSet = false, dropWrites = false, withDocument = false, failSetWhen = null, failRemoveWhen = null } = {}) {
  const source = readFileSync(new URL('../cloud-service.js', import.meta.url), 'utf8');
  const store = key ? { hv_access_key: key } : {};
  const localStorage = {
    getItem: name => store[name] ?? null,
    setItem: (name, value) => {
      if (failSet || (failSetWhen && failSetWhen(name))) throw new Error('QuotaExceededError');
      if (dropWrites) return; // speichert stillschweigend nichts
      store[name] = String(value);
    },
    removeItem: name => {
      if (failRemoveWhen && failRemoveWhen(name)) throw new Error('SecurityError');
      delete store[name];
    }
  };
  const fetch = vi.fn();
  const navigator = { onLine: online };
  const console = { warn: vi.fn() };
  const events = [];
  const document = withDocument ? { dispatchEvent: event => events.push(event.type) } : undefined;
  const CustomEvent = withDocument ? class { constructor(type) { this.type = type; } } : undefined;
  const cloud = new Function('CONFIG', 'fetch', 'localStorage', 'navigator', 'accessUi', 'console', 'document', 'CustomEvent', `${source};return cloudService;`)(
    { API_URL: 'https://example.test/api' }, fetch, localStorage, navigator, accessUi, console, document, CustomEvent);
  const queue = name => JSON.parse(store[name] || '[]');
  // Nutzdaten der Queue-Einträge (ohne id/status), in Reihenfolge.
  const payloads = () => queue('offline_queue').map(entry => entry.payload);
  return { cloud, fetch, store, navigator, queue, payloads, events };
}

afterEach(() => vi.useRealTimers());

const transaction = { typ: 'ZAEHLERSTAND_NEU', data: [{ zaehler_id: 'Z1', wert: 5 }] };

describe('Lesen per POST mit Zugangsschlüssel', () => {
  it('fordert die geschützte Aktualisierung der Verbrauchsviews an', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ status: 'success', message: 'Verbrauchsviews aktualisiert' }));
    await expect(cloud.refreshConsumptionViews()).resolves.toMatchObject({ status: 'success' });
    expect(bodyOf(fetch, 0)).toEqual({ typ: 'VERBRAUCH_VIEWS_AKTUALISIEREN', key: 'k1' });
  });

  it('meldet einen Fehler beim Aktualisieren der Verbrauchsviews', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ status: 'error', message: 'Nicht erlaubt' }));
    await expect(cloud.refreshConsumptionViews()).rejects.toThrow('Nicht erlaubt');
  });

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

describe('Zählerstände speichern: Konflikt und Backend-Fehler', () => {
  it('reicht CONFLICT samt Konfliktdaten an die UI weiter, ohne zu queuen', async () => {
    const { cloud, fetch, queue } = loadCloud({ key: 'k1' });
    const conflicts = [{ stand_id: 'ST_Z1', zaehler_id: 'Z1', alter_wert: 1950, neuer_wert: 1590 }];
    fetch.mockResolvedValue(reply({ status: 'error', code: 'CONFLICT', message: 'Konflikt', conflicts }));
    expect(await cloud.saveTransaction(transaction)).toEqual({ status: 'error', code: 'CONFLICT', conflicts, message: 'Konflikt' });
    expect(queue('offline_queue')).toEqual([]);
  });

  it('queued LOCK_TIMEOUT als vorübergehenden Fehler', async () => {
    const { cloud, fetch, payloads } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ status: 'error', code: 'LOCK_TIMEOUT', transient: true, message: 'ausgelastet' }));
    expect(await cloud.saveTransaction(transaction)).toMatchObject({ status: 'success', queued: true });
    expect(payloads()).toEqual([transaction]);
  });

  it('sendet den Überschreib-Grund mit', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ status: 'success', message: 'ok' }));
    await cloud.saveTransaction({ ...transaction, ueberschreiben: { grund: 'Tippfehler' } });
    expect(bodyOf(fetch, 0)).toMatchObject({ ueberschreiben: { grund: 'Tippfehler' } });
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
    expect(await offline.cloud.saveTransaction(transaction)).toMatchObject({ queued: true, message: 'Offline gespeichert' });
    expect(offline.payloads()).toEqual([transaction]);
    expect(offline.queue('offline_queue')[0]).toMatchObject({ status: 'pending' });
    expect(offline.fetch).not.toHaveBeenCalled();

    const network = loadCloud({ key: 'k1' });
    network.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await network.cloud.saveTransaction(transaction)).toMatchObject({ status: 'success', queued: true, message: 'In Queue verschoben' });
    expect(network.payloads()).toEqual([transaction]);
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
  const item = n => ({ typ: 'ZAEHLERSTAND_NEU', data: [{ zaehler_id: 'Z' + n, wert: n }] });
  const entry = (n, extra = {}) => ({ id: 'e' + n, payload: item(n), status: 'pending', queued_at: null, ...extra });
  const withQueue = (entries, options) => {
    const setup = loadCloud({ key: 'k1', ...options });
    setup.store.offline_queue = JSON.stringify(entries);
    return setup;
  };

  it('entfernt nur vom Backend bestätigte Einträge', async () => {
    const { cloud, fetch, queue } = withQueue([entry(1), entry(2)]);
    fetch.mockResolvedValue(reply({ status: 'success' }));
    await cloud.processOfflineQueue();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(queue('offline_queue')).toEqual([]);
    expect(bodyOf(fetch, 0).key).toBe('k1');
  });

  it('markiert Ablehnungen mit Grund, behält sie sichtbar und blockiert den Rest nicht', async () => {
    const { cloud, fetch, queue } = withQueue([entry(1), entry(2), entry(3)]);
    const conflicts = [{ stand_id: 'ST_Z2', zaehler_id: 'Z2', alter_wert: 1, neuer_wert: 2 }];
    fetch.mockResolvedValueOnce(reply({ status: 'success' }))
      .mockResolvedValueOnce(reply({ status: 'error', code: 'CONFLICT', message: 'Konflikt', conflicts }))
      .mockResolvedValueOnce(reply({ status: 'success' }));
    const summary = await cloud.processOfflineQueue();
    expect(queue('offline_queue')).toHaveLength(1);
    expect(queue('offline_queue')[0]).toMatchObject({ id: 'e2', status: 'rejected', code: 'CONFLICT', message: 'Konflikt', conflicts });
    expect(summary).toMatchObject({ pending: 0, rejected: 1, values: 1 });
  });

  it('behält bei LOCK_TIMEOUT den Rest als pending und stoppt den Durchlauf', async () => {
    const { cloud, fetch, queue } = withQueue([entry(1), entry(2), entry(3)]);
    fetch.mockResolvedValueOnce(reply({ status: 'success' }))
      .mockResolvedValueOnce(reply({ status: 'error', code: 'LOCK_TIMEOUT', transient: true, message: 'ausgelastet' }));
    await cloud.processOfflineQueue();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(queue('offline_queue').map(e => [e.id, e.status])).toEqual([['e2', 'pending'], ['e3', 'pending']]);
  });

  it('behält den Rest bei Netzwerkproblemen', async () => {
    const { cloud, fetch, queue } = withQueue([entry(1), entry(2), entry(3)]);
    fetch.mockResolvedValueOnce(reply({ status: 'success' })).mockRejectedValueOnce(new TypeError('offline'));
    await cloud.processOfflineQueue();
    expect(queue('offline_queue').map(e => [e.id, e.status])).toEqual([['e2', 'pending'], ['e3', 'pending']]);
  });

  it('behält die Queue bei abgelehntem Schlüssel und öffnet dabei keinen Dialog', async () => {
    const accessUi = { prompt: vi.fn() };
    const { cloud, fetch, queue } = withQueue([entry(1), entry(2)], { accessUi });
    fetch.mockResolvedValue(unauthorized());
    await cloud.processOfflineQueue();
    expect(accessUi.prompt).not.toHaveBeenCalled();
    expect(queue('offline_queue').map(e => e.status)).toEqual(['pending', 'pending']);
  });

  it('fragt beim manuellen Senden nach dem Schlüssel, wenn allowPrompt gesetzt ist', async () => {
    const accessUi = { prompt: vi.fn().mockResolvedValue('richtig') };
    const { cloud, fetch, queue } = withQueue([entry(1)], { accessUi });
    fetch.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(reply({ status: 'success' }));
    await cloud.processOfflineQueue({ allowPrompt: true });
    expect(accessUi.prompt).toHaveBeenCalledTimes(1);
    expect(queue('offline_queue')).toEqual([]);
  });

  it('behält Einträge, die während des Durchlaufs neu dazukommen', async () => {
    const { cloud, fetch, store, queue } = withQueue([entry(1)]);
    fetch.mockImplementation(async () => {
      store.offline_queue = JSON.stringify([entry(1), entry(9)]);
      return reply({ status: 'success' });
    });
    await cloud.processOfflineQueue();
    expect(queue('offline_queue').map(e => e.id)).toEqual(['e9']);
  });

  it('sendet abgelehnte Einträge nie von selbst, auch nicht mit force', async () => {
    const rejected = entry(1, { status: 'rejected', code: 'CONFLICT', message: 'Konflikt' });
    const { cloud, fetch } = withQueue([rejected]);
    await cloud.processOfflineQueue();
    await cloud.processOfflineQueue({ force: true, allowPrompt: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('versucht einen abgelehnten Eintrag erst nach ausdrücklichem retryEntry erneut', async () => {
    const rejected = entry(1, { status: 'rejected', code: 'VALIDIERUNG', message: 'Fehler' });
    const { cloud, fetch, queue } = withQueue([rejected]);
    fetch.mockResolvedValue(reply({ status: 'success' }));
    cloud.retryEntry('e1');
    expect(queue('offline_queue')[0]).toMatchObject({ status: 'pending' });
    await cloud.processOfflineQueue();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(queue('offline_queue')).toEqual([]);
  });

  it('übernimmt ältere Formate: rohe Payloads und die frühere Liste offline_queue_failed', () => {
    const { cloud, store, queue } = withQueue([item(1)]);
    store.offline_queue_failed = JSON.stringify([item(2)]);
    const summary = cloud.getQueueSummary();
    expect(summary).toMatchObject({ pending: 1, rejected: 1, values: 2 });
    expect(summary.entries.map(e => e.payload)).toEqual([item(1), item(2)]);
    expect(queue('offline_queue')).toHaveLength(2);
    expect(store.offline_queue_failed).toBeUndefined();
    expect(new Set(queue('offline_queue').map(e => e.id)).size).toBe(2);
  });

  it('verwirft einen Eintrag nur auf ausdrückliche Anforderung', () => {
    const { cloud, queue } = withQueue([entry(1), entry(2)]);
    cloud.discardQueueEntry('e1');
    expect(queue('offline_queue').map(e => e.id)).toEqual(['e2']);
  });

  it('sendet nach prepareOverwrite den Grund mit und entfernt den Eintrag nach Erfolg', async () => {
    const rejected = entry(1, { status: 'rejected', code: 'CONFLICT', message: 'Konflikt' });
    const { cloud, fetch, queue } = withQueue([rejected]);
    fetch.mockResolvedValue(reply({ status: 'success' }));
    cloud.prepareOverwrite('e1', 'Tippfehler');
    expect(queue('offline_queue')[0]).toMatchObject({ status: 'pending' });
    await cloud.processOfflineQueue();
    expect(bodyOf(fetch, 0)).toMatchObject({ ...item(1), ueberschreiben: { grund: 'Tippfehler' }, key: 'k1' });
    expect(queue('offline_queue')).toEqual([]);
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

  it('sendet zuerst die Queue und liest danach, damit die Daten den synchronisierten Stand zeigen', async () => {
    const { cloud, fetch, queue } = withQueue([entry(1)]);
    fetch.mockResolvedValueOnce(reply({ status: 'success' })).mockResolvedValueOnce(reply({ Mieter: [] }));
    expect(await cloud.loadBackgroundData()).toEqual({ Mieter: [] });
    expect(bodyOf(fetch, 0)).toMatchObject(item(1));
    expect(bodyOf(fetch, 1)).toMatchObject({ typ: 'LESEN', view: 'alle' });
    expect(queue('offline_queue')).toEqual([]);
  });

  it('liest auch dann, wenn die Queue nicht gesendet werden konnte', async () => {
    const { cloud, fetch, queue } = withQueue([entry(1)]);
    fetch.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(reply({ Mieter: [] }));
    expect(await cloud.loadBackgroundData()).toEqual({ Mieter: [] });
    expect(queue('offline_queue')).toHaveLength(1);
  });
});

describe('Verlustfreie lokale Speicherung', () => {
  it('meldet einen Fehler statt „offline gespeichert“, wenn localStorage nicht schreibbar ist', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1', online: false, failSet: true });
    const result = await cloud.saveTransaction(transaction);
    expect(result).toMatchObject({ status: 'error', code: 'QUEUE_WRITE_FAILED' });
    expect(result.queued).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('erkennt, dass nichts gespeichert wurde, auch wenn setItem keinen Fehler wirft', async () => {
    const { cloud } = loadCloud({ key: 'k1', online: false, dropWrites: true });
    expect(await cloud.saveTransaction(transaction)).toMatchObject({ status: 'error', code: 'QUEUE_WRITE_FAILED' });
  });

  it('meldet bei Verbindungsabbruch und nicht schreibbarem Speicher einen Fehler', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1', failSet: true });
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await cloud.saveTransaction(transaction)).toMatchObject({ status: 'error', code: 'QUEUE_WRITE_FAILED' });
  });

  it('behält die alte Liste offline_queue_failed, wenn die Übernahme nicht gespeichert werden konnte', () => {
    const { cloud, store } = loadCloud({ key: 'k1', failSet: true });
    store.offline_queue_failed = JSON.stringify([item0(2)]);
    store.offline_queue = JSON.stringify([item0(1)]);
    const first = cloud.getQueueSummary();
    expect(first.entries.map(e => e.payload)).toEqual([item0(1), item0(2)]);
    expect(store.offline_queue_failed).toBeDefined();
    expect(JSON.parse(store.offline_queue)).toEqual([item0(1)]);
    // Stabile IDs, damit Aktionen auf noch nicht persistierte Einträge funktionieren.
    expect(cloud.getQueueSummary().entries.map(e => e.id)).toEqual(first.entries.map(e => e.id));
  });

  it('entfernt die alte Liste erst nach nachweislich gespeicherter Übernahme', () => {
    const { cloud, store, queue } = loadCloud({ key: 'k1' });
    store.offline_queue_failed = JSON.stringify([item0(2)]);
    cloud.getQueueSummary();
    expect(store.offline_queue_failed).toBeUndefined();
    expect(queue('offline_queue')).toHaveLength(1);
    expect(cloud.getQueueSummary().entries).toHaveLength(1);
  });
});

describe('Beschädigte Offline-Queue', () => {
  const corrupt = (extra = {}) => {
    const setup = loadCloud({ key: 'k1', ...extra });
    setup.store.offline_queue = '{kaputt';
    return setup;
  };

  it('behandelt sie nicht als leere Queue, sondern meldet den Fehler und lässt die Daten unverändert', () => {
    const { cloud, store } = corrupt();
    const summary = cloud.getQueueSummary();
    expect(summary.entries).toEqual([]);
    expect(summary.problems).toEqual([{ key: 'offline_queue', unreadable: false }]);
    expect(store.offline_queue).toBe('{kaputt');
  });

  it('erkennt auch gültiges JSON, das keine Liste ist', () => {
    const { cloud, store } = loadCloud({ key: 'k1' });
    store.offline_queue = '{"a":1}';
    expect(cloud.getQueueSummary().problems).toHaveLength(1);
  });

  it('überschreibt die beschädigten Daten nicht und meldet beim Speichern einen eindeutigen Fehler', async () => {
    const { cloud, store, fetch } = corrupt({ online: false });
    const result = await cloud.saveTransaction(transaction);
    expect(result).toMatchObject({ status: 'error', code: 'QUEUE_CORRUPT' });
    expect(result.queued).toBeUndefined();
    expect(store.offline_queue).toBe('{kaputt');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('meldet den Fehler auch bei einem Verbindungsabbruch während des Speicherns', async () => {
    const { cloud, store, fetch } = corrupt();
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await cloud.saveTransaction(transaction)).toMatchObject({ status: 'error', code: 'QUEUE_CORRUPT' });
    expect(store.offline_queue).toBe('{kaputt');
  });

  it('sichert die Rohdaten geprüft, entfernt danach das Original und macht die Queue wieder nutzbar', async () => {
    const { cloud, store, queue } = corrupt({ online: false });
    const result = cloud.resolveCorruptQueue();
    expect(result.ok).toBe(true);
    expect(result.backups).toHaveLength(1);
    expect(store[result.backups[0]]).toBe('{kaputt');
    expect(store.offline_queue).toBeUndefined();
    expect(cloud.getQueueSummary().problems).toEqual([]);
    expect(await cloud.saveTransaction(transaction)).toMatchObject({ status: 'success', queued: true });
    expect(queue('offline_queue')).toHaveLength(1);
    expect(store[result.backups[0]]).toBe('{kaputt');
  });

  it('lässt alles unverändert, wenn die Sicherung nicht gespeichert werden kann', () => {
    const { cloud, store } = corrupt({ failSet: true });
    cloud.getQueueSummary();
    expect(cloud.resolveCorruptQueue()).toMatchObject({ ok: false });
    expect(store.offline_queue).toBe('{kaputt');
    expect(cloud.getQueueSummary().problems).toHaveLength(1);
  });

  it('lässt alles unverändert, wenn die Sicherung nicht zurückgelesen werden kann', () => {
    const { cloud, store } = corrupt({ dropWrites: true });
    cloud.getQueueSummary();
    expect(cloud.resolveCorruptQueue()).toMatchObject({ ok: false });
    expect(store.offline_queue).toBe('{kaputt');
  });

  it('behandelt eine beschädigte alte Liste offline_queue_failed genauso und überschreibt sie nicht', () => {
    const { cloud, store } = loadCloud({ key: 'k1' });
    store.offline_queue_failed = 'kaputt';
    store.offline_queue = JSON.stringify([item0(1)]);
    const summary = cloud.getQueueSummary();
    expect(summary.problems).toEqual([{ key: 'offline_queue_failed', unreadable: false }]);
    expect(store.offline_queue_failed).toBe('kaputt');
    expect(summary.entries).toHaveLength(1);
  });

  it('versendet intakte Einträge nicht, solange die Queue beschädigt ist (kein Teilzustand)', async () => {
    const { cloud, fetch } = corrupt();
    await cloud.processOfflineQueue({ force: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Wiederherstellung, wenn beide Queues beschädigt sind', () => {
  const bothCorrupt = (options = {}) => {
    const setup = loadCloud({ key: 'k1', ...options });
    setup.store.offline_queue = '{kaputt-1';
    setup.store.offline_queue_failed = '[kaputt-2';
    return setup;
  };

  it('zeigt beide Schäden an', () => {
    const { cloud } = bothCorrupt();
    expect(cloud.getQueueSummary().problems.map(p => p.key).sort()).toEqual(['offline_queue', 'offline_queue_failed']);
  });

  it('sichert beide Queues geprüft, entfernt beide Originale und macht die Queue nutzbar', async () => {
    const { cloud, store, queue } = bothCorrupt({ online: false });
    const result = cloud.resolveCorruptQueue();
    expect(result).toMatchObject({ ok: true });
    expect(result.backups).toHaveLength(2);
    expect(result.reset.sort()).toEqual(['offline_queue', 'offline_queue_failed']);
    expect(result.backups.map(key => store[key]).sort()).toEqual(['[kaputt-2', '{kaputt-1']);
    expect(store.offline_queue).toBeUndefined();
    expect(store.offline_queue_failed).toBeUndefined();
    expect(cloud.getQueueSummary().problems).toEqual([]);
    expect(await cloud.saveTransaction(transaction)).toMatchObject({ queued: true });
    expect(queue('offline_queue')).toHaveLength(1);
  });

  it('lässt beide Originale unverändert, wenn die zweite Sicherung scheitert, und sagt das genau', () => {
    const { cloud, store } = bothCorrupt({ failSetWhen: name => name.startsWith('offline_queue_failed_defekt') });
    const result = cloud.resolveCorruptQueue();
    expect(result).toMatchObject({ ok: false });
    expect(result.partial).toBeUndefined();
    expect(result.message).toContain('Die Sicherung von „offline_queue_failed“ konnte nicht gespeichert werden');
    expect(result.message).toContain('Originale wurden nicht verändert');
    expect(result.message).toContain('Bereits angelegte Sicherungskopien: offline_queue_defekt_');
    expect(store.offline_queue).toBe('{kaputt-1');
    expect(store.offline_queue_failed).toBe('[kaputt-2');
    expect(cloud.getQueueSummary().problems).toHaveLength(2);
  });

  it('meldet einen Teilfehler korrekt, wenn nur ein Original nicht entfernt werden kann', () => {
    const fail = { on: true };
    const { cloud, store } = bothCorrupt({ failRemoveWhen: name => fail.on && name === 'offline_queue_failed' });
    const result = cloud.resolveCorruptQueue();
    expect(result).toMatchObject({ ok: false, partial: true });
    expect(result.reset).toEqual(['offline_queue']);
    expect(result.remaining).toEqual(['offline_queue_failed']);
    expect(result.message).toContain('Teilweise abgeschlossen');
    expect(result.message).toContain('Zurückgesetzt: offline_queue.');
    expect(result.message).toContain('Noch beschädigt und nicht zurückgesetzt: offline_queue_failed');
    expect(result.message).not.toContain('nichts verändert');
    expect(result.backups).toHaveLength(2);
    expect(store.offline_queue).toBeUndefined();
    expect(store.offline_queue_failed).toBe('[kaputt-2');
    expect(cloud.getQueueSummary().problems.map(p => p.key)).toEqual(['offline_queue_failed']);

    // Zweiter Versuch schließt den Rest ab (Sicherung ist idempotent).
    fail.on = false;
    const retry = cloud.resolveCorruptQueue();
    expect(retry).toMatchObject({ ok: true });
    expect(store.offline_queue_failed).toBeUndefined();
    expect(cloud.getQueueSummary().problems).toEqual([]);
    expect(Object.keys(store).filter(key => key.includes('_defekt_'))).toHaveLength(2);
  });
});

describe('Zeitgesteuerte Wiederholung unabhängig von navigator.onLine', () => {
  it('sendet den geplanten Versuch auch, wenn der Browser fälschlich „offline“ meldet', async () => {
    vi.useFakeTimers();
    const { cloud, fetch, queue } = loadCloud({ key: 'k1', online: false });
    fetch.mockResolvedValue(reply({ status: 'success' }));
    expect(await cloud.saveTransaction(transaction)).toMatchObject({ queued: true });
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(queue('offline_queue')).toEqual([]);
  });

  it('bleibt auch bei gemeldetem „offline“ begrenzt: höchstens so viele Versuche wie Verzögerungen', async () => {
    vi.useFakeTimers();
    const { cloud, fetch, queue } = loadCloud({ key: 'k1', online: false });
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await cloud.saveTransaction(transaction);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(cloud.RETRY_DELAYS_MS.length);
    expect(queue('offline_queue')).toHaveLength(1);
  });

  it('löst bei der Rückkehr zur App (force) einen begrenzten Versuch aus, auch wenn „offline“ gemeldet wird', async () => {
    vi.useFakeTimers();
    const { cloud, fetch } = loadCloud({ key: 'k1', online: false });
    cloud.saveToOfflineQueue(transaction);
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await cloud.processOfflineQueue({ force: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(1 + cloud.RETRY_DELAYS_MS.length);
  });

  it('sendet nichts, wenn die Queue leer ist (kein Polling ohne offene Einträge)', async () => {
    vi.useFakeTimers();
    const { cloud, fetch } = loadCloud({ key: 'k1', online: false });
    await cloud.processOfflineQueue({ force: true });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Eindeutige Backend-Bestätigung', () => {
  const unclearResponses = {
    'leere Antwort': { ok: true, text: async () => '' },
    'ungültiges JSON': { ok: true, text: async () => '<html>Anmeldung</html>' },
    'unbekannter Status': reply({ status: 'vielleicht' }),
    'Antwort ohne Status': reply({ foo: 'bar' }),
  };

  Object.entries(unclearResponses).forEach(([name, response]) => {
    it(`wertet ${name} nicht als gespeichert, sondern sendet den Zählerstand später erneut`, async () => {
      const { cloud, fetch, payloads } = loadCloud({ key: 'k1' });
      fetch.mockResolvedValue(response);
      const result = await cloud.saveTransaction(transaction);
      expect(result).toMatchObject({ status: 'success', queued: true, message: 'Antwort unklar, wird erneut gesendet' });
      expect(payloads()).toEqual([transaction]);
    });
  });

  it('meldet bei unklarer Antwort auf andere Typen einen Fehler und queued nichts', async () => {
    const { cloud, fetch, queue } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue({ ok: true, text: async () => '' });
    const result = await cloud.saveTransaction({ typ: 'ZAHLUNG', data: [{ betrag: 1 }] });
    expect(result).toMatchObject({ status: 'error' });
    expect(queue('offline_queue')).toEqual([]);
  });

  it('gibt die Zähler der Bestätigung weiter', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ status: 'success', message: 'ok', angelegt: 0, bereits_vorhanden: 1, ueberschrieben: 0 }));
    expect(await cloud.saveTransaction(transaction)).toEqual({
      status: 'success', message: 'ok', angelegt: 0, bereits_vorhanden: 1, ueberschrieben: 0
    });
  });

  ['', '<html>', JSON.stringify({ status: 'vielleicht' })].forEach(body => {
    it(`lässt in der Queue einen Eintrag bei unklarer Antwort (${body || 'leer'}) pending und stoppt`, async () => {
      const { cloud, fetch, queue } = loadCloud({ key: 'k1' });
      cloud.saveToOfflineQueue(item0(1));
      cloud.saveToOfflineQueue(item0(2));
      fetch.mockResolvedValue({ ok: true, text: async () => body });
      await cloud.processOfflineQueue();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(queue('offline_queue').map(e => e.status)).toEqual(['pending', 'pending']);
    });
  });
});

const item0 = n => ({ typ: 'ZAEHLERSTAND_NEU', data: [{ zaehler_id: 'Z' + n, wert: n }] });

describe('Wiederholung bei instabiler Verbindung', () => {
  const hangingFetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });

  it('bricht einen hängenden Abruf nach dem Zeitlimit ab und queued den Wert', async () => {
    vi.useFakeTimers();
    const { cloud, fetch, payloads } = loadCloud({ key: 'k1' });
    fetch.mockImplementation(hangingFetch);
    const pending = cloud.saveTransaction(transaction);
    await vi.advanceTimersByTimeAsync(20000);
    expect(await pending).toMatchObject({ status: 'success', queued: true });
    expect(payloads()).toEqual([transaction]);
  });

  it('blockiert die Queue nicht dauerhaft, wenn ein Abruf hängt', async () => {
    vi.useFakeTimers();
    const { cloud, fetch, queue } = loadCloud({ key: 'k1' });
    cloud.saveToOfflineQueue(transaction);
    fetch.mockImplementation(hangingFetch);
    const run = cloud.processOfflineQueue();
    await vi.advanceTimersByTimeAsync(20000);
    await run;
    expect(cloud.processingQueue).toBe(false);
    expect(queue('offline_queue')).toHaveLength(1);
  });

  it('sendet später erneut, auch ohne online-Ereignis', async () => {
    vi.useFakeTimers();
    const { cloud, fetch, queue } = loadCloud({ key: 'k1' });
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(reply({ status: 'success' }));
    expect(await cloud.saveTransaction(transaction)).toMatchObject({ queued: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(queue('offline_queue')).toEqual([]);
  });

  it('wiederholt nur begrenzt oft und pollt danach nicht weiter', async () => {
    vi.useFakeTimers();
    const { cloud, fetch, queue } = loadCloud({ key: 'k1' });
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await cloud.saveTransaction(transaction);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(1 + cloud.RETRY_DELAYS_MS.length);
    expect(queue('offline_queue')).toHaveLength(1);
  });

  it('setzt die Wiederholungen bei einem neuen Auslöser zurück', async () => {
    vi.useFakeTimers();
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await cloud.saveTransaction(transaction);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    const before = fetch.mock.calls.length;
    await cloud.processOfflineQueue({ force: true });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetch.mock.calls.length).toBe(before + 1 + cloud.RETRY_DELAYS_MS.length);
  });

  it('startet keinen Abruf bei gemeldetem Offline-Zustand, außer ausdrücklich erzwungen', async () => {
    const { cloud, fetch, queue } = loadCloud({ key: 'k1', online: true });
    cloud.saveToOfflineQueue(transaction);
    cloud.cancelRetry();
    // navigator.onLine meldet fälschlich false, obwohl Verbindung besteht
    const setup = loadCloud({ key: 'k1', online: false });
    setup.cloud.saveToOfflineQueue(transaction);
    setup.fetch.mockResolvedValue(reply({ status: 'success' }));
    await setup.cloud.processOfflineQueue();
    expect(setup.fetch).not.toHaveBeenCalled();
    await setup.cloud.processOfflineQueue({ force: true });
    expect(setup.fetch).toHaveBeenCalledTimes(1);
    expect(setup.queue('offline_queue')).toEqual([]);
    expect(queue('offline_queue')).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('meldet nach bestätigten Einträgen die Synchronisation, sonst nicht', async () => {
    const synced = loadCloud({ key: 'k1', withDocument: true });
    synced.cloud.saveToOfflineQueue(transaction);
    synced.fetch.mockResolvedValue(reply({ status: 'success' }));
    await synced.cloud.processOfflineQueue();
    expect(synced.events).toContain('hv-queue-synced');

    const failed = loadCloud({ key: 'k1', withDocument: true });
    failed.cloud.saveToOfflineQueue(transaction);
    failed.fetch.mockRejectedValue(new TypeError('offline'));
    await failed.cloud.processOfflineQueue();
    expect(failed.events).not.toContain('hv-queue-synced');
    failed.cloud.cancelRetry();
  });

  it('lädt die Zählerstände gezielt nach', async () => {
    const { cloud, fetch } = loadCloud({ key: 'k1' });
    fetch.mockResolvedValue(reply({ Zaehlerstaende: [{ stand_id: 'a' }] }));
    expect(await cloud.loadZaehlerstaende()).toEqual({ Zaehlerstaende: [{ stand_id: 'a' }] });
    expect(bodyOf(fetch, 0)).toMatchObject({ typ: 'LESEN', view: 'zaehlerstaende' });
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

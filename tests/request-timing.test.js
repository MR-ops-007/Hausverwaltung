import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const reply = body => ({ ok: true, text: async () => JSON.stringify(body) });

function loadCloud({ environment = 'test', key = 'geheim-123', storedLog } = {}) {
  const source = readFileSync(new URL('../cloud-service.js', import.meta.url), 'utf8');
  const store = { [`hv_access_key:${environment}`]: key };
  if (storedLog) store[`hv_request_log:${environment}`] = JSON.stringify(storedLog);
  const localStorage = {
    getItem: name => store[name] ?? null,
    setItem: (name, value) => { store[name] = String(value); },
    removeItem: name => { delete store[name]; }
  };
  const fetch = vi.fn();
  const events = [];
  const document = { dispatchEvent: event => events.push(event.type) };
  const CustomEvent = class { constructor(type) { this.type = type; } };
  const cloud = new Function('CONFIG', 'fetch', 'localStorage', 'navigator', 'accessUi', 'console', 'document', 'CustomEvent', `${source};return cloudService;`)(
    { API_URL: 'https://example.test/api', ENVIRONMENT: environment }, fetch, localStorage, { onLine: true }, undefined, { warn: vi.fn() }, document, CustomEvent);
  return { cloud, fetch, store, events };
}

describe('Ladezeit-Diagnose', () => {
  it('protokolliert Lesevorgänge mit Art, Dauer und Größe', async () => {
    const { cloud, fetch, events } = loadCloud();
    fetch.mockResolvedValueOnce(reply({ Objekte: [{ objekt_id: 'O1' }] }));
    await cloud.read('alle');
    const [entry] = cloud.getRequestLog();
    expect(entry.label).toBe('LESEN alle');
    expect(entry.ok).toBe(true);
    expect(entry.bytes).toBe(JSON.stringify({ Objekte: [{ objekt_id: 'O1' }] }).length);
    expect(entry.ms).toBeGreaterThanOrEqual(0);
    expect(events).toContain('hv-request-timing');
  });

  it('speichert weder Inhalte noch Zugangsschlüssel', async () => {
    const { cloud, fetch, store } = loadCloud();
    fetch.mockResolvedValueOnce(reply({ Personen: [{ name: 'Dagobert Duck' }] }));
    await cloud.read('alle');
    fetch.mockResolvedValueOnce(reply({ status: 'success' }));
    await cloud.post({ typ: 'ZAHLUNG_NEU', data: [{ betrag: 900, verwendungszweck: 'Miete Mickey' }] });
    const persisted = store['hv_request_log:test'];
    expect(persisted).not.toMatch(/Dagobert|Mickey|geheim-123|900/);
    expect(cloud.getRequestLog().map(entry => entry.label)).toEqual(['LESEN alle', 'ZAHLUNG_NEU']);
    expect(Object.keys(JSON.parse(persisted)[0]).sort()).toEqual(['at', 'bytes', 'error', 'label', 'ms', 'ok', 'parseMs']);
  });

  it('protokolliert Netzwerkfehler und wirft sie unverändert weiter', async () => {
    const { cloud, fetch } = loadCloud();
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(cloud.read('dashboard')).rejects.toThrow('Failed to fetch');
    const [entry] = cloud.getRequestLog();
    expect(entry).toMatchObject({ label: 'LESEN dashboard', ok: false, error: 'Failed to fetch' });
  });

  it('begrenzt das Protokoll und trennt es nach Umgebung', async () => {
    const old = Array.from({ length: 30 }, (_, i) => ({ label: `ALT ${i}`, at: '', ms: 1, parseMs: 0, bytes: 1, ok: true, error: '' }));
    const { cloud, fetch, store } = loadCloud({ environment: 'production', storedLog: old });
    fetch.mockResolvedValueOnce(reply({ backend_version: '4.8.16' }));
    await cloud.loadCapabilities();
    const log = cloud.getRequestLog();
    expect(log).toHaveLength(30);
    expect(log[0].label).toBe('ALT 1');
    expect(log.at(-1).label).toBe('LESEN vertrag_capabilities');
    expect(store['hv_request_log:test']).toBeUndefined();
  });

  it('fasst den letzten Lauf je Anfrageart zusammen, langsamste zuerst', () => {
    const { cloud } = loadCloud({ storedLog: [
      { label: 'LESEN dashboard', at: '', ms: 2400, parseMs: 0, bytes: 6000, ok: true, error: '' },
      { label: 'LESEN alle', at: '', ms: 9000, parseMs: 400, bytes: 5 * 1024 * 1024, ok: true, error: '' },
      { label: 'LESEN dashboard', at: '', ms: 1500, parseMs: 0, bytes: 6000, ok: true, error: '' }
    ] });
    expect(cloud.requestSummary()).toBe('LESEN alle: 9,4 s · 5,0 MB | LESEN dashboard: 1,5 s · 6 KB');
  });

  it('leert das Protokoll auf Wunsch', () => {
    const { cloud, store } = loadCloud({ storedLog: [{ label: 'X', at: '', ms: 1, parseMs: 0, bytes: 1, ok: true, error: '' }] });
    cloud.clearRequestLog();
    expect(cloud.getRequestLog()).toEqual([]);
    expect(store['hv_request_log:test']).toBeUndefined();
  });
});

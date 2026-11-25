import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../busy-indicator.js', import.meta.url), 'utf8');
const cloudSource = readFileSync(new URL('../cloud-service.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fakeElement(tag = 'button') {
  const classes = new Set();
  const attributes = new Map();
  return {
    tag, isConnected: true, hidden: false, textContent: '', innerHTML: '', children: [], dataset: {},
    parts: {},
    querySelector(selector) {
      if (!this.parts[selector]) this.parts[selector] = { textContent: '', src: '', alt: '' };
      return this.parts[selector];
    },
    classList: {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name)
    },
    get className() { return [...classes].join(' '); },
    set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: name => (attributes.has(name) ? attributes.get(name) : null),
    removeAttribute: name => attributes.delete(name),
    appendChild(child) { this.children.push(child); if (child.text) this.textContent += child.text; return child; },
    closest() { return tag === 'button' ? this : null; }
  };
}

function fakeDocument() {
  const listeners = {};
  const nodes = new Map();
  const view = { confirm: vi.fn(() => true) };
  const doc = {
    defaultView: view,
    body: { appendChild: node => { nodes.set(node.id, node); return node; } },
    addEventListener: (type, handler) => { (listeners[type] = listeners[type] || []).push(handler); },
    getElementById: id => nodes.get(id) || null,
    createElement: () => fakeElement('div'),
    createTextNode: text => ({ text })
  };
  const click = target => {
    const event = { target, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; } };
    (listeners.click || []).forEach(handler => handler(event));
    return event;
  };
  return { doc, listeners, click, view };
}

function load() {
  const indicator = new Function(`${source};return busyIndicator;`)();
  const env = fakeDocument();
  indicator.init(env.doc);
  return { indicator, ...env };
}

describe('Rückmeldung bei Aktionen (busy-indicator.js)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 25, 14, 3)); });
  afterEach(() => { vi.useRealTimers(); });

  it('registriert touchstart, damit iOS den Druckzustand zeigt', () => {
    const { listeners } = load();
    expect(listeners.touchstart).toHaveLength(1);
    expect(listeners.click).toHaveLength(1);
  });

  it('sperrt beim Speichern per Tipp die App mit Overlay und zeigt danach den Erfolgsstempel', () => {
    const { indicator, click, doc } = load();
    const button = fakeElement();
    click(button);
    const token = indicator.begin({ typ: 'ZAHLUNG' });
    expect(button.classList.contains('is-busy')).toBe(true);
    const overlay = doc.getElementById('busy-overlay');
    expect(overlay.hidden).toBe(false);
    expect(overlay.dataset.state).toBe('loading');
    expect(overlay.querySelector('.busy-overlay-stamp').src).toContain('hausmeister-stempel-loading.svg');
    expect(overlay.querySelector('.busy-overlay-detail').textContent).toBe('Zahlung wird gespeichert …');

    indicator.end(token, { ok: true });
    expect(overlay.dataset.state).toBe('success');
    expect(overlay.querySelector('.busy-overlay-stamp').src).toContain('hausmeister-stempel-erfolg.svg');
    expect(overlay.querySelector('.busy-overlay-title').textContent).toBe('Amtlich gespeichert!');
    expect(overlay.querySelector('.busy-overlay-detail').textContent).toBe('Zahlung gespeichert · 14:03');
    vi.advanceTimersByTime(indicator.RELEASE_GRACE_MS);
    expect(button.classList.contains('is-busy')).toBe(false);
    vi.advanceTimersByTime(indicator.STAMP_SUCCESS_MS);
    expect(overlay.hidden).toBe(true);
  });

  it('blockiert während des Overlays jeden Tipp, auch auf andere Schaltflächen', () => {
    const { indicator, click } = load();
    click(fakeElement());
    indicator.begin({ typ: 'ZAHLUNG' });
    const other = click(fakeElement());
    expect(other.defaultPrevented).toBe(true);
    expect(other.stopped).toBe(true);
  });

  it('schließt das Overlay bei einem Fehler sofort (Dialog meldet den Fehler)', () => {
    const { indicator, click, doc } = load();
    click(fakeElement());
    const token = indicator.begin({ typ: 'ZAHLUNG' });
    indicator.end(token, { ok: false });
    expect(doc.getElementById('busy-overlay').hidden).toBe(true);
    expect(click(fakeElement()).stopped).toBe(false);
  });

  it('zeigt Speichern ohne Tipp (Warteschlange) nur unten, ohne Overlay', () => {
    const { indicator, doc } = load();
    const token = indicator.begin({ typ: 'ZAHLUNG' });
    expect(doc.getElementById('busy-overlay')).toBeNull();
    expect(doc.getElementById('busy-indicator').textContent).toContain('Zahlung wird gespeichert');
    indicator.end(token, { ok: true });
    expect(doc.getElementById('busy-indicator').textContent).toBe('✓ Gespeichert · 14:03');
    vi.advanceTimersByTime(indicator.RESULT_VISIBLE_MS);
    expect(doc.getElementById('busy-indicator').hidden).toBe(true);
  });

  it('verwirft einen zweiten Tipp, solange geladen wird', () => {
    const { indicator, click } = load();
    const button = fakeElement();
    click(button);
    indicator.begin({ typ: 'LESEN', view: 'verbrauch' });
    const second = click(button);
    expect(second.defaultPrevented).toBe(true);
    expect(second.stopped).toBe(true);
  });

  it('behält den Spinner über Folgeanfragen derselben Aktion (Rechte prüfen, dann speichern)', () => {
    const { indicator, click } = load();
    const button = fakeElement();
    click(button);
    const read = indicator.begin({ typ: 'LESEN', view: 'vertrag_capabilities' });
    indicator.end(read, { ok: true });
    vi.advanceTimersByTime(100);
    const write = indicator.begin({ typ: 'ZAHLUNG' });
    vi.advanceTimersByTime(indicator.RELEASE_GRACE_MS);
    expect(button.classList.contains('is-busy')).toBe(true);
    expect(indicator.isOverlayOpen()).toBe(true);
    indicator.end(write, { ok: true });
    vi.advanceTimersByTime(indicator.RELEASE_GRACE_MS);
    expect(button.classList.contains('is-busy')).toBe(false);
  });

  it('bleibt bei Hintergrundabrufen ohne Tipp unsichtbar', () => {
    const { indicator, doc } = load();
    const token = indicator.begin({ typ: 'LESEN', view: 'stammdaten' });
    expect(doc.getElementById('busy-indicator')).toBeNull();
    indicator.end(token, { ok: true });
  });

  it('ordnet einen alten Tipp keiner späteren Anfrage zu', () => {
    const { indicator, click } = load();
    const button = fakeElement();
    click(button);
    vi.advanceTimersByTime(indicator.ACTIVATOR_WINDOW_MS + 1);
    indicator.begin({ typ: 'LESEN', view: 'verbrauch' });
    expect(button.classList.contains('is-busy')).toBe(false);
  });

  it('zählt nach einer Rückfrage (confirm) den Tipp neu', () => {
    const { indicator, click, view } = load();
    const button = fakeElement();
    click(button);
    vi.advanceTimersByTime(5000); // Nutzer liest die Rückfrage
    expect(view.confirm('Wirklich stornieren?')).toBe(true);
    indicator.begin({ typ: 'ZAHLUNG' });
    expect(button.classList.contains('is-busy')).toBe(true);
  });

  it('lässt Zählerstände bei ihrer eigenen Stempel-Animation im Dialog', () => {
    const { indicator, click, doc } = load();
    const button = fakeElement();
    click(button);
    const token = indicator.begin({ typ: 'ZAEHLERSTAND_NEU' });
    expect(button.classList.contains('is-busy')).toBe(true);
    expect(doc.getElementById('busy-overlay')).toBeNull();
    expect(doc.getElementById('busy-indicator').textContent).toContain('Zählerstand wird gespeichert');
    indicator.end(token, { ok: false });
    expect(doc.getElementById('busy-indicator').textContent).toContain('Nicht gespeichert');
  });
});

describe('cloudService.post meldet Anfragen an den Hinweis', () => {
  function loadCloud(fetchImpl, indicator) {
    const cloud = new Function('CONFIG', 'busyIndicator', 'fetch', 'localStorage', 'navigator', 'accessUi',
      `${cloudSource};return cloudService;`)(
      { API_URL: 'https://example.invalid/exec', ENVIRONMENT: 'test' }, indicator, fetchImpl,
      { getItem: () => null, setItem() {}, removeItem() {} }, { onLine: true }, undefined);
    cloud.scriptUrl = 'https://example.invalid/exec';
    return cloud;
  }

  it('beginnt und beendet je Anfrage genau einmal, auch bei Fehlern', async () => {
    const indicator = { begin: vi.fn(() => 7), end: vi.fn() };
    const ok = loadCloud(async () => ({ ok: true, text: async () => '{"status":"success"}' }), indicator);
    await ok.post({ typ: 'ZAHLUNG', data: [] });
    expect(indicator.begin).toHaveBeenCalledWith({ typ: 'ZAHLUNG', data: [] });
    expect(indicator.end).toHaveBeenCalledWith(7, { ok: true });

    indicator.end.mockClear();
    const rejected = loadCloud(async () => ({ ok: true, text: async () => '{"status":"error","message":"nein"}' }), indicator);
    await rejected.post({ typ: 'ZAHLUNG', data: [] });
    expect(indicator.end).toHaveBeenCalledWith(7, { ok: false });

    indicator.end.mockClear();
    const broken = loadCloud(async () => { throw new TypeError('offline'); }, indicator);
    await expect(broken.post({ typ: 'ZAHLUNG', data: [] })).rejects.toThrow('offline');
    expect(indicator.end).toHaveBeenCalledWith(7, { ok: false });
  });
});

describe('Zahlungstabelle auf schmalen Handys', () => {
  const narrow = css.slice(css.indexOf('@media (max-width: 480px)'));
  const block = narrow.slice(0, narrow.indexOf('\n}\n'));

  it('hält feste Spalten schmal und trennt lange Einheiten', () => {
    expect(block).toContain('.payment-unit-col { width: 50px; }');
    expect(block).toContain('.payment-tenant-col { width: 112px; }');
    expect(block).toMatch(/left: 50px; width: 112px;/);
    expect(block).toMatch(/hyphens: auto/);
    // Miete pro Monat bleibt sichtbar, nur der Vertragszeitraum entfällt.
    expect(block).toContain('.payment-tenant-cell > small { margin-top: 3px;');
    expect(block).not.toMatch(/^\s*\.payment-tenant-cell > small \{ display: none/m);
    // Leerstand: die langen Hinweise bleiben auf schmalen Handys ausgeblendet.
    expect(block).toContain('.payment-row-vacancy .payment-tenant-cell > small { display: none; }');
    expect(html).toMatch(/<html lang="de">/);
  });

  it('lässt auf 375 px neben den festen Spalten mindestens zwei Monate sichtbar', () => {
    const fixed = 50 + 112;
    const month = Number(block.match(/\.payment-month-col \{ width: (\d+)px; \}/)[1]);
    expect(Math.floor((375 - 24 - fixed) / month)).toBeGreaterThanOrEqual(2);
    expect(Number(block.match(/\.payment-table \{ min-width: (\d+)px; \}/)[1])).toBe(fixed + 12 * month);
  });

  it('lädt busy-indicator.js vor cloud-service.js', () => {
    expect(html.indexOf('busy-indicator.js')).toBeGreaterThan(0);
    expect(html.indexOf('busy-indicator.js')).toBeLessThan(html.indexOf('cloud-service.js'));
  });
});

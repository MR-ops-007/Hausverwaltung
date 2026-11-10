import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../environment-service.js', import.meta.url), 'utf8');

function loadEnvironmentService({ environment = 'test', confirmResult = true } = {}) {
  const elements = new Map(['environment-banner', 'environment-banner-label', 'environment-banner-meta', 'environment-switch']
    .map(id => [id, {
      id,
      hidden: false,
      className: '',
      textContent: '',
      value: '',
      innerHTML: '',
      options: [],
      appendChild(option) { this.options.push(option); },
      onChange: null,
      set onchange(handler) { this.onChange = handler; },
      get onchange() { return this.onChange; }
    }]));
  const store = {};
  const location = { reload: vi.fn() };
  const document = {
    getElementById: id => elements.get(id),
    createElement: tag => ({ tag, value: '', textContent: '' })
  };
  const localStorage = {
    getItem: key => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); }
  };
  const service = new Function('CONFIG', 'document', 'localStorage', 'location', 'confirm', `${source};return environmentService;`)(
    {
      ENVIRONMENT: environment,
      ENVIRONMENT_LABEL: environment === 'test' ? 'TEST · Entenhausen' : 'PRODUKTION',
      API_CONFIGURED: true,
      ENVIRONMENT_PROFILES: {
        test: { label: 'TEST · Entenhausen' },
        production: { label: 'PRODUKTION' }
      }
    }, document, localStorage, location, () => confirmResult
  );
  return { service, elements, store, location };
}

describe('Umgebungsanzeige und Laufzeitwechsel', () => {
  it('zeigt die aktive TEST-Umgebung sichtbar und rot markiert an', () => {
    const { service, elements } = loadEnvironmentService();
    service.render();
    expect(elements.get('environment-banner').className).toBe('environment-banner environment-banner-test');
    expect(elements.get('environment-banner-label').textContent).toBe('TEST · Entenhausen');
    expect(elements.get('environment-switch').options).toHaveLength(2);
    expect(elements.get('environment-switch').value).toBe('test');
  });

  it('fordert vor dem Wechsel auf PROD eine Bestätigung und lädt danach neu', () => {
    const { service, store, location } = loadEnvironmentService();
    expect(service.switchTo('production')).toBe(true);
    expect(store.hv_environment).toBe('production');
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it('bricht den Wechsel auf PROD ohne Bestätigung ab', () => {
    const { service, store, location } = loadEnvironmentService({ confirmResult: false });
    expect(service.switchTo('production')).toBe(false);
    expect(store.hv_environment).toBeUndefined();
    expect(location.reload).not.toHaveBeenCalled();
  });

  it('zeigt die geprüfte Backend-Version im Banner', () => {
    const { service, elements } = loadEnvironmentService();
    service.setBackendVersion('4.8.5');
    expect(elements.get('environment-banner-meta').textContent).toBe('Backend 4.8.5');
  });
});

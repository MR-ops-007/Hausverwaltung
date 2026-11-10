import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../config.js', import.meta.url), 'utf8');

function loadConfig(runtimeConfig) {
  const previous = globalThis.HV_RUNTIME_CONFIG;
  try {
    if (runtimeConfig === undefined) delete globalThis.HV_RUNTIME_CONFIG;
    else globalThis.HV_RUNTIME_CONFIG = runtimeConfig;
    return new Function(`${source}; return CONFIG;`)();
  } finally {
    if (previous === undefined) delete globalThis.HV_RUNTIME_CONFIG;
    else globalThis.HV_RUNTIME_CONFIG = previous;
  }
}

function loadLocalConfig(runtimeConfig, host = {}) {
  const localSource = readFileSync(new URL('../config.local.example.js', import.meta.url), 'utf8');
  const localStorage = { getItem: () => null };
  return new Function('window', 'globalThis', `${localSource}; return window.HV_RUNTIME_CONFIG || globalThis.HV_RUNTIME_CONFIG;`)({ ...host }, {});
}

describe('Laufzeitkonfiguration', () => {
  it('bleibt ohne lokale Überschreibung im Produktionsmodus ohne Backend-URL', () => {
    const config = loadConfig();
    expect(config.ENVIRONMENT).toBe('production');
    expect(config.API_URL).toBe('');
    expect(config.API_CONFIGURED).toBe(false);
  });

  it('kann eine lokale Test-API verwenden, ohne die Produktionskonfiguration zu ändern', () => {
    const config = loadConfig({ environment: 'test', apiUrl: 'https://test.example.invalid/exec' });
    expect(config.ENVIRONMENT).toBe('test');
    expect(config.API_URL).toBe('https://test.example.invalid/exec');
    expect(config.API_CONFIGURED).toBe(true);
  });

  it('wählt die API des aktiven Profils aus', () => {
    const config = loadConfig({
      environment: 'test',
      profiles: {
        test: { label: 'TEST', apiUrl: 'https://test.example.invalid/exec' },
        production: { label: 'PRODUKTION', apiUrl: 'https://prod.example.invalid/exec' }
      }
    });
    expect(config.ENVIRONMENT_LABEL).toBe('TEST');
    expect(config.API_URL).toBe('https://test.example.invalid/exec');
    expect(Object.keys(config.ENVIRONMENT_PROFILES)).toEqual(['test', 'production']);
  });

  it('übergibt lokale Profile an den Browser-Host', () => {
    const runtime = loadLocalConfig();
    expect(runtime.environment).toBe('test');
    expect(runtime.profiles.test.label).toBe('TEST · Entenhausen');
    expect(runtime.profiles.production.label).toBe('PRODUKTION');
  });

  it('enthält keine fest verdrahtete Apps-Script-URL', () => {
    expect(source).not.toMatch(/script\.google\.com\/macros\/s\//);
  });
});

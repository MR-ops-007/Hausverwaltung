import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));

describe('Home-Screen-Web-App', () => {
  it('verweist aus dem HTML auf Manifest und iOS-Icon', () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('assets/apple-touch-icon.png');
    expect(html).toContain('apple-mobile-web-app-capable');
  });

  it('startet eigenständig mit validen App-Icons', () => {
    expect(manifest.name).toBe('Hausverwaltung');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toContain('source=homescreen');
    expect(manifest.scope).toBe('./');
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: 'assets/app-icon-192.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: 'assets/app-icon-512.png', sizes: '512x512', type: 'image/png' })
    ]));
    for (const icon of manifest.icons) expect(existsSync(new URL(`../${icon.src}`, import.meta.url))).toBe(true);
    expect(existsSync(new URL('../assets/apple-touch-icon.png', import.meta.url))).toBe(true);
  });

  it('fordert keinen Service Worker als Voraussetzung', () => {
    expect(html).not.toMatch(/navigator\.serviceWorker\.register/);
  });
});

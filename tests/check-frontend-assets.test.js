import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../tools/check-frontend-assets.mjs', import.meta.url));
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createRoot(indexHtml) {
  const root = mkdtempSync(join(tmpdir(), 'hausverwaltung-assets-'));
  temporaryRoots.push(root);
  writeFileSync(join(root, 'index.html'), indexHtml);
  return root;
}

function runChecker(root) {
  return execFileSync(process.execPath, [checker, `--root=${root}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

describe('Frontend-Asset-Prüfung', () => {
  it('akzeptiert die optionale lokale runtime-secrets.js ohne Datei', () => {
    const root = createRoot('<script src="config.js"></script><script src="runtime-secrets.js" onerror="this.remove()"></script>');
    writeFileSync(join(root, 'config.js'), '');

    expect(runChecker(root)).toMatch(/erfolgreich/);
    expect(existsSync(join(root, 'runtime-secrets.js'))).toBe(false);
  });

  it('meldet weiterhin fehlende Pflichtdateien', () => {
    const root = createRoot('<script src="config.js"></script>');

    try {
      runChecker(root);
      throw new Error('Der Checker hätte die fehlende Pflichtdatei melden müssen.');
    } catch (error) {
      expect(String(error.stderr)).toContain('config.js');
    }
  });
});

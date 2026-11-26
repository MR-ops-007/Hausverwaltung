// Drift-Prüfungen (Roadmap 1b): prüfen konkrete Fakten zwischen Code und Doku,
// keine Formulierungen. Die Versionsnummer im Code gegen den obersten CHANGELOG-Eintrag
// prüft bereits tests/apps-script.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const read = path => readFileSync(join(ROOT, path), 'utf8');

const SKIP_DIRS = new Set(['node_modules', '.git', 'archiv']);

function markdownFiles(dir = ROOT) {
  return readdirSync(dir).flatMap(name => {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

const FILE_EXTENSION = /\.(js|mjs|gs|md|json|css|html|yml|yaml|sh|csv)$/;

/** Liefert Verweise auf Repository-Dateien: relative Markdown-Links und `pfad/datei.ext`. */
export function findFileReferences(text) {
  const refs = [];
  for (const match of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue;
    refs.push({ kind: 'link', target });
  }
  for (const match of text.matchAll(/`([A-Za-z0-9_.\-/]+)`/g)) {
    const target = match[1];
    if (!target.includes('/') || target.startsWith('/') || !FILE_EXTENSION.test(target)) continue;
    refs.push({ kind: 'code', target });
  }
  return refs;
}

/** Blattnamen, die das Backend anlegt oder als Startdaten liest. */
export function findBackendSheetNames(sources) {
  const code = sources.join('\n');
  const constants = new Map(
    [...code.matchAll(/const\s+([A-Z_]+)\s*=\s*['"]([^'"]+)['"]/g)].map(m => [m[1], m[2]])
  );
  const names = new Set();
  for (const m of code.matchAll(/insertSheet\(\s*(?:['"]([^'"]+)['"]|([A-Z_]+)\s*\))/g)) {
    const name = m[1] || constants.get(m[2]);
    if (name) names.add(name);
  }
  for (const m of code.matchAll(/writeViewSheet\(\s*\w+\s*,\s*['"]([^'"]+)['"]/g)) names.add(m[1]);
  // Hilfsfunktionen mit `const sheetName = "…"; … insertSheet(sheetName)`
  for (const m of code.matchAll(/const\s+sheetName\s*=\s*['"]([^'"]+)['"]/g)) names.add(m[1]);
  const startList = code.match(/const\s+STAMMDATEN_SHEETS\s*=\s*\[([\s\S]*?)\]/);
  if (startList) for (const m of startList[1].matchAll(/['"]([^'"]+)['"]/g)) names.add(m[1]);
  return [...names].sort();
}

function backendSources() {
  const dir = join(ROOT, 'apps-script');
  return readdirSync(dir)
    .filter(name => /\.(gs|js)$/.test(name))
    .map(name => readFileSync(join(dir, name), 'utf8'));
}

describe('Drift: Doku verweist nur auf vorhandene Dateien', () => {
  it('erkennt Links und Pfade, aber keine URLs oder absoluten Pfade', () => {
    const refs = findFileReferences(
      '[a](docs/x.md#teil) [b](https://example.org/y.md) `apps-script/Code.gs` `Code.gs` `/tmp/z.json` `a/b`'
    );
    expect(refs).toEqual([
      { kind: 'link', target: 'docs/x.md' },
      { kind: 'code', target: 'apps-script/Code.gs' }
    ]);
  });

  it('alle referenzierten Dateien existieren (ohne docs/archiv)', () => {
    const missing = [];
    for (const file of markdownFiles()) {
      for (const ref of findFileReferences(readFileSync(file, 'utf8'))) {
        const candidates = ref.kind === 'link'
          ? [join(dirname(file), ref.target)]
          : [join(ROOT, ref.target), join(dirname(file), ref.target)];
        if (!candidates.some(path => existsSync(path))) {
          missing.push(`${relative(ROOT, file)} → ${ref.target}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('Drift: Blätter des Backends sind in DATA_MODEL.md beschrieben', () => {
  it('erkennt angelegte Blätter samt Konstanten', () => {
    const names = findBackendSheetNames([
      "const X_SHEET_NAME = 'Protokoll';",
      "ss.insertSheet('A'); ss.insertSheet(X_SHEET_NAME); writeViewSheet(ss, \"_view_b\", h, r);",
      'function f() { const sheetName = "_report"; }',
      "const STAMMDATEN_SHEETS = [\n  'Objekte', 'Zahlungen'\n];"
    ]);
    expect(names).toEqual(['A', 'Objekte', 'Protokoll', 'Zahlungen', '_report', '_view_b']);
  });

  it('jedes Blatt steht in DATA_MODEL.md', () => {
    const dataModel = read('DATA_MODEL.md');
    const names = findBackendSheetNames(backendSources());
    expect(names.length).toBeGreaterThan(10);
    expect(names.filter(name => !dataModel.includes(`\`${name}\``))).toEqual([]);
  });
});

describe('Drift: CHANGELOG-Status passt zur Deployment-Historie', () => {
  it('die Version mit Status produktiv ist die zuletzt nach PROD bereitgestellte', () => {
    const changelog = read('CHANGELOG.md');
    const produktiv = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) · \d{4}-\d{2}-\d{2} · produktiv$/gm)]
      .map(m => m[1]);
    const prodRows = [...changelog.matchAll(/^\| (\d{4}-\d{2}-\d{2}) \| (\d+\.\d+\.\d+) \| PROD \|/gm)];
    expect(produktiv).toHaveLength(1);
    expect(prodRows.length).toBeGreaterThan(0);
    // Neueste Zeile steht oben.
    expect(prodRows[0][2]).toBe(produktiv[0]);
  });

  it('jede TEST- oder PROD-Zeile nennt eine Version mit eigenem CHANGELOG-Eintrag', () => {
    const changelog = read('CHANGELOG.md');
    const versions = new Set([...changelog.matchAll(/^## (\d+\.\d+\.\d+) · /gm)].map(m => m[1]));
    const rows = [...changelog.matchAll(/^\| \d{4}-\d{2}-\d{2} \| (\d+\.\d+\.\d+) \| (?:PROD|TEST) \|/gm)]
      .map(m => m[1]);
    expect(rows.filter(version => !versions.has(version))).toEqual([]);
  });
});

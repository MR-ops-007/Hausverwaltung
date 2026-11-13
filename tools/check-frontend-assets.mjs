#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const rootArgument = process.argv.find((argument) => argument.startsWith('--root='));
const root = rootArgument ? rootArgument.slice('--root='.length) : repositoryRoot;

function localPathFromUrl(value) {
  const withoutQuery = value.split(/[?#]/, 1)[0];
  if (!withoutQuery || /^(?:[a-z]+:)?\/\//i.test(withoutQuery) || withoutQuery.startsWith('data:')) {
    return null;
  }
  return withoutQuery.replace(/^\.\//, '');
}

function collectLocalReferences(html) {
  const references = [];
  const patterns = [
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const path = localPathFromUrl(match[1]);
      if (path) references.push(path);
    }
  }
  return [...new Set(references)];
}

const indexPath = join(root, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`Frontend-Prüfung: ${indexPath} fehlt.`);
  process.exit(1);
}

const references = collectLocalReferences(readFileSync(indexPath, 'utf8'));
// Nur runtime-config.js wird im Pages-Build erzeugt. runtime-secrets.js ist
// bewusst eine lokale Datei und darf niemals ins öffentliche Artefakt gelangen.
const generatedInPagesBuild = new Set(['runtime-config.js']);
const missing = references.filter((reference) => {
  if (root === repositoryRoot && generatedInPagesBuild.has(reference)) return false;
  return !existsSync(join(root, normalize(reference)));
});

if (missing.length > 0) {
  console.error('Frontend-Prüfung fehlgeschlagen. Referenzierte Dateien fehlen:');
  for (const reference of missing) console.error(`- ${reference}`);
  process.exit(1);
}

console.log(`Frontend-Prüfung erfolgreich: ${references.length} lokale Assets vorhanden.`);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshotText, selectSnapshotPayload } from './qa-consumption-matrix.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function option(args, name, fallback = '') {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function configuredApiUrl() {
  const config = fs.readFileSync(path.join(repoRoot, 'config.js'), 'utf8');
  const match = config.match(/API_URL:\s*["']([^"']+)["']/);
  if (!match) throw new Error('Keine API_URL in config.js gefunden.');
  return match[1];
}

function excerpt(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

const args = process.argv.slice(2);
const output = option(args, 'output', '/private/tmp/verbrauch-snapshot.json');
const apiUrl = option(args, 'url', configuredApiUrl());
const includeRaw = args.includes('--include-raw');
const accessKey = String(process.env.APP_ACCESS_KEY || '').trim();

if (!accessKey) {
  console.error('APP_ACCESS_KEY fehlt. Beispiel: APP_ACCESS_KEY="..." npm run qa:consumption-snapshot -- --output=/private/tmp/verbrauch-snapshot.json');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        typ: 'LESEN',
        view: includeRaw ? 'alle' : 'verbrauch',
        data: [],
        key: accessKey
      })
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Backend antwortete mit HTTP ${response.status}. Antwort: ${excerpt(responseText)}`);
    }

    const responsePayload = parseSnapshotText(responseText, `Backend-Antwort von ${response.url || apiUrl}`);
    const payload = selectSnapshotPayload(responsePayload, { includeRaw });
    const target = path.resolve(output);
    const temp = `${target}.tmp-${process.pid}`;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, target);

    const counts = Object.fromEntries([
      '_view_verbrauch_monat',
      '_view_verbrauch_jahr',
      '_view_verbrauch_audit',
      '_view_verbrauch_bilanz_jahr',
      ...(includeRaw ? ['Zaehler', 'Zaehlerstaende'] : [])
    ].map(key => [key, Array.isArray(payload[key]) ? payload[key].length : 0]));
    console.log(`Snapshot gespeichert: ${target}`);
    console.log(JSON.stringify({ url: response.url || apiUrl, status: response.status, counts }));
  } catch (error) {
    console.error(`Snapshot konnte nicht gespeichert werden: ${error.message}`);
    process.exitCode = 1;
  }
}

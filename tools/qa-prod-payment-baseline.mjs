import fs from 'node:fs';
import path from 'node:path';
import { buildPaymentBaseline, changedPaymentContracts } from './payment-baseline.mjs';
import { redactSecret } from './qa-secret-utils.mjs';

function option(args, name, fallback = '') {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : fallback;
}

function excerpt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function contractIdsForObject(payload, objectId) {
  const unitIds = new Set((payload.Einheiten || [])
    .filter(row => String(row.objekt_id || '').trim() === objectId)
    .map(row => String(row.einheit_id || '').trim())
    .filter(Boolean));
  return (payload.Vertraege || [])
    .filter(row => unitIds.has(String(row.einheit_id || '').trim())
      || String(row.objekt_id || '').trim() === objectId)
    .map(row => String(row.vertrag_id || '').trim())
    .filter(Boolean);
}

const args = process.argv.slice(2);
const apiUrl = option(args, 'url', process.env.HV_API_URL || '').trim();
const accessKey = String(process.env.APP_ACCESS_KEY || '').trim();
const objectId = option(args, 'object-id', 'TEST');
const output = option(args, 'output', '');
const compare = option(args, 'compare', '');

if (!apiUrl) throw new Error('HV_API_URL oder --url=https://.../exec fehlt.');
if (!accessKey) throw new Error('APP_ACCESS_KEY fehlt. Der Schlüssel wird nicht als CLI-Argument akzeptiert.');

let response;
let responseText;
try {
  response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ typ: 'LESEN', view: 'alle', data: [], key: accessKey })
  });
  responseText = await response.text();
} catch (error) {
  throw new Error(redactSecret(error instanceof Error ? error.message : error, accessKey));
}
if (!response.ok) throw new Error(`Backend antwortete mit HTTP ${response.status}: ${redactSecret(excerpt(responseText), accessKey)}`);

let payload;
try {
  payload = JSON.parse(responseText);
} catch {
  throw new Error(`Backend liefert kein JSON: ${redactSecret(excerpt(responseText), accessKey)}`);
}
if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  throw new Error('Backend-Antwort ist kein Datenobjekt.');
}

const snapshot = {
  ...buildPaymentBaseline(payload, { objectId }),
  objectContractIds: contractIdsForObject(payload, objectId)
};

if (compare) {
  const baseline = JSON.parse(fs.readFileSync(path.resolve(compare), 'utf8'));
  if (baseline.objectId !== objectId) {
    throw new Error(`Baseline gehört zu Objekt ${baseline.objectId}, erwartet wurde ${objectId}.`);
  }
  const changes = changedPaymentContracts(baseline, snapshot);
  const allowed = new Set(snapshot.objectContractIds);
  const outsideObject = changes.filter(change => !allowed.has(change.contractId));
  if (outsideObject.length) {
    throw new Error(`Zahlungsänderungen außerhalb von ${objectId}: ${JSON.stringify(outsideObject)}`);
  }
  snapshot.comparison = {
    baselineCapturedAt: baseline.capturedAt,
    changedContracts: changes,
    comparedBy: baseline.hashAlgorithm === snapshot.hashAlgorithm ? 'count_and_content' : 'count_only_legacy_baseline',
    unchangedOutsideObject: true
  };
}

if (output) {
  const target = path.resolve(output);
  const temp = `${target}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, target);
}

console.log(JSON.stringify(snapshot, null, 2));

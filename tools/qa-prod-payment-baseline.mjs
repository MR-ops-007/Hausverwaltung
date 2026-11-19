import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPaymentBaseline, changedPaymentContracts, objectScope } from './payment-baseline.mjs';
import { redactSecret } from './qa-secret-utils.mjs';

function option(args, name, fallback = '') {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : fallback;
}

function excerpt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function redactAndExcerpt(value, accessKey) {
  return excerpt(redactSecret(value, accessKey));
}

export function requireObjectScope(payload, objectId) {
  const scope = objectScope(payload, objectId);
  if (!scope.unitIds.length && !scope.contractIds.length) {
    throw new Error(`Objekt ${objectId} wurde nicht gefunden: keine Einheiten oder Verträge vorhanden.`);
  }
  return scope;
}

export function comparePaymentBaseline(baseline, snapshot, objectId) {
  if (baseline.objectId !== objectId) {
    throw new Error(`Baseline gehört zu Objekt ${baseline.objectId}, erwartet wurde ${objectId}.`);
  }
  const changes = changedPaymentContracts(baseline, snapshot);
  const allowed = new Set([...(baseline.objectContractIds || []), ...(snapshot.objectContractIds || [])]);
  const outsideObject = changes.filter(change => !allowed.has(change.contractId));
  const comparisonError = outsideObject.length
    ? `Zahlungsänderungen außerhalb von ${objectId}: ${JSON.stringify(outsideObject)}`
    : '';
  return {
    snapshot: {
      ...snapshot,
      ok: outsideObject.length === 0,
      comparison: {
        baselineCapturedAt: baseline.capturedAt,
        changedContracts: changes,
        comparedBy: baseline.hashAlgorithm === snapshot.hashAlgorithm
          ? 'count_and_content'
          : 'count_only_legacy_baseline',
        unchangedOutsideObject: outsideObject.length === 0
      }
    },
    comparisonError
  };
}

export function writeSnapshot(output, snapshot) {
  const target = path.resolve(output);
  const temp = `${target}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, target);
}

async function main() {
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ typ: 'LESEN', view: 'alle', data: [], key: accessKey }),
      signal: controller.signal
    });
    responseText = await response.text();
  } finally {
    clearTimeout(timeout);
  }
} catch (error) {
  throw new Error(redactSecret(error instanceof Error ? error.message : error, accessKey));
}
if (!response.ok) throw new Error(`Backend antwortete mit HTTP ${response.status}: ${redactAndExcerpt(responseText, accessKey)}`);

let payload;
try {
  payload = JSON.parse(responseText);
} catch {
  throw new Error(`Backend liefert kein JSON: ${redactAndExcerpt(responseText, accessKey)}`);
}
if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  throw new Error('Backend-Antwort ist kein Datenobjekt.');
}

const scope = requireObjectScope(payload, objectId);

let snapshot = {
  ...buildPaymentBaseline(payload, { objectId }),
  objectUnitIds: scope.unitIds,
  objectContractIds: scope.contractIds,
  ok: true
};

let comparisonError = '';
if (compare) {
  const baseline = JSON.parse(fs.readFileSync(path.resolve(compare), 'utf8'));
  const compared = comparePaymentBaseline(baseline, snapshot, objectId);
  snapshot = compared.snapshot;
  comparisonError = compared.comparisonError;
}

if (output) {
  writeSnapshot(output, snapshot);
}

console.log(JSON.stringify(snapshot, null, 2));
if (comparisonError) {
  console.error(comparisonError);
  process.exitCode = 1;
}
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
}

if (isDirectInvocation()) {
  await main();
}

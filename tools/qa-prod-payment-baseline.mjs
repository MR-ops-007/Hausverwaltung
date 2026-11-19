import fs from 'node:fs';
import path from 'node:path';

function option(args, name, fallback = '') {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : fallback;
}

function excerpt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function countPaymentsByContract(payload) {
  return (payload.Zahlungen || []).reduce((counts, row) => {
    const contractId = String(row.vertrag_id || '').trim() || '(ohne Vertrag)';
    counts[contractId] = (counts[contractId] || 0) + 1;
    return counts;
  }, {});
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

function changedCounts(before, after) {
  const ids = new Set([
    ...Object.keys(before.countsByContract || {}),
    ...Object.keys(after.countsByContract || {})
  ]);
  return [...ids].sort().flatMap(contractId => {
    const beforeCount = Number(before.countsByContract?.[contractId] || 0);
    const afterCount = Number(after.countsByContract?.[contractId] || 0);
    return beforeCount === afterCount ? [] : [{ contractId, before: beforeCount, after: afterCount }];
  });
}

const args = process.argv.slice(2);
const apiUrl = option(args, 'url', process.env.HV_API_URL || '').trim();
const accessKey = String(process.env.APP_ACCESS_KEY || '').trim();
const objectId = option(args, 'object-id', 'TEST');
const output = option(args, 'output', '');
const compare = option(args, 'compare', '');

if (!apiUrl) throw new Error('HV_API_URL oder --url=https://.../exec fehlt.');
if (!accessKey) throw new Error('APP_ACCESS_KEY fehlt. Der Schlüssel wird nicht als CLI-Argument akzeptiert.');

const response = await fetch(apiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ typ: 'LESEN', view: 'alle', data: [], key: accessKey })
});
const responseText = await response.text();
if (!response.ok) throw new Error(`Backend antwortete mit HTTP ${response.status}: ${excerpt(responseText)}`);

let payload;
try {
  payload = JSON.parse(responseText);
} catch {
  throw new Error(`Backend liefert kein JSON: ${excerpt(responseText)}`);
}
if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  throw new Error('Backend-Antwort ist kein Datenobjekt.');
}

const snapshot = {
  capturedAt: new Date().toISOString(),
  objectId,
  paymentRows: Array.isArray(payload.Zahlungen) ? payload.Zahlungen.length : 0,
  countsByContract: countPaymentsByContract(payload),
  objectContractIds: contractIdsForObject(payload, objectId)
};

if (compare) {
  const baseline = JSON.parse(fs.readFileSync(path.resolve(compare), 'utf8'));
  if (baseline.objectId !== objectId) {
    throw new Error(`Baseline gehört zu Objekt ${baseline.objectId}, erwartet wurde ${objectId}.`);
  }
  const changes = changedCounts(baseline, snapshot);
  const allowed = new Set(snapshot.objectContractIds);
  const outsideObject = changes.filter(change => !allowed.has(change.contractId));
  if (outsideObject.length) {
    throw new Error(`Zahlungsänderungen außerhalb von ${objectId}: ${JSON.stringify(outsideObject)}`);
  }
  snapshot.comparison = {
    baselineCapturedAt: baseline.capturedAt,
    changedContracts: changes,
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

import fs from 'node:fs';
import vm from 'node:vm';
import { redactSecret } from './qa-secret-utils.mjs';

const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);

function argValue(name) {
  const prefix = `${name}=`;
  const token = args.find(value => value.startsWith(prefix));
  return token ? token.slice(prefix.length).trim() : '';
}

const expectedVersion = argValue('--expect-version');
const contractId = argValue('--contract-id') || '35';
const testDate = argValue('--test-date') || '2026-11-18';

if (!args.includes('--yes')) {
  throw new Error('Schreibender TEST-Lauf abgebrochen. Zum Bestätigen --yes angeben.');
}
if (!expectedVersion) {
  throw new Error('Erwartete Backend-Version fehlt. Beispiel: --expect-version=4.8.14');
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
  throw new Error(`Ungültiges Testdatum: ${testDate}. Erwartet wird YYYY-MM-DD.`);
}

function loadRuntimeFile(name) {
  const context = { globalThis: {}, localStorage: { getItem: () => null } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL(name, root), 'utf8'), context, { filename: name });
  return context.globalThis;
}

const runtimeConfig = loadRuntimeFile('config.local.js').HV_RUNTIME_CONFIG;
const runtimeSecrets = loadRuntimeFile('runtime-secrets.js').HV_RUNTIME_SECRETS;
const profile = runtimeConfig?.profiles?.test;
const productionProfile = runtimeConfig?.profiles?.production;
const accessKey = String(runtimeSecrets?.test || '').trim();
const normalizeUrl = value => String(value || '').trim().replace(/\/+$/, '');

if (!profile?.apiUrl || !accessKey) {
  throw new Error('TEST-Laufzeitkonfiguration oder lokaler TEST-Schlüssel fehlt.');
}
if (!productionProfile?.apiUrl) {
  throw new Error('Produktionsprofil fehlt; Zielumgebung kann nicht sicher geprüft werden.');
}
if (normalizeUrl(profile.apiUrl) === normalizeUrl(productionProfile.apiUrl)) {
  throw new Error('TEST-URL entspricht der PROD-URL. Schreibender Lauf wird abgebrochen.');
}

const prefix = `P62_LIVE_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
const created = [];
const checks = [];

async function post(payload) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(profile.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...payload, key: accessKey })
      });
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`TEST-Backend liefert kein JSON (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) {
          throw new Error(`TEST-Backend HTTP ${response.status}: ${redactSecret(result.message || text, accessKey)}`);
        }
        return result;
      }
      return result;
    } catch (error) {
      lastError = new Error(redactSecret(error instanceof Error ? error.message : error, accessKey));
      if (attempt < 2) await wait(2000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function readAll() {
  return post({ typ: 'LESEN', view: 'alle', data: [] });
}

function assert(condition, message) {
  if (!condition) throw new Error(redactSecret(message, accessKey));
}

function check(name, condition, detail = '') {
  assert(condition, `${name}${detail ? `: ${detail}` : ''}`);
  checks.push(name);
}

function stored(result, count = 1) {
  return result.status === 'success'
    && Number(result.angelegt || 0) + Number(result.bereits_vorhanden || 0) === count;
}

function rowsById(data, ids) {
  const wanted = new Set(ids);
  return (data.Zahlungen || []).filter(row => wanted.has(String(row.zahlung_id)));
}

function berlinDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;
}

async function write(data) {
  return post({ typ: 'ZAHLUNG', data });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function payment(id, amount, month, art = 'Miete', extra = {}) {
  return {
    zahlung_id: id,
    vertrag_id: contractId,
    datum: testDate,
    betrag: amount,
    art,
    mietmonat: month,
    ...extra
  };
}

function remember(row) {
  created.push(row);
  return row;
}

function forget(row) {
  const index = created.indexOf(row);
  if (index >= 0) created.splice(index, 1);
}

async function verifyRows(ids, expected = {}) {
  let data;
  let rows = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    data = await readAll();
    rows = rowsById(data, ids);
    if (ids.every(id => rows.some(row => String(row.zahlung_id) === String(id)))) break;
    await wait(2500);
  }
  for (const id of ids) assert(rows.some(row => String(row.zahlung_id) === String(id)), `Zeile fehlt: ${id}`);
  for (const [id, fields] of Object.entries(expected)) {
    const row = rows.find(item => String(item.zahlung_id) === String(id));
    assert(row, `Zeile fehlt: ${id}`);
    for (const [field, value] of Object.entries(fields)) {
      assert(String(row[field] ?? '') === String(value), `${id}.${field} erwartet ${value}, gefunden ${row[field]}`);
    }
  }
  return rows;
}

async function run() {
  const initial = await readAll();
  const testUnits = new Set((initial.Einheiten || []).filter(row => row.objekt_id === 'TEST').map(row => row.einheit_id));
  const contract = (initial.Vertraege || []).find(row => String(row.vertrag_id) === contractId && testUnits.has(row.einheit_id));
  check('TEST-Vertrag gefunden', Boolean(contract), `vertrag_id=${contractId}`);
  check('TEST-Vertrag hat gültigen Mietbeginn', /^\d{4}-\d{2}-\d{2}/.test(String(contract?.start_datum || '')));

  const capabilities = await post({ typ: 'LESEN', view: 'vertrag_capabilities', data: [] });
  check(`Backend-Version ${expectedVersion}`, capabilities.backend_version === expectedVersion, capabilities.backend_version);
  check('Zahlungsschreibweg freigegeben', capabilities.payment_writes === true);
  check('Zahlungsschema vollständig', capabilities.payment_schema_ready === true, JSON.stringify(capabilities.payment_schema_missing || []));
  const backendEnvironment = capabilities.environment ?? capabilities.umgebung ?? capabilities.env;
  if (backendEnvironment) {
    check('Backend-Zielumgebung ist TEST', String(backendEnvironment).toLowerCase() === 'test', String(backendEnvironment));
  }

  const rent = remember(payment(`${prefix}_MIETE`, '500,00', '2026-12'));
  const rentResult = await write(rent);
  check('Mietzahlung gespeichert', stored(rentResult), JSON.stringify(rentResult));
  await verifyRows([rent.zahlung_id], { [rent.zahlung_id]: { mietmonat: '2026-12', art: 'Miete', betrag: '500' } });

  const retry = await write(rent);
  check('Retry derselben zahlung_id bleibt idempotent', retry.status === 'success' && retry.angelegt === 0 && retry.bereits_vorhanden === 1, JSON.stringify(retry));
  const conflict = await write({ ...rent, betrag: '501,00' });
  check('Abweichender Retry wird abgewiesen', conflict.code === 'PAYMENT_ID_CONFLICT', JSON.stringify(conflict));

  const partial = remember(payment(`${prefix}_TEILZAHLUNG`, '100,00', '2026-11'));
  const partialResult = await write(partial);
  check('Teilzahlung gespeichert', stored(partialResult), JSON.stringify(partialResult));

  const groupId = `${prefix}_GRUPPE`;
  const split = [
    remember(payment(`${prefix}_SPLIT_1`, '300,00', '2026-10', 'Miete', { zahlungsgruppe_id: groupId })),
    remember(payment(`${prefix}_SPLIT_2`, '250,00', '2026-09', 'Miete', { zahlungsgruppe_id: groupId }))
  ];
  const splitResult = await write(split);
  check('Überzahlung mit Aufteilung gespeichert', stored(splitResult, 2), JSON.stringify(splitResult));
  const splitRows = await verifyRows(split.map(row => row.zahlung_id));
  check('Aufteilung trägt gemeinsame Zahlungsgruppe', splitRows.every(row => String(row.zahlungsgruppe_id) === groupId));
  check('Aufteilungssumme entspricht Eingang', splitRows.reduce((sum, row) => sum + Number(row.betrag), 0) === 550);

  const deposit = remember(payment(`${prefix}_KAUTION`, '100,00', '2026-11', 'Kaution'));
  const depositResult = await write(deposit);
  check('Kaution gespeichert', stored(depositResult), JSON.stringify(depositResult));
  await verifyRows([deposit.zahlung_id], { [deposit.zahlung_id]: { art: 'Kaution', mietmonat: '' } });

  const creditGroup = `${prefix}_GUTHABEN`;
  const credit = remember(payment(`${prefix}_GUTHABEN`, '25,00', '', 'Miete', { zahlungsgruppe_id: creditGroup }));
  const creditResult = await write(credit);
  check('Explizites Guthaben gespeichert', stored(creditResult), JSON.stringify(creditResult));
  await verifyRows([credit.zahlung_id], { [credit.zahlung_id]: { mietmonat: '', zahlungsgruppe_id: creditGroup } });

  const refund = payment(`${prefix}_ERSTATTUNG`, '-25,00', '2026-11', 'Erstattung');
  const refundResult = await write(refund);
  check('Negative Erstattung gespeichert', stored(refundResult), JSON.stringify(refundResult));
  await verifyRows([refund.zahlung_id], { [refund.zahlung_id]: { art: 'Erstattung', mietmonat: '2026-11', betrag: '-25' } });

  const partialStorno = payment(`${prefix}_STORNO_TEILZAHLUNG`, '-100,00', '1900-01', 'Storno', {
    storno_von: partial.zahlung_id, gegen_art: 'Kaution', zahlungsgruppe_id: 'FALSCH'
  });
  const partialStornoResult = await write(partialStorno);
  check('Storno gespeichert', stored(partialStornoResult), JSON.stringify(partialStornoResult));
  await verifyRows([partialStorno.zahlung_id], { [partialStorno.zahlung_id]: { mietmonat: '2026-11', gegen_art: 'Miete', storno_von: partial.zahlung_id } });
  forget(partial);
  const secondStorno = await write({ ...partialStorno, zahlung_id: `${prefix}_STORNO_TEILZAHLUNG_2` });
  check('Zweites Storno wird abgewiesen', secondStorno.code === 'PAYMENT_ALREADY_STORNOED', JSON.stringify(secondStorno));

  const refundStorno = payment(`${prefix}_STORNO_ERSTATTUNG`, '25,00', '1900-01', 'Storno', {
    storno_von: refund.zahlung_id, gegen_art: 'Miete', zahlungsgruppe_id: 'FALSCH'
  });
  const refundStornoResult = await write(refundStorno);
  check('Erstattungs-Storno übernimmt Gegenart und Monat', stored(refundStornoResult), JSON.stringify(refundStornoResult));
  await verifyRows([refundStorno.zahlung_id], { [refundStorno.zahlung_id]: { mietmonat: '2026-11', gegen_art: 'Erstattung', storno_von: refund.zahlung_id } });
  forget(refund);

  const amount125050 = remember(payment(`${prefix}_BETRAG_1250_50`, '1.250,50', '2026-08', 'Nachzahlung'));
  const amount1250 = remember(payment(`${prefix}_BETRAG_1250`, '1.250', '2026-07', 'Nachzahlung'));
  const amountResult = await write([amount125050, amount1250]);
  check('Deutsche Tausenderbeträge werden angenommen', stored(amountResult, 2), JSON.stringify(amountResult));
  await verifyRows([amount125050.zahlung_id, amount1250.zahlung_id], {
    [amount125050.zahlung_id]: { betrag: '1250.5' },
    [amount1250.zahlung_id]: { betrag: '1250' }
  });

  const invalidIds = [`${prefix}_INVALID_DECIMAL`, `${prefix}_INVALID_TEXT`];
  const invalidDecimal = await write(payment(invalidIds[0], '12,345', '2026-06'));
  check('Mehr als zwei Nachkommastellen werden abgewiesen', invalidDecimal.code === 'PAYMENT_AMOUNT_INVALID', JSON.stringify(invalidDecimal));
  const invalidText = await write(payment(invalidIds[1], 'abc', '2026-06'));
  check('Ungültiger Betrag wird abgewiesen', invalidText.code === 'PAYMENT_AMOUNT_INVALID', JSON.stringify(invalidText));

  const persisted = await readAll();
  const persistedRows = rowsById(persisted, [rent.zahlung_id, partial.zahlung_id, ...split.map(row => row.zahlung_id), deposit.zahlung_id, credit.zahlung_id, refund.zahlung_id, amount125050.zahlung_id, amount1250.zahlung_id]);
  check('Alle positiven Testzeilen sind nach Reload vorhanden', persistedRows.length === 9, `gefunden=${persistedRows.length}`);
  check('Eingangsdatum bleibt Berliner Kalendertag', persistedRows.every(row => berlinDate(row.datum) === testDate));
  check('Ungültige Testzeilen wurden nicht geschrieben', rowsById(persisted, invalidIds).length === 0);

  const cleanupRows = [...created].reverse();
  const cleanupIds = cleanupRows.map(row => `${prefix}_STORNO_${row.zahlung_id}`);
  const persistedById = new Map(persistedRows.map(row => [String(row.zahlung_id), row]));
  for (let index = 0; index < cleanupRows.length; index++) {
    const row = cleanupRows[index];
    const storedRow = persistedById.get(String(row.zahlung_id));
    assert(storedRow, `Persistierte Testzeile für Cleanup fehlt: ${row.zahlung_id}`);
    const cleanupResult = await write(payment(cleanupIds[index], (-Number(storedRow.betrag)).toLocaleString('de-DE', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }), '1999-01', 'Storno', {
      storno_von: row.zahlung_id,
      gegen_art: 'Miete',
      zahlungsgruppe_id: 'CLIENT_METADATA_MUST_BE_IGNORED'
    }));
    assert(stored(cleanupResult),
      `Aufräum-Storno fehlgeschlagen: ${JSON.stringify(cleanupResult)}`);
  }
  const afterCleanup = await readAll();
  check('Aufräum-Stornos sind persistiert', rowsById(afterCleanup, cleanupIds).length === cleanupIds.length);
  return { prefix, contractId, checks: checks.length, cleanupCount: cleanupIds.length, invalidIds };
}

try {
  const result = await run();
  console.log(JSON.stringify({ status: 'PASS', ...result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', message: error.message, prefix }, null, 2));
  process.exitCode = 1;
}

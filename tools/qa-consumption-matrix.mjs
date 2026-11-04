import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const chartSource = fs.readFileSync(new URL('../consumption-charts.js', import.meta.url), 'utf8');
const chartService = new Function(`${chartSource};return consumptionChartService;`)();
const SNAPSHOT_KEYS = [
  '_view_verbrauch_monat',
  '_view_verbrauch_jahr',
  '_view_verbrauch_audit',
  '_view_verbrauch_bilanz_jahr'
];

export function selectSnapshotPayload(payload, { includeRaw = false } = {}) {
  const keys = includeRaw ? [...SNAPSHOT_KEYS, 'Zaehler', 'Zaehlerstaende'] : SNAPSHOT_KEYS;
  const selected = Object.fromEntries(keys.map(key => [key, Array.isArray(payload[key]) ? payload[key] : []]));
  if (includeRaw && (!selected.Zaehler.length || !selected.Zaehlerstaende.length)) {
    throw new Error('Der Rohdaten-Snapshot enthält keine Zaehler- oder Zaehlerstaende-Daten.');
  }
  return selected;
}

export function parseSnapshotText(text, source = 'Snapshot') {
  const raw = String(text || '').trim();
  if (!raw) throw new Error(`${source} ist leer und enthält keine Verbrauchsdaten.`);

  if (/^<!doctype html|^<html[\s>]/i.test(raw)) {
    const excerpt = raw.replace(/\s+/g, ' ').slice(0, 180);
    throw new Error(`${source} enthält HTML statt JSON. Der Abruf hat keine Backend-Daten geliefert. Beginn: ${excerpt}`);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${source} ist kein gültiges JSON: ${error.message}`);
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)
    && (payload.status === 'error' || payload.code || payload.message)) {
    const status = payload.status ? `Status=${payload.status}` : '';
    const code = payload.code ? `Code=${payload.code}` : '';
    const message = payload.message ? `Meldung=${payload.message}` : '';
    throw new Error(`${source} enthält eine Backend-Fehlerantwort: ${[status, code, message].filter(Boolean).join(', ')}`);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !SNAPSHOT_KEYS.some(key => Array.isArray(payload[key]))) {
    throw new Error(`${source} enthält keine erwarteten Verbrauchsviews (${SNAPSHOT_KEYS.join(', ')}).`);
  }

  return payload;
}

const asRows = (payload, ...keys) => {
  for (const key of keys) {
    if (Array.isArray(payload && payload[key])) return payload[key];
  }
  return [];
};

const number = value => chartService.toNumber(value);
const yearOf = row => Number(row && row.jahr);
const sameMeter = (left, right) => chartService.sameMeter(left, right);
const exactKey = row => chartService.getMeterKey(row);

function uniqueMeters(rows, objectId, auditRows) {
  const seen = new Map();
  rows
    .filter(row => !objectId || String(row.objekt_id || '').trim() === String(objectId).trim())
    .forEach(row => {
      const key = exactKey(row);
      if (!key || seen.has(key)) return;
      const audit = auditRows.find(candidate => exactKey(candidate) === key);
      seen.set(key, audit ? { ...row, audit } : row);
    });
  return [...seen.values()];
}

function rawMonthlyRows(monthlyRows, meter, year) {
  return monthlyRows.filter(row => yearOf(row) === Number(year) && sameMeter(row, meter) && number(row.verbrauch_monat) !== null);
}

export function buildMatrixReport(payload, { objectId = '', years = [], now = new Date() } = {}) {
  const monthlyRows = asRows(payload, '_view_verbrauch_monat', 'view_verbrauch_monat');
  const annualRows = asRows(payload, '_view_verbrauch_jahr', 'view_verbrauch_jahr');
  const auditRows = asRows(payload, '_view_verbrauch_audit', 'view_verbrauch_audit');
  const readingRows = asRows(payload, 'Zaehlerstaende', 'zaehlerstaende');
  const masterMeters = asRows(payload, 'Zaehler', 'zaehler');
  const rawReadingsAvailable = readingRows.length > 0;
  const fallbackMeters = [...annualRows, ...monthlyRows];
  const meters = uniqueMeters(masterMeters.length ? masterMeters : fallbackMeters, objectId, auditRows);
  const availableYears = [...new Set([...monthlyRows, ...annualRows].map(yearOf).filter(Number.isInteger))].sort((a, b) => a - b);
  const selectedYears = years.length ? years.map(Number).filter(Number.isInteger) : availableYears;
  const combinations = [];

  meters.forEach(meter => selectedYears.forEach(year => {
    const monthly = rawMonthlyRows(monthlyRows, meter, year);
    const annualExact = annualRows.find(row => yearOf(row) === year && exactKey(row) === exactKey(meter)) || null;
    const annual = annualExact || annualRows.find(row => yearOf(row) === year && sameMeter(row, meter)) || null;
    const annualValue = number(annual && annual.verbrauch_jahr);
    const rawTotal = monthly.reduce((sum, row) => sum + number(row.verbrauch_monat), 0);
    const hasMonthly = monthly.length > 0;
    const hasAnnual = annualValue !== null;
    const comparable = hasMonthly && hasAnnual;
    const rawDifference = comparable ? Math.abs(rawTotal - annualValue) : null;
    const reconciliationLimit = hasAnnual ? Math.max(0.05, Math.abs(annualValue) * 0.02) : null;
    const series = chartService.monthlySeries(monthlyRows, meter, year, {
      annualRow: annual,
      readingRows: readingRows.filter(row => String(row.objekt_id || '').trim() === String(meter.objekt_id || '').trim()),
      now
    });
    const displayedValues = series.map(item => item.value).filter(value => value !== null);
    const displayedTotal = displayedValues.reduce((sum, value) => sum + value, 0);

    combinations.push({
      objekt_id: meter.objekt_id || '',
      einheit_id: meter.einheit_id || '',
      zaehler_id: meter.zaehler_id || '',
      jahr: year,
      hasMonthly,
      hasAnnual,
      rawTotal: comparable ? rawTotal : null,
      annualTotal: comparable ? annualValue : null,
      rawDifference,
      displayedTotal: displayedValues.length ? displayedTotal : null,
      derived: series.some(item => item.derived),
      fromReadings: series.some(item => item.fromReadings),
      reconciled: series.some(item => item.reconciled),
      flagged: series.some(item => item.flagged),
      rawMatchWithoutAdjustment: comparable && rawDifference <= 0.05,
      smallReconciliation: comparable && rawDifference > 0.05 && rawDifference <= reconciliationLimit,
      largeMismatch: comparable && rawDifference > reconciliationLimit,
      annualMatchType: annual ? (annualExact ? 'exact' : 'alias') : 'none',
      annualWithoutMonthly: hasAnnual && !hasMonthly,
      monthlyWithoutAnnual: hasMonthly && !hasAnnual,
      monthlyWithoutAnnualReason: hasMonthly && !hasAnnual
        ? 'KEINE_JAHRESZEILE_UNTER_EXAKTEM_ODER_ALIAS_SCHLUESSEL'
        : '',
      lineEmptyWithMonthly: rawReadingsAvailable
        ? hasMonthly && readingRows.filter(row => sameMeter(row, meter)).length === 0
        : null
    });
  }));

  const count = predicate => combinations.filter(predicate).length;
  return {
    objectId,
    years: selectedYears,
    meterCount: meters.length,
    total: combinations.length,
    compared: count(row => row.hasMonthly && row.hasAnnual),
    rawMatchWithoutAdjustment: count(row => row.rawMatchWithoutAdjustment),
    smallReconciliation: count(row => row.smallReconciliation),
    largeMismatch: count(row => row.largeMismatch),
    annualWithoutMonthly: count(row => row.annualWithoutMonthly),
    monthlyWithoutAnnual: count(row => row.monthlyWithoutAnnual),
    annualMatchesExactKey: count(row => row.annualMatchType === 'exact'),
    annualMatchesAlias: count(row => row.annualMatchType === 'alias'),
    annualMatchesNone: count(row => row.annualMatchType === 'none'),
    rawReadingsAvailable,
    lineEmptyWithMonthly: count(row => row.lineEmptyWithMonthly === true),
    lineCheckUnavailable: rawReadingsAvailable ? 0 : count(row => row.hasMonthly),
    combinationsWithYearRest: count(row => row.derived),
    combinationsFromReadings: count(row => row.fromReadings),
    combinationsReconciled: count(row => row.reconciled),
    combinationsFlagged: count(row => row.flagged),
    maxRawDifference: Math.max(0, ...combinations.map(row => row.rawDifference || 0)),
    combinations
  };
}

function parseOptions(args) {
  const options = {};
  args.forEach(arg => {
    if (arg.startsWith('--object=')) options.objectId = arg.slice('--object='.length);
    if (arg.startsWith('--years=')) options.years = arg.slice('--years='.length).split(',').map(Number);
  });
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) {
    console.error('Verwendung: node tools/qa-consumption-matrix.mjs <view-snapshot.json> [--object=Ra-HS-29] [--years=2018,2019,2020]');
    process.exitCode = 1;
  } else {
    const payload = parseSnapshotText(fs.readFileSync(input, 'utf8'), input);
    const report = buildMatrixReport(payload, parseOptions(process.argv.slice(3)));
    console.log(JSON.stringify(report, null, 2));
  }
}

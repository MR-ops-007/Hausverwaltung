import { createHash } from 'node:crypto';

export const PAYMENT_BASELINE_HASH_ALGORITHM = 'sha256-canonical-json-v1';

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function rowsByContract(payload) {
  return (payload?.Zahlungen || []).reduce((groups, row) => {
    const contractId = String(row?.vertrag_id || '').trim() || '(ohne Vertrag)';
    if (!groups[contractId]) groups[contractId] = [];
    groups[contractId].push(row);
    return groups;
  }, {});
}

export function objectScope(payload, objectId) {
  const unitIds = new Set((payload?.Einheiten || [])
    .filter(row => String(row?.objekt_id || '').trim() === String(objectId || '').trim())
    .map(row => String(row?.einheit_id || '').trim())
    .filter(Boolean));
  const contractIds = (payload?.Vertraege || [])
    .filter(row => unitIds.has(String(row?.einheit_id || '').trim())
      || String(row?.objekt_id || '').trim() === String(objectId || '').trim())
    .map(row => String(row?.vertrag_id || '').trim())
    .filter(Boolean);
  return { unitIds: [...unitIds].sort(), contractIds: [...new Set(contractIds)].sort() };
}

export function countPaymentsByContract(payload) {
  return Object.fromEntries(Object.entries(rowsByContract(payload))
    .map(([contractId, rows]) => [contractId, rows.length]));
}

export function paymentIdsByContract(payload) {
  return Object.fromEntries(Object.entries(rowsByContract(payload)).map(([contractId, rows]) => [
    contractId,
    rows.map(row => String(row?.zahlung_id || '').trim()).filter(Boolean).sort()
  ]));
}

export function fingerprintPaymentsByContract(payload) {
  return Object.fromEntries(Object.entries(rowsByContract(payload)).map(([contractId, rows]) => {
    const normalizedRows = rows
      .map(canonicalValue)
      .sort((left, right) => {
        const leftText = JSON.stringify(left);
        const rightText = JSON.stringify(right);
        return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
      });
    const hash = createHash('sha256')
      .update(JSON.stringify(normalizedRows), 'utf8')
      .digest('hex');
    return [contractId, hash];
  }));
}

export function buildPaymentBaseline(payload, { objectId, capturedAt = new Date().toISOString() } = {}) {
  return {
    capturedAt,
    objectId,
    paymentRows: Array.isArray(payload?.Zahlungen) ? payload.Zahlungen.length : 0,
    countsByContract: countPaymentsByContract(payload),
    paymentIdsByContract: paymentIdsByContract(payload),
    fingerprintsByContract: fingerprintPaymentsByContract(payload),
    hashAlgorithm: PAYMENT_BASELINE_HASH_ALGORITHM
  };
}

export function changedPaymentContracts(before, after) {
  const beforeCounts = before?.countsByContract || {};
  const afterCounts = after?.countsByContract || {};
  const beforeFingerprints = before?.fingerprintsByContract;
  const afterFingerprints = after?.fingerprintsByContract;
  const beforePaymentIds = before?.paymentIdsByContract || {};
  const afterPaymentIds = after?.paymentIdsByContract || {};
  const canCompareContent = before?.hashAlgorithm === PAYMENT_BASELINE_HASH_ALGORITHM
    && after?.hashAlgorithm === PAYMENT_BASELINE_HASH_ALGORITHM
    && beforeFingerprints && afterFingerprints;
  const ids = new Set([
    ...Object.keys(beforeCounts),
    ...Object.keys(afterCounts),
    ...(canCompareContent ? Object.keys(beforeFingerprints) : []),
    ...(canCompareContent ? Object.keys(afterFingerprints) : [])
  ]);

  return [...ids].sort().flatMap(contractId => {
    const beforeCount = Number(beforeCounts[contractId] || 0);
    const afterCount = Number(afterCounts[contractId] || 0);
    const countChanged = beforeCount !== afterCount;
    const contentChanged = canCompareContent
      && beforeFingerprints[contractId] !== afterFingerprints[contractId];
    if (!countChanged && !contentChanged) return [];
    const canCompareIds = before?.paymentIdsByContract
      && after?.paymentIdsByContract
      && typeof before.paymentIdsByContract === 'object'
      && typeof after.paymentIdsByContract === 'object';
    const beforeIds = new Set(canCompareIds ? beforePaymentIds[contractId] : []);
    const afterIds = new Set(canCompareIds ? afterPaymentIds[contractId] : []);
    return [{
      contractId,
      before: beforeCount,
      after: afterCount,
      reason: countChanged && contentChanged ? 'count_and_content' : countChanged ? 'count' : 'content',
      addedPaymentIds: canCompareIds ? [...afterIds].filter(id => !beforeIds.has(id)).sort() : [],
      removedPaymentIds: canCompareIds ? [...beforeIds].filter(id => !afterIds.has(id)).sort() : []
    }];
  });
}

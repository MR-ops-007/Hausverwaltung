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

export function countPaymentsByContract(payload) {
  return Object.fromEntries(Object.entries(rowsByContract(payload))
    .map(([contractId, rows]) => [contractId, rows.length]));
}

export function fingerprintPaymentsByContract(payload) {
  return Object.fromEntries(Object.entries(rowsByContract(payload)).map(([contractId, rows]) => {
    const normalizedRows = rows
      .map(canonicalValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
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
    fingerprintsByContract: fingerprintPaymentsByContract(payload),
    hashAlgorithm: PAYMENT_BASELINE_HASH_ALGORITHM
  };
}

export function changedPaymentContracts(before, after) {
  const beforeCounts = before?.countsByContract || {};
  const afterCounts = after?.countsByContract || {};
  const beforeFingerprints = before?.fingerprintsByContract;
  const afterFingerprints = after?.fingerprintsByContract;
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
    return [{
      contractId,
      before: beforeCount,
      after: afterCount,
      reason: countChanged && contentChanged ? 'count_and_content' : countChanged ? 'count' : 'content'
    }];
  });
}

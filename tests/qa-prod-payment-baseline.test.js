import { describe, expect, it } from 'vitest';
import {
  PAYMENT_BASELINE_HASH_ALGORITHM,
  buildPaymentBaseline,
  changedPaymentContracts
} from '../tools/payment-baseline.mjs';
import { redactSecret } from '../tools/qa-secret-utils.mjs';

const payment = (overrides = {}) => ({
  zahlung_id: 'P1',
  vertrag_id: 'V1',
  datum: '2026-11-18',
  betrag: 650,
  art: 'Miete',
  mietmonat: '2026-11',
  ...overrides
});

describe('production payment baseline', () => {
  it('redacts the access key from error text', () => {
    expect(redactSecret('Backend echo: super-secret-key', 'super-secret-key'))
      .toBe('Backend echo: [REDACTED]');
    expect(redactSecret('kein Schlüssel', ''))
      .toBe('kein Schlüssel');
  });

  it('hashes payment content without writing raw payment rows to the snapshot', () => {
    const baseline = buildPaymentBaseline({ Zahlungen: [payment({ name: 'nicht ausgeben' })] }, {
      objectId: 'TEST',
      capturedAt: '2026-11-19T00:00:00.000Z'
    });
    expect(baseline).toMatchObject({
      objectId: 'TEST',
      paymentRows: 1,
      hashAlgorithm: PAYMENT_BASELINE_HASH_ALGORITHM
    });
    expect(JSON.stringify(baseline)).not.toContain('nicht ausgeben');
    expect(baseline.fingerprintsByContract.V1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not depend on row order or object key order', () => {
    const before = buildPaymentBaseline({ Zahlungen: [payment(), payment({ zahlung_id: 'P2', betrag: 50 })] }, { objectId: 'TEST' });
    const after = buildPaymentBaseline({ Zahlungen: [
      { mietmonat: '2026-11', art: 'Miete', betrag: 50, datum: '2026-11-18', vertrag_id: 'V1', zahlung_id: 'P2' },
      { mietmonat: '2026-11', art: 'Miete', betrag: 650, datum: '2026-11-18', vertrag_id: 'V1', zahlung_id: 'P1' }
    ] }, { objectId: 'TEST' });
    expect(changedPaymentContracts(before, after)).toEqual([]);
  });

  it('detects a content replacement even when the row count is unchanged', () => {
    const before = buildPaymentBaseline({ Zahlungen: [payment()] }, { objectId: 'TEST' });
    const after = buildPaymentBaseline({ Zahlungen: [payment({ betrag: 651 })] }, { objectId: 'TEST' });
    expect(changedPaymentContracts(before, after)).toEqual([{
      contractId: 'V1', before: 1, after: 1, reason: 'content'
    }]);
  });

  it('detects new and deleted contract ids', () => {
    const before = buildPaymentBaseline({ Zahlungen: [payment()] }, { objectId: 'TEST' });
    const after = buildPaymentBaseline({ Zahlungen: [payment({ vertrag_id: 'V2' })] }, { objectId: 'TEST' });
    expect(changedPaymentContracts(before, after)).toEqual([
      { contractId: 'V1', before: 1, after: 0, reason: 'count_and_content' },
      { contractId: 'V2', before: 0, after: 1, reason: 'count_and_content' }
    ]);
  });

  it('keeps legacy count-only baselines compatible', () => {
    const before = { countsByContract: { V1: 1 } };
    const after = buildPaymentBaseline({ Zahlungen: [payment({ betrag: 651 })] }, { objectId: 'TEST' });
    expect(changedPaymentContracts(before, after)).toEqual([]);
  });
});

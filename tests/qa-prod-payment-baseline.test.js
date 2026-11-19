import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAYMENT_BASELINE_HASH_ALGORITHM,
  buildPaymentBaseline,
  changedPaymentContracts,
  objectScope
} from '../tools/payment-baseline.mjs';
import { redactSecret } from '../tools/qa-secret-utils.mjs';
import {
  comparePaymentBaseline,
  redactAndExcerpt,
  requireObjectScope,
  writeSnapshot
} from '../tools/qa-prod-payment-baseline.mjs';

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
      contractId: 'V1',
      before: 1,
      after: 1,
      reason: 'content',
      addedPaymentIds: [],
      removedPaymentIds: []
    }]);
  });

  it('detects new and deleted contract ids', () => {
    const before = buildPaymentBaseline({ Zahlungen: [payment()] }, { objectId: 'TEST' });
    const after = buildPaymentBaseline({ Zahlungen: [payment({ vertrag_id: 'V2' })] }, { objectId: 'TEST' });
    expect(changedPaymentContracts(before, after)).toEqual([
      {
        contractId: 'V1',
        before: 1,
        after: 0,
        reason: 'count_and_content',
        addedPaymentIds: [],
        removedPaymentIds: ['P1']
      },
      {
        contractId: 'V2',
        before: 0,
        after: 1,
        reason: 'count_and_content',
        addedPaymentIds: ['P1'],
        removedPaymentIds: []
      }
    ]);
  });

  it('keeps payment IDs in the snapshot and reports ID changes', () => {
    const before = buildPaymentBaseline({ Zahlungen: [payment()] }, { objectId: 'TEST' });
    const after = buildPaymentBaseline({ Zahlungen: [payment({ zahlung_id: 'P2' })] }, { objectId: 'TEST' });

    expect(before.paymentIdsByContract).toEqual({ V1: ['P1'] });
    expect(changedPaymentContracts(before, after)[0]).toMatchObject({
      addedPaymentIds: ['P2'],
      removedPaymentIds: ['P1']
    });
  });

  it('keeps legacy count-only baselines compatible', () => {
    const before = { countsByContract: { V1: 1 } };
    const after = buildPaymentBaseline({ Zahlungen: [payment({ betrag: 651 })] }, { objectId: 'TEST' });
    expect(changedPaymentContracts(before, after)).toEqual([]);
  });

  it('does not resolve an unknown object id to another object', () => {
    const payload = {
      Einheiten: [{ einheit_id: 'U1', objekt_id: 'TEST' }],
      Vertraege: [{ vertrag_id: 'V1', einheit_id: 'U1', objekt_id: 'TEST' }]
    };

    expect(objectScope(payload, 'Test')).toEqual({ unitIds: [], contractIds: [] });
    expect(objectScope(payload, 'TEST')).toEqual({ unitIds: ['U1'], contractIds: ['V1'] });
    expect(() => requireObjectScope(payload, 'Test')).toThrow('Objekt Test wurde nicht gefunden');
  });
});

describe('production payment baseline CLI', () => {
  it('writes an unsuccessful after-snapshot before reporting an outside-object change', async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'hausverwaltung-baseline-'));
    const afterFile = path.join(temporaryDirectory, 'prod-after.json');

    try {
      const before = {
        ...buildPaymentBaseline({ Zahlungen: [payment({ vertrag_id: 'V_PROD', zahlung_id: 'P_PROD', betrag: 25 })] }, { objectId: 'TEST' }),
        objectContractIds: ['V_TEST']
      };
      const after = {
        ...buildPaymentBaseline({ Zahlungen: [payment({ vertrag_id: 'V_PROD', zahlung_id: 'P_PROD', betrag: 26 })] }, { objectId: 'TEST' }),
        objectContractIds: ['V_TEST'],
        ok: true
      };
      const compared = comparePaymentBaseline(before, after, 'TEST');

      expect(compared.comparisonError).toContain('Zahlungsänderungen außerhalb von TEST');
      expect(compared.snapshot.ok).toBe(false);
      expect(compared.snapshot.comparison.unchangedOutsideObject).toBe(false);
      expect(compared.snapshot.comparison.changedContracts).toContainEqual({
        contractId: 'V_PROD',
        before: 1,
        after: 1,
        reason: 'content',
        addedPaymentIds: [],
        removedPaymentIds: []
      });

      writeSnapshot(afterFile, compared.snapshot);
      const saved = JSON.parse(await readFile(afterFile, 'utf8'));
      expect(saved.ok).toBe(false);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('redacts a secret before shortening an error response', () => {
    const result = redactAndExcerpt(`${'x'.repeat(235)}SECRET_TOKEN_123456`, 'SECRET_TOKEN_123456');
    expect(result).not.toContain('SECRET');
  });
});

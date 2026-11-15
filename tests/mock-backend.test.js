import { describe, expect, it } from 'vitest';
import { createMockConsumptionData } from '../tools/mock-consumption-fixtures.mjs';
import { baselineRentalFixture, tenantChangeFixture } from '../tools/mock-rental-fixtures.mjs';

describe('synthetische Mock-Fixtures', () => {
  it('liefert Verbrauchsdaten für alle unterstützten Medien und Jahre', () => {
    const fixture = createMockConsumptionData();
    expect(fixture._view_verbrauch_monat.length).toBeGreaterThan(100);
    expect(new Set(fixture._view_verbrauch_monat.map(row => row.medium))).toEqual(new Set(['Strom', 'Kaltwasser', 'Warmwasser', 'Öl']));
    expect(new Set(fixture._view_verbrauch_jahr.map(row => row.jahr))).toEqual(new Set([2025, 2026]));
    expect(fixture._view_verbrauch_audit.length).toBeGreaterThan(0);
    expect(fixture._view_verbrauch_bilanz_jahr.length).toBeGreaterThan(0);
  });

  it('bildet einen Mieterwechsel über zwei Verträge derselben Einheit ab', () => {
    const [previous, current] = tenantChangeFixture.vertraege;
    expect(previous.einheit_id).toBe(current.einheit_id);
    expect(previous.end_datum).toBe('2026-05-31');
    expect(current.start_datum).toBe('2026-06-01');
    expect(previous.aktiv).toBe(false);
    expect(current.aktiv).toBe(true);

    const oldPayments = tenantChangeFixture.zahlungen.filter(row => row.vertrag_id === previous.vertrag_id);
    const newPayments = tenantChangeFixture.zahlungen.filter(row => row.vertrag_id === current.vertrag_id);
    expect(oldPayments.filter(row => row.art === 'Miete').map(row => row.mietmonat)).toEqual([
      '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'
    ]);
    expect(newPayments.map(row => row.mietmonat).filter(Boolean)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(tenantChangeFixture.activeViewRow.vertrag_id).toBe(current.vertrag_id);
    expect(tenantChangeFixture.vertragsparteien).toEqual(expect.arrayContaining([
      expect.objectContaining({ vertrag_id: previous.vertrag_id, person_id: 'P8' }),
      expect.objectContaining({ vertrag_id: current.vertrag_id, person_id: 'P9' })
    ]));

    expect(tenantChangeFixture.negativeCases.gap[0].end_datum < tenantChangeFixture.negativeCases.gap[1].start_datum).toBe(true);
    expect(tenantChangeFixture.negativeCases.overlap[0].end_datum >= tenantChangeFixture.negativeCases.overlap[1].start_datum).toBe(true);
    expect(tenantChangeFixture.negativeCases.midMonth[0].end_datum).toBe('2026-06-14');
    expect(tenantChangeFixture.negativeCases.midMonth[1].start_datum).toBe('2026-06-15');
  });

  it('hält den Entenhausen-Grundbestand über 2025 und 2026 konsistent', () => {
    const rentedUnits = baselineRentalFixture.vertraege
      .filter(contract => contract.soll_gesamt > 0)
      .map(contract => contract.einheit_id);
    const coveredBy2025 = baselineRentalFixture.vertraege
      .filter(contract => !contract.start_datum || contract.start_datum.slice(0, 4) <= '2025')
      .map(contract => contract.einheit_id);
    const rentMonths = new Set(baselineRentalFixture.zahlungen.map(row => row.mietmonat));

    expect(new Set(rentedUnits)).toEqual(new Set(['TEST_WE_01', 'TEST_WE_02', 'TEST_WE_03', 'TEST_WE_04', 'TEST_WE_05', 'TEST_WE_06']));
    expect(new Set(coveredBy2025)).toEqual(new Set(['TEST_WE_01', 'TEST_WE_02', 'TEST_WE_03', 'TEST_WE_04', 'TEST_WE_05', 'TEST_WE_06', 'TEST_WE_07']));
    expect(rentMonths.has('2025-01')).toBe(true);
    expect(rentMonths.has('2025-12')).toBe(true);
    expect(baselineRentalFixture.zahlungen).toEqual(expect.arrayContaining([
      expect.objectContaining({ vertrag_id: 'TEST_V3', mietmonat: '2025-07', betrag: 300 }),
      expect.objectContaining({ vertrag_id: 'TEST_V5', mietmonat: '2025-02', betrag: 600 })
    ]));
    expect(tenantChangeFixture.zahlungen).toEqual(expect.arrayContaining([
      expect.objectContaining({ vertrag_id: 'TEST_V8_ALT', mietmonat: '2025-06', betrag: 700 }),
      expect.objectContaining({ vertrag_id: 'TEST_V8_ALT', mietmonat: '2025-12', betrag: 700 })
    ]));
  });
});

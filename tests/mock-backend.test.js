import { describe, expect, it } from 'vitest';
import { createMockConsumptionData } from '../tools/mock-consumption-fixtures.mjs';
import { tenantChangeFixture } from '../tools/mock-rental-fixtures.mjs';

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
    expect(oldPayments.filter(row => row.art === 'Miete').map(row => row.mietmonat)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']);
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
});

import { describe, expect, it } from 'vitest';
import { createMockConsumptionData } from '../tools/mock-consumption-fixtures.mjs';

describe('synthetische Mock-Fixtures', () => {
  it('liefert Verbrauchsdaten für alle unterstützten Medien und Jahre', () => {
    const fixture = createMockConsumptionData();
    expect(fixture._view_verbrauch_monat.length).toBeGreaterThan(100);
    expect(new Set(fixture._view_verbrauch_monat.map(row => row.medium))).toEqual(new Set(['Strom', 'Kaltwasser', 'Warmwasser', 'Öl']));
    expect(new Set(fixture._view_verbrauch_jahr.map(row => row.jahr))).toEqual(new Set([2025, 2026]));
    expect(fixture._view_verbrauch_audit.length).toBeGreaterThan(0);
    expect(fixture._view_verbrauch_bilanz_jahr.length).toBeGreaterThan(0);
  });
});

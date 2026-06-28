import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function loadCalcService() {
  const calcServiceCode = readFileSync(
    new URL('../calc-service.js', import.meta.url),
    'utf8'
  );
  const factory = new Function(`${calcServiceCode}; return calcService;`);

  return factory();
}

describe('calcService consumption dashboard', () => {
  it('calculates consumption rows for Ra-HS-29 meter readings in one year', () => {
    const calcService = loadCalcService();
    const dashboard = calcService.buildConsumptionDashboard(
      {
        einheiten: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            nummer: 'Wohnung 1',
          },
        ],
        zaehler: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            medium: 'strom_ht_kwh',
            bezeichnung: 'Strom Wohnung 1',
            einheit: 'kWh',
            ueberlauf_erlaubt: false,
          },
        ],
        zaehlerstaende: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            wert: 6500,
            zeitstempel: '31.12.2025 00:00',
          },
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            wert: 6647,
            zeitstempel: '02.01.2026 00:00',
          },
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            wert: 6900,
            zeitstempel: '30.12.2026 00:00',
          },
          {
            objekt_id: 'TEST',
            einheit_id: 'TEST_WE_01',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            wert: 9999,
            zeitstempel: '30.12.2026 00:00',
          },
        ],
      },
      {
        objekt_id: 'Ra-HS-29',
        year: 2026,
      }
    );

    expect(dashboard.rows).toHaveLength(1);
    expect(dashboard.rows[0]).toMatchObject({
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_WE_01',
      einheit_name: 'Wohnung 1',
      zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
      medium: 'strom_ht_kwh',
      readings_count: 3,
      period_readings_count: 2,
      uses_baseline: true,
      start_wert: 6500,
      end_wert: 6900,
      verbrauch: 400,
      status: 'OK',
    });
    expect(dashboard.summary).toEqual([
      expect.objectContaining({
        objekt_id: 'Ra-HS-29',
        medium: 'strom_ht_kwh',
        verbrauch: 400,
        zaehler_count: 1,
        offene_zaehler: 0,
      }),
    ]);
  });

  it('calculates overflow consumption for water meters', () => {
    const calcService = loadCalcService();
    const result = calcService.calculateReadingDelta(
      { wert: 9876 },
      { wert: 123 },
      {
        medium: 'kaltwasser_m3',
        stellen: 4,
        ueberlauf_erlaubt: true,
      }
    );

    expect(result).toMatchObject({
      value: 247,
      status: 'UEBERLAUF',
    });
  });

  it('treats decreasing oil level in cm as consumption', () => {
    const calcService = loadCalcService();
    const result = calcService.calculateReadingDelta(
      { wert: 55 },
      { wert: 43 },
      {
        medium: 'oel_stand_cm',
        ueberlauf_erlaubt: false,
      }
    );

    expect(result).toMatchObject({
      value: 12,
      status: 'OK',
    });
  });

  it('marks increasing oil level as a dashboard review item', () => {
    const calcService = loadCalcService();
    const result = calcService.calculateReadingDelta(
      { wert: 43 },
      { wert: 55 },
      {
        medium: 'oel_stand_cm',
      }
    );

    expect(result).toMatchObject({
      value: 0,
      status: 'FUELLSTAND_GESTIEGEN',
    });
    expect(result.note).toContain('Füllstand ist gestiegen');
  });

  it('sums decreasing oil level intervals and ignores refills as consumption', () => {
    const calcService = loadCalcService();
    const result = calcService.calculateConsumptionFromReadings(
      [
        { wert: 60, zeitstempel: '01.01.2026 00:00' },
        { wert: 50, zeitstempel: '01.02.2026 00:00' },
        { wert: 70, zeitstempel: '01.03.2026 00:00' },
        { wert: 40, zeitstempel: '01.04.2026 00:00' },
      ],
      {
        medium: 'oel_stand_cm',
      }
    );

    expect(result).toMatchObject({
      value: 40,
      status: 'FUELLSTAND_GESTIEGEN',
    });
  });

  it('marks meters without readings in the selected year as open even if a baseline exists', () => {
    const calcService = loadCalcService();
    const rows = calcService.buildConsumptionRows(
      {
        zaehler: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_Allgemein',
            zaehler_id: 'Z_STROM_KWH_ALLGEMEIN_NT',
            medium: 'strom_nt_kwh',
            einheit: 'kWh',
          },
        ],
        zaehlerstaende: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_Allgemein',
            zaehler_id: 'Z_STROM_KWH_ALLGEMEIN_NT',
            wert: 1200,
            zeitstempel: '31.12.2025 00:00',
          },
        ],
        einheiten: [],
      },
      {
        objekt_id: 'Ra-HS-29',
        year: 2026,
      }
    );

    expect(rows[0]).toMatchObject({
      verbrauch: null,
      status: 'KEINE_WERTE',
      uses_baseline: true,
      period_readings_count: 0,
    });
  });

  it('can exclude calculated virtual meters from dashboard rows', () => {
    const calcService = loadCalcService();
    const rows = calcService.buildConsumptionRows(
      {
        zaehler: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_Allgemein',
            zaehler_id: 'Z_WARMWASSER_WW_GESAMT_BERECHNET',
            medium: 'warmwasser_m3',
            berechnet: true,
          },
        ],
        zaehlerstaende: [],
        einheiten: [],
      },
      {
        objekt_id: 'Ra-HS-29',
        includeCalculated: false,
      }
    );

    expect(rows).toEqual([]);
  });
});

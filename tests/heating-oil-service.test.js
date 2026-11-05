import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const service = new Function(
  readFileSync(new URL('../heating-oil-service.js', import.meta.url), 'utf8') +
  '; return heatingOilService;'
)();

const mainMeter = {
  objekt_id: 'Ra-HS-29',
  einheit_id: 'Ra-HS-29_Allgemein',
  zaehler_id: 'Z_OEL_STAND_IN_CM',
  medium: 'oel_stand_cm',
};

const auxiliaryMeter = {
  ...mainMeter,
  zaehler_id: 'Z_OEL_STAND_IN_CM_ZUSATZTANK',
  bezeichnung: 'Heizung Ölstand Zusatztank',
};

const reading = (meter, date, value) => ({
  ...meter,
  zeitstempel: date,
  wert: value,
});

describe('Heizöl-Fachlogik', () => {
  it('liefert für den Haupttank die Arbeitshypothese 10.000 Liter bei 140 cm', () => {
    const config = service.getTankConfig(mainMeter, []);

    expect(config).toMatchObject({
      tank_id: 'HAUPTTANK',
      volumen_l: 10000,
      max_fuellstand_cm: 140,
      in_verbrauch_auswertung: true,
    });
    expect(config.liter_pro_cm).toBeCloseTo(10000 / 140);
  });

  it('berechnet sinkende Füllstände in cm und Litern und ignoriert fremde Zähler', () => {
    const result = service.calculate([
      reading(mainMeter, '01.01.2026 00:00', 100),
      reading(mainMeter, '01.02.2026 00:00', 80),
      reading({ ...mainMeter, zaehler_id: 'OTHER' }, '15.01.2026 00:00', 1),
    ], mainMeter, [], 2026);

    expect(result.totalCm).toBeCloseTo(20);
    expect(result.totalLiters).toBeCloseTo(20 * (10000 / 140));
    expect(result.refills).toHaveLength(0);
    expect(result.monthly[0].liter).toBeCloseTo(result.totalLiters);
  });

  it('behandelt steigende Füllstände als Tankfüllung und nicht als Verbrauch', () => {
    const result = service.calculate([
      reading(mainMeter, '01.01.2026 00:00', 80),
      reading(mainMeter, '15.01.2026 00:00', 120),
      reading(mainMeter, '01.02.2026 00:00', 100),
    ], mainMeter, [], 2026);

    expect(result.totalCm).toBeCloseTo(20);
    expect(result.totalLiters).toBeCloseTo(20 * (10000 / 140));
    expect(result.refills).toHaveLength(1);
    expect(result.refillMonths.has(0)).toBe(true);
  });

  it('ordnet den Zusatztank separat zu und nimmt ihn standardmäßig nicht in die Hausauswertung', () => {
    const config = service.getTankConfig(auxiliaryMeter, []);

    expect(config).toMatchObject({
      tank_id: 'ZUSATZTANK',
      volumen_l: 2000,
      in_verbrauch_auswertung: false,
    });
    expect(config.liter_pro_cm).toBeCloseTo(2000 / 140);
  });

  it('übernimmt objektbezogene Tankparameter aus der Haustechnik', () => {
    const technicalRows = [{
      objekt_id: 'Ra-HS-29',
      tank_id: 'HAUPTTANK',
      volumen_l: 9000,
      max_fuellstand_cm: 120,
      aktiv: 'TRUE',
      in_verbrauch_auswertung: 'ja',
    }];
    const config = service.getTankConfig(mainMeter, technicalRows);
    const result = service.calculate([
      reading(mainMeter, '01.01.2026 00:00', 100),
      reading(mainMeter, '01.02.2026 00:00', 90),
    ], mainMeter, technicalRows, 2026);

    expect(config).toMatchObject({ volumen_l: 9000, max_fuellstand_cm: 120 });
    expect(config.liter_pro_cm).toBeCloseTo(75);
    expect(result.totalLiters).toBeCloseTo(750);
  });

  it('erkennt eine Tankfüllung ohne gleichzeitigen neuen Füllstand', () => {
    const events = service.findMissingLevelAfterFill(
      [reading(mainMeter, '01.01.2026 00:00', 60)],
      [
        reading({ ...mainMeter, zaehler_id: 'Z_OEL_GETANKT_LITER', medium: 'oel_stand_l' }, '01.01.2026 00:00', 1000),
        reading({ ...mainMeter, zaehler_id: 'Z_OEL_GETANKT_LITER', medium: 'oel_stand_l' }, '15.01.2026 00:00', 4000),
      ],
      mainMeter,
      [],
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: 'FUELLSTAND_FEHLT',
      getankt_liter: 3000,
      vollgetankt_vorschlag: true,
      vorgeschlagener_fuellstand_cm: 140,
    });
  });

  it('liefert Literwerte für die Jahresentwicklung', () => {
    const series = service.annualSeries([
      reading(mainMeter, '01.01.2025 00:00', 120),
      reading(mainMeter, '01.01.2026 00:00', 100),
      reading(mainMeter, '01.01.2027 00:00', 90),
    ], mainMeter, [], 2026);

    expect(series).toEqual(expect.arrayContaining([
      expect.objectContaining({ year: 2025, value: expect.closeTo(20 * (10000 / 140), 5) }),
      expect.objectContaining({ year: 2026, value: expect.closeTo(10 * (10000 / 140), 5) }),
    ]));
  });
});

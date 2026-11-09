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

  it('ordnet eine Zusatztank-Füllung nicht dem Haupttank zu', () => {
    const events = service.findMissingLevelAfterFill(
      [reading(mainMeter, '01.01.2026 00:00', 60)],
      [
        reading({ ...auxiliaryMeter, zaehler_id: 'Z_OEL_GETANKT_LITER_ZUSATZTANK', medium: 'oel_stand_l' }, '01.01.2026 00:00', 1000),
        reading({ ...auxiliaryMeter, zaehler_id: 'Z_OEL_GETANKT_LITER_ZUSATZTANK', medium: 'oel_stand_l' }, '15.01.2026 00:00', 2500),
      ],
      mainMeter,
      [],
    );

    expect(events).toEqual([]);
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
  describe('Verfeinerungen', () => {
    const fillMeter = { ...mainMeter, zaehler_id: 'Z_OEL_STAND_L', medium: 'oel_stand_l' };
    const levels = (endValue) => [
      reading(mainMeter, '01.01.2026 08:00', 40),
      reading(mainMeter, '10.01.2026 14:00', endValue),
    ];

    it('wertet Anstiege bis zur Rauschschwelle weder als Füllung noch als Verbrauch', () => {
      const result = service.calculate([
        reading(mainMeter, '01.01.2026 00:00', 100),
        reading(mainMeter, '15.01.2026 00:00', 100.5),
        reading(mainMeter, '01.02.2026 00:00', 90),
      ], mainMeter, [], 2026);

      expect(result.refills).toHaveLength(0);
      expect(result.refillMonths.size).toBe(0);
      // Der Referenzstand bleibt 100 cm, das Rauschen wird nicht in den Folgezeitraum verschoben.
      expect(result.totalCm).toBeCloseTo(10);
    });

    it('lässt die Rauschschwelle über die Haustechnik konfigurieren', () => {
      const rows = [{ objekt_id: 'Ra-HS-29', tank_id: 'HAUPTTANK', volumen_l: 10000, max_fuellstand_cm: 140, rauschen_cm: 0.2 }];
      const result = service.calculate([
        reading(mainMeter, '01.01.2026 00:00', 100),
        reading(mainMeter, '15.01.2026 00:00', 100.5),
      ], mainMeter, rows, 2026);

      expect(result.refills).toHaveLength(1);
    });

    it('bilanziert den Verbrauch im Füllintervall aus den getankten Litern', () => {
      // 7000 l getankt, Stand steigt von 40 auf 131 cm (91 cm = 6500 l) => 500 l Verbrauch.
      const fills = [
        reading(fillMeter, '01.01.2026 08:00', 1000),
        reading(fillMeter, '10.01.2026 12:00', 8000),
      ];
      const result = service.calculate(levels(131), mainMeter, [], 2026, { fillReadings: fills });

      expect(result.refills).toHaveLength(1);
      expect(result.refills[0]).toMatchObject({ status: 'FUELLUNG_REKONSTRUIERT', getankt_liter: 7000 });
      expect(result.refills[0].verbrauch_liter).toBeCloseTo(500, 0);
      expect(result.totalLiters).toBeCloseTo(500, 0);
      expect(result.monthly[0].liter).toBeCloseTo(500, 0);
      expect(result.reconstructedMonths.has(0)).toBe(true);
      expect(result.refillMonths.has(0)).toBe(true);
    });

    it('bilanziert eine Tankfüllung auch dann, wenn der Füllstand trotzdem fällt', () => {
      // 100 -> 90 cm trotz 3.000 l Lieferung: Verbrauch = 3.000 l + 10 cm x l/cm.
      const fills = [
        reading(fillMeter, '01.01.2026 08:00', 1000),
        reading(fillMeter, '10.01.2026 12:00', 4000),
      ];
      const result = service.calculate([
        reading(mainMeter, '01.01.2026 08:00', 100),
        reading(mainMeter, '10.01.2026 14:00', 90),
      ], mainMeter, [], 2026, { fillReadings: fills });

      expect(result.refills[0].status).toBe('FUELLUNG_REKONSTRUIERT');
      expect(result.totalLiters).toBeCloseTo(3000 + 10 * (10000 / 140), 0);
      expect(result.refillMonths.has(0)).toBe(true);
    });

    it('wählt Betankungsdaten nur vom passenden Tank (gemeinsam für Diagramm und Tabelle)', () => {
      const auxFill = { ...fillMeter, zaehler_id: 'Z_OEL_STAND_L_ZUSATZTANK' };
      const meters = [mainMeter, auxiliaryMeter, fillMeter, auxFill];
      const readings = [
        reading(fillMeter, '10.01.2026 12:00', 8000),
        reading(auxFill, '10.01.2026 12:00', 500),
        reading(mainMeter, '10.01.2026 14:00', 131),
      ];

      const forMain = service.fillReadingsFor(readings, meters, mainMeter);
      const forAux = service.fillReadingsFor(readings, meters, auxiliaryMeter);

      expect(forMain.map(row => row.zaehler_id)).toEqual(['Z_OEL_STAND_L']);
      expect(forAux.map(row => row.zaehler_id)).toEqual(['Z_OEL_STAND_L_ZUSATZTANK']);
    });

    it('findet den Füllzähler auch ohne Stammdatensatz in der Meterliste', () => {
      const fills = [
        reading(fillMeter, '01.01.2026 08:00', 1000),
        reading(fillMeter, '10.01.2026 12:00', 4000),
      ];

      const result = service.calculate([
        reading(mainMeter, '01.01.2026 08:00', 100),
        reading(mainMeter, '10.01.2026 14:00', 90),
        ...fills,
      ], mainMeter, [], 2026, {
        fillReadings: service.fillReadingsFor([
          reading(mainMeter, '01.01.2026 08:00', 100),
          reading(mainMeter, '10.01.2026 14:00', 90),
          ...fills,
        ], [mainMeter], mainMeter),
      });

      expect(result.totalLiters).toBeCloseTo(3000 + 10 * (10000 / 140), 0);
    });

    it('verbucht keinen Verbrauch, wenn der Anstieg die getankte Menge übersteigt', () => {
      const fills = [
        reading(fillMeter, '01.01.2026 08:00', 1000),
        reading(fillMeter, '10.01.2026 12:00', 2000),
      ];
      const result = service.calculate(levels(131), mainMeter, [], 2026, { fillReadings: fills });

      expect(result.refills[0].status).toBe('FUELLUNG_UNPLAUSIBEL');
      expect(result.totalLiters).toBe(0);
      expect(result.warnings.join(' ')).toContain('Untergrenze');
    });

    it('führt Füllintervalle ohne Betankungsdaten wie bisher als Lücke', () => {
      const result = service.calculate(levels(131), mainMeter, [], 2026, { fillReadings: [] });

      expect(result.refills[0].status).toBe('FUELLUNG_ODER_KORREKTUR');
      expect(result.totalLiters).toBe(0);
      expect(result.warnings.join(' ')).toContain('Untergrenze');
    });

    it('ordnet eine Lieferung nur einem Füllintervall zu', () => {
      const fills = [
        reading(fillMeter, '01.01.2026 08:00', 1000),
        reading(fillMeter, '10.01.2026 12:00', 8000),
      ];
      const result = service.calculate([
        reading(mainMeter, '01.01.2026 08:00', 40),
        reading(mainMeter, '10.01.2026 08:00', 40.2),
        reading(mainMeter, '10.01.2026 14:00', 131),
      ], mainMeter, [], 2026, { fillReadings: fills });

      expect(result.refills.filter(refill => refill.status === 'FUELLUNG_REKONSTRUIERT')).toHaveLength(1);
    });

    it('summiert den Hausverbrauch nur über Tanks mit in_verbrauch_auswertung', () => {
      const readings = [
        reading(mainMeter, '01.01.2026 00:00', 100),
        reading(mainMeter, '01.02.2026 00:00', 80),
        reading(auxiliaryMeter, '01.01.2026 00:00', 100),
        reading(auxiliaryMeter, '01.02.2026 00:00', 90),
      ];
      const meters = [mainMeter, auxiliaryMeter];

      expect(service.calculate(readings, auxiliaryMeter, [], 2026).includedInTotals).toBe(false);
      expect(service.totalLiters(readings, meters, [], 2026)).toBeCloseTo(20 * (10000 / 140));

      const release = [{
        objekt_id: 'Ra-HS-29', tank_id: 'ZUSATZTANK', volumen_l: 2000, max_fuellstand_cm: 140,
        in_verbrauch_auswertung: true,
      }];
      expect(service.totalLiters(readings, meters, release, 2026))
        .toBeCloseTo(20 * (10000 / 140) + 10 * (2000 / 140));
    });

    it('berücksichtigt Betankungen in totalLiters automatisch', () => {
      const fills = [
        reading(fillMeter, '01.01.2026 08:00', 1000),
        reading(fillMeter, '10.01.2026 12:00', 4000),
      ];
      const readings = [
        reading(mainMeter, '01.01.2026 08:00', 100),
        reading(mainMeter, '10.01.2026 14:00', 90),
        ...fills,
      ];

      expect(service.totalLiters(readings, [mainMeter], [], 2026))
        .toBeCloseTo(3000 + 10 * (10000 / 140), 0);
    });
  });
});

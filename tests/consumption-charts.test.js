import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const service = new Function(readFileSync(new URL('../consumption-charts.js', import.meta.url), 'utf8') + ';return consumptionChartService;')();
const meter = {objekt_id:'O1',einheit_id:'W1',zaehler_id:'Z1',medium:'strom_kwh',einheit_name:'Wohnung 1',bezeichnung:'Strom'};
const row = (monat, verbrauch_monat, extra={}) => ({...meter,jahr:Number(monat.slice(0,4)),monat,verbrauch_monat,...extra});

describe('Verbrauchsdiagramme', () => {
  it('aggregiert nur die richtige Objekt-/Einheit-/Zähleridentität pro Monat', () => {
    const series = service.monthlySeries([
      row('2026-02',2),row('2026-02',3),
      row('2026-02',999,{objekt_id:'O2'}),
      row('2026-03',7,{einheit_id:'W2'}),
      row('2025-02',44)
    ],meter,2026);
    expect(series[1].value).toBe(5);
    expect(series[2].value).toBe(null);
    expect(series[0].value).toBe(null);
  });
  it('unterscheidet echten Verbrauch null von fehlenden oder ausgeschlossenen Monaten', () => {
    const series = service.monthlySeries([
      row('2026-01',0),
      row('2026-02',''),
      row('2026-03',500,{in_summe_beruecksichtigen:false}),
      row('2026-04',6,{plausibilitaet_status:'WARNUNG'})
    ],meter,2026);
    expect(series[0].value).toBe(0);
    expect(series[1]).toEqual({value:null,flagged:true,derived:false});
    expect(series[2]).toEqual({value:500,flagged:true,derived:false});
    expect(series[3]).toEqual({value:6,flagged:true,derived:false});
  });
  it('aggregiert eigene Monatssegmente, nicht den Vorjahresverbrauch', () => {
    const series = service.monthlySeries([row('2025-01',5),row('2026-01',10)],meter,2025);
    expect(series[0].value).toBe(5);
  });
  it('verarbeitet auch nicht null aufgefüllte Monatswerte und deutsche Zeitstempel', () => {
    const html = service.render({
      meters:[meter],
      selectedKey:service.getMeterKey(meter),
      selectedYear:'2026',
      monthlyRows:[row('2026-1',10)],
      annualRows:[{...meter,jahr:2026,verbrauch_jahr:10}],
      readingRows:[
        {...meter,zeitstempel:'01.01.2026 12:30',wert:100},
        {...meter,zeitstempel:'01.02.2026 12:30',wert:110}
      ]
    });
    expect(html).toContain('Monatsverbrauch 2026 / 2025');
    expect(html).toContain('Zählerstandsverlauf');
    expect(html).toContain('<polyline');
    expect(html).toContain('2026: 10 kWh');
    expect(html).toContain('aria-label="Monatliche Verbrauchswerte"');
  });
  it('ordnet zweistellige Monatsnummern dem richtigen Monat zu', () => {
    const series = service.monthlySeries([
      row('2025-10', 10),
      row('2025-11', 20),
      row('2025-12', 30)
    ], meter, 2025);

    expect(series[0].value).toBe(null);
    expect(series[9].value).toBe(10);
    expect(series[10].value).toBe(20);
    expect(series[11].value).toBe(30);
  });
  it('verarbeitet deutsche Tausender- und Dezimaltrennzeichen', () => {
    const series = service.monthlySeries(
      [row('2025-01', '1.000,50')],
      meter,
      2025,
      { annualRow: { ...meter, jahr: 2025, verbrauch_jahr: '1.000,50' } }
    );

    expect(series[0].value).toBe(1000.5);
  });
  it('ordnet historisch dokumentierte Zähler-IDs dem aktuellen Zähler zu', () => {
    const currentMeter = {
      ...meter,
      zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
      audit: { source_keys: 'O1||W1||Z_STROM_HT_KWH_PRIVAT_HT' }
    };
    const html = service.render({
      meters: [currentMeter],
      selectedKey: service.getMeterKey(currentMeter),
      selectedYear: '2026',
      monthlyRows: [row('2026-1', 10, currentMeter)],
      annualRows: [{ ...currentMeter, jahr: 2026, verbrauch_jahr: 10 }],
      readingRows: [
        { ...currentMeter, zaehler_id: 'Z_STROM_HT_KWH_PRIVAT_HT', zeitstempel: '01.01.2026 12:30', wert: 100 },
        { ...currentMeter, zaehler_id: 'Z_STROM_HT_KWH_PRIVAT_HT', zeitstempel: '01.02.2026 12:30', wert: 110 }
      ]
    });
    expect(html).toContain('<polyline');
    expect(html).toContain('01.01.2026');
  });
  it('zeigt fehlende Jahre und entwertet sie nicht zu Null', () => {
    const s = service.annualSeries([{...meter,jahr:2024,verbrauch_jahr:78},{...meter,jahr:2026,verbrauch_jahr:122}],meter,2026);
    expect(s.map(v=>[v.year,v.value])).toEqual([[2024,78],[2025,null],[2026,122]]);
  });
  it('füllt historische Monatslücken aus dem Folgeintervall der Rohablesungen', () => {
    const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30];
    const monthlyRows = daysPerMonth.map((days, index) => row(`2025-${index + 1}`, 120 * days / 365));
    const series = service.monthlySeries(monthlyRows, meter, 2025, {
      annualRow: { ...meter, jahr: 2025, verbrauch_jahr: 120, anzahl_monate_mit_verbrauch: 12 },
      readingRows: [
        { ...meter, zeitstempel: '01.01.2025 00:00', wert: 100 },
        { ...meter, zeitstempel: '01.01.2026 00:00', wert: 220 }
      ]
    });

    expect(series).toHaveLength(12);
    expect(series.slice(0, 9).every(item => item.value !== null && item.derived === false)).toBe(true);
    expect(series.slice(9).every(item => item.value !== null && item.derived === true)).toBe(true);
    expect(series.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(120, 1);
  });
  it('verteilt einen historischen Jahresrest nur als gekennzeichneten Fallback', () => {
    const series = service.monthlySeries([row('2025-01', 10)], meter, 2025, {
      annualRow: { ...meter, jahr: 2025, verbrauch_jahr: 120, anzahl_monate_mit_verbrauch: 12 }
    });

    expect(series[0]).toEqual({ value: 10, flagged: false, derived: false });
    expect(series.slice(1).every(item => item.derived === true)).toBe(true);
    expect(series.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(120);
  });
  it('behandelt den Jahreswert als Prüfsumme, wenn Rohintervall und View abweichen', () => {
    const series = service.monthlySeries(
      Array.from({ length: 9 }, (_, index) => row(`2025-${index + 1}`, 10)),
      meter,
      2025,
      {
        annualRow: { ...meter, jahr: 2025, verbrauch_jahr: 100, anzahl_monate_mit_verbrauch: 12 },
        readingRows: [
          { ...meter, zeitstempel: '01.01.2025 00:00', wert: 100 },
          { ...meter, zeitstempel: '01.01.2026 00:00', wert: 220 }
        ]
      }
    );

    expect(series.slice(0, 9).every(item => item.value === 10)).toBe(true);
    expect(series.slice(9).every(item => item.derived === true)).toBe(true);
    expect(series.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(100);
  });
  it('gleicht vollständige historische Monatsreihen proportional mit dem Jahreswert ab', () => {
    const series = service.monthlySeries(
      Array.from({ length: 12 }, (_, index) => row(`2025-${index + 1}`, 10)),
      meter,
      2025,
      { annualRow: { ...meter, jahr: 2025, verbrauch_jahr: 100 } }
    );

    expect(series.every(item => item.value !== null && item.reconciled === true)).toBe(true);
    expect(series.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(100);
    expect(series[0].value).toBeCloseTo(100 / 12);
  });
  it('ergänzt im laufenden Jahr nur Monate aus vorhandenen Rohintervallen', () => {
    const currentYear = new Date().getFullYear();
    const series = service.monthlySeries([], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 20 },
      readingRows: [
        { ...meter, zeitstempel: `01.01.${currentYear} 00:00`, wert: 100 },
        { ...meter, zeitstempel: `01.03.${currentYear} 00:00`, wert: 120 }
      ]
    });

    expect(series[0].value).toBeGreaterThan(0);
    expect(series[0].fromReadings).toBe(true);
    expect(series[1].value).toBeGreaterThan(0);
    expect(series[1].fromReadings).toBe(true);
    expect(series.slice(2).every(item => item.value === null)).toBe(true);
    expect(series.slice(0, 2).reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(20);
  });
  it('gleicht das laufende Jahr nur für den belegten Zeitraum mit der Jahresview ab', () => {
    const currentYear = new Date().getFullYear();
    const series = service.monthlySeries([row(`${currentYear}-01`, 8)], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 20, anzahl_monate_mit_verbrauch: 2 },
      readingRows: [
        { ...meter, zeitstempel: `01.01.${currentYear} 00:00`, wert: 100 },
        { ...meter, zeitstempel: `01.03.${currentYear} 00:00`, wert: 120 }
      ]
    });

    expect(series[0].reconciled).toBe(true);
    expect(series[1].reconciled).toBe(true);
    expect(series.slice(2).every(item => item.value === null)).toBe(true);
    expect(series.slice(0, 2).reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(20);
  });
  it('ergänzt ein belegtes laufendes Segment aus dem Jahresrest, aber keine Zukunft', () => {
    const currentYear = new Date().getFullYear();
    const series = service.monthlySeries([
      row(`${currentYear}-01`, 8),
      row(`${currentYear}-02`, '')
    ], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 20, anzahl_monate_mit_verbrauch: 2 },
      readingRows: [
        { ...meter, zeitstempel: `01.01.${currentYear} 00:00`, wert: 100 },
        { ...meter, zeitstempel: `01.03.${currentYear} 00:00`, wert: 90 }
      ]
    });

    expect(series[1].fromAnnual).toBe(true);
    expect(series[1].flagged).toBe(true);
    expect(series[0].value + series[1].value).toBeCloseTo(20);
    expect(series.slice(2).every(item => item.value === null)).toBe(true);
  });
  it('prognostiziert im laufenden Jahr keine fehlenden Zukunftsmonate', () => {
    const currentYear = new Date().getFullYear();
    const series = service.monthlySeries([row(`${currentYear}-01`, 10)], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 120, anzahl_monate_mit_verbrauch: 12 }
    });

    expect(series[0]).toEqual({ value: 10, flagged: false, derived: false });
    expect(series.slice(1).every(item => item.value === null && item.derived === false)).toBe(true);
  });
  it('rendert Vorjahresvergleich ohne fehlende Monate als Null zu behaupten', () => {
    const html = service.render({meters:[meter],selectedKey:service.getMeterKey(meter),selectedYear:'2026',
      monthlyRows:[row('2025-01',30),row('2026-01',42)],
      annualRows:[{...meter,jahr:2025,verbrauch_jahr:30},{...meter,jahr:2026,verbrauch_jahr:42}]});
    expect(html).toContain('Monatsverbrauch 2026 / 2025');
    expect(html).toContain('Jahresentwicklung');
    expect(html).toContain('role="img"');
    expect(html).toContain('Fehlende Monate');
    expect(html).toContain('2026: 42 kWh');
    expect((html.match(/aria-label="Monatliche Verbrauchswerte"/g) || [])).toHaveLength(1);
    expect(html).not.toContain('undefined');
  });
  it('entwertet HTML in Zählerbezeichnungen', () => {
    const dangerous = {...meter,bezeichnung:'<script>test</script>'};
    const html = service.render({meters:[dangerous],selectedYear:2026});
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

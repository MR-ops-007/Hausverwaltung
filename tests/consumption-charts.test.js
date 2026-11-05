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
  it('ordnet UTC-Monatsgrenzen nach deutscher Lokalzeit dem richtigen Verbrauchsjahr zu', () => {
    const rows = [
      { ...meter, jahr: 2026, monat: '2025-12-31T23:00:00.000Z', verbrauch_monat: 10 },
      { ...meter, jahr: 2026, monat: '2026-01-31T23:00:00.000Z', verbrauch_monat: 20 },
      { ...meter, jahr: 2026, monat: '2026-02-28T23:00:00.000Z', verbrauch_monat: 30 }
    ];
    const series = service.monthlySeries(rows, meter, 2026);

    expect(series[0].value).toBe(10);
    expect(series[1].value).toBe(20);
    expect(series[2].value).toBe(30);
    expect(series.reduce((sum, item) => sum + (item.value || 0), 0)).toBe(60);
  });
  it('behält mehrere UTC-Segmente am lokalen Jahresanfang im Ölverlauf', () => {
    const oilMeter = { ...meter, medium: 'oel_stand_cm' };
    const rows = [
      { ...oilMeter, jahr: 2026, monat: '2025-12-31T23:00:00.000Z', verbrauch_monat: 0 },
      { ...oilMeter, jahr: 2026, monat: '2025-12-31T23:00:00.000Z', verbrauch_monat: 11.92 },
      { ...oilMeter, jahr: 2026, monat: '2026-01-31T23:00:00.000Z', verbrauch_monat: 13.9 }
    ];
    const series = service.monthlySeries(rows, oilMeter, 2026);

    expect(series[0].value).toBeCloseTo(11.92);
    expect(series[1].value).toBeCloseTo(13.9);
  });
  it('verarbeitet deutsche Tausender- und Dezimaltrennzeichen', () => {
    const series = service.monthlySeries(
      [row('2025-01', '1.000,50')],
      meter,
      2025,
      { annualRow: { ...meter, jahr: 2025, verbrauch_jahr: '1.000,50' } }
    );

    expect(series[0].value).toBe(1000.5);
    // JSON-Zahlen bleiben numerisch; ein punktgetrennter String ist ohne
    // Locale-Metadaten mehrdeutig und wird deshalb als Dezimalzahl gelesen.
    expect(service.toNumber(1040)).toBe(1040);
    expect(service.toNumber('1.040')).toBeCloseTo(1.04);
    expect(service.toNumber('1.040,82')).toBeCloseTo(1040.82);
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
  it('verwendet source_keys auch direkt aus einer View-Zeile für historische Alias-IDs', () => {
    const currentMeter = {
      ...meter,
      zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
      source_keys: 'O1||W1||Z_STROM_HT_KWH_PRIVAT_HT'
    };
    const series = service.monthlySeries([
      {
        ...meter,
        zaehler_id: 'Z_STROM_HT_KWH_PRIVAT_HT',
        source_keys: 'O1||W1||Z_STROM_HT_KWH_PRIVAT_HT',
        jahr: 2026,
        monat: '2026-01',
        verbrauch_monat: 10
      }
    ], currentMeter, 2026);

    expect(series[0].value).toBe(10);
  });
  it('führt einen historischen Alias nicht über eine andere Einheit zusammen', () => {
    const currentMeter = {
      ...meter,
      zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
      audit: { source_keys: 'O1||W1||Z_STROM_HT_KWH_PRIVAT_HT' }
    };
    const series = service.monthlySeries([
      { ...currentMeter, einheit_id: 'W2', zaehler_id: 'Z_STROM_HT_KWH_PRIVAT_HT', jahr: 2026, monat: '2026-01', verbrauch_monat: 99 }
    ], currentMeter, 2026);

    expect(series[0].value).toBe(null);
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
    expect(series.slice(9).every(item => item.value !== null && item.fromReadings === true && item.derived === false)).toBe(true);
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
  it('füllt historische Monate bei ausgeschöpftem Jahreswert nicht mit künstlichen Nullen', () => {
    const series = service.monthlySeries(
      Array.from({ length: 8 }, (_, index) => row(`2025-${index + 1}`, 100)),
      meter,
      2025,
      { annualRow: { ...meter, jahr: 2025, verbrauch_jahr: 800, anzahl_monate_mit_verbrauch: 8 } }
    );

    expect(series.slice(0, 8).every(item => item.value === 100)).toBe(true);
    expect(series.slice(8).every(item => item.value === null && item.derived === false)).toBe(true);
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
    expect(series.slice(9).every(item => item.derived === true && item.fromReadings !== true)).toBe(true);
    expect(series.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(100);
  });
  it('markiert größere Abweichungen statt gemessene Monatswerte zu skalieren', () => {
    const series = service.monthlySeries(
      Array.from({ length: 12 }, (_, index) => row(`2025-${index + 1}`, 10)),
      meter,
      2025,
      { annualRow: { ...meter, jahr: 2025, verbrauch_jahr: 126 } }
    );

    expect(series.every(item => item.value === 10 && item.reconciled !== true && item.flagged === true)).toBe(true);
    expect(series.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(120);
  });
  it('kennzeichnet große Abweichungen auch in den sichtbaren Monatswerten', () => {
    const html = service.render({
      meters: [meter],
      selectedKey: service.getMeterKey(meter),
      selectedYear: '2025',
      monthlyRows: Array.from({ length: 12 }, (_, index) => row(`2025-${index + 1}`, 10)),
      annualRows: [{ ...meter, jahr: 2025, verbrauch_jahr: 126 }]
    });

    expect(html).toContain('2025: 10 kWh · Prüfhinweis');
  });
  it('behält die Teilmonatsinformation intern, zeigt sie aber nicht als eigene UI-Kategorie', () => {
    const series = service.monthlySeries([
      row('2026-06', 12, { tage_im_monat: 2 })
    ], meter, 2026);
    const html = service.render({
      meters: [meter],
      selectedKey: service.getMeterKey(meter),
      selectedYear: '2026',
      monthlyRows: [row('2026-06', 12, { tage_im_monat: 2 })],
      annualRows: [{ ...meter, jahr: 2026, verbrauch_jahr: 12 }]
    });

    expect(series[5]).toMatchObject({ value: 12, partial: true });
    expect(html).toContain('2026: 12 kWh');
    expect(html).not.toContain('Teilmonat');
  });
  it('verknüpft die Jahresauswahl der Statistik mit der Dashboard-Auswahl', () => {
    const html = service.render({
      meters: [meter],
      selectedKey: service.getMeterKey(meter),
      selectedYear: '2026',
      monthlyRows: [row('2025-01', 30), row('2026-01', 42)],
      annualRows: [
        { ...meter, jahr: 2025, verbrauch_jahr: 30 },
        { ...meter, jahr: 2026, verbrauch_jahr: 42 }
      ]
    });

    expect(html).toContain('id="consumption-chart-year-select"');
    expect(html).toContain('<option value="2026" selected>2026</option>');
    expect(html).toContain("yearSelect.value=this.value");
  });
  it('verschweigt rückläufige Rohintervalle nicht im Diagramm', () => {
    const now = new Date(2026, 10, 4);
    const series = service.monthlySeries([], meter, 2026, {
      now,
      readingRows: [
        { ...meter, zeitstempel: '01.01.2026 00:00', wert: 100 },
        { ...meter, zeitstempel: '01.02.2026 00:00', wert: 90 }
      ]
    });
    const html = service.render({
      meters: [meter],
      selectedKey: service.getMeterKey(meter),
      selectedYear: '2026',
      readingRows: [
        { ...meter, zeitstempel: '01.01.2026 00:00', wert: 100 },
        { ...meter, zeitstempel: '01.02.2026 00:00', wert: 90 }
      ],
      now
    });

    expect(series[0]).toMatchObject({ value: null, flagged: true, invalidReading: true });
    expect(html).toContain('Rückläufiger Zählerstand erkannt');
  });
  it('gleicht kleine Abweichungen transparent ab und markiert sie', () => {
    const series = service.monthlySeries(
      Array.from({ length: 12 }, (_, index) => row(`2025-${index + 1}`, 100)),
      meter,
      2025,
      { annualRow: { ...meter, jahr: 2025, verbrauch_jahr: 1201.2 } }
    );

    expect(series.every(item => item.value !== null && item.reconciled === true && item.flagged === true)).toBe(true);
    expect(series.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(1201.2);
  });
  it('ergänzt im laufenden Jahr nur Monate aus vorhandenen Rohintervallen', () => {
    const currentYear = 2026;
    const now = new Date(2026, 10, 3);
    const series = service.monthlySeries([], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 20 },
      now,
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
  it('markiert eine größere Abweichung im laufenden Jahr statt sie zu skalieren', () => {
    const currentYear = 2026;
    const now = new Date(2026, 10, 3);
    const series = service.monthlySeries([row(`${currentYear}-01`, 8)], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 20, anzahl_monate_mit_verbrauch: 2 },
      now,
      readingRows: [
        { ...meter, zeitstempel: `01.01.${currentYear} 00:00`, wert: 100 },
        { ...meter, zeitstempel: `01.03.${currentYear} 00:00`, wert: 120 }
      ]
    });

    expect(series[0].reconciled).not.toBe(true);
    expect(series[1].reconciled).not.toBe(true);
    expect(series[0].flagged).toBe(true);
    expect(series[1].flagged).toBe(true);
    expect(series.slice(2).every(item => item.value === null)).toBe(true);
    expect(series.slice(0, 2).reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(17.49, 1);
  });
  it('markiert eine laufende Abweichung auch ohne Monatsanzahl als Prüfhinweis', () => {
    const currentYear = 2026;
    const series = service.monthlySeries([row(`${currentYear}-01`, 800)], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 1300 },
      now: new Date(2026, 10, 3)
    });

    expect(series[0].value).toBe(800);
    expect(series[0].flagged).toBe(true);
    expect(series[0].reconciled).not.toBe(true);
  });
  it('erzeugt bei einem ausgeschöpften laufenden Jahresrest keine Nullmonate', () => {
    const currentYear = 2026;
    const series = service.monthlySeries([
      ...Array.from({ length: 8 }, (_, index) => row(`${currentYear}-${index + 1}`, 100)),
      row(`${currentYear}-09`, ''),
      row(`${currentYear}-10`, '')
    ], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 800, anzahl_monate_mit_verbrauch: 10 },
      now: new Date(2026, 10, 3)
    });

    expect(series.slice(0, 8).every(item => item.value === 100)).toBe(true);
    expect(series[8]).toMatchObject({ value: null, flagged: true, derived: false });
    expect(series[9]).toMatchObject({ value: null, flagged: true, derived: false });
    expect(series[8].fromAnnual).not.toBe(true);
    expect(series[9].fromAnnual).not.toBe(true);
  });
  it('ergänzt ein belegtes laufendes Segment aus dem Jahresrest, aber keine Zukunft', () => {
    const currentYear = 2026;
    const now = new Date(2026, 10, 3);
    const series = service.monthlySeries([
      row(`${currentYear}-01`, 8),
      row(`${currentYear}-02`, '')
    ], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 20, anzahl_monate_mit_verbrauch: 2 },
      now,
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
    const currentYear = 2026;
    const now = new Date(2026, 10, 3);
    const series = service.monthlySeries([row(`${currentYear}-01`, 10)], meter, currentYear, {
      annualRow: { ...meter, jahr: currentYear, verbrauch_jahr: 120, anzahl_monate_mit_verbrauch: 12 },
      now
    });

    expect(series[0]).toEqual({ value: 10, flagged: true, derived: false });
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
  it('unterbricht Linien an fehlenden Monaten und zeigt im Balkenmodus beide Jahre', () => {
    const html = service.render({
      meters: [meter],
      selectedKey: service.getMeterKey(meter),
      selectedYear: '2026',
      monthlyRows: [row('2025-01', 30), row('2025-03', 50), row('2026-01', 42)],
      annualRows: [
        { ...meter, jahr: 2025, verbrauch_jahr: 80 },
        { ...meter, jahr: 2026, verbrauch_jahr: 42 }
      ]
    });
    const lineCount = (html.match(/<polyline /g) || []).length;
    // Die verbleibende Linie gehört zur Jahresentwicklung; die Monatsreihe
    // besitzt wegen der Lücke keine verbindende Linie.
    expect(lineCount).toBe(1);

    const barHtml = service.render({
      meters: [meter],
      selectedKey: service.getMeterKey(meter),
      selectedYear: '2026',
      mode: 'bar',
      monthlyRows: [row('2025-01', 30), row('2026-01', 42)],
      annualRows: [
        { ...meter, jahr: 2025, verbrauch_jahr: 30 },
        { ...meter, jahr: 2026, verbrauch_jahr: 42 }
      ]
    });
    expect(barHtml).toContain('2026: 42 kWh');
    expect(barHtml).toContain('2025: 30 kWh');
  });
  it('entwertet HTML in Zählerbezeichnungen', () => {
    const dangerous = {
      ...meter,
      medium: 'unknown',
      einheit: '<img src=x onerror=alert(1)>',
      bezeichnung: '<script>test</script>'
    };
    const html = service.render({
      meters: [dangerous],
      selectedKey: service.getMeterKey(dangerous),
      selectedYear: 2026,
      monthlyRows: [row('2026-01', 10, dangerous)],
      annualRows: [{ ...dangerous, jahr: 2026, verbrauch_jahr: 10 }],
      readingRows: [
        { ...dangerous, zeitstempel: '01.01.2026 12:30', wert: 100 },
        { ...dangerous, zeitstempel: '01.02.2026 12:30', wert: 110 }
      ]
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });
});

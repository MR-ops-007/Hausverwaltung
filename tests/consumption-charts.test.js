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
    expect(series[1]).toEqual({value:null,flagged:true});
    expect(series[2]).toEqual({value:null,flagged:true});
    expect(series[3]).toEqual({value:6,flagged:true});
  });
  it('aggregiert eigene Monatssegmente, nicht den Vorjahresverbrauch', () => {
    const series = service.monthlySeries([row('2025-01',5),row('2026-01',10)],meter,2025);
    expect(series[0].value).toBe(5);
  });
  it('zeigt fehlende Jahre und entwertet sie nicht zu Null', () => {
    const s = service.annualSeries([{...meter,jahr:2024,verbrauch_jahr:78},{...meter,jahr:2026,verbrauch_jahr:122}],meter,2026);
    expect(s.map(v=>[v.year,v.value])).toEqual([[2024,78],[2025,null],[2026,122]]);
  });
  it('rendert Vorjahresvergleich ohne fehlende Monate als Null zu behaupten', () => {
    const html = service.render({meters:[meter],selectedKey:service.getMeterKey(meter),selectedYear:'2026',
      monthlyRows:[row('2025-01',30),row('2026-01',42)],
      annualRows:[{...meter,jahr:2025,verbrauch_jahr:30},{...meter,jahr:2026,verbrauch_jahr:42}]});
    expect(html).toContain('Monatsverbrauch 2026 / 2025');
    expect(html).toContain('Jahresentwicklung');
    expect(html).toContain('role="img"');
    expect(html).toContain('Fehlende Monate');
    expect(html).not.toContain('undefined');
  });
  it('entwertet HTML in Zählerbezeichnungen', () => {
    const dangerous = {...meter,bezeichnung:'<script>test</script>'};
    const html = service.render({meters:[dangerous],selectedYear:2026});
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

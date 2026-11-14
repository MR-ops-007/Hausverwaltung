/* Reusable synthetic consumption data for the local Entenhausen environment. */

const meters = [
  { zaehler_id: 'Z_TEST_STROM_1', objekt_id: 'TEST', einheit_id: 'TEST_WE_01', medium: 'Strom', einheit: 'kWh', bezeichnung: 'Strom Wohnung 1', verbrauchsgruppe: 'Wohnungen' },
  { zaehler_id: 'Z_TEST_STROM_2', objekt_id: 'TEST', einheit_id: 'TEST_WE_02', medium: 'Strom', einheit: 'kWh', bezeichnung: 'Strom Wohnung 2', verbrauchsgruppe: 'Wohnungen' },
  { zaehler_id: 'Z_TEST_STROM_3', objekt_id: 'TEST', einheit_id: 'TEST_WE_03', medium: 'Strom', einheit: 'kWh', bezeichnung: 'Strom Wohnung 3', verbrauchsgruppe: 'Wohnungen' },
  { zaehler_id: 'Z_TEST_KW_1', objekt_id: 'TEST', einheit_id: 'TEST_WE_01', medium: 'Kaltwasser', einheit: 'm³', bezeichnung: 'Kaltwasser Wohnung 1', verbrauchsgruppe: 'Wohnungen' },
  { zaehler_id: 'Z_TEST_WW_1', objekt_id: 'TEST', einheit_id: 'TEST_WE_01', medium: 'Warmwasser', einheit: 'm³', bezeichnung: 'Warmwasser Wohnung 1', verbrauchsgruppe: 'Wohnungen' },
  { zaehler_id: 'Z_TEST_OEL_HAUPT', objekt_id: 'TEST', einheit_id: 'TEST_Allgemein', medium: 'Öl', einheit: 'l', bezeichnung: 'Heizöl Haupttank', verbrauchsgruppe: 'Allgemein' }
];

const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

function monthlyValue(meter, year, month) {
  const seasonal = [1.18, 1.08, 1.02, 0.96, 0.9, 0.86, 0.82, 0.86, 0.94, 1.02, 1.1, 1.18][month - 1];
  const yearFactor = year === 2025 ? 0.96 : 1;
  const unitNumber = Number(String(meter.einheit_id).match(/(\d+)/)?.[1] || 1);
  const meterSeed = [...meter.zaehler_id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const apartmentFactor = 0.9 + ((unitNumber * 17 + meterSeed) % 23) / 100;
  const monthlyVariation = 0.96 + ((month * 13 + unitNumber * 7 + meterSeed) % 9) / 100;
  const base = meter.zaehler_id.includes('STROM_1') ? 320
    : meter.zaehler_id.includes('STROM_2') ? 285
      : meter.zaehler_id.includes('STROM_3') ? 260
        : meter.zaehler_id.includes('KW_1') ? 5.2
          : meter.zaehler_id.includes('WW_1') ? 3.6
            : 210;
  return Math.round(base * seasonal * yearFactor * apartmentFactor * monthlyVariation * 100) / 100;
}

export function createMockConsumptionData() {
  const monthly = [];
  const annual = [];
  const audits = [];
  const balances = [];
  const readings = [];

  meters.forEach((meter, meterIndex) => {
    [2025, 2026].forEach(year => {
      const lastMonth = year === 2026 ? 11 : 12;
      const rows = [];
      for (let month = 1; month <= lastMonth; month++) {
        if (meter.zaehler_id === 'Z_TEST_WW_1' && year === 2026 && month === 4) continue;
        const value = monthlyValue(meter, year, month);
        const row = {
          ...meter,
          jahr: year,
          monat: monthKey(year, month),
          verbrauch_monat: value,
          status: meter.zaehler_id === 'Z_TEST_STROM_3' && year === 2026 && month === 5 ? 'PRUEFEN' : 'OK',
          quelle: 'Mock-Fixture'
        };
        monthly.push(row);
        rows.push(row);
        readings.push({
          stand_id: `ST_${meter.zaehler_id}_${year}_${String(month).padStart(2, '0')}`,
          objekt_id: meter.objekt_id,
          einheit_id: meter.einheit_id,
          zaehler_id: meter.zaehler_id,
          zeitstempel: `${year}-${String(month).padStart(2, '0')}-28 12:00`,
          wert: Math.round(rows.reduce((sum, item) => sum + item.verbrauch_monat, 0) * 100) / 100,
          quelle: 'Mock-Fixture'
        });
      }
      const total = rows.reduce((sum, row) => sum + row.verbrauch_monat, 0);
      annual.push({
        ...meter,
        jahr: year,
        verbrauch_jahr: Math.round(total * 100) / 100,
        verbrauch_monat_durchschnitt: Math.round((total / rows.length) * 100) / 100,
        anzahl_monate_mit_verbrauch: rows.length,
        status: rows.some(row => row.status !== 'OK') ? 'PRUEFEN' : 'OK',
        quelle: 'Mock-Fixture'
      });
    });
  });

  audits.push({
    objekt_id: 'TEST', einheit_id: 'TEST_WE_03', zaehler_id: 'Z_TEST_STROM_3', medium: 'Strom', jahr: 2026,
    status: 'PRUEFEN', plausibilitaet_status: 'WARNUNG', hinweis: 'Mai liegt deutlich über dem üblichen Monatswert. Bitte Rohablesung prüfen.',
    readings_count: 11, intervalle_count: 10, monatszeilen: 11
  });
  audits.push({
    objekt_id: 'TEST', einheit_id: 'TEST_WE_01', zaehler_id: 'Z_TEST_WW_1', medium: 'Warmwasser', jahr: 2026,
    status: 'KEINE_ABLESUNG', plausibilitaet_status: 'INFO', hinweis: 'Für April liegt keine Rohablesung vor.',
    readings_count: 10, intervalle_count: 9, monatszeilen: 10
  });

  [
    ['Strom', 'kWh', 'Wohnungen'], ['Kaltwasser', 'm³', 'Wohnungen'], ['Warmwasser', 'm³', 'Wohnungen'], ['Öl', 'l', 'Allgemein']
  ].forEach(([medium, einheit, gruppe]) => [2025, 2026].forEach(year => {
    const rows = annual.filter(row => row.medium === medium && row.einheit === einheit && row.verbrauchsgruppe === gruppe && row.jahr === year);
    balances.push({ objekt_id: 'TEST', jahr: year, medium, einheit, verbrauchsgruppe: gruppe, bezeichnung: `${medium} · ${gruppe}`, verbrauch_jahr: Math.round(rows.reduce((sum, row) => sum + Number(row.verbrauch_jahr || 0), 0) * 100) / 100, status: 'OK', quelle: 'Mock-Fixture' });
  }));

  return {
    zaehler: meters.map(meter => ({ ...meter, aktiv: true, erfassbar: true })),
    zaehlerstaende: readings,
    _view_verbrauch_monat: monthly,
    _view_verbrauch_jahr: annual,
    _view_verbrauch_audit: audits,
    _view_verbrauch_bilanz_jahr: balances
  };
}

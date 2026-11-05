import { describe, expect, it } from 'vitest';
import { buildMatrixReport, parseSnapshotText, selectSnapshotPayload } from '../tools/qa-consumption-matrix.mjs';

const meter = {
  objekt_id: 'O1',
  einheit_id: 'W1',
  zaehler_id: 'Z1',
  medium: 'strom_kwh',
  bezeichnung: 'Strom'
};

const month = (monat, value, extra = {}) => ({
  ...meter,
  jahr: Number(monat.slice(0, 4)),
  monat,
  verbrauch_monat: value,
  ...extra
});

describe('QA-Matrix Verbrauchsstatistik', () => {
  it('weist eine HTML-Fehlerseite als ungültigen Snapshot aus', () => {
    expect(() => parseSnapshotText('<!DOCTYPE html><html><body>Seite nicht gefunden</body></html>'))
      .toThrow(/HTML statt JSON/);
  });

  it('zeigt Backend-Fehlerantworten ohne sensible Inhalte verständlich an', () => {
    expect(() => parseSnapshotText(JSON.stringify({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Zugangsschlüssel fehlt oder ist falsch.'
    }))).toThrow(/Code=UNAUTHORIZED.*Zugangsschlüssel fehlt/);
  });

  it('akzeptiert einen Snapshot mit den erwarteten Verbrauchsviews', () => {
    const payload = parseSnapshotText(JSON.stringify({
      _view_verbrauch_monat: [],
      _view_verbrauch_jahr: [],
      _view_verbrauch_audit: [],
      _view_verbrauch_bilanz_jahr: []
    }));

    expect(payload._view_verbrauch_jahr).toEqual([]);
  });

  it('reduziert einen Rohdaten-Snapshot auf die für die QA benötigten Tabellen', () => {
    const payload = selectSnapshotPayload({
      _view_verbrauch_monat: [],
      _view_verbrauch_jahr: [],
      _view_verbrauch_audit: [],
      _view_verbrauch_bilanz_jahr: [],
      Zaehler: [{ zaehler_id: 'Z1' }],
      Zaehlerstaende: [{ zaehler_id: 'Z1', wert: 1 }],
      Personen: [{ person_id: 1 }],
      Vertraege: [{ vertrag_id: 1 }]
    }, { includeRaw: true });

    expect(Object.keys(payload).sort()).toEqual([
      'Zaehler',
      'Zaehlerstaende',
      '_view_verbrauch_audit',
      '_view_verbrauch_bilanz_jahr',
      '_view_verbrauch_jahr',
      '_view_verbrauch_monat'
    ]);
    expect(payload.Personen).toBeUndefined();
  });

  it('unterscheidet Monatsintervalle von fehlenden Monatsablesungen', () => {
    const report = buildMatrixReport({
      Zaehler: [meter],
      _view_verbrauch_monat: [month('2026-01', 12)],
      _view_verbrauch_jahr: [{ ...meter, jahr: 2026, verbrauch_jahr: 12 }]
    }, { years: [2026], now: new Date(2026, 10, 4) });

    expect(report.total).toBe(1);
    expect(report.compared).toBe(1);
    expect(report.rawMatchWithoutAdjustment).toBe(1);
    expect(report.displayedComparable).toBe(1);
    expect(report.displayedMatchesAnnual).toBe(1);
    expect(report.displayedDifferencesExplained).toBe(0);
    expect(report.displayedDifferencesUnexplained).toBe(0);
    expect(report.combinations[0].displayedDifference).toBe(0);
    expect(report.combinations[0].displayedDifferenceClass).toBe('match');
    expect(report.monthlyWithoutAnnual).toBe(0);
    expect(report.annualMatchesExactKey).toBe(1);
  });

  it('führt historische Alias-IDs bei Monats- und Jahreswerten zusammen', () => {
    const currentMeter = {
      ...meter,
      zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
      audit: { source_keys: 'O1||W1||Z_STROM_HT_KWH_PRIVAT_HT' }
    };
    const report = buildMatrixReport({
      Zaehler: [currentMeter],
      _view_verbrauch_monat: [{ ...meter, zaehler_id: 'Z_STROM_HT_KWH_PRIVAT_HT', jahr: 2025, monat: '2025-01', verbrauch_monat: 10 }],
      _view_verbrauch_jahr: [{ ...currentMeter, jahr: 2025, verbrauch_jahr: 10 }]
    }, { years: [2025], now: new Date(2026, 10, 4) });

    expect(report.compared).toBe(1);
    expect(report.monthlyWithoutAnnual).toBe(0);
    expect(report.annualMatchesExactKey).toBe(1);
  });
  it('prüft mehrere Objekte wie LOK und TEST getrennt voneinander', () => {
    const lok = { ...meter, objekt_id: 'LOK', einheit_id: 'LOK_WE_10_A', zaehler_id: 'Z_LOK_WE_10_A_strom_ht_kwh' };
    const test = { ...meter, objekt_id: 'TEST', einheit_id: 'TEST_WE_01', zaehler_id: 'Z_TEST_WE_01_strom_ht_kwh' };
    const report = buildMatrixReport({
      Zaehler: [lok, test],
      _view_verbrauch_monat: [
        { ...lok, jahr: 2026, monat: '2026-01', verbrauch_monat: 11 },
        { ...test, jahr: 2026, monat: '2026-01', verbrauch_monat: 7 }
      ],
      _view_verbrauch_jahr: [
        { ...lok, jahr: 2026, verbrauch_jahr: 11 },
        { ...test, jahr: 2026, verbrauch_jahr: 7 }
      ]
    }, { years: [2026], now: new Date(2026, 10, 4) });

    expect(report.total).toBe(2);
    expect(report.compared).toBe(2);
    expect(report.combinations.map(item => item.objekt_id).sort()).toEqual(['LOK', 'TEST']);
    expect(report.combinations.every(item => item.displayedDifference === 0)).toBe(true);
  });

  it('weist große Rohabweichungen aus, ohne sie durch die UI-Abstimmung zu verstecken', () => {
    const report = buildMatrixReport({
      Zaehler: [meter],
      _view_verbrauch_monat: Array.from({ length: 12 }, (_, index) => month(`2025-${index + 1}`, 10)),
      _view_verbrauch_jahr: [{ ...meter, jahr: 2025, verbrauch_jahr: 126 }]
    }, { years: [2025], now: new Date(2026, 10, 4) });

    expect(report.compared).toBe(1);
    expect(report.rawMatchWithoutAdjustment).toBe(0);
    expect(report.smallReconciliation).toBe(0);
    expect(report.largeMismatch).toBe(1);
    expect(report.combinations[0].rawDifference).toBe(6);
    expect(report.combinations[0].displayedDifference).toBe(6);
    expect(report.displayedDifferencesUnexpectedWithMarker).toBe(1);
    expect(report.displayedDifferencesExplained).toBe(0);
    expect(report.displayedDifferencesUnexplained).toBe(0);
    expect(report.combinations[0].displayedDifferenceClass).toBe('unexpected_with_marker');
  });

  it('trennt angezeigte Abweichungen mit dokumentierter Ergänzung von ungeklärten Abweichungen', () => {
    const report = buildMatrixReport({
      Zaehler: [meter],
      _view_verbrauch_monat: [month('2026-01', 10)],
      _view_verbrauch_jahr: [{ ...meter, jahr: 2026, verbrauch_jahr: 20, anzahl_monate_mit_verbrauch: 2 }],
      Zaehlerstaende: [
        { ...meter, zeitstempel: '01.01.2026 00:00', wert: 100 },
        { ...meter, zeitstempel: '01.03.2026 00:00', wert: 110 }
      ]
    }, { years: [2026], now: new Date(2026, 2, 4) });

    expect(report.displayedComparable).toBe(1);
    expect(report.displayedDifferencesExplained).toBe(1);
    expect(report.displayedDifferencesUnexplained).toBe(0);
    expect(report.combinations[0].displayedDifference).toBeGreaterThan(0);
    expect(report.displayedReadingsOutsideRelativeThreshold).toBe(1);
    expect(report.combinations[0].displayedDifferenceClass).toBe('explained_by_readings');
    expect(report.combinations[0].fromReadings).toBe(true);
  });

  it('weist fehlende Jahreszuordnung als diagnostizierbaren Schlüsselbefund aus', () => {
    const report = buildMatrixReport({
      Zaehler: [meter],
      _view_verbrauch_monat: [month('2025-01', 10)],
      _view_verbrauch_jahr: [{ ...meter, zaehler_id: 'Z1_ALT', jahr: 2025, verbrauch_jahr: 10 }]
    }, { years: [2025], now: new Date(2026, 10, 4) });

    expect(report.monthlyWithoutAnnual).toBe(1);
    expect(report.annualMatchesNone).toBe(1);
    expect(report.combinations[0].monthlyWithoutAnnualReason)
      .toBe('KEINE_JAHRESZEILE_UNTER_EXAKTEM_ODER_ALIAS_SCHLUESSEL');
  });

  it('verwechselt einen View-Snapshot ohne Rohablesungen nicht mit einem leeren Verlauf', () => {
    const report = buildMatrixReport({
      Zaehler: [meter],
      _view_verbrauch_monat: [month('2025-01', 10)],
      _view_verbrauch_jahr: [{ ...meter, jahr: 2025, verbrauch_jahr: 10 }]
    }, { years: [2025] });

    expect(report.rawReadingsAvailable).toBe(false);
    expect(report.lineEmptyWithMonthly).toBe(0);
    expect(report.lineCheckUnavailable).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function loadAppsScriptHelpers() {
  const code = readFileSync(
    new URL('../apps-script/Code.gs', import.meta.url),
    'utf8'
  );
  const standIdMigrationCode = readFileSync(
    new URL('../apps-script/StandIdMigration.gs', import.meta.url),
    'utf8'
  );

  const factory = new Function(
    `${code}; ${standIdMigrationCode}; return { BACKEND_VERSION, analyzeCanonicalZaehlerstandMigrationRows, analyzeStandIdDuplicateRows, analyzeStandIdMigrationRows, appendIfMissingByKeys, buildExistingEinheitMappingFromRows, buildLokZaehlerId, buildMigratedZaehlerstandItem, buildStandId, buildVerbrauchViewData, calculateVerbrauchDifference, deactivateObsoleteLokShortCodeMeters, deriveEinheitIdFromLegacyZaehlerId, formatStandIdTimestamp, getHistoricalCalculatedConsumptionMeterSeedDataFromRows, getHistoricalCalculatedMeterSeedData, getItemValueForHeader, getLokEinheitEntranceMapping, getLokEinheitSeedData, getLokReplacementZaehlerId, getLokSeedData, getMieterNameForVertrag, getProdTestSeedData, normalizeZaehlerstandItem };`
  );

  return factory();
}

describe('Apps Script Zaehlerstaende helpers', () => {
  it('declares the current backend version', () => {
    const { BACKEND_VERSION } = loadAppsScriptHelpers();

    expect(BACKEND_VERSION).toBe('4.6.3');
  });

  it('formats German timestamps for stand_id values', () => {
    const { formatStandIdTimestamp } = loadAppsScriptHelpers();

    expect(formatStandIdTimestamp('02.06.2026 00:00')).toBe('2026-06-02 00:00');
    expect(formatStandIdTimestamp('2.6.2026 9:05')).toBe('2026-06-02 09:05');
  });

  it('formats JavaScript date strings for stand_id values', () => {
    const { formatStandIdTimestamp } = loadAppsScriptHelpers();

    const result = formatStandIdTimestamp(
      'Tue Jun 02 2026 00:00:00 GMT+0200 (Central European Summer Time)'
    );

    expect(result).toBe('2026-06-02 00:00');
  });

  it('builds monthly and yearly consumption view rows from meter intervals', () => {
    const { buildVerbrauchViewData } = loadAppsScriptHelpers();

    const views = buildVerbrauchViewData(
      {
        Zaehler: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            medium: 'strom_ht_kwh',
            bezeichnung: 'Strom Wohnung 1',
            einheit: 'kWh',
            einbauort: 'Wohnung',
            ueberlauf_erlaubt: false,
            berechnet: false,
          },
        ],
        Zaehlerstaende: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            zeitstempel: '01.11.2023 00:00',
            wert: 100,
          },
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            zeitstempel: '01.03.2024 00:00',
            wert: 200,
          },
        ],
        Einheiten: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            nummer: 'Wohnung 1',
            typ: 'Wohnung',
          },
        ],
        _view_aktive_mieter: [
          {
            einheit_id: 'Ra-HS-29_WE_01',
            mieter_name: 'Duck, Donald',
          },
        ],
      },
      { berechnetAm: '2026-06-29' }
    );

    expect(views.monatRows.map(row => row.monat)).toEqual([
      '2023-11',
      '2023-12',
      '2024-01',
      '2024-02',
    ]);

    const january = views.monatRows.find(row => row.monat === '2024-01');
    const year2024 = views.jahrRows.find(row => row.jahr === 2024);

    expect(january.verbrauch_monat).toBeCloseTo((100 * 31) / 121);
    expect(january.plausibilitaet_status).toBe('OK');
    expect(january.mieter_name).toBe('Duck, Donald');
    expect(year2024.verbrauch_jahr).toBeCloseTo((100 * 60) / 121);
    expect(year2024.verbrauch_monat_durchschnitt).toBeCloseTo(((100 * 60) / 121) / 2);
    expect(year2024.anzahl_monate_mit_verbrauch).toBe(2);
  });

  it('assigns historical meter reading ids to canonical meter definitions', () => {
    const { buildVerbrauchViewData } = loadAppsScriptHelpers();

    const views = buildVerbrauchViewData(
      {
        Zaehler: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_GE_02',
            zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
            medium: 'strom_ht_kwh',
            bezeichnung: 'Strom Hauptzähler (privat HT)',
            einheit: 'kWh',
            aktiv: true,
          },
        ],
        Zaehlerstaende: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_GE_02',
            zaehler_id: 'Z_STROM_HT_KWH_PRIVAT_HT',
            zeitstempel: '01.01.2025 00:00',
            wert: 1000,
          },
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_GE_02',
            zaehler_id: 'Z_STROM_HT_KWH_PRIVAT_HT',
            zeitstempel: '01.02.2025 00:00',
            wert: 1300,
          },
        ],
        Einheiten: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_GE_02',
            nummer: 'Black Inn',
            typ: 'Gewerbe',
          },
        ],
      },
      { berechnetAm: '2026-06-29' }
    );

    expect(views.monatRows).toHaveLength(1);
    expect(views.monatRows[0]).toMatchObject({
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_GE_02',
      zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
      untergruppe: 'PRIVAT_HT',
      verbrauch_monat: 300,
    });
    expect(views.jahrRows[0]).toMatchObject({
      jahr: 2025,
      zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
      verbrauch_jahr: 300,
    });
    expect(views.auditRows[0]).toMatchObject({
      status: 'KANONISCH_ZUGEORDNET',
      readings_count: 2,
      intervalle_count: 1,
      erwartete_monatszeilen: 1,
      monatszeilen: 1,
      jahreszeilen: 1,
    });
    expect(views.auditRows[0].source_keys).toContain('Z_STROM_HT_KWH_PRIVAT_HT');
  });

  it('builds the Black Inn power balance from explicit source meters', () => {
    const { buildVerbrauchViewData } = loadAppsScriptHelpers();
    const sourceMeters = [
      ['Ra-HS-29_GE_02', 'Z_STROM_KWH_PRIVAT_HT', 'Strom Hauptzähler (privat HT)', 1000],
      ['Ra-HS-29_GE_02', 'Z_STROM_KWH_PRIVAT_NT', 'Strom Hauptzähler (privat NT)', 500],
      ['Ra-HS-29_Allgemein_Flur', 'Z_STROM_KWH_FLUR', 'Strom Flur Zwischenzähler', 50],
      ['Ra-HS-29_Allgemein_Heizung', 'Z_STROM_KWH_HEIZUNG', 'Strom Heizung Zwischenzähler', 60],
      ['Ra-HS-29_GE_02', 'Z_STROM_KWH_BUERO', 'Strom Büro Zwischenzähler', 70],
      ['Ra-HS-29_WE_03', 'Z_STROM_KWH_WOHNUNG_3', 'Strom Wohnung 3 Zwischenzähler', 80],
      ['Ra-HS-29_WE_04', 'Z_STROM_KWH_WOHNUNG_4', 'Strom Wohnung 4 Zwischenzähler', 90],
      ['Ra-HS-29_WE_02', 'Z_STROM_KWH_WOHNUNG_2', 'Strom Wohnung 2 Zwischenzähler', 999],
      ['Ra-HS-29_GE_01', 'Z_STROM_KWH_KODI_HT', 'Strom Hauptzähler (Kodi HT)', 999],
    ];

    const views = buildVerbrauchViewData(
      {
        Zaehler: sourceMeters.map(([einheit_id, zaehler_id, bezeichnung]) => ({
          objekt_id: 'Ra-HS-29',
          einheit_id,
          zaehler_id,
          medium: 'strom_ht_kwh',
          bezeichnung,
          einheit: 'kWh',
          ueberlauf_erlaubt: false,
          berechnet: false,
        })),
        Zaehlerstaende: sourceMeters.flatMap(([einheit_id, zaehler_id, , verbrauch]) => [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id,
            zaehler_id,
            zeitstempel: '01.01.2025 00:00',
            wert: 1000,
          },
          {
            objekt_id: 'Ra-HS-29',
            einheit_id,
            zaehler_id,
            zeitstempel: '01.02.2025 00:00',
            wert: 1000 + verbrauch,
          },
        ]),
        Einheiten: [
          { objekt_id: 'Ra-HS-29', einheit_id: 'Ra-HS-29_GE_01', nummer: 'Kochdippe', typ: 'Gewerbe' },
          { objekt_id: 'Ra-HS-29', einheit_id: 'Ra-HS-29_GE_02', nummer: 'Black Inn', typ: 'Gewerbe' },
          { objekt_id: 'Ra-HS-29', einheit_id: 'Ra-HS-29_Allgemein_Flur', nummer: 'Haus', typ: 'Allgemein' },
          { objekt_id: 'Ra-HS-29', einheit_id: 'Ra-HS-29_Allgemein_Heizung', nummer: 'Haus', typ: 'Allgemein' },
          { objekt_id: 'Ra-HS-29', einheit_id: 'Ra-HS-29_WE_02', nummer: 'WE 02', typ: 'Wohnung' },
          { objekt_id: 'Ra-HS-29', einheit_id: 'Ra-HS-29_WE_03', nummer: 'WE 03', typ: 'Wohnung' },
          { objekt_id: 'Ra-HS-29', einheit_id: 'Ra-HS-29_WE_04', nummer: 'WE 04', typ: 'Wohnung' },
        ],
      },
      { berechnetAm: '2026-07-03' }
    );

    expect(views.bilanzJahrRows).toHaveLength(1);
    expect(views.bilanzJahrRows[0]).toMatchObject({
      jahr: 2025,
      objekt_id: 'Ra-HS-29',
      bilanz_id: 'BILANZ_STROM_BLACK_INN',
      label: 'Strom · Black Inn',
      wert: 1150,
      plausibilitaet_status: 'OK',
      missing_source_zaehler_ids: '',
    });
    expect(views.bilanzJahrRows[0].source_zaehler_ids).toContain('Z_STROM_KWH_WOHNUNG_3');
    expect(views.bilanzJahrRows[0].source_zaehler_ids).toContain('Z_STROM_KWH_WOHNUNG_4');
    expect(views.bilanzJahrRows[0].source_zaehler_ids).not.toContain('Z_STROM_KWH_WOHNUNG_2');
    expect(views.bilanzJahrRows[0].source_zaehler_ids).not.toContain('Z_STROM_KWH_KODI_HT');
  });

  it('reports unresolved consumption readings in the audit view', () => {
    const { buildVerbrauchViewData } = loadAppsScriptHelpers();

    const views = buildVerbrauchViewData(
      {
        Zaehler: [],
        Zaehlerstaende: [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_GE_02',
            zaehler_id: 'Z_UNBEKANNT',
            zeitstempel: '01.01.2025 00:00',
            wert: 1000,
          },
        ],
      },
      { berechnetAm: '2026-06-29' }
    );

    expect(views.monatRows).toHaveLength(0);
    expect(views.jahrRows).toHaveLength(0);
    expect(views.auditRows).toEqual([
      expect.objectContaining({
        status: 'UNGELOESTE_MESSWERTE',
        objekt_id: 'Ra-HS-29',
        einheit_id: 'Ra-HS-29_GE_02',
        zaehler_id: 'Z_UNBEKANNT',
        readings_count: 1,
      }),
    ]);
  });

  it('previews canonical meter identity updates for historical meter readings', () => {
    const { analyzeCanonicalZaehlerstandMigrationRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert'];
    const rows = [
      [
        'ST_Ra-HS-29_Ra-HS-29_GE_02_Z_STROM_HT_KWH_PRIVAT_HT_2025-01-01 00:00',
        'Ra-HS-29',
        'Ra-HS-29_GE_02',
        'Z_STROM_HT_KWH_PRIVAT_HT',
        '01.01.2025 00:00',
        1000,
      ],
      [
        'ST_Ra-HS-29_Ra-HS-29_GE_02_Z_STROM_KWH_PRIVAT_HT_2025-02-01 00:00',
        'Ra-HS-29',
        'Ra-HS-29_GE_02',
        'Z_STROM_KWH_PRIVAT_HT',
        '01.02.2025 00:00',
        1300,
      ],
    ];
    const zaehlerRows = [
      {
        objekt_id: 'Ra-HS-29',
        einheit_id: 'Ra-HS-29_GE_02',
        zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
      },
    ];

    const result = analyzeCanonicalZaehlerstandMigrationRows(headers, rows, zaehlerRows);

    expect(result).toMatchObject({
      totalRows: 2,
      changedRows: 1,
      unchangedRows: 1,
      unresolvedRows: 0,
      duplicateRows: 0,
      missingHeaders: [],
    });
    expect(result.candidates[0]).toMatchObject({
      row_number: 2,
      status: 'KANONISCHE_ZAEHLER_ID',
      old_zaehler_id: 'Z_STROM_HT_KWH_PRIVAT_HT',
      new_zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
      new_stand_id: 'ST_Ra-HS-29_Ra-HS-29_GE_02_Z_STROM_KWH_PRIVAT_HT_2025-01-01 00:00',
    });
  });

  it('detects duplicate stand ids before applying canonical meter identity updates', () => {
    const { analyzeCanonicalZaehlerstandMigrationRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert'];
    const rows = [
      [
        'ST_OLD_ALIAS',
        'Ra-HS-29',
        'Ra-HS-29_GE_02',
        'Z_STROM_HT_KWH_PRIVAT_HT',
        '01.01.2025 00:00',
        1000,
      ],
      [
        'ST_Ra-HS-29_Ra-HS-29_GE_02_Z_STROM_KWH_PRIVAT_HT_2025-01-01 00:00',
        'Ra-HS-29',
        'Ra-HS-29_GE_02',
        'Z_STROM_KWH_PRIVAT_HT',
        '01.01.2025 00:00',
        1000,
      ],
    ];
    const zaehlerRows = [
      {
        objekt_id: 'Ra-HS-29',
        einheit_id: 'Ra-HS-29_GE_02',
        zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
      },
    ];

    const result = analyzeCanonicalZaehlerstandMigrationRows(headers, rows, zaehlerRows);

    expect(result.changedRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.duplicates[0]).toMatchObject({
      row_number: 2,
      new_stand_id: 'ST_Ra-HS-29_Ra-HS-29_GE_02_Z_STROM_KWH_PRIVAT_HT_2025-01-01 00:00',
      duplicate_count: 2,
    });
  });

  it('blocks canonical meter identity updates when the target unit is empty', () => {
    const { analyzeCanonicalZaehlerstandMigrationRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert'];
    const rows = [
      [
        'ST_Ra-HS-29_Ra-HS-29_Allgemein_Z_OEL_GETANKT_LITER_2025-12-23 00:00',
        'Ra-HS-29',
        'Ra-HS-29_Allgemein',
        'Z_OEL_GETANKT_LITER',
        '23.12.2025 00:00',
        3000,
      ],
    ];
    const zaehlerRows = [
      {
        objekt_id: 'Ra-HS-29',
        einheit_id: '',
        zaehler_id: 'Z_OEL_GETANKT_LITER',
      },
    ];

    const result = analyzeCanonicalZaehlerstandMigrationRows(headers, rows, zaehlerRows);

    expect(result).toMatchObject({
      changedRows: 0,
      unresolvedRows: 1,
      duplicateRows: 0,
    });
    expect(result.unresolved[0]).toMatchObject({
      status: 'ZIEL_EINHEIT_FEHLT',
      old_einheit_id: 'Ra-HS-29_Allgemein',
      old_zaehler_id: 'Z_OEL_GETANKT_LITER',
    });
  });

  it('keeps overflow consumption visible as a reviewable warning', () => {
    const { calculateVerbrauchDifference } = loadAppsScriptHelpers();

    const result = calculateVerbrauchDifference(890, 188, {
      medium: 'kaltwasser_m3',
      stellen: 4,
      ueberlauf_erlaubt: true,
    });

    expect(result).toMatchObject({
      verbrauch: 9298,
      methode: 'UEBERLAUF',
      status: 'WARNUNG_UEBERLAUF',
      pruefung: true,
      inSumme: true,
    });
  });

  it('calculates falling oil fill levels as consumption and rising levels as warnings', () => {
    const { calculateVerbrauchDifference } = loadAppsScriptHelpers();

    const falling = calculateVerbrauchDifference(55, 43, {
      medium: 'oel_stand_cm',
    });
    const rising = calculateVerbrauchDifference(43, 55, {
      medium: 'oel_stand_cm',
    });

    expect(falling).toMatchObject({
      verbrauch: 12,
      methode: 'OEL_FUELLSTAND',
      status: 'OK',
      inSumme: true,
    });
    expect(rising).toMatchObject({
      verbrauch: 0,
      methode: 'OEL_FUELLSTAND',
      status: 'WARNUNG_FUELLSTAND_GESTIEGEN',
      pruefung: true,
      inSumme: true,
    });
  });

  it('builds compact stand_id values from object, unit, meter and timestamp', () => {
    const { buildStandId } = loadAppsScriptHelpers();

    const result = buildStandId({
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_GE_02',
      zaehler_id: 'Z_STROM_KWH_PRIVAT_NT',
      zeitstempel: '02.06.2026 00:00',
    });

    expect(result).toBe('ST_Ra-HS-29_Ra-HS-29_GE_02_Z_STROM_KWH_PRIVAT_NT_2026-06-02 00:00');
  });

  it('adds a missing stand_id before a meter reading is saved', () => {
    const { normalizeZaehlerstandItem } = loadAppsScriptHelpers();

    const result = normalizeZaehlerstandItem({
      stand_id: '',
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_WE_01',
      zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
      zeitstempel: '19.06.2026 00:00',
      wert: 1234,
    });

    expect(result.stand_id).toBe('ST_Ra-HS-29_Ra-HS-29_WE_01_Z_STROM_KWH_WOHNUNG_1_2026-06-19 00:00');
    expect(result['stand.id']).toBe('ST_Ra-HS-29_Ra-HS-29_WE_01_Z_STROM_KWH_WOHNUNG_1_2026-06-19 00:00');
    expect(result.wert).toBe(1234);
  });

  it('maps generated stand_id values to legacy stand.id sheet headers', () => {
    const { getItemValueForHeader, normalizeZaehlerstandItem } = loadAppsScriptHelpers();

    const item = normalizeZaehlerstandItem({
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_WE_01',
      zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
      zeitstempel: '19.06.2026 00:00',
    });

    expect(getItemValueForHeader(item, 'stand_id')).toBe(
      'ST_Ra-HS-29_Ra-HS-29_WE_01_Z_STROM_KWH_WOHNUNG_1_2026-06-19 00:00'
    );
    expect(getItemValueForHeader(item, 'stand.id')).toBe(
      'ST_Ra-HS-29_Ra-HS-29_WE_01_Z_STROM_KWH_WOHNUNG_1_2026-06-19 00:00'
    );
  });

  it('keeps an existing stand_id unchanged', () => {
    const { normalizeZaehlerstandItem } = loadAppsScriptHelpers();

    const result = normalizeZaehlerstandItem({
      stand_id: 'ST_EXISTING',
      zaehler_id: 'Z001',
      zeitstempel: '19.06.2026 00:00',
    });

    expect(result.stand_id).toBe('ST_EXISTING');
  });

  it('uses the fallback date if no timestamp was provided', () => {
    const { normalizeZaehlerstandItem } = loadAppsScriptHelpers();

    const result = normalizeZaehlerstandItem(
      {
        objekt_id: 'TEST',
        einheit_id: 'TEST_WE_01',
        zaehler_id: 'Z001',
        wert: 10,
      },
      new Date(2026, 5, 20, 9, 5)
    );

    expect(result.stand_id).toBe('ST_TEST_TEST_WE_01_Z001_2026-06-20 09:05');
  });

  it('keeps missing object or unit explicit in generated stand_id values', () => {
    const { buildStandId } = loadAppsScriptHelpers();

    const result = buildStandId({
      zaehler_id: 'Z001',
      zeitstempel: '20.06.2026 09:05',
    });

    expect(result).toBe('ST_UNKNOWN_OBJEKT_UNKNOWN_EINHEIT_Z001_2026-06-20 09:05');
  });

  it('detects existing rows by composite meter identity', () => {
    const { appendIfMissingByKeys } = loadAppsScriptHelpers();
    const appendedRows = [];
    const sheet = {
      getName() {
        return 'Zaehler';
      },
      getDataRange() {
        return {
          getValues() {
            return [
              ['objekt_id', 'einheit_id', 'zaehler_id'],
              ['Ra-HS-29', 'Ra-HS-29_WE_01', 'STROM'],
            ];
          },
        };
      },
      appendRow(row) {
        appendedRows.push(row);
      },
    };

    const duplicateCreated = appendIfMissingByKeys(
      sheet,
      ['objekt_id', 'einheit_id', 'zaehler_id'],
      {
        objekt_id: 'Ra-HS-29',
        einheit_id: 'Ra-HS-29_WE_01',
        zaehler_id: 'STROM',
      }
    );
    const sameMeterCodeInDifferentObjectCreated = appendIfMissingByKeys(
      sheet,
      ['objekt_id', 'einheit_id', 'zaehler_id'],
      {
        objekt_id: 'TEST',
        einheit_id: 'TEST_WE_01',
        zaehler_id: 'STROM',
      }
    );

    expect(duplicateCreated).toBe(false);
    expect(sameMeterCodeInDifferentObjectCreated).toBe(true);
    expect(appendedRows).toHaveLength(1);
  });

  it('defines isolated production test seed data', () => {
    const { getProdTestSeedData } = loadAppsScriptHelpers();

    const seed = getProdTestSeedData();

    expect(seed.objekte[0]).toMatchObject({
      objekt_id: 'TEST',
      bezeichnung: 'Test fuer Produktivsystem',
      strasse: 'Am Geldspeicher 1',
    });
    expect(seed.einheiten).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          einheit_id: 'TEST_WE_01',
          objekt_id: 'TEST',
          nummer: 'WE 01 TEST',
        }),
        expect.objectContaining({
          einheit_id: 'TEST_WE_02',
          objekt_id: 'TEST',
          nummer: 'WE 02 TEST Leerstand',
        }),
        expect.objectContaining({
          einheit_id: 'TEST_Allgemein',
          objekt_id: 'TEST',
          typ: 'Allgemein',
        }),
      ])
    );

    expect(seed.zaehler.map(zaehler => zaehler.zaehler_id)).toEqual([
      'Z_STROM_KWH_WOHNUNG_1',
      'Z_KALTWASSER_KW_WOHNUNG_1',
      'Z_WARMWASSER_WW_WOHNUNG_1',
      'Z_STROM_KWH_WOHNUNG_2',
      'Z_KALTWASSER_KW_WOHNUNG_2',
      'Z_WARMWASSER_WW_WOHNUNG_2',
      'Z_STROM_KWH_ALLGEMEIN',
      'Z_KALTWASSER_KW_HAUPTZAEHLER',
      'Z_WARMWASSER_WW_ZULAUF',
      'Z_OEL_STAND_IN_CM',
      'Z_OEL_GETANKT_LITER',
    ]);

    seed.zaehler.forEach(zaehler => {
      expect(zaehler).toMatchObject({
        objekt_id: 'TEST',
        erfassbar: true,
        berechnet: false,
        aktiv: true,
      });
    });

    expect(seed.zaehler[0]).toMatchObject({
      zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
      objekt_id: 'TEST',
      einheit_id: 'TEST_WE_01',
      max_plausibler_verbrauch: 100,
    });

    expect(seed.zaehler).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          zaehler_id: 'Z_STROM_KWH_WOHNUNG_2',
          einheit_id: 'TEST_WE_02',
          hinweis: 'Testzaehler fuer Leerstand',
        }),
        expect.objectContaining({
          zaehler_id: 'Z_KALTWASSER_KW_WOHNUNG_2',
          einheit_id: 'TEST_WE_02',
          bezeichnung: 'Kaltwasser Wohnung 2 TEST Leerstand',
        }),
        expect.objectContaining({
          zaehler_id: 'Z_WARMWASSER_WW_WOHNUNG_2',
          einheit_id: 'TEST_WE_02',
          bezeichnung: 'Warmwasser Wohnung 2 TEST Leerstand',
        }),
        expect.objectContaining({
          zaehler_id: 'Z_STROM_KWH_ALLGEMEIN',
          einheit_id: 'TEST_Allgemein',
          hinweis: 'Testzaehler fuer Allgemeinbereich',
        }),
        expect.objectContaining({
          zaehler_id: 'Z_KALTWASSER_KW_HAUPTZAEHLER',
          einheit_id: 'TEST_Allgemein',
          bezeichnung: 'Kaltwasser Hauptzähler TEST',
        }),
        expect.objectContaining({
          zaehler_id: 'Z_WARMWASSER_WW_ZULAUF',
          einheit_id: 'TEST_Allgemein',
          bezeichnung: 'Warmwasser (WW Zulauf) TEST',
        }),
        expect.objectContaining({
          zaehler_id: 'Z_OEL_STAND_IN_CM',
          einheit_id: 'TEST_Allgemein',
          medium: 'oel_stand_cm',
          bezeichnung: 'Heizung Ölstand (cm) TEST',
        }),
        expect.objectContaining({
          zaehler_id: 'Z_OEL_GETANKT_LITER',
          einheit_id: 'TEST_Allgemein',
          medium: 'oel_stand_l',
        }),
      ])
    );
  });

  it('defines LOK entrance metadata and unit-scoped meter ids', () => {
    const {
      buildLokZaehlerId,
      getLokEinheitEntranceMapping,
      getLokEinheitSeedData,
      getLokReplacementZaehlerId,
      getLokSeedData,
    } = loadAppsScriptHelpers();

    const mapping = getLokEinheitEntranceMapping();
    const einheiten = getLokEinheitSeedData();
    const seed = getLokSeedData();

    expect(mapping).toMatchObject({
      LOK_WE_01: 'A',
      LOK_WE_05: 'A',
      LOK_WE_06: 'B',
      LOK_WE_10_A: 'B',
      LOK_WE_10_B: 'B',
      LOK_WE_10_S: 'B',
      LOK_WE_11: 'C',
      LOK_WE_15: 'C',
      LOK_GE_01: 'A',
      LOK_Allgemein: 'Allgemein',
    });
    expect(mapping).not.toHaveProperty('LOK_WE_10');
    expect(seed.objekte).toEqual([
      expect.objectContaining({
        objekt_id: 'LOK',
        eingange: 'A,B,C',
      }),
    ]);
    expect(einheiten).toHaveLength(19);
    expect(seed.einheiten).toHaveLength(19);
    expect(seed.einheiten).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          einheit_id: 'LOK_WE_01',
          nummer: 'Wohnung 1',
          eingang: 'A',
        }),
        expect.objectContaining({
          einheit_id: 'LOK_WE_10_A',
          nummer: 'Wohnung 10 A',
          eingang: 'B',
        }),
        expect.objectContaining({
          einheit_id: 'LOK_WE_10_B',
          nummer: 'Wohnung 10 B',
          eingang: 'B',
        }),
        expect.objectContaining({
          einheit_id: 'LOK_WE_10_S',
          nummer: 'Wohnung 10 S',
          eingang: 'B',
        }),
        expect.objectContaining({
          einheit_id: 'LOK_WE_11',
          eingang: 'C',
        }),
      ])
    );
    expect(seed.zaehler).toHaveLength(60);
    expect(buildLokZaehlerId('LOK_WE_10_A', 'strom_ht_kwh')).toBe('Z_LOK_WE_10_A_strom_ht_kwh');
    expect(buildLokZaehlerId('LOK_Allgemein', 'kaltwasser_m3', 'hauptzaehler')).toBe(
      'Z_LOK_Allgemein_kaltwasser_m3_hauptzaehler'
    );
    expect(getLokReplacementZaehlerId('LOK_WE_10_A', 'STROM')).toBe('Z_LOK_WE_10_A_strom_ht_kwh');
    expect(getLokReplacementZaehlerId('LOK_Allgemein', 'KW_HAUPTZAEHLER')).toBe(
      'Z_LOK_Allgemein_kaltwasser_m3_hauptzaehler'
    );
    expect(seed.zaehler).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objekt_id: 'LOK',
          einheit_id: 'LOK_WE_01',
          zaehler_id: 'Z_LOK_WE_01_strom_ht_kwh',
          medium: 'strom_ht_kwh',
          einbauort: 'Eingang A',
        }),
        expect.objectContaining({
          objekt_id: 'LOK',
          einheit_id: 'LOK_WE_01',
          zaehler_id: 'Z_LOK_WE_01_kaltwasser_m3',
          medium: 'kaltwasser_m3',
        }),
        expect.objectContaining({
          objekt_id: 'LOK',
          einheit_id: 'LOK_WE_01',
          zaehler_id: 'Z_LOK_WE_01_warmwasser_m3',
          medium: 'warmwasser_m3',
        }),
        expect.objectContaining({
          objekt_id: 'LOK',
          einheit_id: 'LOK_WE_10_S',
          zaehler_id: 'Z_LOK_WE_10_S_warmwasser_m3',
          bezeichnung: 'Warmwasser Wohnung 10 S',
          einbauort: 'Eingang B',
        }),
        expect.objectContaining({
          objekt_id: 'LOK',
          einheit_id: 'LOK_Allgemein',
          zaehler_id: 'Z_LOK_Allgemein_oel_stand_cm',
          medium: 'oel_stand_cm',
          ueberlauf_erlaubt: false,
        }),
      ])
    );
  });

  it('deactivates obsolete LOK short meter ids idempotently', () => {
    const { deactivateObsoleteLokShortCodeMeters } = loadAppsScriptHelpers();
    const rows = [
      ['objekt_id', 'einheit_id', 'zaehler_id', 'aktiv', 'erfassbar', 'ersetzt_durch_zaehler_id', 'hinweis'],
      ['LOK', 'LOK_WE_10_A', 'STROM', true, true, '', ''],
      ['LOK', 'LOK_WE_10_A', 'Z_LOK_WE_10_A_strom_ht_kwh', true, true, '', ''],
      ['TEST', 'TEST_WE_01', 'STROM', true, true, '', ''],
    ];
    const sheet = {
      getDataRange() {
        return {
          getValues() {
            return rows.map(row => [...row]);
          },
        };
      },
      getRange(rowNumber, columnNumber) {
        return {
          setValue(value) {
            rows[rowNumber - 1][columnNumber - 1] = value;
          },
        };
      },
    };

    expect(deactivateObsoleteLokShortCodeMeters(sheet)).toBe(1);
    expect(rows[1]).toEqual([
      'LOK',
      'LOK_WE_10_A',
      'STROM',
      false,
      false,
      'Z_LOK_WE_10_A_strom_ht_kwh',
      'Veraltete LOK-Kurz-ID; ersetzt durch einheitgebundene zaehler_id.',
    ]);
    expect(rows[2][3]).toBe(true);
    expect(rows[3][3]).toBe(true);
    expect(deactivateObsoleteLokShortCodeMeters(sheet)).toBe(0);
  });

  it('resolves tenant names from Vertragsparteien first', () => {
    const { getMieterNameForVertrag } = loadAppsScriptHelpers();

    const result = getMieterNameForVertrag(
      {
        vertrag_id: 29,
        hauptperson_id: 1,
      },
      {
        29: ['Duck, Donald'],
      },
      {
        1: 'Mouse, Mickey',
      }
    );

    expect(result).toBe('Duck, Donald');
  });

  it('falls back to hauptperson_id if Vertragsparteien has no Hauptmieter entry', () => {
    const { getMieterNameForVertrag } = loadAppsScriptHelpers();

    const result = getMieterNameForVertrag(
      {
        vertrag_id: 29,
        hauptperson_id: 1,
      },
      {},
      {
        1: 'Duck, Donald',
      }
    );

    expect(result).toBe('Duck, Donald');
  });

  it('derives unit ids from historical meter ids without relying on mutable master data', () => {
    const { deriveEinheitIdFromLegacyZaehlerId } = loadAppsScriptHelpers();

    expect(deriveEinheitIdFromLegacyZaehlerId('Z_STROM_KWH_WOHNUNG_1', 'Ra-HS-29')).toBe('Ra-HS-29_WE_01');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_KALTWASSER_M3_WOHNUNG_11', 'Ra-HS-29')).toBe('Ra-HS-29_WE_11');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_STROM_KWH_GEWERBE_2', 'Ra-HS-29')).toBe('Ra-HS-29_GE_02');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_STROM_KWH_ALLGEMEIN', 'Ra-HS-29')).toBe('Ra-HS-29_Allgemein');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_KALTWASSER_KW_HAUPTZAEHLER', 'Ra-HS-29')).toBe('Ra-HS-29_Allgemein');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_STROM_KWH_PRIVAT_NT', 'Ra-HS-29')).toBe('Ra-HS-29_GE_02');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_STROM_KWH_FLUR', 'Ra-HS-29')).toBe('Ra-HS-29_Allgemein_Flur');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_STROM_KWH_HEIZUNG', 'Ra-HS-29')).toBe('Ra-HS-29_Allgemein_Heizung');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_WARMWASSER_WW_GESAMT_BERECHNET', 'Ra-HS-29')).toBe('Ra-HS-29_Allgemein_Heizung');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_WARMWASSER_WW_WOHNUNG_10', 'Ra-HS-29')).toBe('Ra-HS-29_WE_10');
    expect(deriveEinheitIdFromLegacyZaehlerId('Z_WARMWASSER_WW_WOHNUNG_11', 'Ra-HS-29')).toBe('Ra-HS-29_WE_11');
  });

  it('defines the historical calculated warm water meter as non-manual', () => {
    const { getHistoricalCalculatedMeterSeedData } = loadAppsScriptHelpers();

    expect(getHistoricalCalculatedMeterSeedData()).toEqual([
      expect.objectContaining({
        zaehler_id: 'Z_WARMWASSER_WW_GESAMT_BERECHNET',
        objekt_id: 'Ra-HS-29',
        einheit_id: 'Ra-HS-29_Allgemein_Heizung',
        medium: 'warmwasser_m3',
        einbauort: 'berechneter Wert, kein Zaehler',
        erfassbar: false,
        berechnet: true,
        aktiv: true,
      }),
    ]);
  });

  it('builds migrated meter readings with object, unit and new stand_id', () => {
    const { buildMigratedZaehlerstandItem } = loadAppsScriptHelpers();

    const result = buildMigratedZaehlerstandItem({
      stand_id: 'ST_Z_STROM_KWH_WOHNUNG_1_20260619',
      objekt_id: '',
      einheit_id: '',
      zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
      zeitstempel: '19.06.2026 00:00',
      wert: 1234,
    });

    expect(result).toMatchObject({
      status: 'ok',
      changed: true,
      oldStandId: 'ST_Z_STROM_KWH_WOHNUNG_1_20260619',
      newStandId: 'ST_Ra-HS-29_Ra-HS-29_WE_01_Z_STROM_KWH_WOHNUNG_1_2026-06-19 00:00',
    });
    expect(result.item).toMatchObject({
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_WE_01',
      stand_id: 'ST_Ra-HS-29_Ra-HS-29_WE_01_Z_STROM_KWH_WOHNUNG_1_2026-06-19 00:00',
      wert: 1234,
    });
  });

  it('previews stand_id migration and blocks unresolved or duplicate rows', () => {
    const { analyzeStandIdMigrationRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert'];
    const rows = [
      ['ST_Z_STROM_KWH_WOHNUNG_1_20260619', '', '', 'Z_STROM_KWH_WOHNUNG_1', '19.06.2026 00:00', 100],
      ['ST_Z_STROM_KWH_WOHNUNG_1_20260619_COPY', '', '', 'Z_STROM_KWH_WOHNUNG_1', '19.06.2026 00:00', 100],
      ['ST_Z_UNKNOWN_20260619', '', '', 'Z_UNBEKANNT', '19.06.2026 00:00', 100],
    ];

    const result = analyzeStandIdMigrationRows(headers, rows);

    expect(result).toMatchObject({
      totalRows: 3,
      migratableRows: 2,
      changedRows: 2,
      unresolvedRows: 1,
      duplicateRows: 1,
      missingHeaders: [],
    });
    expect(result.unresolved[0]).toMatchObject({
      row: 4,
      reason: 'UNKNOWN_EINHEIT_ID',
      zaehler_id: 'Z_UNBEKANNT',
    });
    expect(result.duplicates[0]).toMatchObject({
      row: 3,
      duplicateOfRow: 2,
      stand_id: 'ST_Ra-HS-29_Ra-HS-29_WE_01_Z_STROM_KWH_WOHNUNG_1_2026-06-19 00:00',
    });
  });

  it('reports duplicate migration groups with conservative recommendations', () => {
    const { analyzeStandIdDuplicateRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert', 'quelle'];
    const rows = [
      ['ST_A', '', '', 'Z_STROM_KWH_WOHNUNG_1', '19.06.2026 00:00', 100, 'Import'],
      ['ST_B', '', '', 'Z_STROM_KWH_WOHNUNG_1', '19.06.2026 00:00', 100, 'Import'],
      ['ST_C', '', '', 'Z_STROM_KWH_WOHNUNG_1', '19.06.2026 00:00', 101, 'Import'],
      ['ST_D', '', '', 'Z_STROM_KWH_WOHNUNG_1', '20.06.2026 00:00', 102, 'Import'],
    ];

    const result = analyzeStandIdDuplicateRows(headers, rows);

    expect(result).toMatchObject({
      totalRows: 4,
      duplicateGroups: 1,
      duplicateRows: 2,
      deleteCandidateRows: 1,
      reviewRows: 1,
      missingHeaders: [],
    });
    expect(result.rows.map(row => row.recommendation)).toEqual([
      'KEEP',
      'CANDIDATE_DELETE_EXACT_DUPLICATE',
      'REVIEW_VALUE_DIFFERS',
    ]);
    expect(result.rows[1]).toMatchObject({
      group: 'DUP_01',
      row: 3,
      duplicateOfRow: 2,
      valueStatus: 'SAME_VALUE',
      wert: 100,
    });
    expect(result.rows[2]).toMatchObject({
      group: 'DUP_01',
      row: 4,
      duplicateOfRow: 2,
      valueStatus: 'VALUE_DIFFERS',
      wert: 101,
    });
  });

  it('resolves historical duplicate readings as meter stand plus calculated consumption', () => {
    const { analyzeStandIdDuplicateRows, analyzeStandIdMigrationRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert', 'quelle'];
    const rows = [
      ['ST_LOW', '', '', 'Z_WARMWASSER_WW_WOHNUNG_4', '19.06.2026 00:00', 12, 'Migration'],
      ['ST_HIGH', '', '', 'Z_WARMWASSER_WW_WOHNUNG_4', '19.06.2026 00:00', 456, 'Migration'],
    ];

    const duplicateReport = analyzeStandIdDuplicateRows(headers, rows);
    const migrationReport = analyzeStandIdMigrationRows(headers, rows);

    expect(duplicateReport).toMatchObject({
      duplicateGroups: 1,
      duplicateRows: 1,
      conversionRows: 1,
      deleteCandidateRows: 0,
      reviewRows: 0,
    });
    expect(duplicateReport.rows.map(row => row.recommendation)).toEqual([
      'CONVERT_LOWER_VALUE_TO_CALCULATED_CONSUMPTION',
      'KEEP',
    ]);
    expect(duplicateReport.rows[0]).toMatchObject({
      calculated_zaehler_id: 'Z_WARMWASSER_WW_WOHNUNG_4_VERBRAUCH_BERECHNET',
      wert: 12,
    });

    expect(migrationReport).toMatchObject({
      totalRows: 2,
      migratableRows: 2,
      duplicateRows: 0,
      unresolvedRows: 0,
    });
    expect(migrationReport.changes[0]).toMatchObject({
      zaehler_id: 'Z_WARMWASSER_WW_WOHNUNG_4_VERBRAUCH_BERECHNET',
      migrationNote: 'LOWER_VALUE_IS_CALCULATED_CONSUMPTION',
    });
    expect(migrationReport.changes[1]).toMatchObject({
      zaehler_id: 'Z_WARMWASSER_WW_WOHNUNG_4',
      migrationNote: '',
    });
  });

  it('creates virtual meter seed data for calculated duplicate consumption rows', () => {
    const { getHistoricalCalculatedConsumptionMeterSeedDataFromRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert', 'quelle'];
    const rows = [
      ['ST_LOW', '', '', 'Z_WARMWASSER_WW_WOHNUNG_4', '19.06.2026 00:00', 12, 'Migration'],
      ['ST_HIGH', '', '', 'Z_WARMWASSER_WW_WOHNUNG_4', '19.06.2026 00:00', 456, 'Migration'],
    ];

    const seed = getHistoricalCalculatedConsumptionMeterSeedDataFromRows(headers, rows);

    expect(seed).toEqual([
      expect.objectContaining({
        zaehler_id: 'Z_WARMWASSER_WW_WOHNUNG_4_VERBRAUCH_BERECHNET',
        objekt_id: 'Ra-HS-29',
        einheit_id: 'Ra-HS-29_WE_04',
        medium: 'warmwasser_m3',
        einheit: 'm3',
        einbauort: 'berechneter Wert, kein Zaehler',
        erfassbar: false,
        berechnet: true,
      }),
    ]);
  });

  it('learns existing unit mappings from already prepared meter readings', () => {
    const { analyzeStandIdMigrationRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert'];
    const rows = [
      ['ST_PREPARED', 'Ra-HS-29', 'Ra-HS-29_GE_01', 'Z_SONDERZAEHLER_GEWERBE', '01.01.2026 00:00', 10],
      ['ST_LEGACY', '', '', 'Z_SONDERZAEHLER_GEWERBE', '02.01.2026 00:00', 11],
    ];

    const result = analyzeStandIdMigrationRows(headers, rows);

    expect(result).toMatchObject({
      totalRows: 2,
      migratableRows: 2,
      unresolvedRows: 0,
      mappingConflictRows: 0,
    });
    expect(result.changes[1]).toMatchObject({
      row: 3,
      einheit_id: 'Ra-HS-29_GE_01',
      zaehler_id: 'Z_SONDERZAEHLER_GEWERBE',
    });
  });

  it('reports conflicting learned unit mappings instead of guessing', () => {
    const { buildExistingEinheitMappingFromRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert'];
    const rows = [
      ['ST_ONE', 'Ra-HS-29', 'Ra-HS-29_WE_01', 'Z_MEHRDEUTIG', '01.01.2026 00:00', 10],
      ['ST_TWO', 'Ra-HS-29', 'Ra-HS-29_WE_02', 'Z_MEHRDEUTIG', '02.01.2026 00:00', 11],
    ];

    const result = buildExistingEinheitMappingFromRows(headers, rows);

    expect(result.mapping).toEqual({});
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        objekt_id: 'Ra-HS-29',
        zaehler_id: 'Z_MEHRDEUTIG',
        einheit_ids: 'Ra-HS-29_WE_01, Ra-HS-29_WE_02',
        rows: '2, 3',
      }),
    ]);
  });

  it('uses explicit overrides to resolve known incorrect historical mappings', () => {
    const { buildExistingEinheitMappingFromRows } = loadAppsScriptHelpers();
    const headers = ['stand_id', 'objekt_id', 'einheit_id', 'zaehler_id', 'zeitstempel', 'wert'];
    const rows = [
      ['ST_BAD', 'Ra-HS-29', 'Ra-HS-29_WE_010', 'Z_WARMWASSER_WW_WOHNUNG_10', '01.01.2026 00:00', 10],
      ['ST_GOOD', 'Ra-HS-29', 'Ra-HS-29_WE_10', 'Z_WARMWASSER_WW_WOHNUNG_10', '02.01.2026 00:00', 11],
      ['ST_FLUR_OLD', 'Ra-HS-29', 'Ra-HS-29_Allgemein', 'Z_STROM_KWH_FLUR', '01.01.2026 00:00', 12],
      ['ST_FLUR_NEW', 'Ra-HS-29', 'Ra-HS-29_Allgemein_Flur', 'Z_STROM_KWH_FLUR', '02.01.2026 00:00', 13],
    ];

    const result = buildExistingEinheitMappingFromRows(headers, rows);

    expect(result.conflicts).toEqual([]);
    expect(result.mapping['RA-HS-29|Z_WARMWASSER_WW_WOHNUNG_10']).toBe('Ra-HS-29_WE_10');
    expect(result.mapping['RA-HS-29|Z_STROM_KWH_FLUR']).toBe('Ra-HS-29_Allgemein_Flur');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function loadAppsScriptHelpers() {
  const code = readFileSync(
    new URL('../apps-script/Code.gs', import.meta.url),
    'utf8'
  );

  const factory = new Function(
    `${code}; return { BACKEND_VERSION, appendIfMissingByKeys, buildStandId, formatStandIdTimestamp, getItemValueForHeader, getMieterNameForVertrag, getProdTestSeedData, normalizeZaehlerstandItem };`
  );

  return factory();
}

describe('Apps Script Zaehlerstaende helpers', () => {
  it('declares the current backend version', () => {
    const { BACKEND_VERSION } = loadAppsScriptHelpers();

    expect(BACKEND_VERSION).toBe('4.3.0');
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
});

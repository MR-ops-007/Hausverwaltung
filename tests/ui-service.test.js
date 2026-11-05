import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateZaehlerstand, VALIDATION_STATUS } from '../validation-service.js';

const consumptionChartService = new Function(
  readFileSync(new URL('../consumption-charts.js', import.meta.url), 'utf8') +
  '; return consumptionChartService;'
)();
const heatingOilService = new Function(
  readFileSync(new URL('../heating-oil-service.js', import.meta.url), 'utf8') +
  '; return heatingOilService;'
)();

function loadUiService({
  zaehlerstaende = [],
  inputValuesByZaehlerId = {},
  currentMeters = [],
  units = [],
  objects = [],
  viewAktiveMieter = [],
  viewVerbrauchJahr = [],
  viewVerbrauchMonat = [],
  viewVerbrauchAudit = [],
  viewVerbrauchBilanzJahr = [],
  haustechnik = [],
  consumptionData = null,
  loadConsumptionDataImpl = null,
  calcService = {
    buildConsumptionDashboard() {
      return {
        rows: [],
        summary: [],
      };
    },
  },
  saveResponse = { status: 'success' },
  confirmResult = true,
  confirmResults = null,
  validationServiceAvailable = true,
  saveResponses = null,
  serverZaehlerstaende = null,
  processResult = null,
  queueProblems = [],
  promptResult = 'Tippfehler',
  queueEntries = [],
} = {}) {
  const uiServiceCode = readFileSync(
    new URL('../ui-service.js', import.meta.url),
    'utf8'
  );

  const alerts = [];
  const confirms = [];
  const prompts = [];
  const saveCalls = [];
  const processCalls = [];
  const queueCalls = [];

  const dataService = {
    state: {
      zaehlerstaende,
      zaehler: currentMeters,
      einheiten: units,
      objekte: objects,
      view_aktive_mieter: viewAktiveMieter,
      view_verbrauch_jahr: viewVerbrauchJahr,
      view_verbrauch_monat: viewVerbrauchMonat,
      view_verbrauch_audit: viewVerbrauchAudit,
      view_verbrauch_bilanz_jahr: viewVerbrauchBilanzJahr,
      haustechnik,
    },
    setZaehlerstaende(data) {
      if (!data || !Array.isArray(data.Zaehlerstaende)) throw new Error('keine Zählerstände');
      this.state.zaehlerstaende = data.Zaehlerstaende;
    },
    setConsumptionData(data) {
      this.state.view_verbrauch_jahr = data['_view_verbrauch_jahr'] || [];
      this.state.view_verbrauch_monat = data['_view_verbrauch_monat'] || [];
      this.state.view_verbrauch_audit = data['_view_verbrauch_audit'] || [];
      this.state.view_verbrauch_bilanz_jahr = data['_view_verbrauch_bilanz_jahr'] || [];
    },
    getUniqueObjects() {
      return Array.isArray(this.state.objekte)
        ? this.state.objekte.map(o => o.objekt_id)
        : [];
    },
    getUnitsByObject(objektId) {
      return Array.isArray(this.state.einheiten)
        ? this.state.einheiten.filter(e => String(e.objekt_id) === String(objektId))
        : [];
    },
  };

  const cloudService = {
    async loadConsumptionData() {
      if (loadConsumptionDataImpl) return loadConsumptionDataImpl();
      return consumptionData || {
        '_view_verbrauch_jahr': viewVerbrauchJahr,
        '_view_verbrauch_monat': viewVerbrauchMonat,
        '_view_verbrauch_audit': viewVerbrauchAudit,
        '_view_verbrauch_bilanz_jahr': viewVerbrauchBilanzJahr,
      };
    },
    async saveTransaction(payload) {
      saveCalls.push(payload);
      if (Array.isArray(saveResponses)) {
        return saveResponses[Math.min(saveCalls.length, saveResponses.length) - 1];
      }
      return saveResponse;
    },
    ...(serverZaehlerstaende ? { async loadZaehlerstaende() { return { Zaehlerstaende: serverZaehlerstaende }; } } : {}),
    discardQueueEntry(id) { queueCalls.push(['discard', id]); },
    prepareOverwrite(id, grund) { queueCalls.push(['overwrite', id, grund]); },
    prepareNewReading(id) { queueCalls.push(['neu', id]); },
    getQueueProblems() { return queueProblems; },
    getCorruptRaw() { return '{kaputt'; },
    resolveCorruptQueue() { queueCalls.push(['resolve']); return { ok: true, backups: ['offline_queue_defekt_x'], message: 'Gesichert unter: offline_queue_defekt_x' }; },
    async processOfflineQueue(options) {
      processCalls.push(options);
      return processResult || this.getQueueSummary();
    },
    getQueueSummary() {
      return {
        entries: queueEntries,
        pending: queueEntries.filter(entry => entry.status !== 'rejected').length,
        rejected: queueEntries.filter(entry => entry.status === 'rejected').length,
        values: queueEntries.reduce((sum, entry) => sum + entry.payload.data.length, 0),
        problems: queueProblems,
      };
    },
  };

  const modalElement = {
    style: {
      display: 'flex',
    },
  };
  const modalBodyElement = {
    innerHTML: '',
  };
  const elementsById = {
    'modal-container': modalElement,
    'modal-body': modalBodyElement,
    'object-selector-section': { style: { display: 'block' }, innerHTML: '', className: '' },
    'unit-list-section': { style: { display: 'none' }, innerHTML: '', className: '' },
    'consumption-dashboard-section': { style: { display: 'none' }, innerHTML: '', className: '' },
    'nav-meter-entry': { style: {}, innerHTML: '', className: '' },
    'nav-consumption-dashboard': { style: {}, innerHTML: '', className: '' },
    'consumption-object-select': { style: {}, innerHTML: '', value: '', className: '' },
    'consumption-year-select': { style: {}, innerHTML: '', value: '', className: '' },
    'consumption-include-calculated': { style: {}, checked: true, innerHTML: '', className: '' },
    'consumption-status-filter': { style: {}, innerHTML: '', value: 'all', className: '' },
    'consumption-dashboard-output': { style: {}, innerHTML: '', className: '' },
    'sync-queue-status': { style: { display: 'none' }, innerHTML: '' },
  };

  const document = {
    getElementById(id) {
      if (elementsById[id]) {
        return elementsById[id];
      }

      if (id.startsWith('input-')) {
        const zaehlerId = id.replace('input-', '');

        return {
          value: inputValuesByZaehlerId[zaehlerId] ?? '',
        };
      }

      return null;
    },
  };

  const window = {
    validationService: validationServiceAvailable
      ? {
        validateZaehlerstand,
        VALIDATION_STATUS,
      }
      : undefined,
    heatingOilService,
  };

  const alert = (message) => {
    alerts.push(String(message));
  };

  const confirm = (message) => {
    confirms.push(String(message));
    return Array.isArray(confirmResults) ? Boolean(confirmResults[confirms.length - 1]) : confirmResult;
  };

  const prompt = (message) => {
    prompts.push(String(message));
    return promptResult;
  };

  const factory = new Function(
    'dataService',
    'cloudService',
    'window',
    'document',
    'alert',
    'confirm',
    'calcService',
    'prompt',
    'consumptionChartService',
    `${uiServiceCode}; return uiService;`
  );

  const uiService = factory(
    dataService,
    cloudService,
    window,
    document,
    alert,
    confirm,
    calcService,
    prompt,
    consumptionChartService
  );

  uiService.currentActiveMetersObjects = currentMeters;

  return {
    uiService,
    dataService,
    alerts,
    confirms,
    prompts,
    processCalls,
    queueCalls,
    saveCalls,
    modalElement,
    modalBodyElement,
    elementsById,
    cloudService,
  };
}

describe('uiService helper methods', () => {
  it('ordnet ISO-UTC-Monatsgrenzen nach deutscher Zeit ein', () => {
    const { uiService } = loadUiService();

    expect(uiService.parseConsumptionMonth('2025-12-31T23:00:00.000Z')).toEqual({
      year: 2026,
      month: 1,
    });
  });

  it('formats timestamps as DD.MM.YYYY HH:mm', () => {
    const { uiService } = loadUiService();

    const result = uiService.formatGermanTimestamp(
      new Date(2026, 5, 20, 9, 5)
    );

    expect(result).toBe('20.06.2026 09:05');
  });

  it('trennt historische gleiche Werte von identischen Wiederholungen', () => {
    const { uiService } = loadUiService();

    expect(uiService.formatZaehlerSaveSuccess({ angelegt: 1, bereits_vorhanden: 0, ueberschrieben: 0 }))
      .toContain('1 neuer Zählerstand');
    expect(uiService.formatZaehlerSaveSuccess({ angelegt: 0, bereits_vorhanden: 1, ueberschrieben: 0 }))
      .toContain('identische Eingabe');
    expect(uiService.formatZaehlerSaveSuccess({ angelegt: 0, bereits_vorhanden: 1, ueberschrieben: 0 }))
      .toContain('kein neuer Zeitstempel');
  });

  it('builds meter labels from bezeichnung, medium, typ, zaehler_id or fallback', () => {
    const { uiService } = loadUiService();

    expect(uiService.getZaehlerLabel({ bezeichnung: 'Strom HT' })).toBe('Strom HT');
    expect(uiService.getZaehlerLabel({ medium: 'Kaltwasser' })).toBe('Kaltwasser');
    expect(uiService.getZaehlerLabel({ typ: 'Alt-Typ' })).toBe('Alt-Typ');
    expect(uiService.getZaehlerLabel({ zaehler_id: 'Z001' })).toBe('Z001');
    expect(uiService.getZaehlerLabel({})).toBe('Zähler');
  });

  it('formats unit and tenant context for display', () => {
    const { uiService } = loadUiService();

    expect(uiService.getUnitDisplayName({
      einheit_id: 'LOK_WE_10_A',
      nummer: 'Wohnung 10 A',
    })).toBe('Wohnung 10 A');
    expect(uiService.getUnitEntranceLabel({ eingang: 'B' })).toBe('Eingang B');
    expect(uiService.formatMieterDisplayName('Duck, Donald')).toBe('Donald Duck');
    expect(uiService.formatMieterDisplayName('Leerstand')).toBe('Leerstand');
  });

  it('finds the latest meter reading by German timestamp including time', () => {
    const { uiService } = loadUiService({
      zaehlerstaende: [
        {
          zaehler_id: 'Z001',
          wert: 100,
          zeitstempel: '20.06.2026 09:00',
        },
        {
          zaehler_id: 'Z001',
          wert: 150,
          zeitstempel: '20.06.2026 11:30',
        },
        {
          zaehler_id: 'Z002',
          wert: 999,
          zeitstempel: '20.06.2026 12:00',
        },
      ],
    });

    const result = uiService.getLatestZaehlerstand('Z001');

    expect(result.wert).toBe(150);
  });

  it('scopes latest meter readings by object and unit when meter context is provided', () => {
    const { uiService } = loadUiService({
      zaehlerstaende: [
        {
          objekt_id: 'Ra-HS-29',
          einheit_id: 'Ra-HS-29_WE_01',
          zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
          wert: 6647,
          zeitstempel: '20.06.2026 09:00',
        },
        {
          objekt_id: 'TEST',
          einheit_id: 'TEST_WE_01',
          zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
          wert: 100,
          zeitstempel: '20.06.2026 10:00',
        },
      ],
    });

    const result = uiService.getLatestZaehlerstand({
      objekt_id: 'TEST',
      einheit_id: 'TEST_WE_01',
      zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
    });

    expect(result.wert).toBe(100);
  });

  it('does not use real meter history for production test meters with reused zaehler_id', () => {
    const { uiService } = loadUiService({
      zaehlerstaende: [
        {
          objekt_id: 'Ra-HS-29',
          einheit_id: 'Ra-HS-29_WE_01',
          zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
          wert: 6647,
          zeitstempel: '20.06.2026 09:00',
        },
      ],
    });

    const result = uiService.getLatestZaehlerstand({
      objekt_id: 'TEST',
      einheit_id: 'TEST_WE_01',
      zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
    });

    expect(result).toBe(null);
  });

  it('detects manually enterable active meters for the input mask', () => {
    const { uiService } = loadUiService();

    expect(uiService.toBoolean(true)).toBe(true);
    expect(uiService.toBoolean(false)).toBe(false);
    expect(uiService.toBoolean('TRUE')).toBe(true);
    expect(uiService.toBoolean('FALSE')).toBe(false);
    expect(uiService.toBoolean('1')).toBe(true);
    expect(uiService.toBoolean('0')).toBe(false);
    expect(uiService.toBoolean('ja')).toBe(true);
    expect(uiService.toBoolean('nein')).toBe(false);
    expect(uiService.toBoolean('wahr')).toBe(true);
    expect(uiService.toBoolean('falsch')).toBe(false);
    expect(uiService.toBoolean('')).toBe(null);
    expect(uiService.isExplicitFalse(' nein ')).toBe(true);
    expect(uiService.isZaehlerAktiv({ aktiv: 'falsch' })).toBe(false);
    expect(uiService.isZaehlerErfassbar({ erfassbar: 'nein' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: true })).toBe(true);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: 'TRUE' })).toBe(true);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: false })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: 'FALSE' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: '0' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: 'nein' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ erfassbar: false })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ erfassbar: 'FALSE' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ erfassbar: 'falsch' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ berechnet: true })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ berechnet: 'TRUE' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ berechnet: 'wahr' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: 'TRUE', erfassbar: 'ja', berechnet: 'nein' })).toBe(true);
  });

  it('extracts available consumption years from meter readings', () => {
    const { uiService } = loadUiService({
      zaehlerstaende: [
        { zeitstempel: '02.01.2025 00:00' },
        { zeitstempel: '02.01.2026 00:00' },
        { zeitstempel: 'Ungültig' },
      ],
    });

    expect(uiService.getAvailableConsumptionYears()).toEqual(['2026', '2025']);
  });

  it('excludes meters marked in_summe_beruecksichtigen=false from summaries and balances', () => {
    const { uiService } = loadUiService();
    const rows = [
      {
        objekt_id: 'Ra-HS-29',
        einheit_id: 'Ra-HS-29_GE_02',
        zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
        verbrauchsgruppe: 'HAUPTZAEHLER',
        untergruppe: 'PRIVAT_HT',
        medium: 'strom_ht_kwh',
        verbrauch_jahr: 100,
        in_summe_beruecksichtigen: true,
      },
      {
        objekt_id: 'Ra-HS-29',
        einheit_id: 'Ra-HS-29_Allgemein_Flur',
        zaehler_id: 'Z_STROM_KWH_FLUR',
        verbrauchsgruppe: 'ALLGEMEIN',
        untergruppe: 'FLUR',
        medium: 'strom_ht_kwh',
        verbrauch_jahr: 999,
        in_summe_beruecksichtigen: false,
      },
    ];

    const summary = uiService.buildConsumptionSummaryFromViews(rows);
    const balance = uiService.buildFallbackBlackInnBalanceRows(rows);

    expect(summary.reduce((sum, item) => sum + item.verbrauch, 0)).toBe(100);
    expect(balance[0].wert).toBe(100);
    expect(balance[0].missing_source_zaehler_ids).toContain('Z_STROM_KWH_FLUR');
  });
});

describe('uiService consumption dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 30, 12));
  });
  afterEach(() => vi.useRealTimers());
  it('switches to the consumption dashboard view and renders backend view summary plus rows', async () => {
    const calcCalls = [];
    const { uiService, elementsById } = loadUiService({
      objects: [
        {
          objekt_id: 'Ra-HS-29',
          bezeichnung: 'Rathausstraße 29',
        },
      ],
      viewAktiveMieter: [
        {
          einheit_id: 'Ra-HS-29_WE_01',
          mieter_name: 'Duck, Donald',
          start_datum: '01.03.2026',
        },
      ],
      consumptionData: {
        '_view_verbrauch_jahr': [
          {
            jahr: 2026,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            einheit_name: 'Wohnung 1',
            mieter_name: 'Duck, Donald',
            verbrauchsgruppe: 'WOHNUNG',
            untergruppe: '',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            medium: 'strom_ht_kwh',
            bezeichnung: 'Strom Wohnung 1',
            verbrauch_jahr: 253,
            verbrauch_monat_durchschnitt: 21.08,
            anzahl_monate_mit_verbrauch: 7,
            anzahl_warnungen: 1,
            plausibilitaet_status: 'WARNUNG_RUECKLAEUFIG',
            in_summe_beruecksichtigen: true,
          },
          {
            jahr: 2026,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            einheit_name: 'Wohnung 1',
            mieter_name: 'Duck, Donald',
            verbrauchsgruppe: 'WOHNUNG',
            untergruppe: '',
            zaehler_id: 'Z_KALTWASSER_KW_WOHNUNG_1',
            medium: 'kaltwasser_m3',
            bezeichnung: 'Kaltwasser Wohnung 1',
            verbrauch_jahr: 12,
            verbrauch_monat_durchschnitt: 1,
            anzahl_monate_mit_verbrauch: 12,
            anzahl_warnungen: 0,
            plausibilitaet_status: 'OK',
            in_summe_beruecksichtigen: true,
          },
          {
            jahr: 2026,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            einheit_name: 'Wohnung 1',
            mieter_name: 'Duck, Donald',
            verbrauchsgruppe: 'WOHNUNG',
            untergruppe: '',
            zaehler_id: 'Z_WARMWASSER_WW_WOHNUNG_1',
            medium: 'warmwasser_m3',
            bezeichnung: 'Warmwasser Wohnung 1',
            verbrauch_jahr: 6,
            verbrauch_monat_durchschnitt: 0.5,
            anzahl_monate_mit_verbrauch: 12,
            anzahl_warnungen: 0,
            plausibilitaet_status: 'OK',
            in_summe_beruecksichtigen: true,
          },
          {
            jahr: 2026,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_GE_02',
            einheit_name: 'Black Inn',
            mieter_name: 'Leerstand',
            verbrauchsgruppe: 'HAUPTZAEHLER',
            untergruppe: 'PRIVAT_HT',
            zaehler_id: 'Z_STROM_KWH_PRIVAT_HT',
            medium: 'strom_ht_kwh',
            bezeichnung: 'Strom Hauptzähler (privat HT)',
            verbrauch_jahr: 100,
            verbrauch_monat_durchschnitt: 16.67,
            anzahl_monate_mit_verbrauch: 6,
            anzahl_warnungen: 0,
            plausibilitaet_status: 'OK',
            in_summe_beruecksichtigen: true,
          },
          {
            jahr: 2026,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_GE_01',
            einheit_name: 'Kochdippe',
            mieter_name: 'Leerstand',
            verbrauchsgruppe: 'HAUPTZAEHLER',
            untergruppe: 'PRIVAT_HT',
            zaehler_id: 'Z_STROM_KWH_KODI_HT',
            medium: 'strom_ht_kwh',
            bezeichnung: 'Strom Hauptzähler (Imbiss HT)',
            verbrauch_jahr: 50,
            verbrauch_monat_durchschnitt: 8.33,
            anzahl_monate_mit_verbrauch: 6,
            anzahl_warnungen: 0,
            plausibilitaet_status: 'OK',
            in_summe_beruecksichtigen: true,
          },
          {
            jahr: 2026,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_GE_02',
            einheit_name: 'Black Inn',
            mieter_name: 'Leerstand',
            verbrauchsgruppe: 'GEWERBE',
            untergruppe: '',
            zaehler_id: 'Z_STROM_KWH_BUERO',
            medium: 'strom_ht_kwh',
            bezeichnung: 'Strom Büro Zwischenzähler',
            verbrauch_jahr: 25,
            verbrauch_monat_durchschnitt: 4.17,
            anzahl_monate_mit_verbrauch: 6,
            anzahl_warnungen: 0,
            plausibilitaet_status: 'OK',
            in_summe_beruecksichtigen: true,
          },
          {
            jahr: 2026,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_Allgemein_Flur',
            einheit_name: 'Haus',
            mieter_name: 'Leerstand',
            verbrauchsgruppe: 'ALLGEMEIN',
            untergruppe: 'FLUR',
            zaehler_id: 'Z_STROM_KWH_FLUR',
            medium: 'strom_ht_kwh',
            bezeichnung: 'Strom Flur Zwischenzähler',
            verbrauch_jahr: 7,
            verbrauch_monat_durchschnitt: 1.17,
            anzahl_monate_mit_verbrauch: 6,
            anzahl_warnungen: 0,
            plausibilitaet_status: 'OK',
            in_summe_beruecksichtigen: true,
          },
          {
            jahr: 2026,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_Allgemein',
            einheit_name: 'Haus',
            mieter_name: 'Leerstand',
            verbrauchsgruppe: 'BERECHNET',
            untergruppe: '',
            zaehler_id: 'Z_WARMWASSER_BERECHNET',
            medium: 'warmwasser_m3',
            bezeichnung: 'Warmwasser berechnet',
            verbrauch_jahr: 3,
            verbrauch_monat_durchschnitt: 0.25,
            anzahl_monate_mit_verbrauch: 12,
            anzahl_warnungen: 0,
            plausibilitaet_status: 'OK',
            in_summe_beruecksichtigen: true,
            berechnet: true,
          },
          {
            jahr: 2025,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_GE_02',
            einheit_name: 'Black Inn',
            mieter_name: 'Leerstand',
            verbrauchsgruppe: 'GEWERBE',
            untergruppe: '',
            zaehler_id: 'Z_STROM_KWH_BUERO',
            medium: 'strom_ht_kwh',
            bezeichnung: 'Strom Büro Zwischenzähler',
            verbrauch_jahr: 20,
            verbrauch_monat_durchschnitt: 1.67,
            anzahl_monate_mit_verbrauch: 12,
            anzahl_warnungen: 0,
            plausibilitaet_status: 'OK',
            in_summe_beruecksichtigen: true,
          },
          {
            jahr: 2025,
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_10',
            einheit_name: 'WE 10',
            mieter_name: 'Leerstand',
            verbrauchsgruppe: 'WOHNUNG',
            untergruppe: '',
            zaehler_id: 'Z_KALTWASSER_KW_WOHNUNG_10',
            medium: 'kaltwasser_m3',
            bezeichnung: 'Kaltwasser Wohnung 10',
            verbrauch_jahr: 20,
            verbrauch_monat_durchschnitt: 1.67,
            anzahl_monate_mit_verbrauch: 12,
            anzahl_warnungen: 0,
            plausibilitaet_status: 'OK',
            in_summe_beruecksichtigen: true,
          },
        ],
        '_view_verbrauch_monat': [
          '2026-01',
          '2026-02',
          '2026-03',
          '2026-04',
          '2026-05',
          '2026-06',
          '2026-07',
          '2026-08',
          '2026-09',
        ].map(monat => ({
          jahr: 2026,
          monat,
          objekt_id: 'Ra-HS-29',
          einheit_id: 'Ra-HS-29_WE_01',
          zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
          medium: 'strom_ht_kwh',
          verbrauch_monat: 10,
        })),
        '_view_verbrauch_audit': [
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
            status: 'OK',
            readings_count: 2,
            intervalle_count: 1,
          },
          {
            objekt_id: 'Ra-HS-29',
            einheit_id: 'Ra-HS-29_WE_01',
            zaehler_id: 'Z_KALTWASSER_KW_WOHNUNG_1',
            status: 'MONATSZEILEN_ABWEICHUNG',
            readings_count: 4,
            intervalle_count: 3,
            monatszeilen: 2,
            hinweis: 'Monatszeilen prüfen',
          },
        ],
        '_view_verbrauch_bilanz_jahr': [
          {
            jahr: 2026,
            objekt_id: 'Ra-HS-29',
            bilanz_id: 'BILANZ_STROM_BLACK_INN',
            label: 'Strom · Black Inn',
            medium: 'strom_ht_nt_kwh',
            einheit: 'kWh',
            wert: 123,
            wert_monat_durchschnitt: 20.5,
            anzahl_monate_mit_verbrauch: 6,
            source_zaehler_ids: 'Z_STROM_KWH_PRIVAT_HT, Z_STROM_KWH_PRIVAT_NT, Z_STROM_KWH_WOHNUNG_3, Z_STROM_KWH_WOHNUNG_4',
            missing_source_zaehler_ids: '',
            formel_text: 'Privat HT + Privat NT - Flur - Heizung - Büro - Wohnung 3 - Wohnung 4',
            plausibilitaet_status: 'OK',
          },
        ],
      },
      calcService: {
        buildConsumptionDashboard(data, options) {
          calcCalls.push(options);
          return { summary: [], rows: [] };
        },
      },
    });

    await uiService.showConsumptionDashboard();

    expect(elementsById['object-selector-section'].style.display).toBe('none');
    expect(elementsById['consumption-dashboard-section'].style.display).toBe('block');
    expect(elementsById['nav-consumption-dashboard'].className).toBe('tab-btn-active');
    expect(elementsById['consumption-object-select'].innerHTML).toContain('Rathausstraße 29');
    expect(elementsById['consumption-year-select'].innerHTML).toContain('2026');
    expect(calcCalls).toEqual([]);
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Strom');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Wohnung 1');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Donald Duck');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Strom Wohnung 1');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Strom · Wohnungen');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Strom · Black Inn');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Strom · Black Inn · Privat HT');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Strom · Black Inn · Büro');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Strom · Kodi HT');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Berechneter Zeitraum');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Jahresverbrauch');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Abrechnung bis heute');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Vorjahr gesamt');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Jahresverbrauch:</strong> Summe der Monatsverbräuche');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Abrechnung bis heute:</strong> Summe der Monatswerte');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Berechneter Zeitraum:</strong> zeigt die Monatssegmente');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('253 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('70 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('9 Monatssegmente · 7 mit Verbrauch');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Nicht jedes Monatssegment enthält berechenbaren Verbrauch.');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('01.03.2026 - 30.09.2026');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('unterjährig · ab Einzug 01.03.2026');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('100 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('50 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('123 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('25 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('20 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Ø Monat: 1,67 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Kaltwasser Wohnung 10');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Keine Werte');
    expect(elementsById['consumption-dashboard-output'].innerHTML).not.toContain('150 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).not.toContain('353 kWh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('2 Rohwerte');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Verbrauchszeilen');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Fehlende Werte');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Warnungen');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Berechnete Werte');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toMatch(/Verbrauchszeilen[\s\S]*?<strong>9<\/strong>/);
    expect(elementsById['consumption-dashboard-output'].innerHTML).toMatch(/Fehlende Werte[\s\S]*?<strong>2<\/strong>/);
    expect(elementsById['consumption-dashboard-output'].innerHTML).toMatch(/Warnungen[\s\S]*?<strong>2<\/strong>/);
    expect(elementsById['consumption-dashboard-output'].innerHTML).toMatch(/Berechnete Werte[\s\S]*?<strong>2<\/strong>/);
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Datenqualität');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Kaltwasser Wohnung 1');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Prüfen');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('4 Rohwerte · 3 Intervalle · 2 Monatszeilen');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('berechnet');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Bilanz');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Dieser Wert wurde berechnet und nicht manuell erfasst.');

    const summaryHtml = elementsById['consumption-dashboard-output'].innerHTML.split('<div style="overflow:auto;')[0];
    expect(summaryHtml).toContain('Formel und Quellen');
    expect(summaryHtml).toContain('Privat HT + Privat NT - Flur - Heizung - Büro - Wohnung 3 - Wohnung 4');
    expect(summaryHtml.indexOf('Strom · Flur')).toBeLessThan(summaryHtml.indexOf('Strom · Black Inn'));
    expect(summaryHtml.indexOf('Strom · Black Inn')).toBeLessThan(summaryHtml.indexOf('Strom · Wohnungen'));
    expect(summaryHtml).toContain('Strom · Black Inn');
    expect(summaryHtml).not.toContain('Strom · Black Inn · Privat HT');
    expect(summaryHtml).not.toContain('Strom · Black Inn · Büro');

    const detailHtml = elementsById['consumption-dashboard-output'].innerHTML.split('<div style="overflow:auto;')[1];
    expect(detailHtml).toContain('Verbrauchsblock');
    expect(detailHtml).toContain('Haus');
    expect(detailHtml).toContain('Black Inn');
    expect(detailHtml).toContain('border-left:6px solid #16a34a');
    expect(detailHtml).toContain('border-left:6px solid #2563eb');
    expect(detailHtml).toContain('border-left:6px solid #dc2626');
    expect(detailHtml.indexOf('Strom Wohnung 1</div>')).toBeLessThan(detailHtml.indexOf('Kaltwasser Wohnung 1</div>'));
    expect(detailHtml.indexOf('Kaltwasser Wohnung 1</div>')).toBeLessThan(detailHtml.indexOf('Warmwasser Wohnung 1</div>'));

    elementsById['consumption-status-filter'].value = 'missing';
    await uiService.renderConsumptionDashboard();
    const missingDetailHtml = elementsById['consumption-dashboard-output'].innerHTML.split('<div style="overflow:auto;')[1];
    expect(missingDetailHtml).toContain('Kaltwasser Wohnung 10');
    expect(missingDetailHtml).not.toContain('Strom Wohnung 1</div>');

    elementsById['consumption-status-filter'].value = 'warnings';
    await uiService.renderConsumptionDashboard();
    const warningDetailHtml = elementsById['consumption-dashboard-output'].innerHTML.split('<div style="overflow:auto;')[1];
    expect(warningDetailHtml).toContain('Strom Wohnung 1');
    expect(warningDetailHtml).not.toContain('Kaltwasser Wohnung 10');
  });

  it('ignores stale dashboard renders after a user changes the object during loading', async () => {
    let resolveConsumptionLoad;
    const pendingLoad = new Promise(resolve => {
      resolveConsumptionLoad = resolve;
    });
    const { uiService, elementsById } = loadUiService({
      objects: [
        { objekt_id: 'O1', bezeichnung: 'Objekt 1' },
        { objekt_id: 'O2', bezeichnung: 'Objekt 2' },
      ],
      loadConsumptionDataImpl: () => pendingLoad,
    });

    const firstRender = uiService.renderConsumptionDashboard();
    elementsById['consumption-object-select'].value = 'O2';
    elementsById['consumption-object-select'].dataset = {};
    const secondRender = uiService.renderConsumptionDashboard();

    resolveConsumptionLoad({
      '_view_verbrauch_jahr': [
        {
          jahr: 2026,
          objekt_id: 'O1',
          einheit_id: 'O1_WE_01',
          zaehler_id: 'Z_O1',
          bezeichnung: 'Zähler O1',
          medium: 'strom_kwh',
          verbrauch_jahr: 10,
        },
        {
          jahr: 2026,
          objekt_id: 'O2',
          einheit_id: 'O2_WE_01',
          zaehler_id: 'Z_O2',
          bezeichnung: 'Zähler O2',
          medium: 'strom_kwh',
          verbrauch_jahr: 20,
        },
      ],
      '_view_verbrauch_monat': [],
      '_view_verbrauch_audit': [],
      '_view_verbrauch_bilanz_jahr': [],
    });

    await Promise.all([firstRender, secondRender]);

    expect(elementsById['consumption-object-select'].value).toBe('O2');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Objekt 2');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Zähler O2');
    expect(elementsById['consumption-dashboard-output'].innerHTML).not.toContain('Zähler O1');
  });

  it('uses a fallback Black Inn balance tile when backend balance rows are not loaded yet', async () => {
    const { uiService, elementsById } = loadUiService({
      objects: [
        {
          objekt_id: 'Ra-HS-29',
          bezeichnung: 'Rathausstraße 29',
        },
      ],
      consumptionData: {
        '_view_verbrauch_jahr': [
          ['Ra-HS-29_GE_02', 'Z_STROM_KWH_PRIVAT_HT', 'strom_ht_kwh', 'Strom Hauptzähler (privat HT)', 100],
          ['Ra-HS-29_GE_02', 'Z_STROM_KWH_PRIVAT_NT', 'strom_nt_kwh', 'Strom Hauptzähler (privat NT)', 80],
          ['Ra-HS-29_GE_02', 'Z_STROM_KWH_BUERO', 'strom_ht_kwh', 'Strom Büro Zwischenzähler', 10],
          ['Ra-HS-29_Allgemein_Flur', 'Z_STROM_KWH_FLUR', 'strom_ht_kwh', 'Strom Flur Zwischenzähler', 20],
          ['Ra-HS-29_Allgemein_Heizung', 'Z_STROM_KWH_HEIZUNG', 'strom_ht_kwh', 'Strom Heizung Zwischenzähler', 30],
          ['Ra-HS-29_WE_03', 'Z_STROM_KWH_WOHNUNG_3', 'strom_ht_kwh', 'Strom Wohnung 3 Zwischenzähler', 15],
          ['Ra-HS-29_WE_04', 'Z_STROM_KWH_WOHNUNG_4', 'strom_ht_kwh', 'Strom Wohnung 4 Zwischenzähler', 5],
        ].map(([einheit_id, zaehler_id, medium, bezeichnung, verbrauch_jahr]) => ({
          jahr: 2026,
          objekt_id: 'Ra-HS-29',
          einheit_id,
          einheit_name: einheit_id === 'Ra-HS-29_GE_02' ? 'Black Inn' : 'Haus',
          mieter_name: 'Leerstand',
          verbrauchsgruppe: einheit_id.indexOf('_GE_') !== -1 ? 'HAUPTZAEHLER' : 'ALLGEMEIN',
          untergruppe: zaehler_id.indexOf('_NT') !== -1 ? 'PRIVAT_NT' : zaehler_id.indexOf('_HT') !== -1 ? 'PRIVAT_HT' : '',
          zaehler_id,
          medium,
          bezeichnung,
          verbrauch_jahr,
          verbrauch_monat_durchschnitt: verbrauch_jahr / 12,
          anzahl_monate_mit_verbrauch: 12,
          anzahl_warnungen: 0,
          plausibilitaet_status: 'OK',
          in_summe_beruecksichtigen: true,
        })),
        '_view_verbrauch_monat': [],
        '_view_verbrauch_audit': [],
        '_view_verbrauch_bilanz_jahr': [],
      },
    });

    await uiService.showConsumptionDashboard();

    const summaryHtml = elementsById['consumption-dashboard-output'].innerHTML.split('<div style="overflow:auto;')[0];
    expect(summaryHtml).toContain('Strom · Black Inn');
    expect(summaryHtml).toContain('100 kWh');
    expect(summaryHtml).not.toContain('Strom · Black Inn · Privat HT');
    expect(summaryHtml).not.toContain('Strom · Black Inn · Privat NT');
    expect(summaryHtml).not.toContain('Strom · Black Inn · Büro');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Keine offenen Datenqualitäts-Hinweise für diese Auswahl.');
  });
});

describe('uiService.showZaehlerMaske', () => {
  it('renders only active manually enterable meters', () => {
    const { uiService, modalBodyElement, modalElement } = loadUiService({
      currentMeters: [
        {
          zaehler_id: 'Z_NORMAL',
          einheit_id: 'WE001',
          bezeichnung: 'Normaler Zähler',
          aktiv: 'TRUE',
          erfassbar: 'TRUE',
          berechnet: 'FALSE',
        },
        {
          zaehler_id: 'Z_INAKTIV',
          einheit_id: 'WE001',
          bezeichnung: 'Alter Zähler',
          aktiv: 'FALSE',
        },
        {
          zaehler_id: 'Z_NICHT_ERFASSBAR',
          einheit_id: 'WE001',
          bezeichnung: 'Nicht erfassbarer Zähler',
          erfassbar: 'FALSE',
        },
        {
          zaehler_id: 'Z_BERECHNET',
          einheit_id: 'WE001',
          bezeichnung: 'Berechneter Verbrauch',
          berechnet: 'TRUE',
        },
        {
          zaehler_id: 'Z_ANDERE_EINHEIT',
          einheit_id: 'WE002',
          bezeichnung: 'Andere Einheit',
        },
      ],
    });

    uiService.showZaehlerMaske('WE001');

    expect(uiService.currentActiveMetersObjects).toHaveLength(1);
    expect(uiService.currentActiveMetersObjects[0].zaehler_id).toBe('Z_NORMAL');
    expect(modalBodyElement.innerHTML).toContain('Normaler Zähler');
    expect(modalBodyElement.innerHTML).not.toContain('Alter Zähler');
    expect(modalBodyElement.innerHTML).not.toContain('Nicht erfassbarer Zähler');
    expect(modalBodyElement.innerHTML).not.toContain('Berechneter Verbrauch');
    expect(modalElement.style.display).toBe('flex');
  });

  it('renders unit name, entrance, tenant and meter location in the input mask', () => {
    const { uiService, modalBodyElement } = loadUiService({
      units: [
        {
          einheit_id: 'LOK_WE_10_A',
          nummer: 'Wohnung 10 A',
          eingang: 'B',
        },
      ],
      viewAktiveMieter: [
        {
          einheit_id: 'LOK_WE_10_A',
          mieter_name: 'Duck, Donald',
        },
      ],
      currentMeters: [
        {
          zaehler_id: 'STROM',
          einheit_id: 'LOK_WE_10_A',
          bezeichnung: 'Strom Wohnung 10 A',
          einbauort: 'Eingang B',
          aktiv: 'TRUE',
          erfassbar: 'TRUE',
          berechnet: 'FALSE',
        },
      ],
    });

    uiService.showZaehlerMaske('LOK_WE_10_A');

    expect(modalBodyElement.innerHTML).toContain('Wohnung 10 A');
    expect(modalBodyElement.innerHTML).toContain('Eingang B');
    expect(modalBodyElement.innerHTML).toContain('Donald Duck');
    expect(modalBodyElement.innerHTML).toContain('Einbauort: Eingang B');
  });

  it('renders the latest reading with timestamp for each meter in the input mask', () => {
    const { uiService, modalBodyElement } = loadUiService({
      currentMeters: [
        {
          zaehler_id: 'Z_STROM',
          objekt_id: 'OBJ001',
          einheit_id: 'WE001',
          bezeichnung: 'Strom Wohnung 1',
          medium: 'strom_ht_kwh',
          aktiv: 'TRUE',
          erfassbar: 'TRUE',
          berechnet: 'FALSE',
        },
      ],
      zaehlerstaende: [
        {
          zaehler_id: 'Z_STROM',
          objekt_id: 'OBJ001',
          einheit_id: 'WE001',
          wert: 123.45,
          zeitstempel: '01.06.2026 08:30',
        },
        {
          zaehler_id: 'Z_STROM',
          objekt_id: 'OBJ001',
          einheit_id: 'WE001',
          wert: 130,
          zeitstempel: '2026-07-03T07:00:00.000Z',
        },
        {
          zaehler_id: 'Z_STROM',
          objekt_id: 'OBJ001',
          einheit_id: 'WE002',
          wert: 999,
          zeitstempel: '04.07.2026 09:00',
        },
      ],
    });

    uiService.showZaehlerMaske('WE001');

    expect(modalBodyElement.innerHTML).toContain('Letzter Stand');
    expect(modalBodyElement.innerHTML).toContain('130 kWh');
    expect(modalBodyElement.innerHTML).toContain('03.07.2026 09:00');
    expect(modalBodyElement.innerHTML).not.toContain('999');
  });

  it('renders a helpful note if no previous reading exists for a meter', () => {
    const { uiService, modalBodyElement } = loadUiService({
      currentMeters: [
        {
          zaehler_id: 'Z_NEU',
          einheit_id: 'WE001',
          bezeichnung: 'Neuer Zähler',
          aktiv: 'TRUE',
          erfassbar: 'TRUE',
          berechnet: 'FALSE',
        },
      ],
    });

    uiService.showZaehlerMaske('WE001');

    expect(modalBodyElement.innerHTML).toContain('Noch keine Ablesung vorhanden.');
  });

  it('colors meter cards by medium', () => {
    const { uiService, modalBodyElement } = loadUiService({
      currentMeters: [
        {
          zaehler_id: 'Z_STROM',
          einheit_id: 'WE001',
          bezeichnung: 'Strom',
          medium: 'strom_ht_kwh',
        },
        {
          zaehler_id: 'Z_KALTWASSER',
          einheit_id: 'WE001',
          bezeichnung: 'Kaltwasser',
          medium: 'kaltwasser_m3',
        },
        {
          zaehler_id: 'Z_WARMWASSER',
          einheit_id: 'WE001',
          bezeichnung: 'Warmwasser',
          medium: 'warmwasser_m3',
        },
        {
          zaehler_id: 'Z_OEL',
          einheit_id: 'WE001',
          bezeichnung: 'Öl',
          medium: 'oel_stand_cm',
        },
      ],
    });

    uiService.showZaehlerMaske('WE001');

    expect(modalBodyElement.innerHTML).toContain('background:#f0fdf4');
    expect(modalBodyElement.innerHTML).toContain('background:#eff6ff');
    expect(modalBodyElement.innerHTML).toContain('background:#fef2f2');
    expect(modalBodyElement.innerHTML).toContain('background:#fffbeb');
  });

  it('rechnet die Heizöl-Tabelle mit denselben Betankungsdaten wie das Diagramm', () => {
    const level = {
      objekt_id: 'Ra-HS-29', einheit_id: 'Ra-HS-29_Allgemein',
      zaehler_id: 'Z_OEL_STAND_IN_CM', medium: 'oel_stand_cm',
    };
    const fill = { ...level, zaehler_id: 'Z_OEL_STAND_L', medium: 'oel_stand_l' };
    const reading = (meter, zeitstempel, wert) => ({ ...meter, zeitstempel, wert });
    const { uiService } = loadUiService({
      currentMeters: [level, fill],
      zaehlerstaende: [
        reading(level, '01.01.2026 08:00', 100),
        reading(level, '10.01.2026 14:00', 90),
        reading(fill, '01.01.2026 08:00', 1000),
        reading(fill, '10.01.2026 12:00', 4000),
      ],
    });

    const report = uiService.getOilConsumptionReport(level, 2026);

    // 3.000 l getankt, 10 cm gefallen: 3.000 l + 10 cm x (10.000 l / 140 cm).
    expect(report.totalLiters).toBeCloseTo(3000 + 10 * (10000 / 140), 0);
    expect(report.refills[0].status).toBe('FUELLUNG_REKONSTRUIERT');
  });

  it('renders a helpful message if no manually enterable meters exist', () => {
    const { uiService, modalBodyElement, modalElement } = loadUiService({
      currentMeters: [
        {
          zaehler_id: 'Z_INAKTIV',
          einheit_id: 'WE001',
          bezeichnung: 'Inaktiver Zähler',
          aktiv: false,
        },
        {
          zaehler_id: 'Z_NICHT_ERFASSBAR',
          einheit_id: 'WE001',
          bezeichnung: 'Nicht erfassbarer Zähler',
          erfassbar: 'nein',
        },
        {
          zaehler_id: 'Z_BERECHNET',
          einheit_id: 'WE001',
          bezeichnung: 'Berechneter Wert',
          berechnet: 'wahr',
        },
        {
          zaehler_id: 'Z_ANDERE_EINHEIT',
          einheit_id: 'WE002',
          bezeichnung: 'Andere Einheit',
        },
      ],
    });

    uiService.showZaehlerMaske('WE001');

    expect(uiService.currentActiveMetersObjects).toHaveLength(0);
    expect(modalBodyElement.innerHTML).toContain('keine manuell erfassbaren Zähler');
    expect(modalBodyElement.innerHTML).not.toContain('Inaktiver Zähler');
    expect(modalBodyElement.innerHTML).not.toContain('Nicht erfassbarer Zähler');
    expect(modalBodyElement.innerHTML).not.toContain('Berechneter Wert');
    expect(modalBodyElement.innerHTML).not.toContain('Andere Einheit');
    expect(modalBodyElement.innerHTML).not.toContain('uiService.saveZaehler()');
    expect(modalElement.style.display).toBe('flex');
  });
});

describe('uiService.saveZaehler', () => {
  beforeEach(() => {
    // Intentionally empty.
    // Kept for future setup without changing test structure.
  });

  it('saves a normal increasing meter value', async () => {
    const meter = {
      zaehler_id: 'Z001',
      objekt_id: 'OBJ001',
      einheit_id: 'WE001',
      bezeichnung: 'Strom HT',
    };

    const { uiService, saveCalls, alerts, confirms, modalElement } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: {
        Z001: '1250',
      },
      zaehlerstaende: [
        {
          objekt_id: 'OBJ001',
          einheit_id: 'WE001',
          zaehler_id: 'Z001',
          wert: 1200,
          zeitstempel: '20.06.2026 09:00',
        },
      ],
    });

    await uiService.saveZaehler();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].typ).toBe('ZAEHLERSTAND_NEU');
    expect(saveCalls[0].data).toHaveLength(1);
    expect(saveCalls[0].data[0]).toMatchObject({
      objekt_id: 'OBJ001',
      einheit_id: 'WE001',
      zaehler_id: 'Z001',
      wert: 1250,
      quelle: 'UI',
    });
    expect(saveCalls[0].data[0].zeitstempel).toMatch(
      /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/
    );
    expect(confirms).toHaveLength(0);
    expect(alerts).toContain('Erfolgreich gespeichert!');
    expect(modalElement.style.display).toBe('none');
  });

  it('schlägt nach einer Tankfüllung ohne neuen Ölstand den maximalen Füllstand vor', async () => {
    const fillMeter = {
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_Allgemein',
      zaehler_id: 'Z_OEL_GETANKT_LITER',
      medium: 'oel_stand_l',
      bezeichnung: 'Heizung Öl getankt (Liter)',
    };
    const levelMeter = {
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_Allgemein',
      zaehler_id: 'Z_OEL_STAND_IN_CM',
      medium: 'oel_stand_cm',
      bezeichnung: 'Heizung Ölstand (cm)',
    };
    const { uiService, saveCalls, confirms, alerts } = loadUiService({
      currentMeters: [fillMeter, levelMeter],
      inputValuesByZaehlerId: { Z_OEL_GETANKT_LITER: '3000' },
    });

    await uiService.saveZaehler();

    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toContain('Tankfüllung');
    expect(saveCalls[0].data).toHaveLength(2);
    expect(saveCalls[0].data).toEqual(expect.arrayContaining([
      expect.objectContaining({ zaehler_id: 'Z_OEL_GETANKT_LITER', wert: 3000 }),
      expect.objectContaining({ zaehler_id: 'Z_OEL_STAND_IN_CM', wert: 140 }),
    ]));
    expect(alerts).toContain('Erfolgreich gespeichert!');
  });

  it('ordnet eine Zusatztank-Füllung dem Zusatztank statt dem Haupttank zu', async () => {
    const mainLevelMeter = {
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_Allgemein',
      zaehler_id: 'Z_OEL_STAND_IN_CM',
      medium: 'oel_stand_cm',
      bezeichnung: 'Heizung Ölstand (cm)',
    };
    const auxiliaryFillMeter = {
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_Allgemein',
      zaehler_id: 'Z_OEL_GETANKT_LITER_ZUSATZTANK',
      medium: 'oel_stand_l',
      bezeichnung: 'Heizung Zusatztank Öl getankt (Liter)',
    };
    const auxiliaryLevelMeter = {
      objekt_id: 'Ra-HS-29',
      einheit_id: 'Ra-HS-29_Allgemein',
      zaehler_id: 'Z_OEL_STAND_IN_CM_ZUSATZTANK',
      medium: 'oel_stand_cm',
      bezeichnung: 'Heizung Ölstand Zusatztank',
    };
    const { uiService, saveCalls } = loadUiService({
      currentMeters: [mainLevelMeter, auxiliaryFillMeter, auxiliaryLevelMeter],
      inputValuesByZaehlerId: { Z_OEL_GETANKT_LITER_ZUSATZTANK: '1000' },
    });

    await uiService.saveZaehler();

    expect(saveCalls[0].data).toEqual(expect.arrayContaining([
      expect.objectContaining({ zaehler_id: 'Z_OEL_GETANKT_LITER_ZUSATZTANK', wert: 1000 }),
      expect.objectContaining({ zaehler_id: 'Z_OEL_STAND_IN_CM_ZUSATZTANK', wert: 140 }),
    ]));
    expect(saveCalls[0].data).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ zaehler_id: 'Z_OEL_STAND_IN_CM', wert: 140 }),
    ]));
  });

  it('blocks negative values and does not save', async () => {
    const meter = {
      zaehler_id: 'Z001',
      objekt_id: 'OBJ001',
      einheit_id: 'WE001',
      bezeichnung: 'Strom HT',
    };

    const { uiService, saveCalls, alerts, confirms } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: {
        Z001: '-1',
      },
      zaehlerstaende: [
        {
          objekt_id: 'OBJ001',
          einheit_id: 'WE001',
          zaehler_id: 'Z001',
          wert: 1200,
          zeitstempel: '20.06.2026 09:00',
        },
      ],
    });

    await uiService.saveZaehler();

    expect(saveCalls).toHaveLength(0);
    expect(confirms).toHaveLength(0);
    expect(alerts.join('\n')).toContain('fehlerhaft');
  });

  it('warns for lower value without explanation and cancels if user rejects confirmation', async () => {
    const meter = {
      zaehler_id: 'Z001',
      objekt_id: 'OBJ001',
      einheit_id: 'WE001',
      bezeichnung: 'Strom HT',
    };

    const { uiService, saveCalls, alerts, confirms } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: {
        Z001: '900',
      },
      zaehlerstaende: [
        {
          objekt_id: 'OBJ001',
          einheit_id: 'WE001',
          zaehler_id: 'Z001',
          wert: 1200,
          zeitstempel: '20.06.2026 09:00',
        },
      ],
      confirmResult: false,
    });

    await uiService.saveZaehler();

    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toContain('Plausibilitätswarnungen');
    expect(saveCalls).toHaveLength(0);
    expect(alerts).not.toContain('Erfolgreich gespeichert!');
  });

  it('warns for lower value without explanation and saves if user confirms', async () => {
    const meter = {
      zaehler_id: 'Z001',
      objekt_id: 'OBJ001',
      einheit_id: 'WE001',
      bezeichnung: 'Strom HT',
    };

    const { uiService, saveCalls, confirms, alerts } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: {
        Z001: '900',
      },
      zaehlerstaende: [
        {
          objekt_id: 'OBJ001',
          einheit_id: 'WE001',
          zaehler_id: 'Z001',
          wert: 1200,
          zeitstempel: '20.06.2026 09:00',
        },
      ],
      confirmResult: true,
    });

    await uiService.saveZaehler();

    expect(confirms).toHaveLength(1);
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].data[0].wert).toBe(900);
    expect(alerts).toContain('Erfolgreich gespeichert!');
  });

  it('accepts lower value as 4-digit overflow without confirmation when consumption is plausible', async () => {
    const meter = {
      zaehler_id: 'Z001',
      objekt_id: 'OBJ001',
      einheit_id: 'WE001',
      bezeichnung: 'Strom Zwischenzähler',
      stellen: 4,
      ueberlauf_erlaubt: true,
      max_plausibler_verbrauch: 500,
    };

    const { uiService, saveCalls, confirms, alerts } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: {
        Z001: '123',
      },
      zaehlerstaende: [
        {
          objekt_id: 'OBJ001',
          einheit_id: 'WE001',
          zaehler_id: 'Z001',
          wert: 9876,
          zeitstempel: '20.06.2026 09:00',
        },
      ],
    });

    await uiService.saveZaehler();

    expect(confirms).toHaveLength(0);
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].data[0].wert).toBe(123);
    expect(alerts).toContain('Erfolgreich gespeichert!');
  });

  it('adds successful saves to local history so production test meters are validated immediately', async () => {
    const meter = {
      zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
      objekt_id: 'TEST',
      einheit_id: 'TEST_WE_01',
      bezeichnung: 'Strom Wohnung 1 TEST',
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 10, 0));

    const firstRun = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: {
        Z_STROM_KWH_WOHNUNG_1: '100',
      },
    });

    await firstRun.uiService.saveZaehler();

    // Erst eine spätere Minute ist eine neue Ablesung; dieselbe Minute wäre eine Korrektur.
    vi.setSystemTime(new Date(2026, 9, 30, 10, 30));

    expect(firstRun.saveCalls).toHaveLength(1);
    expect(firstRun.dataService.state.zaehlerstaende).toEqual([
      expect.objectContaining({
        objekt_id: 'TEST',
        einheit_id: 'TEST_WE_01',
        zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
        wert: 100,
      }),
    ]);

    firstRun.uiService.currentActiveMetersObjects = [meter];
    firstRun.dataService.state.zaehler = [meter];

    const secondInputDocument = {
      getElementById(id) {
        if (id.startsWith('input-')) {
          return { value: '90' };
        }

        if (id === 'modal-container') {
          return { style: { display: 'flex' } };
        }

        return null;
      },
    };

    const secondFactory = new Function(
      'dataService',
      'cloudService',
      'window',
      'document',
      'alert',
      'confirm',
      `${readFileSync(new URL('../ui-service.js', import.meta.url), 'utf8')}; return uiService;`
    );
    const secondUiService = secondFactory(
      firstRun.dataService,
      {
        async saveTransaction(payload) {
          firstRun.saveCalls.push(payload);
          return { status: 'success' };
        },
      },
      {
        validationService: {
          validateZaehlerstand,
          VALIDATION_STATUS,
        },
      },
      secondInputDocument,
      message => firstRun.alerts.push(String(message)),
      message => {
        firstRun.confirms.push(String(message));
        return false;
      }
    );

    secondUiService.currentActiveMetersObjects = [meter];

    await secondUiService.saveZaehler();

    expect(firstRun.confirms).toHaveLength(1);
    expect(firstRun.confirms[0]).toContain('Plausibilitätswarnungen');
    expect(firstRun.confirms[0]).toContain('Alt: 100');
    expect(firstRun.confirms[0]).toContain('Neu: 90');
    expect(firstRun.saveCalls).toHaveLength(1);
    vi.useRealTimers();
  });

  it('uses built-in validation fallback if the browser module did not initialize', async () => {
    const meter = {
      zaehler_id: 'Z_OEL_STAND_IN_CM',
      objekt_id: 'TEST',
      einheit_id: 'TEST_Allgemein',
      bezeichnung: 'Heizung Ölstand (cm) TEST',
      medium: 'oel_stand_cm',
    };

    const { uiService, saveCalls, confirms, alerts } = loadUiService({
      validationServiceAvailable: false,
      currentMeters: [meter],
      inputValuesByZaehlerId: {
        Z_OEL_STAND_IN_CM: '55',
      },
      zaehlerstaende: [
        {
          objekt_id: 'TEST',
          einheit_id: 'TEST_Allgemein',
          zaehler_id: 'Z_OEL_STAND_IN_CM',
          wert: 33,
          zeitstempel: '28.06.2026 10:00',
        },
      ],
      confirmResult: false,
    });

    await uiService.saveZaehler();

    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toContain('Füllstand ist höher');
    expect(saveCalls).toHaveLength(0);
    expect(alerts).not.toContain('Plausibilitätsprüfung konnte nicht geladen werden. Speicherung wurde aus Sicherheitsgründen abgebrochen.');
  });

  it('ignores empty inputs and alerts if no values were entered', async () => {
    const meter = {
      zaehler_id: 'Z001',
      objekt_id: 'OBJ001',
      einheit_id: 'WE001',
      bezeichnung: 'Strom HT',
    };

    const { uiService, saveCalls, alerts, confirms } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: {
        Z001: '',
      },
    });

    await uiService.saveZaehler();

    expect(saveCalls).toHaveLength(0);
    expect(confirms).toHaveLength(0);
    expect(alerts).toContain('Keine Werte eingetragen.');
  });
});


describe('uiService.saveZaehler: stand_id, Korrektur und Konflikt', () => {
  const meter = {
    zaehler_id: 'Z_WASSER_1',
    objekt_id: 'TEST',
    einheit_id: 'TEST_WE_01',
    bezeichnung: 'Wasser Wohnung 1 TEST',
  };
  const standId = 'ST_Z_WASSER_1_2026-10-30 10:00';
  const earlier = { objekt_id: 'TEST', einheit_id: 'TEST_WE_01', zaehler_id: 'Z_WASSER_1', wert: 1400, zeitstempel: '29.10.2026 08:00' };
  const typo = { ...earlier, wert: 1950, zeitstempel: '30.10.2026 10:00', stand_id: standId };
  const conflict = { status: 'error', code: 'CONFLICT', message: 'Konflikt', conflicts: [{ stand_id: standId, zaehler_id: 'Z_WASSER_1', alter_wert: 1950, neuer_wert: 1590 }] };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('bildet die stand_id aus Zähler und Minute des Zeitstempels', () => {
    const { uiService } = loadUiService();
    expect(uiService.buildStandId('Z1', '02.06.2026 09:05')).toBe('ST_Z1_2026-06-02 09:05');
    expect(uiService.buildStandId('Z1', '2.6.2026 9:05')).toBe('ST_Z1_2026-06-02 09:05');
    expect(uiService.buildStandId('Z1', 'kaputt')).toBe('');
  });

  it('sendet die stand_id mit, damit Wiederholungen von jedem Gerät dieselbe Identität haben', async () => {
    const { uiService, saveCalls } = loadUiService({ currentMeters: [meter], inputValuesByZaehlerId: { Z_WASSER_1: '1450' }, zaehlerstaende: [earlier] });
    await uiService.saveZaehler();
    expect(saveCalls[0].data[0]).toMatchObject({ zaehler_id: 'Z_WASSER_1', zeitstempel: '30.10.2026 10:00', stand_id: standId });
    expect(saveCalls[0].ueberschreiben).toBeUndefined();
  });

  it('nutzt bei einer Korrektur in derselben Minute den Wert davor als Vergleich, nicht den Tippfehler', async () => {
    const { uiService, saveCalls, confirms, alerts } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: { Z_WASSER_1: '1450' },
      zaehlerstaende: [{ ...earlier }, { ...typo }],
    });
    await uiService.saveZaehler();
    expect(alerts.filter(message => message.includes('fehlerhaft'))).toEqual([]);
    expect(confirms).toEqual([]);
    expect(saveCalls).toHaveLength(1);
  });

  it('warnt bei Konflikt, verlangt einen Grund und sendet das Überschreiben mit Grund', async () => {
    const { uiService, saveCalls, confirms, prompts, alerts, dataService } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: { Z_WASSER_1: '1450' },
      zaehlerstaende: [{ ...earlier }, { ...typo }],
      saveResponses: [conflict, { status: 'success' }],
      promptResult: 'Zahlendreher',
    });
    await uiService.saveZaehler();

    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toContain('Wasser Wohnung 1 TEST');
    expect(confirms[0]).toContain('gespeichert 1950 → neu 1590');
    expect(prompts).toHaveLength(1);
    expect(saveCalls).toHaveLength(2);
    expect(saveCalls[1]).toMatchObject({ typ: 'ZAEHLERSTAND_NEU', ueberschreiben: { grund: 'Zahlendreher' } });
    expect(alerts).toContain('Erfolgreich gespeichert!');
    // lokale Historie: Wert ersetzt, keine zweite Zeile für dieselbe Minute
    const rows = dataService.state.zaehlerstaende.filter(row => row.stand_id === standId);
    expect(rows).toHaveLength(1);
    expect(rows[0].wert).toBe(1450);
  });

  it('überschreibt nicht, wenn die Warnung abgelehnt wird', async () => {
    const { uiService, saveCalls, dataService, prompts } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: { Z_WASSER_1: '1450' },
      zaehlerstaende: [{ ...earlier }, { ...typo }],
      saveResponses: [conflict],
      confirmResult: false,
    });
    await uiService.saveZaehler();
    expect(saveCalls).toHaveLength(1);
    expect(prompts).toEqual([]);
    expect(dataService.state.zaehlerstaende.find(row => row.stand_id === standId).wert).toBe(1950);
  });

  it('überschreibt nicht ohne Grund', async () => {
    const { uiService, saveCalls, alerts } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: { Z_WASSER_1: '1450' },
      zaehlerstaende: [{ ...earlier }, { ...typo }],
      saveResponses: [conflict],
      promptResult: '  ',
    });
    await uiService.saveZaehler();
    expect(saveCalls).toHaveLength(1);
    expect(alerts.some(message => message.includes('Ohne Grund'))).toBe(true);
  });

  it('sagt deutlich, dass offline gespeicherte Werte noch nicht in der Datenbank sind', async () => {
    const { uiService, alerts } = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: { Z_WASSER_1: '1450' },
      zaehlerstaende: [{ ...earlier }],
      saveResponse: { status: 'success', queued: true, message: 'Offline gespeichert' },
    });
    await uiService.saveZaehler();
    expect(alerts[0]).toContain('NICHT in der Datenbank');
    expect(alerts).not.toContain('Erfolgreich gespeichert!');
  });
});

describe('uiService.renderSyncQueueStatus', () => {
  const meter = { zaehler_id: 'Z1', bezeichnung: 'Kaltwasser' };
  const pending = { id: 'e1', status: 'pending', payload: { data: [{ zaehler_id: 'Z1', wert: 12, zeitstempel: '30.10.2026 10:00' }] } };
  const rejected = {
    id: 'e2', status: 'rejected', code: 'CONFLICT', message: 'Konflikt <b>',
    conflicts: [{ alter_wert: 1950, neuer_wert: 1590 }],
    payload: { data: [{ zaehler_id: 'Z1', wert: 1590, zeitstempel: '30.10.2026 10:00' }] },
  };

  it('blendet die Anzeige aus, wenn alles gespeichert ist', () => {
    const { uiService, elementsById } = loadUiService({ queueEntries: [] });
    elementsById['sync-queue-status'].style.display = 'block';
    uiService.renderSyncQueueStatus();
    expect(elementsById['sync-queue-status'].style.display).toBe('none');
    expect(elementsById['sync-queue-status'].innerHTML).toBe('');
  });

  it('zeigt Anzahl, Hinweis auf Ablehnungen und den Button zum erneuten Senden', () => {
    const { uiService, elementsById } = loadUiService({ queueEntries: [pending, rejected], currentMeters: [meter] });
    uiService.renderSyncQueueStatus();
    const el = elementsById['sync-queue-status'];
    expect(el.style.display).toBe('block');
    expect(el.innerHTML).toContain('2 Werte noch nicht in der Datenbank gespeichert');
    expect(el.innerHTML).toContain('1 wurde abgelehnt');
    expect(el.innerHTML).toContain('uiService.retrySyncQueue()');
    expect(el.innerHTML).not.toContain('Kaltwasser'); // Details sind zugeklappt
  });

  it('listet in den Details Werte, Grund und Aktionen und maskiert Backend-Texte', () => {
    const { uiService, elementsById } = loadUiService({ queueEntries: [pending, rejected], currentMeters: [meter] });
    uiService.toggleSyncQueueDetails();
    const html = elementsById['sync-queue-status'].innerHTML;
    expect(html).toContain('Kaltwasser: 12 (30.10.2026 10:00)');
    expect(html).toContain('Gespeichert ist 1950, erfasst wurde 1590');
    expect(html).toContain("uiService.overwriteQueueEntry('e2')");
    expect(html).toContain("uiService.discardQueueEntry('e1')");
    expect(html).toContain('Konflikt &lt;b&gt;');
    expect(html).not.toContain('Konflikt <b>');
  });
});


describe('uiService.saveZaehler: Korrektur nach Minutenwechsel', () => {
  const meter = { zaehler_id: 'Z_WASSER_1', objekt_id: 'TEST', einheit_id: 'TEST_WE_01', bezeichnung: 'Wasser Wohnung 1 TEST' };
  const earlier = { objekt_id: 'TEST', einheit_id: 'TEST_WE_01', zaehler_id: 'Z_WASSER_1', wert: 1400, zeitstempel: '29.10.2026 08:00' };
  const oldStandId = 'ST_Z_WASSER_1_2026-10-30 13:50';
  const typo = { ...earlier, wert: 1950, zeitstempel: '30.10.2026 13:50', stand_id: oldStandId };
  const nearConflict = {
    status: 'error', code: 'CONFLICT', message: 'Konflikt',
    conflicts: [{ art: 'NAHE_ABLESUNG', stand_id: oldStandId, zaehler_id: 'Z_WASSER_1', alter_wert: 1950, neuer_wert: 1590, alte_zeit: '30.10.2026 13:50', minuten_abstand: 1 }],
  };
  const setup = extra => loadUiService({
    currentMeters: [meter],
    inputValuesByZaehlerId: { Z_WASSER_1: '1590' },
    zaehlerstaende: [{ ...earlier }, { ...typo }],
    ...extra,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 13, 51, 4)); // 13:50:55 getippt, 13:51:04 korrigiert
  });
  afterEach(() => vi.useRealTimers());

  it('vergleicht die Korrektur nicht mit dem Tippfehler aus der Minute davor', async () => {
    const { uiService, alerts } = setup({ saveResponses: [{ status: 'success' }] });
    await uiService.saveZaehler();
    expect(alerts.filter(message => message.includes('fehlerhaft'))).toEqual([]);
  });

  it('überschreibt die Zeile der Minute davor mit Grund, ohne zweite Zeile', async () => {
    const { uiService, saveCalls, confirms, dataService } = setup({
      saveResponses: [nearConflict, { status: 'success' }],
      promptResult: 'Zahlendreher',
    });
    await uiService.saveZaehler();

    expect(confirms[0]).toContain('vor 1 Min. (30.10.2026 13:50) gespeichert 1950 → neu 1590');
    expect(saveCalls[0].data[0].stand_id).toBe('ST_Z_WASSER_1_2026-10-30 13:51');
    expect(saveCalls[1]).toMatchObject({ ueberschreiben: { grund: 'Zahlendreher' } });
    expect(saveCalls[1].neueAblesung).toBeUndefined();
    const rows = dataService.state.zaehlerstaende.filter(row => row.zaehler_id === 'Z_WASSER_1');
    expect(rows.map(row => row.wert)).toEqual([1400, 1590]);
  });

  it('bietet statt des Überschreibens an, den Wert als neue Ablesung zu speichern', async () => {
    const { uiService, saveCalls, confirms, prompts, dataService } = setup({
      saveResponses: [nearConflict, { status: 'success' }],
      confirmResults: [false, true],
    });
    await uiService.saveZaehler();

    expect(confirms).toHaveLength(2);
    expect(confirms[1]).toContain('zusätzliche, neue Ablesung');
    expect(prompts).toEqual([]);
    expect(saveCalls[1]).toMatchObject({ neueAblesung: true });
    expect(saveCalls[1].ueberschreiben).toBeUndefined();
    const rows = dataService.state.zaehlerstaende.filter(row => row.zaehler_id === 'Z_WASSER_1');
    expect(rows.map(row => row.wert)).toEqual([1400, 1950, 1590]);
  });

  it('speichert nichts, wenn beides abgelehnt wird', async () => {
    const { uiService, saveCalls } = setup({ saveResponses: [nearConflict], confirmResults: [false, false] });
    await uiService.saveZaehler();
    expect(saveCalls).toHaveLength(1);
  });

  it('fragt nach fehlendem Grund nicht zusätzlich nach einer neuen Ablesung', async () => {
    const { uiService, saveCalls, confirms } = setup({ saveResponses: [nearConflict], promptResult: '' });
    await uiService.saveZaehler();
    expect(confirms).toHaveLength(1);
    expect(saveCalls).toHaveLength(1);
  });

  it('bietet die neue Ablesung bei gleicher Minute nicht an', async () => {
    const sameMinute = { ...nearConflict, conflicts: [{ ...nearConflict.conflicts[0], art: 'GLEICHE_MINUTE' }] };
    const { uiService, saveCalls, confirms } = setup({ saveResponses: [sameMinute], confirmResults: [false, true] });
    await uiService.saveZaehler();
    expect(confirms).toHaveLength(1);
    expect(saveCalls).toHaveLength(1);
  });

  it('zeigt in der Queue-Anzeige „Als neue Ablesung speichern“ nur bei NAHE_ABLESUNG', () => {
    const entry = art => ({
      id: 'e1', status: 'rejected', code: 'CONFLICT', message: 'Konflikt',
      conflicts: [{ art, alter_wert: 1950, neuer_wert: 1590, minuten_abstand: 1 }],
      payload: { data: [{ zaehler_id: 'Z_WASSER_1', wert: 1590, zeitstempel: '30.10.2026 13:51' }] },
    });
    const near = loadUiService({ queueEntries: [entry('NAHE_ABLESUNG')] });
    near.uiService.toggleSyncQueueDetails();
    expect(near.elementsById['sync-queue-status'].innerHTML).toContain("uiService.saveQueueEntryAsNew('e1')");
    expect(near.elementsById['sync-queue-status'].innerHTML).toContain('gespeichert vor 1 Min.');

    const same = loadUiService({ queueEntries: [entry('GLEICHE_MINUTE')] });
    same.uiService.toggleSyncQueueDetails();
    expect(same.elementsById['sync-queue-status'].innerHTML).not.toContain('saveQueueEntryAsNew');
  });
});


describe('uiService: Zustände lokal erfasst / übertragen / abgelehnt', () => {
  const meter = { zaehler_id: 'Z_WASSER_1', objekt_id: 'TEST', einheit_id: 'TEST_WE_01', bezeichnung: 'Wasser Wohnung 1 TEST' };
  const base = { objekt_id: 'TEST', einheit_id: 'TEST_WE_01', zaehler_id: 'Z_WASSER_1' };
  const earlier = { ...base, wert: 1400, zeitstempel: '29.10.2026 08:00', stand_id: 'ST_Z_WASSER_1_2026-10-29 08:00' };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  const setup = extra => loadUiService({
    currentMeters: [meter],
    inputValuesByZaehlerId: { Z_WASSER_1: '1450' },
    zaehlerstaende: [{ ...earlier }],
    ...extra,
  });

  it('trägt einen nur in die Queue geschriebenen Wert nicht in den Datenbestand ein', async () => {
    const { uiService, dataService } = setup({ saveResponse: { status: 'success', queued: true, message: 'Offline gespeichert' } });
    await uiService.saveZaehler();
    expect(dataService.state.zaehlerstaende).toEqual([earlier]);
  });

  it('zeigt bei einem Speicherfehler der Queue keine Erfolgsmeldung und lässt die Eingabe offen', async () => {
    const { uiService, alerts, modalElement } = setup({ saveResponse: { status: 'error', code: 'QUEUE_WRITE_FAILED', message: 'nicht zwischengespeichert' } });
    await uiService.saveZaehler();
    expect(alerts).toEqual(['Fehler: nicht zwischengespeichert']);
    expect(modalElement.style.display).toBe('flex');
  });

  it('übernimmt nach bestätigtem Speichern den Stand der Datenbank statt einer lokalen Kopie', async () => {
    const server = [{ ...earlier }, { ...base, wert: 1450, zeitstempel: '30.10.2026 10:00', stand_id: 'ST_Z_WASSER_1_2026-10-30 10:00' }];
    const { uiService, dataService } = setup({ saveResponse: { status: 'success', angelegt: 1 }, serverZaehlerstaende: server });
    await uiService.saveZaehler();
    expect(dataService.state.zaehlerstaende).toBe(server);
  });

  it('erzeugt bei „bereits vorhanden“ ohne Nachladen keinen Phantomwert', async () => {
    const { uiService, dataService, alerts } = setup({ saveResponse: { status: 'success', angelegt: 0, bereits_vorhanden: 1 } });
    await uiService.saveZaehler();
    expect(alerts[0]).toContain('identische Eingabe');
    expect(alerts[0]).toContain('kein neuer Zeitstempel');
    expect(dataService.state.zaehlerstaende).toEqual([earlier]);
  });

  it('führt ohne Nachladen nur bei eindeutig angelegten Werten lokal nach', async () => {
    const { uiService, dataService } = setup({ saveResponse: { status: 'success', angelegt: 1, bereits_vorhanden: 0 } });
    await uiService.saveZaehler();
    expect(dataService.state.zaehlerstaende).toHaveLength(2);
    expect(dataService.state.zaehlerstaende[1]).toMatchObject({ wert: 1450, stand_id: 'ST_Z_WASSER_1_2026-10-30 10:00' });
  });

  it('prüft die Plausibilität auch gegen noch nicht übertragene Werte, zeigt als letzten Stand aber nur Bestätigtes', async () => {
    const pendingEntry = { id: 'e1', status: 'pending', payload: { data: [{ ...base, wert: 2000, zeitstempel: '29.10.2026 12:00', stand_id: 'ST_Z_WASSER_1_2026-10-29 12:00' }] } };
    const { uiService, saveCalls, alerts, confirms } = setup({ queueEntries: [pendingEntry] });
    expect(uiService.getLatestZaehlerstand(meter).wert).toBe(1400);
    expect(uiService.getLatestZaehlerstand(meter, { includePending: true }).wert).toBe(2000);
    await uiService.saveZaehler();
    // 1450 liegt unter dem noch nicht übertragenen Wert 2000: Warnung mit dem Vergleichswert 2000
    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toContain('Alt: 2000 | Neu: 1450');
    expect(saveCalls).toHaveLength(1);
    expect(alerts).toEqual(['Erfolgreich gespeichert!']);
  });

  it('bietet „Jetzt erneut senden“ nur bei offenen Einträgen an, nicht bei reinen Ablehnungen', () => {
    const pending = { id: 'p1', status: 'pending', payload: { data: [{ zaehler_id: 'Z_WASSER_1', wert: 1 }] } };
    const rejected = { id: 'r1', status: 'rejected', code: 'CONFLICT', conflicts: [], payload: { data: [{ zaehler_id: 'Z_WASSER_1', wert: 1 }] } };
    const withPending = loadUiService({ queueEntries: [pending] });
    withPending.uiService.renderSyncQueueStatus();
    expect(withPending.elementsById['sync-queue-status'].innerHTML).toContain('sync-queue-retry');

    const onlyRejected = loadUiService({ queueEntries: [rejected] });
    onlyRejected.uiService.renderSyncQueueStatus();
    expect(onlyRejected.elementsById['sync-queue-status'].innerHTML).not.toContain('sync-queue-retry');
  });

  it('bietet „Erneut versuchen“ nur für abgelehnte Einträge ohne fachlichen Konflikt an', () => {
    const entry = code => ({ id: 'r1', status: 'rejected', code, message: 'x', payload: { data: [{ zaehler_id: 'Z1', wert: 1 }] } });
    const technical = loadUiService({ queueEntries: [entry('DOPPELTE_STAND_ID')] });
    technical.uiService.toggleSyncQueueDetails();
    expect(technical.elementsById['sync-queue-status'].innerHTML).toContain("uiService.retryQueueEntry('r1')");

    const conflict = loadUiService({ queueEntries: [entry('CONFLICT')] });
    conflict.uiService.toggleSyncQueueDetails();
    expect(conflict.elementsById['sync-queue-status'].innerHTML).not.toContain('retryQueueEntry');
  });

  it('sendet beim Button auch dann, wenn der Browser „offline“ meldet (force)', async () => {
    const pending = { id: 'p1', status: 'pending', payload: { data: [{ zaehler_id: 'Z1', wert: 1 }] } };
    const { uiService, processCalls, alerts } = loadUiService({ queueEntries: [pending] });
    await uiService.retrySyncQueue();
    expect(processCalls).toEqual([{ force: true, allowPrompt: true }]);
    expect(alerts[0]).toContain('Übertragung war nicht möglich');
  });
});


describe('uiService: mehrere Zählerstände, Konflikte und beschädigte Queue', () => {
  const m1 = { zaehler_id: 'Z_A', objekt_id: 'TEST', einheit_id: 'TEST_WE_01', bezeichnung: 'Kaltwasser TEST' };
  const m2 = { zaehler_id: 'Z_B', objekt_id: 'TEST', einheit_id: 'TEST_WE_01', bezeichnung: 'Strom TEST' };
  const multiEntry = (extra = {}) => ({
    id: 'r1', status: 'rejected', code: 'CONFLICT', message: 'Konflikt',
    conflicts: [{ art: 'GLEICHE_MINUTE', zaehler_id: 'Z_A', stand_id: 's', alter_wert: 1950, neuer_wert: 1590 }],
    payload: { data: [
      { zaehler_id: 'Z_A', wert: 1590, zeitstempel: '30.10.2026 10:00' },
      { zaehler_id: 'Z_B', wert: 77, zeitstempel: '30.10.2026 10:00' },
    ] },
    ...extra,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('markiert in den Details, welche Zählerstände betroffen sind, und nennt die Anzahl', () => {
    const { uiService, elementsById } = loadUiService({ queueEntries: [multiEntry()], currentMeters: [m1, m2] });
    uiService.toggleSyncQueueDetails();
    const html = elementsById['sync-queue-status'].innerHTML;
    expect(html).toContain('⚠️ Konflikt: ');
    expect(html.match(/Konflikt: /g)).toHaveLength(1);
    expect(html).toContain('2 Zählerstände gehören zu dieser Eingabe, davon 1 mit Konflikt');
    expect(html).toContain('die Entscheidung gilt für die ganze Eingabe');
  });

  it('listet beim Verwerfen alle Zählerstände auf und warnt vor Verlust der Werte ohne Konflikt', () => {
    const { uiService, confirms, queueCalls } = loadUiService({ queueEntries: [multiEntry()], currentMeters: [m1, m2], confirmResult: false });
    uiService.discardQueueEntry('r1');
    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toContain('Eintrag mit 2 Zählerständen verwerfen?');
    expect(confirms[0]).toContain('⚠️ Konflikt: ');
    expect(confirms[0]).toContain('Achtung: 1 dieser Zählerstände haben keinen Konflikt und gehen ebenfalls verloren.');
    expect(queueCalls).toEqual([]); // abgebrochen: nichts verworfen
  });

  it('verwirft erst nach ausdrücklicher Bestätigung', () => {
    const { uiService, queueCalls } = loadUiService({ queueEntries: [multiEntry()], currentMeters: [m1, m2], confirmResult: true });
    uiService.discardQueueEntry('r1');
    expect(queueCalls).toEqual([['discard', 'r1']]);
  });

  it('verzichtet bei einem einzelnen Zählerstand auf die Zusatzwarnung', () => {
    const single = multiEntry({ payload: { data: [{ zaehler_id: 'Z_A', wert: 1590, zeitstempel: '30.10.2026 10:00' }] } });
    const { uiService, confirms } = loadUiService({ queueEntries: [single], currentMeters: [m1], confirmResult: false });
    uiService.discardQueueEntry('r1');
    expect(confirms[0]).toContain('Eintrag mit 1 Zählerstand verwerfen?');
    expect(confirms[0]).not.toContain('Achtung');
  });

  it('nennt beim Überschreiben aus der Queue, dass weitere Zählerstände mitgespeichert werden', async () => {
    const { uiService, confirms, queueCalls } = loadUiService({ queueEntries: [multiEntry()], currentMeters: [m1, m2], promptResult: 'Tippfehler' });
    await uiService.overwriteQueueEntry('r1');
    expect(confirms[0]).toContain('Zusätzlich wird 1 weiterer Zählerstand dieser Eingabe (ohne Konflikt) gespeichert.');
    expect(queueCalls).toEqual([['overwrite', 'r1', 'Tippfehler']]);
  });

  it('nennt bei „als neue Ablesung“ aus der Queue die Anzahl aller betroffenen Zählerstände', async () => {
    const near = multiEntry({ conflicts: [{ art: 'NAHE_ABLESUNG', zaehler_id: 'Z_A', alter_wert: 1950, neuer_wert: 1590, minuten_abstand: 1 }] });
    const { uiService, confirms, queueCalls } = loadUiService({ queueEntries: [near], currentMeters: [m1, m2] });
    await uiService.saveQueueEntryAsNew('r1');
    expect(confirms[0]).toContain('Alle 2 Zählerstände dieser Eingabe als zusätzliche, neue Ablesung speichern?');
    expect(queueCalls).toEqual([['neu', 'r1']]);
  });

  it('nennt beim Speichern mit Konflikt die Zahl der zusätzlich gespeicherten Zählerstände', async () => {
    const conflict = {
      status: 'error', code: 'CONFLICT', message: 'Konflikt',
      conflicts: [{ art: 'GLEICHE_MINUTE', stand_id: 'ST_Z_A_2026-10-30 10:00', zaehler_id: 'Z_A', alter_wert: 1950, neuer_wert: 1590 }],
    };
    const { uiService, confirms, saveCalls } = loadUiService({
      currentMeters: [m1, m2],
      inputValuesByZaehlerId: { Z_A: '1590', Z_B: '77' },
      zaehlerstaende: [
        { objekt_id: 'TEST', einheit_id: 'TEST_WE_01', zaehler_id: 'Z_A', wert: 1400, zeitstempel: '29.10.2026 08:00' },
        { objekt_id: 'TEST', einheit_id: 'TEST_WE_01', zaehler_id: 'Z_B', wert: 70, zeitstempel: '29.10.2026 08:00' },
      ],
      saveResponses: [conflict, { status: 'success' }],
      promptResult: 'Tippfehler',
    });
    await uiService.saveZaehler();
    expect(confirms[0]).toContain('Zusätzlich wird 1 weiterer Zählerstand dieser Eingabe (ohne Konflikt) gespeichert.');
    expect(saveCalls[1].data).toHaveLength(2);
  });

  it('zeigt eine beschädigte Queue sichtbar an, auch ohne Einträge', () => {
    const { uiService, elementsById } = loadUiService({ queueEntries: [], queueProblems: [{ key: 'offline_queue' }] });
    uiService.renderSyncQueueStatus();
    const el = elementsById['sync-queue-status'];
    expect(el.style.display).toBe('block');
    expect(el.innerHTML).toContain('beschädigt');
    expect(el.innerHTML).toContain('uiService.resetCorruptQueue()');
    expect(el.innerHTML).toContain('uiService.showCorruptQueue()');
  });

  it('zeigt die Warnung zusätzlich zu offenen Einträgen und blendet sie ohne Problem aus', () => {
    const pending = { id: 'p1', status: 'pending', payload: { data: [{ zaehler_id: 'Z_A', wert: 1 }] } };
    const withProblem = loadUiService({ queueEntries: [pending], queueProblems: [{ key: 'offline_queue_failed' }] });
    withProblem.uiService.renderSyncQueueStatus();
    expect(withProblem.elementsById['sync-queue-status'].innerHTML).toContain('beschädigt');
    expect(withProblem.elementsById['sync-queue-status'].innerHTML).toContain('noch nicht in der Datenbank');

    const healthy = loadUiService({ queueEntries: [pending] });
    healthy.uiService.renderSyncQueueStatus();
    expect(healthy.elementsById['sync-queue-status'].innerHTML).not.toContain('beschädigt');
  });

  it('sichert und setzt die beschädigte Queue nur nach Bestätigung zurück', () => {
    const declined = loadUiService({ queueProblems: [{ key: 'offline_queue' }], confirmResult: false });
    declined.uiService.resetCorruptQueue();
    expect(declined.queueCalls).toEqual([]);

    const accepted = loadUiService({ queueProblems: [{ key: 'offline_queue' }], confirmResult: true });
    accepted.uiService.resetCorruptQueue();
    expect(accepted.queueCalls).toEqual([['resolve']]);
    expect(accepted.alerts[0]).toContain('offline_queue_defekt_x');
  });

  it('zeigt die Rohdaten zum Kopieren an', () => {
    const { uiService, prompts } = loadUiService({ queueProblems: [{ key: 'offline_queue' }] });
    uiService.showCorruptQueue();
    expect(prompts[0]).toContain('Beschädigte Queue-Daten');
  });
});

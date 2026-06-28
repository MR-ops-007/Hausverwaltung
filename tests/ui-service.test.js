import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateZaehlerstand, VALIDATION_STATUS } from '../validation-service.js';

function loadUiService({
  zaehlerstaende = [],
  inputValuesByZaehlerId = {},
  currentMeters = [],
  units = [],
  objects = [],
  viewAktiveMieter = [],
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
  validationServiceAvailable = true,
} = {}) {
  const uiServiceCode = readFileSync(
    new URL('../ui-service.js', import.meta.url),
    'utf8'
  );

  const alerts = [];
  const confirms = [];
  const saveCalls = [];

  const dataService = {
    state: {
      zaehlerstaende,
      zaehler: currentMeters,
      einheiten: units,
      objekte: objects,
      view_aktive_mieter: viewAktiveMieter,
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
    async saveTransaction(payload) {
      saveCalls.push(payload);
      return saveResponse;
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
    'consumption-dashboard-output': { style: {}, innerHTML: '', className: '' },
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
  };

  const alert = (message) => {
    alerts.push(String(message));
  };

  const confirm = (message) => {
    confirms.push(String(message));
    return confirmResult;
  };

  const factory = new Function(
    'dataService',
    'cloudService',
    'window',
    'document',
    'alert',
    'confirm',
    'calcService',
    `${uiServiceCode}; return uiService;`
  );

  const uiService = factory(
    dataService,
    cloudService,
    window,
    document,
    alert,
    confirm,
    calcService
  );

  uiService.currentActiveMetersObjects = currentMeters;

  return {
    uiService,
    dataService,
    alerts,
    confirms,
    saveCalls,
    modalElement,
    modalBodyElement,
    elementsById,
  };
}

describe('uiService helper methods', () => {
  it('formats timestamps as DD.MM.YYYY HH:mm', () => {
    const { uiService } = loadUiService();

    const result = uiService.formatGermanTimestamp(
      new Date(2026, 5, 20, 9, 5)
    );

    expect(result).toBe('20.06.2026 09:05');
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

    expect(uiService.isZaehlerManuellErfassbar({ aktiv: true })).toBe(true);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: 'TRUE' })).toBe(true);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: false })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ aktiv: 'FALSE' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ erfassbar: false })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ erfassbar: 'FALSE' })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ berechnet: true })).toBe(false);
    expect(uiService.isZaehlerManuellErfassbar({ berechnet: 'TRUE' })).toBe(false);
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
});

describe('uiService consumption dashboard', () => {
  it('switches to the consumption dashboard view and renders summary plus rows', () => {
    const calcCalls = [];
    const { uiService, elementsById } = loadUiService({
      objects: [
        {
          objekt_id: 'Ra-HS-29',
          bezeichnung: 'Rathausstraße 29',
        },
      ],
      zaehlerstaende: [
        {
          objekt_id: 'Ra-HS-29',
          zeitstempel: '02.01.2026 00:00',
        },
      ],
      calcService: {
        buildConsumptionDashboard(data, options) {
          calcCalls.push(options);

          return {
            summary: [
              {
                objekt_id: 'Ra-HS-29',
                medium: 'strom_ht_kwh',
                einheit: 'kWh',
                verbrauch: 253,
                zaehler_count: 1,
                offene_zaehler: 0,
                berechnet: false,
              },
            ],
            rows: [
              {
                objekt_id: 'Ra-HS-29',
                einheit_id: 'Ra-HS-29_WE_01',
                einheit_name: 'Wohnung 1',
                mieter_name: 'Duck, Donald',
                zaehler_id: 'Z_STROM_KWH_WOHNUNG_1',
                medium: 'strom_ht_kwh',
                bezeichnung: 'Strom Wohnung 1',
                einheit: 'kWh',
                einbauort: 'Flur',
                readings_count: 2,
                start_wert: 6647,
                start_zeitstempel: '02.01.2026 00:00',
                end_wert: 6900,
                end_zeitstempel: '30.12.2026 00:00',
                verbrauch: 253,
                status: 'OK',
                hinweis: '',
              },
            ],
          };
        },
      },
    });

    uiService.showConsumptionDashboard();

    expect(elementsById['object-selector-section'].style.display).toBe('none');
    expect(elementsById['consumption-dashboard-section'].style.display).toBe('block');
    expect(elementsById['nav-consumption-dashboard'].className).toBe('tab-btn-active');
    expect(elementsById['consumption-object-select'].innerHTML).toContain('Rathausstraße 29');
    expect(elementsById['consumption-year-select'].innerHTML).toContain('2026');
    expect(calcCalls).toEqual([
      {
        objekt_id: 'Ra-HS-29',
        year: '2026',
        includeCalculated: true,
      },
    ]);
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('strom_ht_kwh');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Wohnung 1');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Donald Duck');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('Strom Wohnung 1');
    expect(elementsById['consumption-dashboard-output'].innerHTML).toContain('253 kWh');
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

    const firstRun = loadUiService({
      currentMeters: [meter],
      inputValuesByZaehlerId: {
        Z_STROM_KWH_WOHNUNG_1: '100',
      },
    });

    await firstRun.uiService.saveZaehler();

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

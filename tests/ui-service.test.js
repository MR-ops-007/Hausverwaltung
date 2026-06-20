import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateZaehlerstand, VALIDATION_STATUS } from '../validation-service.js';

function loadUiService({
  zaehlerstaende = [],
  inputValuesByZaehlerId = {},
  currentMeters = [],
  saveResponse = { status: 'success' },
  confirmResult = true,
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
      objekte: [],
      view_aktive_mieter: [],
    },
    getUniqueObjects() {
      return [];
    },
    getUnitsByObject() {
      return [];
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

  const document = {
    getElementById(id) {
      if (id === 'modal-container') {
        return modalElement;
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
    validationService: {
      validateZaehlerstand,
      VALIDATION_STATUS,
    },
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
    `${uiServiceCode}; return uiService;`
  );

  const uiService = factory(
    dataService,
    cloudService,
    window,
    document,
    alert,
    confirm
  );

  uiService.currentActiveMetersObjects = currentMeters;

  return {
    uiService,
    alerts,
    confirms,
    saveCalls,
    modalElement,
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
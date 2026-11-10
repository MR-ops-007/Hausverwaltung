import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Backend-Schreibweg für Zählerstände (4.8.5): Authentifizierung, Idempotenz über stand_id, CONFLICT,
 * Überschreiben nur mit Grund (mit Protokoll) und LOCK_TIMEOUT.
 */
const ACCESS_KEY = 'zaehlerstand-test-key';

function backend({ lockFails = false, failLogAppend = false } = {}) {
  const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const calls = { viewUpdates: 0 };
  const sheetsData = {
    Zaehlerstaende: [
      ['stand_id', 'zaehler_id', 'wert', 'zeitstempel', 'quelle'],
      ['ST_Z1_2026-10-30 09:00', 'Z1', 1500, '30.10.2026 09:00', 'UI']
    ]
  };
  const makeSheet = (name, values) => ({
    getName: () => name,
    getDataRange: () => ({ getValues: () => values.map(row => row.slice()) }),
    getLastColumn: () => values[0].length,
    getRange: (row, column) => ({
      getValues: () => [values[0].slice()],
      setValue: value => { values[row - 1][column - 1] = value; }
    }),
    appendRow: row => {
      if (failLogAppend && name === 'Zaehlerstand_Korrekturen' && values.length > 0) throw new Error('Protokoll nicht schreibbar');
      values.push(row);
    }
  });
  const sheets = { Zaehlerstaende: makeSheet('Zaehlerstaende', sheetsData.Zaehlerstaende) };
  const ss = {
    getSheets: () => Object.values(sheets),
    getSheetByName: name => sheets[name] || null,
    insertSheet: name => {
      sheetsData[name] = [];
      sheets[name] = makeSheet(name, sheetsData[name]);
      return sheets[name];
    }
  };
  const globals = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => name === 'APP_ACCESS_KEY' ? ACCESS_KEY : null }) },
    ContentService: { createTextOutput: text => ({ text, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: {
      getScriptLock: () => ({
        waitLock() { if (lockFails) throw new Error('Could not obtain lock after 10000 milliseconds.'); },
        releaseLock() {}
      })
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => { calls.flushes = (calls.flushes || 0) + 1; } },
    Utilities: { formatDate: () => '2026-10-30 09:05:00' }
  };
  const factory = new Function(...Object.keys(globals), 'calls', `${code}
    updateAktiveMieterView = () => { calls.viewUpdates++; };
    return { doPost };`);
  const api = factory(...Object.values(globals), calls);
  return {
    calls, data: sheetsData, getSheetData: name => sheetsData[name],
    post: payload => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(payload) } }).text)
  };
}

const reading = (zaehlerId, wert, minute = '09:00') => ({
  zaehler_id: zaehlerId,
  wert,
  zeitstempel: `30.10.2026 ${minute}`,
  stand_id: `ST_${zaehlerId}_2026-10-30 ${minute}`,
  quelle: 'UI'
});
const send = (api, data, extra = {}) => api.post({ typ: 'ZAEHLERSTAND_NEU', data, key: ACCESS_KEY, ...extra });

describe('Zählerstände schreiben (idempotent)', () => {
  it('legt neue Stände an und aktualisiert die View', () => {
    const api = backend();
    const result = send(api, [reading('Z2', 10), reading('Z1', 1600, '09:30')]);
    expect(result).toMatchObject({ status: 'success', angelegt: 2, bereits_vorhanden: 0, ueberschrieben: 0 });
    expect(api.data.Zaehlerstaende).toHaveLength(4);
    expect(api.calls.viewUpdates).toBe(1);
  });

  it('wertet die Wiederholung desselben Eintrags (Offline-Retry) als bereits gespeichert', () => {
    const api = backend();
    const result = send(api, [reading('Z1', 1500)]);
    expect(result).toMatchObject({ status: 'success', angelegt: 0, bereits_vorhanden: 1 });
    expect(api.data.Zaehlerstaende).toHaveLength(2);
    expect(api.calls.viewUpdates).toBe(0);
  });

  it('vergleicht Werte numerisch (Komma, Text)', () => {
    const api = backend();
    expect(send(api, [{ ...reading('Z1', '1500,0') }]).bereits_vorhanden).toBe(1);
  });

  it('schreibt bei gemischter Anfrage nur die fehlenden Einträge', () => {
    const api = backend();
    const result = send(api, [reading('Z1', 1500), reading('Z3', 7)]);
    expect(result).toMatchObject({ status: 'success', angelegt: 1, bereits_vorhanden: 1 });
    expect(api.data.Zaehlerstaende.map(row => row[1])).toEqual(['zaehler_id', 'Z1', 'Z3']);
  });

  it('akzeptiert Einträge ohne stand_id und bildet sie wie bisher aus Zähler und Zeitstempel', () => {
    const api = backend();
    const { stand_id, ...withoutId } = reading('Z5', 3);
    send(api, [withoutId]);
    expect(api.data.Zaehlerstaende[2][0]).toBe('ST_Z5_2026-10-30 09:00');
  });
});

describe('Konflikt und Überschreiben', () => {
  it('meldet CONFLICT mit altem und neuem Wert und schreibt nichts, auch nichts Unkritisches', () => {
    const api = backend();
    const result = send(api, [reading('Z1', 1590), reading('Z4', 5)]);
    expect(result).toMatchObject({
      status: 'error',
      code: 'CONFLICT',
      conflicts: [{ art: 'GLEICHE_MINUTE', stand_id: 'ST_Z1_2026-10-30 09:00', zaehler_id: 'Z1', alter_wert: 1500, neuer_wert: 1590 }]
    });
    expect(api.data.Zaehlerstaende).toHaveLength(2);
    expect(api.data.Zaehlerstaende[1][2]).toBe(1500);
    expect(api.data.Zaehlerstand_Korrekturen).toBeUndefined();
  });

  it('überschreibt nicht ohne ausreichenden Grund', () => {
    const api = backend();
    for (const grund of [undefined, '', '  ', 'ab']) {
      const result = send(api, [reading('Z1', 1590)], { ueberschreiben: { grund } });
      expect(result).toMatchObject({ status: 'error', code: 'GRUND_FEHLT' });
    }
    expect(api.data.Zaehlerstaende[1][2]).toBe(1500);
    expect(api.data.Zaehlerstand_Korrekturen).toBeUndefined();
  });

  it('überschreibt mit Grund, protokolliert alt/neu/Grund und legt die übrigen Einträge an', () => {
    const api = backend();
    const result = send(api, [reading('Z1', 1590), reading('Z4', 5)], { ueberschreiben: { grund: ' Zahlendreher ' } });
    expect(result).toMatchObject({ status: 'success', angelegt: 1, ueberschrieben: 1 });
    expect(api.data.Zaehlerstaende[1][2]).toBe(1590);
    expect(api.data.Zaehlerstaende).toHaveLength(3);
    expect(api.data.Zaehlerstand_Korrekturen).toEqual([
      ['korrigiert_am', 'stand_id', 'zaehler_id', 'alter_wert', 'neuer_wert', 'grund', 'quelle', 'art'],
      ['2026-10-30 09:05:00', 'ST_Z1_2026-10-30 09:00', 'Z1', 1500, 1590, 'Zahlendreher', 'UI', 'GLEICHE_MINUTE']
    ]);
    expect(api.calls.viewUpdates).toBe(1);
  });

  it('protokolliert weitere Überschreibungen im bestehenden Blatt', () => {
    const api = backend();
    send(api, [reading('Z1', 1590)], { ueberschreiben: { grund: 'Tippfehler' } });
    send(api, [reading('Z1', 1595)], { ueberschreiben: { grund: 'nochmal korrigiert' } });
    expect(api.data.Zaehlerstand_Korrekturen).toHaveLength(3);
    expect(api.data.Zaehlerstand_Korrekturen[2].slice(3, 6)).toEqual([1590, 1595, 'nochmal korrigiert']);
    expect(api.data.Zaehlerstaende[1][2]).toBe(1595);
  });

  it('lehnt dieselbe stand_id mit verschiedenen Werten in einer Anfrage ab', () => {
    const api = backend();
    const result = send(api, [reading('Z9', 1), reading('Z9', 2)]);
    expect(result).toMatchObject({ status: 'error', code: 'DOPPELTE_STAND_ID' });
    expect(api.data.Zaehlerstaende).toHaveLength(2);
  });
});

describe('Sperre', () => {
  it('meldet einen Lock-Timeout als vorübergehenden Fehler und schreibt nichts', () => {
    const api = backend({ lockFails: true });
    const result = send(api, [reading('Z2', 10)]);
    expect(result).toMatchObject({ status: 'error', code: 'LOCK_TIMEOUT', transient: true });
    expect(api.data.Zaehlerstaende).toHaveLength(2);
  });
});

describe('Korrekturfenster (Minutenwechsel)', () => {
  it('erkennt eine Korrektur kurz nach dem Minutenwechsel (13:50 → 13:51)', () => {
    const api = backend();
    send(api, [reading('Z7', 1950, '13:50')]);
    const result = send(api, [reading('Z7', 1590, '13:51')]);
    expect(result).toMatchObject({
      status: 'error',
      code: 'CONFLICT',
      conflicts: [{
        art: 'NAHE_ABLESUNG', stand_id: 'ST_Z7_2026-10-30 13:50', zaehler_id: 'Z7',
        alter_wert: 1950, neuer_wert: 1590, alte_zeit: '30.10.2026 13:50', minuten_abstand: 1
      }]
    });
    expect(api.data.Zaehlerstaende).toHaveLength(3);
  });

  it('überschreibt die vorherige Zeile (kein zweiter Wert) und protokolliert die Art', () => {
    const api = backend();
    const result = send(api, [reading('Z1', 1590, '09:01')], { ueberschreiben: { grund: 'Zahlendreher' } });
    expect(result).toMatchObject({ status: 'success', angelegt: 0, ueberschrieben: 1 });
    expect(api.data.Zaehlerstaende).toHaveLength(2);
    expect(api.data.Zaehlerstaende[1][2]).toBe(1590);
    expect(api.data.Zaehlerstaende[1][3]).toBe('30.10.2026 09:00');
    expect(api.data.Zaehlerstand_Korrekturen[1]).toEqual(
      ['2026-10-30 09:05:00', 'ST_Z1_2026-10-30 09:00', 'Z1', 1500, 1590, 'Zahlendreher', 'UI', 'NAHE_ABLESUNG']
    );
  });

  it('wertet die Wiederholung nach erfolgter Korrektur als bereits gespeichert', () => {
    const api = backend();
    send(api, [reading('Z1', 1590, '09:01')], { ueberschreiben: { grund: 'Tippfehler' } });
    const retry = send(api, [reading('Z1', 1590, '09:01')]);
    expect(retry).toMatchObject({ status: 'success', angelegt: 0, bereits_vorhanden: 1 });
    expect(api.data.Zaehlerstaende).toHaveLength(2);
  });

  it('speichert mit neueAblesung ausdrücklich einen zusätzlichen Wert', () => {
    const api = backend();
    const result = send(api, [reading('Z1', 1590, '09:03')], { neueAblesung: true });
    expect(result).toMatchObject({ status: 'success', angelegt: 1, ueberschrieben: 0 });
    expect(api.data.Zaehlerstaende).toHaveLength(3);
    expect(api.data.Zaehlerstaende[1][2]).toBe(1500);
  });

  it('grenzt das 15-Minuten-Korrekturfenster exakt ab', () => {
    const conflictAt15 = send(backend(), [reading('Z1', 1590, '09:15')]);
    expect(conflictAt15).toMatchObject({ status: 'error', code: 'CONFLICT' });

    const duplicateAt15 = send(backend(), [reading('Z1', 1500, '09:15')]);
    expect(duplicateAt15).toMatchObject({ status: 'success', angelegt: 0, bereits_vorhanden: 1 });

    const api = backend();
    expect(send(api, [reading('Z1', 1500, '09:16')])).toMatchObject({ status: 'success', angelegt: 1, bereits_vorhanden: 0 });
  });

  it('wertet gleichen Wert im Fenster als Wiederholung und lässt andere Zähler unberührt', () => {
    const api = backend();
    expect(send(api, [reading('Z1', 1500, '09:02')])).toMatchObject({ status: 'success', angelegt: 0, bereits_vorhanden: 1 });
    expect(send(api, [reading('Z2', 5, '09:02')])).toMatchObject({ status: 'success', angelegt: 1 });
  });

  it('legt einen historischen gleichen Nullstand als neue Ablesung an', () => {
    const api = backend();
    const firstZero = {
      ...reading('Z1', 0),
      zeitstempel: '30.09.2026 09:00',
      stand_id: 'ST_Z1_2026-09-30 09:00',
    };
    const historicalZero = {
      ...reading('Z1', 0),
      zeitstempel: '01.10.2026 09:00',
      stand_id: 'ST_Z1_2026-10-01 09:00',
    };

    expect(send(api, [firstZero])).toMatchObject({ status: 'success', angelegt: 1 });
    const result = send(api, [historicalZero]);

    expect(result).toMatchObject({ status: 'success', angelegt: 1, bereits_vorhanden: 0 });
    expect(api.data.Zaehlerstaende).toHaveLength(4);
    expect(api.data.Zaehlerstaende[3]).toEqual([
      historicalZero.stand_id,
      'Z1',
      0,
      historicalZero.zeitstempel,
      'UI',
    ]);
  });

  it('legt Einträge mit früherem Zeitpunkt als den vorhandenen Wert an', () => {
    const api = backend();
    expect(send(api, [reading('Z1', 1400, '08:55')])).toMatchObject({ status: 'success', angelegt: 1 });
  });
});

describe('Protokoll vor Änderung', () => {
  it('ändert den Zählerstand nicht, wenn das Protokoll nicht geschrieben werden kann', () => {
    const api = backend({ failLogAppend: true });
    const result = send(api, [reading('Z1', 1590)], { ueberschreiben: { grund: 'Tippfehler' } });
    expect(result).toMatchObject({ status: 'error' });
    expect(api.data.Zaehlerstaende[1][2]).toBe(1500);
    expect(api.data.Zaehlerstaende).toHaveLength(2);
    expect(api.data.Zaehlerstand_Korrekturen).toHaveLength(1); // nur Kopfzeile
  });

  it('schreibt das Protokoll vor der Änderung und leert danach den Schreibpuffer', () => {
    const api = backend();
    send(api, [reading('Z1', 1590)], { ueberschreiben: { grund: 'Tippfehler' } });
    expect(api.calls.flushes).toBe(1);
  });
});

describe('Leseansicht zaehlerstaende', () => {
  it('liefert nur das Blatt Zaehlerstaende (gezieltes Nachladen)', () => {
    const api = backend();
    const result = api.post({ typ: 'LESEN', view: 'zaehlerstaende', data: [], key: ACCESS_KEY });
    expect(Object.keys(result)).toEqual(['Zaehlerstaende']);
    expect(result.Zaehlerstaende).toHaveLength(1);
    expect(result.Zaehlerstaende[0]).toMatchObject({ zaehler_id: 'Z1', wert: 1500 });
  });
});

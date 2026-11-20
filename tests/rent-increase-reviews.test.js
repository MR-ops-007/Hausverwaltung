import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const shared = readFileSync(new URL('../apps-script/ContractService.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../apps-script/RentIncreaseReviews.gs', import.meta.url), 'utf8');

function fixture() {
  const rows = [['pruefung_id', 'vertrag_id', 'signatur', 'status', 'erledigt_am', 'wiedervorlage_ab', 'erfasst_von', 'notiz', 'aktualisiert_am']];
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map(row => row.slice()) }),
    appendRow: row => rows.push(row.slice()),
    getRange: (row, column, height, width) => ({
      setValues: values => values.forEach((value, index) => { rows[row - 1 + index] = value.slice(); })
    })
  };
  const properties = { getProperty: name => name === 'CONTRACT_WRITE_TOKEN' ? 'contract-token' : '' };
  const Utilities = {
    formatDate: (date, timezone, pattern) => {
      const iso = date.toISOString();
      if (pattern === 'yyyy-MM-dd') return iso.slice(0, 10);
      return iso.slice(0, 19).replace('T', ' ');
    }
  };
  const runtime = new Function('PropertiesService', 'Utilities', 'SpreadsheetApp',
    `${shared};${source};return { handleRentIncreaseReviewWrite, addRentIncreaseReviewMonths };`
  )( { getScriptProperties: () => properties }, Utilities, { flush() {} } );
  const ss = { getSheetByName: name => name === 'MieterhöhungsPrüfungen' ? sheet : null };
  return { rows, sheet, ss, runtime };
}

describe('Apps-Script Mieterhöhungsprüfungen', () => {
  it('speichert Abschluss mit Akteur und Wiedervorlage zwölf Monate später', () => {
    const { rows, ss, runtime } = fixture();
    const result = runtime.handleRentIncreaseReviewWrite(ss, {
      vertrag_id: 'V_1', signatur: '{"status":"DUE"}', notiz: 'Geprüft'
    }, { id: 'device-1', label: 'Michaels Mac', role: 'admin' });
    expect(result.status).toBe('success');
    expect(result.review).toMatchObject({ vertrag_id: 'V_1', status: 'ERLEDIGT', signatur: '{"status":"DUE"}',
      erfasst_von: 'Michaels Mac', notiz: 'Geprüft' });
    expect(result.review.erledigt_am).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(result.review.wiedervorlage_ab).toBe(runtime.addRentIncreaseReviewMonths(result.review.erledigt_am.slice(0, 10), 12));
    expect(rows).toHaveLength(2);
  });

  it('erlaubt auch der Rolle erfassen den Prüfabschluss ohne Vertrags-Schreibrecht', () => {
    const { rows, ss, runtime } = fixture();
    const result = runtime.handleRentIncreaseReviewWrite(ss, {
      vertrag_id: 'V_2', signatur: '{"status":"DUE"}'
    }, { id: 'device-2', label: 'Vaters iPad', role: 'erfassen' });
    expect(result).toMatchObject({ status: 'success', review: { vertrag_id: 'V_2', erfasst_von: 'Vaters iPad' } });
    expect(rows).toHaveLength(2);
  });

  it('aktualisiert denselben Vertrag idempotent und öffnet ihn wieder', () => {
    const { rows, ss, runtime } = fixture();
    const payload = { vertrag_id: 'V_1', signatur: 'sig' };
    expect(runtime.handleRentIncreaseReviewWrite(ss, payload, { id: 'd1', label: 'Admin', role: 'admin' })).toMatchObject({ status: 'success' });
    const storedAfterFirstWrite = rows[1].slice();
    expect(runtime.handleRentIncreaseReviewWrite(ss, payload, { id: 'd1', label: 'Admin', role: 'admin' })).toMatchObject({ status: 'success', bereits_vorhanden: true });
    expect(rows[1]).toEqual(storedAfterFirstWrite);
    expect(rows).toHaveLength(2);
    const reopened = runtime.handleRentIncreaseReviewWrite(ss, { vertrag_id: 'V_1', aktion: 'WIEDER_OEFFNEN' }, { id: 'd1', label: 'Admin', role: 'admin' });
    expect(reopened.review).toMatchObject({ status: 'OFFEN', signatur: '', erledigt_am: '', wiedervorlage_ab: '' });
    expect(rows).toHaveLength(2);
  });

  it('lehnt fehlende Signatur, unbekannte Aktionen und unberechtigte Rollen ab', () => {
    const { ss, runtime } = fixture();
    expect(() => runtime.handleRentIncreaseReviewWrite(ss, { vertrag_id: 'V_1' }, { role: 'admin' }))
      .toThrow(/Prüfsignatur fehlt/);
    expect(() => runtime.handleRentIncreaseReviewWrite(ss, { vertrag_id: 'V_1', aktion: 'DELETE' }, { role: 'admin' }))
      .toThrow(/Unbekannte Aktion/);
    expect(() => runtime.handleRentIncreaseReviewWrite(ss, { vertrag_id: 'V_1', signatur: 'sig' }, { role: 'viewer' }))
      .toThrow(/nicht freigegeben/);
  });

  it('begrenzt den 29. Februar bei der Wiedervorlage auf den letzten Februartag', () => {
    const { runtime } = fixture();
    expect(runtime.addRentIncreaseReviewMonths('2024-02-29', 12)).toBe('2025-02-28');
  });
  it('übernimmt eine individuelle Wiedervorlage und lehnt vergangene Termine ab', () => {
    const { runtime, ss } = fixture();
    const payload = {
      vertrag_id: 'V_CUSTOM', signatur: 'sig', wiedervorlage_ab: '2027-05-15', notiz: 'Unterlagen prüfen'
    };
    const result = runtime.handleRentIncreaseReviewWrite(ss, payload, { id: 'd1', label: 'Admin', role: 'admin' });
    expect(result.review).toMatchObject({ wiedervorlage_ab: '2027-05-15', notiz: 'Unterlagen prüfen' });
    expect(runtime.handleRentIncreaseReviewWrite(ss, payload, { id: 'd1', label: 'Admin', role: 'admin' }))
      .toMatchObject({ bereits_vorhanden: true });
    expect(runtime.handleRentIncreaseReviewWrite(ss, { ...payload, wiedervorlage_ab: '2027-06-15' }, { id: 'd1', label: 'Admin', role: 'admin' }))
      .toMatchObject({ bereits_vorhanden: false, review: { wiedervorlage_ab: '2027-06-15' } });
    expect(() => runtime.handleRentIncreaseReviewWrite(ss, {
      vertrag_id: 'V_PAST', signatur: 'sig', wiedervorlage_ab: '2020-01-01'
    }, { id: 'd1', label: 'Admin', role: 'admin' })).toThrow(/Vergangenheit/);
  });
});

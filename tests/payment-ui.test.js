import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const paymentCode = readFileSync(new URL('../payment-ui.js', import.meta.url), 'utf8');

function loadPaymentService(state, document = {}, cloudService = {}) {
  const dataService = { state: { ...state } };
  const uiService = { escapeHtml: value => String(value ?? ''), setNavigationState() {}, closeModal() {} };
  const confirm = () => true;
  const factory = new Function('dataService', 'uiService', 'document', 'cloudService', 'confirm', `${paymentCode}; return paymentUiService;`);
  return factory(dataService, uiService, document, cloudService, confirm);
}

function baseState(overrides = {}) {
  return {
    objekte: [{ objekt_id: 'O1', bezeichnung: 'Hauptstraße 29' }],
    einheiten: [{ einheit_id: 'O1_WE_01', objekt_id: 'O1', nummer: 'Wohnung 1' }],
    personen: [{ person_id: 'P1', vorname: 'Donald', name: 'Duck' }],
    vertraege: [{ vertrag_id: 'V1', einheit_id: 'O1_WE_01', hauptperson_id: 'P1', aktiv: true, soll_gesamt: 650 }],
    vertragsparteien: [],
    zahlungen: [],
    ...overrides
  };
}

describe('paymentUiService Monatsstatus', () => {
  it('summiert Zahlungen und unterscheidet bezahlt, teilbezahlt, überfällig und zukünftig', () => {
    const service = loadPaymentService(baseState({ zahlungen: [
      { zahlung_id: 'JAN', vertrag_id: 'V1', datum: '2026-01-05', betrag: 650, art: 'Miete' },
      { zahlung_id: 'FEB', vertrag_id: 'V1', datum: '2026-02-05', betrag: 300, art: 'Miete' }
    ] }));
    const contract = service.getContracts()[0];

    expect(service.summarizeMonth(contract, '2026-01', new Date(2026, 10, 11))).toMatchObject({ status: 'bezahlt', paid: 650, remaining: 0 });
    expect(service.summarizeMonth(contract, '2026-02', new Date(2026, 10, 11))).toMatchObject({ status: 'teilbezahlt', paid: 300, remaining: 350 });
    expect(service.summarizeMonth(contract, '2026-03', new Date(2026, 10, 11)).status).toBe('überfällig');
    expect(service.summarizeMonth(contract, '2026-12', new Date(2026, 10, 11)).status).toBe('zukünftig');
  });

  it('führt Leerstand sichtbar, aber ohne offene Sollmiete', () => {
    const service = loadPaymentService(baseState({
      vertraege: [{ vertrag_id: 'V7', einheit_id: 'O1_WE_01', hauptperson_id: '', aktiv: true, soll_gesamt: 0 }]
    }));
    const summary = service.summarizeMonth(service.getContracts()[0], '2026-11', new Date(2026, 10, 11));
    expect(summary).toMatchObject({ due: 0, remaining: 0, status: 'leerstand', verspaetet: false });
  });

  it('berücksichtigt Stornos append-only als Gegenbuchung', () => {
    const service = loadPaymentService(baseState({ zahlungen: [
      { zahlung_id: 'PAY', vertrag_id: 'V1', datum: '2026-10-03', betrag: 650, art: 'Miete' },
      { zahlung_id: 'STORNO_PAY', vertrag_id: 'V1', datum: '2026-10-04', betrag: -650, art: 'Storno' }
    ] }));
    const summary = service.summarizeMonth(service.getContracts()[0], '2026-10', new Date(2026, 10, 11));
    expect(summary.paid).toBe(0);
    expect(summary.status).toBe('überfällig');
  });

  it('ordnet einen später eingegangenen Betrag dem ausgewählten Mietmonat zu', () => {
    const service = loadPaymentService(baseState({ zahlungen: [
      { zahlung_id: 'FEB_NACHZAHLUNG', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-02', betrag: 650, art: 'Miete' }
    ] }));
    const february = service.summarizeMonth(service.getContracts()[0], '2026-02', new Date(2026, 10, 11));
    const november = service.summarizeMonth(service.getContracts()[0], '2026-11', new Date(2026, 10, 11));
    expect(february).toMatchObject({ paid: 650, status: 'bezahlt', verspaetet: true });
    expect(november.paid).toBe(0);
  });

  it('hält Kaution außerhalb der Monatsmiete und berechnet den Kautionsstatus', () => {
    const service = loadPaymentService(baseState({
      vertraege: [{ ...baseState().vertraege[0], kaution_soll: 2000 }],
      zahlungen: [{ zahlung_id: 'K1', vertrag_id: 'V1', datum: '2026-01-02', mietmonat: '', betrag: 1200, art: 'Kaution' }]
    }));
    const contract = service.getContracts()[0];
    expect(service.summarizeMonth(contract, '2026-01').paid).toBe(0);
    expect(service.summarizeDeposit(contract)).toMatchObject({ due: 2000, paid: 1200, remaining: 800, status: 'teilweise' });
  });

  it('führt Erstattungen als negative Monatskorrektur', () => {
    const service = loadPaymentService(baseState({ zahlungen: [
      { zahlung_id: 'REFUND', vertrag_id: 'V1', datum: '2026-03-20', mietmonat: '2026-03', betrag: -100, art: 'Erstattung' }
    ] }));
    const summary = service.summarizeMonth(service.getContracts()[0], '2026-03', new Date(2026, 10, 11));
    expect(summary.paid).toBe(-100);
    expect(summary.status).toBe('überfällig');
    expect(summary.remaining).toBe(750);
  });

  it('baut eine Matrix nur für aktive Verträge', () => {
    const service = loadPaymentService(baseState({ vertraege: [
      baseState().vertraege[0],
      { vertrag_id: 'V2', einheit_id: 'O1_WE_01', hauptperson_id: 'P1', aktiv: false, soll_gesamt: 500 }
    ] }));
    const matrix = service.buildMatrix({ contracts: service.getContracts(), year: '2026', now: new Date(2026, 10, 11) });
    expect(matrix).toHaveLength(1);
    expect(matrix[0].months).toHaveLength(12);
  });
});

describe('paymentUiService CSV-Import', () => {
  it('liest deutsche Semikolon-CSV mit Dezimalkomma und Anführungszeichen', () => {
    const service = loadPaymentService(baseState());
    const rows = service.parseCsv('Datum;Betrag;Name;Verwendungszweck\n01.11.2026;"1.234,50";"Duck, Donald";Miete Wohnung 1');
    expect(rows).toEqual([expect.objectContaining({ datum: '01.11.2026', betrag: 1234.5, name: 'Duck, Donald', verwendungszweck: 'Miete Wohnung 1' })]);
  });

  it('schlägt Vertrag über Namen und Sollbetrag vor und lässt unklare Buchungen offen', () => {
    const service = loadPaymentService(baseState({ vertraege: [
      { vertrag_id: 'V1', einheit_id: 'O1_WE_01', hauptperson_id: 'P1', aktiv: true, soll_gesamt: 650 },
      { vertrag_id: 'V2', einheit_id: 'O1_WE_01', hauptperson_id: 'P2', aktiv: true, soll_gesamt: 500 }
    ], personen: [
      { person_id: 'P1', vorname: 'Donald', name: 'Duck' },
      { person_id: 'P2', vorname: 'Mickey', name: 'Mouse' }
    ] }));
    const rows = service.suggestImportRows([
      { datum: '01.11.2026', betrag: 650, name: 'Donald Duck', verwendungszweck: 'Miete' },
      { datum: '02.11.2026', betrag: 123.45, name: 'Unbekannt', verwendungszweck: 'Ohne Vertrag' }
    ]);
    expect(rows[0].vertrag_id).toBe('V1');
    expect(rows[0].matchReason).toContain('Donald Duck');
    expect(rows[1].vertrag_id).toBe('');
    expect(rows[1].matchReason).toContain('Keine eindeutige Zuordnung');
  });

  it('erzeugt für identische Importzeilen dieselbe idempotente ID', () => {
    const service = loadPaymentService(baseState());
    const key = '01.11.2026|650|Donald Duck|Miete|V1';
    expect(service.hash(key)).toBe(service.hash(key));
    expect(service.makePaymentId('V1', '2026-11', 'voll')).toBe('Miete_V1_2026-11_voll');
  });

  it('rendert die Monatsmatrix mit Status, Sollbetrag und Importbereich', () => {
    const output = { innerHTML: '' };
    const service = loadPaymentService(baseState(), {
      getElementById(id) {
        return id === 'payments-output' ? output : null;
      }
    });
    service.selectedObject = 'O1';
    service.selectedYear = '2026';
    service.render();
    expect(output.innerHTML).toContain('Mieteingänge');
    expect(output.innerHTML).toContain('Wohnung 1');
    expect(output.innerHTML).toContain('Überfällig');
    expect(output.innerHTML).toContain('Guthaben / Überzahlungen');
    expect(output.innerHTML).toContain('Kontoauszug als CSV');
  });

  it('zeigt eine vorgemerkte Offline-Zahlung nicht vorzeitig als gespeichert an', async () => {
    const messages = [];
    const state = baseState();
    const service = loadPaymentService(
      state,
      { getElementById: () => null },
      { saveTransaction: async () => ({ status: 'success', queued: true }) }
    );
    service.render = () => {};
    service.showMessage = message => messages.push(message);

    const result = await service.persistPayment({
      zahlung_id: 'Miete_V1_2026-11_voll',
      vertrag_id: 'V1',
      datum: '2026-11-11',
      betrag: 650,
      art: 'Miete'
    });

    expect(result.queued).toBe(true);
    expect(state.zahlungen).toHaveLength(0);
    expect(messages.at(-1)).toContain('vorgemerkt');
  });
});

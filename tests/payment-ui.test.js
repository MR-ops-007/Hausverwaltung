import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const paymentCode = readFileSync(new URL('../payment-ui.js', import.meta.url), 'utf8');

function loadPaymentService(state, document = {}, cloudService = {}, uiOptions = {}) {
  const dataService = { state: { ...state } };
  const uiService = { escapeHtml: value => String(value ?? ''), setNavigationState() {}, closeModal() {}, ...uiOptions };
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
    fullDataLoaded: true,
    fullDataError: false,
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
    expect(service.summarizeMonth(contract, '2026-02', new Date(2026, 10, 11))).toMatchObject({ status: 'teilbezahlt', paid: 300, remaining: 350, verspaetet: true });
    expect(service.summarizeMonth(contract, '2026-03', new Date(2026, 10, 11)).status).toBe('überfällig');
    expect(service.summarizeMonth(contract, '2026-12', new Date(2026, 10, 11)).status).toBe('zukünftig');
  });

  it('berechnet die Frist als Werktag und überspringt Feiertage', () => {
    const service = loadPaymentService(baseState());
    const contract = service.getContracts()[0];
    expect(service.formatDate(service.paymentDeadlineDate(contract, '2026-03'))).toBe('04.03.2026');
    expect(service.formatDate(service.paymentDeadlineDate(contract, '2026-05'))).toBe('06.05.2026');
    expect(service.paymentDeadlineLabel(contract, '2026-05')).toContain('3. Werktag');
  });

  it('markiert einen offenen Monat am Fälligkeitstag noch nicht als überfällig', () => {
    const service = loadPaymentService(baseState());
    const summary = service.summarizeMonth(service.getContracts()[0], '2026-11', new Date(2026, 10, 4, 18, 30));
    expect(service.formatDate(summary.dueDate)).toBe('04.11.2026');
    expect(summary.status).toBe('offen');
    expect(summary.verspaetet).toBe(false);
  });

  it('berücksichtigt individuellen Kalendertag und Mietbeginn im ersten Monat', () => {
    const service = loadPaymentService(baseState({ vertraege: [{ ...baseState().vertraege[0], start_datum: '2026-01-15', zahlungsziel_typ: 'KALENDERTAG', zahlungsziel_wert: 15 }] }));
    const contract = service.getContracts()[0];
    expect(service.formatDate(service.paymentDeadlineDate(contract, '2026-01'))).toBe('15.01.2026');
    expect(service.formatDate(service.paymentDeadlineDate(contract, '2026-02'))).toBe('16.02.2026');
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

  it('findet eine fachlich zugeordnete Zahlung zusätzlich im Eingangsmonat', () => {
    const service = loadPaymentService(baseState({ zahlungen: [
      { zahlung_id: 'FEB_NACHZAHLUNG', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-03', betrag: 100, art: 'Miete' }
    ] }));
    expect(service.getPaymentsEnteredInMonth('V1', '2026-11').map(row => row.zahlung_id)).toEqual(['FEB_NACHZAHLUNG']);
    expect(service.getPaymentsFor('V1', '2026-11')).toEqual([]);
  });

  it('behandelt alte Zahlungen mit leerer optionaler Spalte weiter nach Eingangsmonat', () => {
    const service = loadPaymentService(baseState({ zahlungen: [
      { zahlung_id: 'LEGACY', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '', betrag: 650, art: 'Miete' },
      { zahlung_id: 'CREDIT', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '', betrag: 100, art: 'Miete', zahlungsgruppe_id: 'ZG_1' }
    ] }));
    expect(service.getPaymentsFor('V1', '2026-11')).toHaveLength(1);
    expect(service.getPaymentsFor('V1', '2026-11')[0].zahlung_id).toBe('LEGACY');
    expect(service.getEffectivePaymentMonth(service.getPaymentsFor('V1', '2026-11')[0])).toBe('2026-11');
    expect(service.getEffectivePaymentMonth({ zahlung_id: 'CREDIT', mietmonat: '', zahlungsgruppe_id: 'ZG_1', datum: '2026-11-11' })).toBe('');
  });

  it('normalisiert einen als Date gelieferten Mietmonat aus Google Sheets', () => {
    const service = loadPaymentService(baseState());
    expect(service.getPaymentMonth({ mietmonat: new Date(2026, 1, 1) })).toBe('2026-02');
    expect(service.getEffectivePaymentMonth({ mietmonat: new Date(2026, 1, 1), datum: '2026-11-11' })).toBe('2026-02');
  });

  it('ordnet ein Altzahlungs-Storno im lokalen State sofort dem Originalmonat zu', async () => {
    let request;
    const service = loadPaymentService(baseState({ zahlungen: [
      { zahlung_id: 'LEGACY', vertrag_id: 'V1', datum: '2026-03-05', mietmonat: '', betrag: 650, art: 'Miete' }
    ] }), { getElementById: () => null }, {
      saveTransaction: async transaction => {
        request = transaction;
        return { status: 'success', angelegt: 1 };
      }
    });
    service.render = () => {};
    service.showMessage = () => {};

    await service.saveStorno('V1', '2026-11', 'LEGACY', 650, 'Miete', '');

    expect(request.data[0]).toMatchObject({ mietmonat: '2026-03', storno_von: 'LEGACY' });
    expect(service.getPaymentsFor('V1', '2026-03').map(row => row.zahlung_id)).toContain('Storno_LEGACY');
    expect(service.getPaymentsFor('V1', '2026-11').map(row => row.zahlung_id)).not.toContain('Storno_LEGACY');
  });

  it('erzeugt für gleiche Buchungen unterschiedliche Aktions-IDs', () => {
    const service = loadPaymentService(baseState());
    const first = service.makePaymentId('V1', '2026-11', '', 'Miete');
    const second = service.makePaymentId('V1', '2026-11', '', 'Miete');
    expect(first).not.toBe(second);
    expect(service.makeStornoId('PAYMENT_1')).toBe('Storno_PAYMENT_1');
  });

  it('plant eine Überzahlung zuerst im angeklickten und danach im ältesten offenen Mietmonat', () => {
    const service = loadPaymentService(baseState());
    const plan = service.planPaymentAllocation('V1', '2026-02', 900, 'Miete', new Date(2026, 10, 11));
    expect(plan.allocations.slice(0, 2)).toEqual([
      expect.objectContaining({ month: '2026-02', amount: 650 }),
      expect.objectContaining({ month: '2026-01', amount: 250 })
    ]);
    expect(plan.unassigned).toBe(0);
  });

  it('erzeugt für eine Verteilung eindeutige Teilbuchungen mit gemeinsamer Zahlungsgruppe', () => {
    const service = loadPaymentService(baseState());
    const plan = service.planPaymentAllocation('V1', '2026-02', 900);
    const rows = service.buildAllocationRows(plan, '2026-11-11');
    expect(rows.reduce((sum, row) => sum + row.betrag, 0)).toBe(900);
    expect(new Set(rows.map(row => row.zahlung_id)).size).toBe(rows.length);
    expect(new Set(rows.map(row => row.zahlungsgruppe_id)).size).toBe(1);
    expect(rows.map(row => row.mietmonat)).toEqual(['2026-02', '2026-01']);
  });

  it('führt einen nicht zugeordneten Rest als Guthaben und nicht als Mietmonat', () => {
    const service = loadPaymentService(baseState());
    const plan = service.planPaymentAllocation('V1', '2026-02', 8000);
    expect(plan.unassigned).toBe(200);
    const rows = service.buildAllocationRows(plan, '2026-11-11');
    expect(rows.at(-1)).toMatchObject({ mietmonat: '', betrag: 200, zahlungsgruppe_id: rows[0].zahlungsgruppe_id });
  });

  it('rechnet unzugeordnetes Mietguthaben in die Übersicht ein', () => {
    const service = loadPaymentService(baseState({ zahlungen: [
      { zahlung_id: 'CREDIT', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '', betrag: 100, art: 'Miete', zahlungsgruppe_id: 'ZG_CREDIT' }
    ] }));
    const matrix = service.buildMatrix({ contracts: service.getContracts(), year: '2026', now: new Date(2026, 10, 11) });
    expect(service.summarizeOverview(matrix, '2026', new Date(2026, 10, 11))).toMatchObject({ unassignedCredit: 100, creditAmount: 100 });
    expect(service.summarizeMonth(service.getContracts()[0], '2026-11', new Date(2026, 10, 11)).paid).toBe(0);
  });

  it('speichert beim Februar-Dialog den angeklickten Mietmonat statt des Eingangsmonats', async () => {
    const fields = {
      'payment-amount': { value: '250' },
      'payment-date': { value: '2026-11-11' },
      'payment-art': { value: 'Miete' }
    };
    let request;
    const service = loadPaymentService(
      baseState(),
      { getElementById: id => fields[id] || null },
      { saveTransaction: async transaction => { request = transaction; return { status: 'success', angelegt: 1 }; } }
    );

    await service.savePayment('V1', '2026-02');

    expect(request.data[0]).toMatchObject({
      datum: '2026-11-11',
      mietmonat: '2026-02',
      betrag: 250,
      art: 'Miete'
    });
  });

  it('verwendet bei einem Timeout und erneutem Speichern dieselbe Zahlungs-ID', async () => {
    const fields = {
      'payment-amount': { value: '250' },
      'payment-date': { value: '2026-11-11' },
      'payment-art': { value: 'Miete' }
    };
    const ids = [];
    let attempts = 0;
    const service = loadPaymentService(
      baseState(),
      { getElementById: id => fields[id] || null },
      { saveTransaction: async transaction => {
        ids.push(transaction.data[0].zahlung_id);
        if (attempts++ === 0) throw new Error('Zeitüberschreitung');
        return { status: 'success', angelegt: 1 };
      } }
    );
    service.showMessage = () => {};

    expect(await service.savePayment('V1', '2026-02')).toBeNull();
    expect(await service.savePayment('V1', '2026-02')).toMatchObject({ status: 'success' });
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('öffnet bei einer Überzahlung zuerst die explizite Verteilung statt still zu buchen', async () => {
    const fields = {
      'payment-amount': { value: '900' },
      'payment-date': { value: '2026-11-11' },
      'payment-art': { value: 'Miete' }
    };
    let pending;
    let request = false;
    const service = loadPaymentService(
      baseState(),
      { getElementById: id => fields[id] || null },
      { saveTransaction: async () => { request = true; return { status: 'success' }; } }
    );
    service.showAllocationDialog = value => { pending = value; };

    await service.savePayment('V1', '2026-02');

    expect(pending.plan).toMatchObject({ amount: 900, selectedMonth: '2026-02' });
    expect(pending.plan.allocations[0]).toMatchObject({ month: '2026-02', amount: 650 });
    expect(request).toBe(false);
  });

  it('zeigt bei einer falschen Verteilung direkt im Dialog „Bitte Summe prüfen“', () => {
    const inputs = [
      { value: '500', addEventListener(_event, handler) { this.handler = handler; } },
      { value: '400', addEventListener(_event, handler) { this.handler = handler; } },
      { value: '0', addEventListener(_event, handler) { this.handler = handler; } }
    ];
    const total = { textContent: '' };
    const message = { textContent: '', hidden: true, className: '' };
    const save = { disabled: false };
    const body = {
      innerHTML: '',
      querySelectorAll: () => inputs,
      querySelector(selector) {
        if (selector === '[data-payment-allocation-total]') return total;
        if (selector === '[data-payment-allocation-message]') return message;
        if (selector === '[data-payment-allocation-save]') return save;
        return null;
      }
    };
    const service = loadPaymentService(baseState(), {
      getElementById: id => id === 'modal-body' ? body : id === 'modal-container' ? { style: {} } : null
    });
    const contract = service.getContracts()[0];

    service.showAllocationDialog({
      contract,
      date: '2026-11-11',
      plan: {
        contractId: 'V1', selectedMonth: '2026-02', amount: 900, art: 'Miete', unassigned: 0,
        allocations: [
          { month: '2026-02', remaining: 500, amount: 500, verspaetet: true },
          { month: '2026-11', remaining: 650, amount: 400, verspaetet: true }
        ]
      }
    });

    expect(save.disabled).toBe(false);
    inputs[0].value = '499';
    inputs[0].handler();
    expect(save.disabled).toBe(true);
    expect(message.hidden).toBe(false);
    expect(message.textContent).toContain('Bitte Summe prüfen');
    expect(message.textContent).toContain('899,00 EUR');
  });

  it('behält die Aufteilung nach einem fehlgeschlagenen Speichern zur Wiederholung', async () => {
    const inputs = [
      { value: '650', getAttribute: () => '2026-02' },
      { value: '250', getAttribute: () => '2026-01' },
      { value: '0', getAttribute: () => '' }
    ];
    const body = {
      innerHTML: '',
      querySelectorAll: () => inputs,
      querySelector: () => null
    };
    const service = loadPaymentService(baseState(), {
      getElementById: id => id === 'modal-body' ? body : id === 'modal-container' ? { style: {} } : null
    });
    service.pendingAllocation = {
      contract: service.getContracts()[0],
      date: '2026-11-11',
      intentId: 'zahlung_RETRY',
      plan: {
        contractId: 'V1', selectedMonth: '2026-02', amount: 900, art: 'Miete', unassigned: 0,
        allocations: [{ month: '2026-02', remaining: 650, amount: 650 }]
      }
    };
    service.persistPayment = async () => null;

    expect(await service.confirmPaymentAllocation()).toBeNull();
    expect(service.pendingAllocation).not.toBeNull();
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

  it('führt Erstattungen separat und verschlechtert den Mietstatus nicht', () => {
    const service = loadPaymentService(baseState({ zahlungen: [
      { zahlung_id: 'RENT', vertrag_id: 'V1', datum: '2026-03-05', mietmonat: '2026-03', betrag: 650, art: 'Miete' },
      { zahlung_id: 'REFUND', vertrag_id: 'V1', datum: '2026-03-20', mietmonat: '2026-03', betrag: -100, art: 'Erstattung' }
    ] }));
    const summary = service.summarizeMonth(service.getContracts()[0], '2026-03', new Date(2026, 10, 11));
    expect(summary.paid).toBe(650);
    expect(summary.status).toBe('bezahlt');
    expect(summary.refunds).toHaveLength(1);
    expect(summary.remaining).toBe(0);
  });

  it('speichert eine Erstattung auch bei positiver Eingabe als negativen Betrag', async () => {
    const fields = {
      'payment-amount': { value: '100' },
      'payment-date': { value: '2026-11-11' },
      'payment-art': { value: 'Erstattung' }
    };
    let request;
    const service = loadPaymentService(
      baseState(),
      { getElementById: id => fields[id] || null },
      { saveTransaction: async transaction => { request = transaction; return { status: 'success', angelegt: 1 }; } }
    );

    await service.savePayment('V1', '2026-03');

    expect(request.data[0]).toMatchObject({ mietmonat: '2026-03', betrag: -100, art: 'Erstattung' });
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

  it('übernimmt den fachlichen Mietmonat aus Verwendungszweck oder Eingangsdatum', () => {
    const service = loadPaymentService(baseState());
    const rows = service.suggestImportRows([
      { datum: '30.01.2026', betrag: 650, name: 'Donald Duck', verwendungszweck: 'Miete 2026-02' },
      { datum: '05.03.2026', betrag: 650, name: 'Donald Duck', verwendungszweck: 'Miete' }
    ]);
    expect(rows.map(row => row.mietmonat)).toEqual(['2026-02', '2026-03']);
  });

  it('sendet beim CSV-Import den geprüften fachlichen Mietmonat', async () => {
    let request;
    const service = loadPaymentService(baseState(), { getElementById: () => null }, {
      saveTransaction: async transaction => { request = transaction; return { status: 'success', angelegt: 1 }; }
    });
    service.renderImportRows = () => {};
    service.importRows = [{ datum: '30.01.2026', mietmonat: '2026-02', betrag: 650, vertrag_id: 'V1', name: 'Donald Duck' }];
    await service.importPayment(0);
    expect(request.data[0]).toMatchObject({ mietmonat: '2026-02', vertrag_id: 'V1', betrag: 650 });
  });

  it('vergibt Importzeilen individuelle IDs und behält sie bei Wiederholung', () => {
    const service = loadPaymentService(baseState());
    service.importRows = [{ datum: '01.11.2026', betrag: 650, name: 'Donald Duck', verwendungszweck: 'Miete', vertrag_id: 'V1' }];
    const first = service.importRows[0].zahlung_id || (service.importRows[0].zahlung_id = service.makeActionId('Import'));
    const second = service.importRows[0].zahlung_id || (service.importRows[0].zahlung_id = service.makeActionId('Import'));
    expect(first).toBe(second);
    expect(first).toMatch(/^Import_/);
    expect(service.makePaymentId('V1', '2026-11', 'voll')).toMatch(/^Miete_V1_2026-11_voll$/);
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

  it('stellt eine offene CSV-Importliste nach einem Hintergrund-Refresh wieder her', () => {
    const output = { innerHTML: '' };
    const importOutput = { innerHTML: '' };
    const service = loadPaymentService(baseState(), {
      getElementById(id) {
        if (id === 'payments-output') return output;
        if (id === 'payment-import-output') return importOutput;
        return null;
      }
    });
    service.selectedObject = 'O1';
    service.selectedYear = '2026';
    service.importRows = [{ datum: '11.11.2026', betrag: 650, name: 'Donald Duck', vertrag_id: 'V1', mietmonat: '2026-11', matchReason: 'Manuell zugeordnet' }];

    service.render();

    expect(output.innerHTML).toContain('payment-import-output');
    expect(importOutput.innerHTML).toContain('1 Buchungen gefunden');
    expect(importOutput.innerHTML).toContain('Donald Duck');
  });

  it('sperrt die Zahlungserfassung bis zum vollständigen Hintergrundladen', () => {
    const output = { innerHTML: '' };
    const service = loadPaymentService(baseState({ fullDataLoaded: false }), {
      getElementById(id) {
        return id === 'payments-output' ? output : null;
      }
    });

    service.render();

    expect(output.innerHTML).toContain('Zahlungsdaten werden noch vollständig geladen');
  });

  it('zeigt nach einem fehlgeschlagenen Hintergrundladen einen Retry-Hinweis', () => {
    const output = { innerHTML: '' };
    const service = loadPaymentService(baseState({ fullDataLoaded: false, fullDataError: true }), {
      getElementById(id) {
        return id === 'payments-output' ? output : null;
      }
    });

    service.render();

    expect(output.innerHTML).toContain('Zahlungsdaten konnten nicht vollständig geladen werden');
    expect(output.innerHTML).toContain('Zahlungserfassung ist deshalb gesperrt');
    expect(output.innerHTML).toContain('Erneut laden');
    expect(output.innerHTML).not.toContain('gleich freigeschaltet');
  });

  it('übernimmt beim Öffnen den zuvor gewählten Objektkontext', () => {
    const output = { innerHTML: '' };
    const service = loadPaymentService(baseState({
      objekte: [
        { objekt_id: 'O1', bezeichnung: 'Hauptstraße 29' },
        { objekt_id: 'O2', bezeichnung: 'TEST · Entenhausen' }
      ],
      einheiten: [
        { einheit_id: 'O1_WE_01', objekt_id: 'O1', nummer: 'Wohnung 1' },
        { einheit_id: 'O2_WE_01', objekt_id: 'O2', nummer: 'Wohnung 2' }
      ],
      vertraege: [
        { vertrag_id: 'V1', einheit_id: 'O1_WE_01', hauptperson_id: 'P1', aktiv: true, soll_gesamt: 650 },
        { vertrag_id: 'V2', einheit_id: 'O2_WE_01', hauptperson_id: 'P1', aktiv: true, soll_gesamt: 800 }
      ],
      zahlungen: [{ zahlung_id: 'P2', vertrag_id: 'V2', datum: '2026-11-11', mietmonat: '2026-11', betrag: 800, art: 'Miete' }]
    }), {
      getElementById(id) {
        if (id === 'payments-output') return output;
        return { style: {} };
      }
    }, {}, { currentSelection: 'O2' });

    service.selectedObject = 'O1';
    service.show();

    expect(service.selectedObject).toBe('O2');
    expect(output.innerHTML).toContain('Wohnung 2');
    expect(output.innerHTML).toContain('800,00 EUR / Monat');
    expect(output.innerHTML).not.toContain('Wohnung 1');
  });

  it('zeigt den Kautionsstatus prominent in der Vertragsübersicht', () => {
    const output = { innerHTML: '' };
    const service = loadPaymentService(baseState({
      vertraege: [{ ...baseState().vertraege[0], kaution_soll: 2000 }],
      zahlungen: [{ zahlung_id: 'K1', vertrag_id: 'V1', art: 'Kaution', datum: '2026-01-02', betrag: 1200 }]
    }), {
      getElementById(id) {
        return id === 'payments-output' ? output : null;
      }
    });
    service.selectedObject = 'O1';
    service.selectedYear = '2026';
    service.render();
    expect(output.innerHTML).toContain('Vertragsstatus');
    expect(output.innerHTML).toContain('payment-contract-summary-overall');
    expect(output.innerHTML).toContain('onclick="paymentUiService.toggleLegend(this)"');
    expect(output.innerHTML).toContain('Kaution: 1.200,00 / 2.000,00 EUR');
    expect(output.innerHTML).toContain('800,00 EUR offen');
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

  it('schreibt keine Zahlung, wenn das Backend das Zahlungsschema nicht freigibt', async () => {
    const messages = [];
    let wrote = false;
    const service = loadPaymentService(
      baseState(),
      { getElementById: () => null },
      {
        loadPaymentCapabilities: async () => { throw new Error('Der Zahlungsbereich ist im Backend noch nicht freigegeben.'); },
        saveTransaction: async () => { wrote = true; return { status: 'success' }; }
      }
    );
    service.showMessage = message => messages.push(message);

    await service.persistPayment({ zahlung_id: 'PAYMENT_1', vertrag_id: 'V1', datum: '2026-11-12', mietmonat: '2026-11', betrag: 650, art: 'Miete' });

    expect(wrote).toBe(false);
    expect(messages.at(-1)).toContain('Zahlungsbereich');
  });

  it('lässt einen vorübergehenden Capability-Netzfehler in den Queue-fähigen Schreibweg durch', async () => {
    let wrote = false;
    const service = loadPaymentService(
      baseState(),
      { getElementById: () => null },
      {
        loadPaymentCapabilities: async () => { const error = new TypeError('Netzwerk getrennt'); throw error; },
        isTransient: error => error instanceof TypeError,
        saveTransaction: async () => { wrote = true; return { status: 'success', queued: true }; }
      }
    );
    service.render = () => {};
    service.showMessage = () => {};

    const result = await service.persistPayment({ zahlung_id: 'QUEUE_AFTER_PREFLIGHT', vertrag_id: 'V1', datum: '2026-11-12', mietmonat: '2026-11', betrag: 650, art: 'Miete' });

    expect(wrote).toBe(true);
    expect(result).toMatchObject({ status: 'success', queued: true });
  });

  it('sendet eine aufgeteilte Zahlung als mehrere Zeilen an den Schreibweg', async () => {
    let request;
    const state = baseState();
    const service = loadPaymentService(state, { getElementById: () => null }, {
      saveTransaction: async transaction => { request = transaction; return { status: 'success', angelegt: 2 }; }
    });
    service.render = () => {};
    await service.persistPayment([
      { zahlung_id: 'SPLIT_1', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-02', betrag: 650, art: 'Miete', zahlungsgruppe_id: 'ZG_1' },
      { zahlung_id: 'SPLIT_2', vertrag_id: 'V1', datum: '2026-11-11', mietmonat: '2026-01', betrag: 250, art: 'Miete', zahlungsgruppe_id: 'ZG_1' }
    ]);
    expect(request.data).toHaveLength(2);
    expect(new Set(request.data.map(row => row.zahlungsgruppe_id))).toEqual(new Set(['ZG_1']));
    expect(state.zahlungen.map(row => row.zahlung_id)).toEqual(['SPLIT_1', 'SPLIT_2']);
  });
});

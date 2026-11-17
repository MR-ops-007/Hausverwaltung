import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps-script/PaymentRules.js', import.meta.url), 'utf8');
const rules = new Function(`${source}; return paymentRules;`)();

describe('gemeinsame Zahlungsregeln', () => {
  it('normalisiert Zahlungsarten, Beträge und fachliche Monate einheitlich', () => {
    expect(rules.normalizeArt(' erstattung ')).toBe('Erstattung');
    expect(rules.normalizeArt('')).toBe('Miete');
    expect(rules.normalizeAmount('1.250,50')).toBe(1250.5);
    expect(rules.normalizeAmount('1.250')).toBe(1250);
    expect(rules.normalizeAmount('0.500')).toBe(0.5);
    expect(rules.normalizeAmount(1.005)).toBeNull();
    expect(rules.normalizeAmount('1.234,565')).toBeNull();
    expect(rules.normalizeAmount('abc')).toBeNull();
    expect(rules.normalizeMonth('29.02.2026')).toBe('2026-02');
    expect(rules.normalizeMonth('2026-13')).toBeNull();
    expect(rules.normalizeMonth('2026-02-28T23:00:00Z')).toBe('2026-03');
  });

  it('trennt zugewiesene Monate, Legacy-Eingänge und explizites Guthaben', () => {
    expect(rules.effectiveMonth({ mietmonat: '2026-02', datum: '2026-11-11' })).toBe('2026-02');
    expect(rules.effectiveMonth({ mietmonat: '', datum: '2026-02-05' })).toBe('2026-02');
    expect(rules.effectiveMonth({ mietmonat: '', zahlungsgruppe_id: 'GROUP-1', datum: '2026-11-11' })).toBe('');
    expect(rules.explicitCredit({ mietmonat: '', zahlungsgruppe_id: 'GROUP-1' })).toBe(true);
    expect(rules.normalizeAssignedMonth({ art: 'Kaution', mietmonat: '2026-02' })).toBe('');
    expect(rules.normalizeAssignedMonth({ art: 'Miete', mietmonat: '2026-02' })).toBe('2026-02');
  });

  it('klassifiziert Kaution, Miete, Erstattung und Storno ohne UI-Kontext', () => {
    expect(rules.isDeposit({ art: 'Kaution' })).toBe(true);
    expect(rules.isDeposit({ art: 'Storno', gegen_art: 'Kaution' })).toBe(true);
    expect(rules.isRentSettlement({ art: 'Nachzahlung' })).toBe(true);
    expect(rules.isRentSettlement({ art: 'Storno', gegen_art: 'Erstattung' })).toBe(false);
    expect(rules.isRefund({ art: 'Erstattung' })).toBe(true);
  });

  it('leitet Storno-Metadaten ausschließlich aus dem Original ab', () => {
    expect(rules.stornoMetadata({ art: 'Miete', mietmonat: '', datum: '05.02.2026' })).toEqual({
      mietmonat: '2026-02', gegen_art: 'Miete', zahlungsgruppe_id: ''
    });
    expect(rules.stornoMetadata({ art: 'Kaution', mietmonat: '', datum: '05.02.2026' })).toEqual({
      mietmonat: '', gegen_art: 'Kaution', zahlungsgruppe_id: ''
    });
    expect(rules.stornoMetadata({ art: 'Miete', mietmonat: '', zahlungsgruppe_id: 'GROUP-1', datum: '05.02.2026' })).toEqual({
      mietmonat: '', gegen_art: 'Miete', zahlungsgruppe_id: 'GROUP-1'
    });
  });

  it('berechnet Status und Verspätung mit derselben Cent-Toleranz', () => {
    expect(rules.paymentStatus({ due: 800, paid: 800, dueDate: '2026-03-03', currentDate: '2026-03-10' }))
      .toEqual({ status: 'bezahlt', verspaetet: false });
    expect(rules.paymentStatus({ due: 800, paid: 400, dueDate: '2026-03-03', currentDate: '2026-03-10' }))
      .toEqual({ status: 'teilbezahlt', verspaetet: true });
    expect(rules.paymentStatus({ due: 800, paid: 0, dueDate: '2026-03-03', currentDate: '2026-03-10' }))
      .toEqual({ status: 'überfällig', verspaetet: true });
    expect(rules.paymentStatus({ outsidePeriod: 'leerstand', due: 0, paid: 0, currentDate: '2026-03-10' }))
      .toEqual({ status: 'leerstand', verspaetet: false });
  });
});

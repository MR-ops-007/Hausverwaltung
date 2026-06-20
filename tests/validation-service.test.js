import { describe, it, expect } from 'vitest';
import {
  VALIDATION_STATUS,
  validateZaehlerstand,
} from '../validation-service.js';

describe('validateZaehlerstand', () => {
  it('accepts first reading without previous value', () => {
    const result = validateZaehlerstand({
      letzterWert: null,
      neuerWert: 200,
    });

    expect(result.status).toBe(VALIDATION_STATUS.OK);
    expect(result.code).toBe('FIRST_READING');
    expect(result.delta).toBe(null);
  });

  it('accepts normal increasing meter value', () => {
    const result = validateZaehlerstand({
      letzterWert: 1200,
      neuerWert: 1350,
    });

    expect(result.status).toBe(VALIDATION_STATUS.OK);
    expect(result.code).toBe('NORMAL_INCREASE');
    expect(result.delta).toBe(150);
  });

  it('warns if consumption is higher than max plausible consumption', () => {
    const result = validateZaehlerstand({
      letzterWert: 1000,
      neuerWert: 9000,
      zaehler: {
        max_plausibler_verbrauch: 500,
      },
    });

    expect(result.status).toBe(VALIDATION_STATUS.WARNUNG);
    expect(result.code).toBe('HIGH_CONSUMPTION');
    expect(result.delta).toBe(8000);
    expect(result.needsConfirmation).toBe(true);
  });

  it('warns if new value is lower without overflow or meter change', () => {
    const result = validateZaehlerstand({
      letzterWert: 1200,
      neuerWert: 900,
    });

    expect(result.status).toBe(VALIDATION_STATUS.WARNUNG);
    expect(result.code).toBe('LOWER_VALUE_WITHOUT_EXPLANATION');
    expect(result.needsConfirmation).toBe(true);
  });

  it('accepts 4-digit overflow', () => {
    const result = validateZaehlerstand({
      letzterWert: 9876,
      neuerWert: 123,
      zaehler: {
        stellen: 4,
        ueberlauf_erlaubt: true,
      },
    });

    expect(result.status).toBe(VALIDATION_STATUS.OK);
    expect(result.code).toBe('OVERFLOW');
    expect(result.delta).toBe(247);
  });

  it('accepts 5-digit overflow', () => {
    const result = validateZaehlerstand({
      letzterWert: 99876,
      neuerWert: 123,
      zaehler: {
        stellen: 5,
        ueberlauf_erlaubt: true,
      },
    });

    expect(result.status).toBe(VALIDATION_STATUS.OK);
    expect(result.code).toBe('OVERFLOW');
    expect(result.delta).toBe(247);
  });

  it('warns if overflow consumption is unusually high', () => {
    const result = validateZaehlerstand({
      letzterWert: 1000,
      neuerWert: 900,
      zaehler: {
        stellen: 4,
        ueberlauf_erlaubt: true,
        max_plausibler_verbrauch: 500,
      },
    });

    expect(result.status).toBe(VALIDATION_STATUS.WARNUNG);
    expect(result.code).toBe('HIGH_OVERFLOW_CONSUMPTION');
    expect(result.delta).toBe(9900);
    expect(result.needsConfirmation).toBe(true);
  });

  it('accepts lower value when meter change is explicitly provided in context', () => {
    const result = validateZaehlerstand({
      letzterWert: 1200,
      neuerWert: 15,
      context: {
        zaehlerwechsel: true,
      },
    });

    expect(result.status).toBe(VALIDATION_STATUS.OK);
    expect(result.code).toBe('METER_CHANGE');
    expect(result.delta).toBe(null);
  });

  it('rejects invalid new value', () => {
    const result = validateZaehlerstand({
      letzterWert: 1200,
      neuerWert: 'abc',
    });

    expect(result.status).toBe(VALIDATION_STATUS.FEHLER);
    expect(result.code).toBe('INVALID_NEW_VALUE');
  });

  it('rejects negative new value', () => {
    const result = validateZaehlerstand({
      letzterWert: 1200,
      neuerWert: -1,
    });

    expect(result.status).toBe(VALIDATION_STATUS.FEHLER);
    expect(result.code).toBe('NEGATIVE_NEW_VALUE');
  });

  it('accepts comma decimal values from German input', () => {
    const result = validateZaehlerstand({
      letzterWert: '10,5',
      neuerWert: '12,75',
    });

    expect(result.status).toBe(VALIDATION_STATUS.OK);
    expect(result.code).toBe('NORMAL_INCREASE');
    expect(result.delta).toBe(2.25);
  });
});
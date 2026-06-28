export const VALIDATION_STATUS = {
  OK: 'OK',
  WARNUNG: 'WARNUNG',
  FEHLER: 'FEHLER',
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value;

  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function toBoolean(value) {
  if (value === true || value === 'TRUE' || value === 'true' || value === 1 || value === '1') {
    return true;
  }

  return false;
}

function calculateOverflowDelta(lastValue, newValue, digits) {
  const maxValueExclusive = Math.pow(10, digits);
  return maxValueExclusive - lastValue + newValue;
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function isReverseFillLevelMeter(zaehler) {
  const medium = normalizeKey(zaehler.medium);
  const zaehlerId = normalizeKey(zaehler.zaehler_id);

  return medium === 'oel_stand_cm' || zaehlerId.includes('oel_stand_in_cm');
}

function buildResult(status, code, message, options = {}) {
  return {
    status,
    code,
    message,
    delta: options.delta ?? null,
    needsConfirmation: options.needsConfirmation ?? false,
  };
}

export function validateZaehlerstand({
  letzterWert,
  neuerWert,
  zaehler = {},
  context = {},
}) {
  const previous = toNumber(letzterWert);
  const current = toNumber(neuerWert);

  if (current === null) {
    return buildResult(
      VALIDATION_STATUS.FEHLER,
      'INVALID_NEW_VALUE',
      'Der neue Zählerstand ist keine gültige Zahl.'
    );
  }

  if (current < 0) {
    return buildResult(
      VALIDATION_STATUS.FEHLER,
      'NEGATIVE_NEW_VALUE',
      'Der neue Zählerstand darf nicht negativ sein.'
    );
  }

  if (previous === null) {
    return buildResult(
      VALIDATION_STATUS.OK,
      'FIRST_READING',
      'Erstablesung ohne vorherigen Vergleichswert.',
      { delta: null }
    );
  }

  if (previous < 0) {
    return buildResult(
      VALIDATION_STATUS.FEHLER,
      'INVALID_PREVIOUS_VALUE',
      'Der vorherige Zählerstand ist ungültig.'
    );
  }

  const maxPlausibleConsumption = toNumber(zaehler.max_plausibler_verbrauch);
  const isMeterChange =
    toBoolean(context.zaehlerwechsel) ||
    toBoolean(zaehler.zaehlerwechsel);

  if (isReverseFillLevelMeter(zaehler)) {
    if (current <= previous) {
      const delta = previous - current;

      if (maxPlausibleConsumption !== null && delta > maxPlausibleConsumption) {
        return buildResult(
          VALIDATION_STATUS.WARNUNG,
          'HIGH_FILL_LEVEL_CONSUMPTION',
          'Der Füllstand ist stärker gesunken als der definierte plausible Maximalverbrauch.',
          { delta, needsConfirmation: true }
        );
      }

      return buildResult(
        VALIDATION_STATUS.OK,
        'FILL_LEVEL_DECREASE',
        'Der niedrigere Füllstand ist als Verbrauch plausibel.',
        { delta }
      );
    }

    return buildResult(
      VALIDATION_STATUS.WARNUNG,
      'FILL_LEVEL_INCREASE',
      'Der Füllstand ist höher als der vorherige Wert. Bitte Betankung, Korrektur oder Eingabefehler prüfen.',
      { delta: current - previous, needsConfirmation: true }
    );
  }

  if (current >= previous) {
    const delta = current - previous;

    if (maxPlausibleConsumption !== null && delta > maxPlausibleConsumption) {
      return buildResult(
        VALIDATION_STATUS.WARNUNG,
        'HIGH_CONSUMPTION',
        'Der Verbrauch ist höher als der definierte plausible Maximalwert.',
        { delta, needsConfirmation: true }
      );
    }

    return buildResult(
      VALIDATION_STATUS.OK,
      'NORMAL_INCREASE',
      'Der neue Zählerstand ist plausibel.',
      { delta }
    );
  }

  if (isMeterChange) {
    return buildResult(
      VALIDATION_STATUS.OK,
      'METER_CHANGE',
      'Der niedrigere Wert ist durch einen Zählerwechsel erklärbar.',
      { delta: null }
    );
  }

  const overflowAllowed = toBoolean(zaehler.ueberlauf_erlaubt);
  const digits = toNumber(zaehler.stellen);

  if (overflowAllowed && digits !== null && digits > 0) {
    const delta = calculateOverflowDelta(previous, current, digits);

    if (maxPlausibleConsumption !== null && delta > maxPlausibleConsumption) {
      return buildResult(
        VALIDATION_STATUS.WARNUNG,
        'HIGH_OVERFLOW_CONSUMPTION',
        'Der niedrigere Wert kann durch Überlauf erklärbar sein, der berechnete Verbrauch ist aber ungewöhnlich hoch.',
        { delta, needsConfirmation: true }
      );
    }

    return buildResult(
      VALIDATION_STATUS.OK,
      'OVERFLOW',
      'Der niedrigere Wert ist durch einen Zählerüberlauf erklärbar.',
      { delta }
    );
  }

  return buildResult(
    VALIDATION_STATUS.WARNUNG,
    'LOWER_VALUE_WITHOUT_EXPLANATION',
    'Der neue Zählerstand ist niedriger als der vorherige Wert. Bitte Zählerwechsel, Überlauf oder Eingabefehler prüfen.',
    { delta: null, needsConfirmation: true }
  );
}

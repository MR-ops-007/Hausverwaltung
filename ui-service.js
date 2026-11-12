/**
 * UI-SERVICE (v2.8.2 - Zähler-Plausibilitätsprüfung integriert)
 */
const uiService = {
  currentSelection: null,
  currentActiveMetersObjects: [],
  saveSuccessDisplayMs: 900,
  CONSUMPTION_STALE_READING_DAYS: 365,

  applyStyles(el, styles) {
    Object.assign(el.style, styles);
  },

  parseGermanDate(value) {
    if (!value) return 0;

    if (value instanceof Date) {
      return value.getTime();
    }

    const text = String(value).trim();

    const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);

    if (match) {
      const [, day, month, year, hour = '0', minute = '0'] = match;

      return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute)
      ).getTime();
    }

    const fallback = Date.parse(text);
    return Number.isFinite(fallback) ? fallback : 0;
  },

  formatGermanTimestamp(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${day}.${month}.${year} ${hour}:${minute}`;
  },

  formatReadingTimestamp(value) {
    if (!value) return '';

    const timestamp = this.parseGermanDate(value);

    if (!timestamp) {
      return String(value);
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) {
      const parts = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin',
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(timestamp));
      const part = type => parts.find(item => item.type === type).value;
      return `${part('day')}.${part('month')}.${part('year')} ${part('hour')}:${part('minute')}`;
    }

    return this.formatGermanTimestamp(new Date(timestamp));
  },

  getZaehlerLabel(zaehler) {
    return (
      zaehler.bezeichnung ||
      zaehler.medium ||
      zaehler.typ ||
      zaehler.zaehler_id ||
      'Zähler'
    );
  },

  getZaehlerTheme(zaehler) {
    const mediumFamily = this.getConsumptionMediumFamily(zaehler && zaehler.medium);
    const fallbackText = [
      zaehler && zaehler.medium,
      zaehler && zaehler.bezeichnung,
      zaehler && zaehler.zaehler_id
    ].join(' ').toLowerCase();

    const resolvedFamily = mediumFamily !== 'SONSTIGES'
      ? mediumFamily
      : fallbackText.includes('kaltwasser')
        ? 'KALTWASSER'
        : fallbackText.includes('warmwasser')
          ? 'WARMWASSER'
          : fallbackText.includes('strom')
            ? 'STROM'
            : (fallbackText.includes('oel') || fallbackText.includes('öl'))
              ? 'OEL'
              : 'SONSTIGES';

    const themes = {
      KALTWASSER: {
        accent: '#2563eb',
        border: '#bfdbfe',
        background: '#eff6ff',
        previousBackground: '#f8fbff',
        previousBorder: '#dbeafe'
      },
      WARMWASSER: {
        accent: '#dc2626',
        border: '#fecaca',
        background: '#fef2f2',
        previousBackground: '#fff7f7',
        previousBorder: '#fecaca'
      },
      STROM: {
        accent: '#16a34a',
        border: '#bbf7d0',
        background: '#f0fdf4',
        previousBackground: '#f7fef9',
        previousBorder: '#dcfce7'
      },
      OEL: {
        accent: '#b45309',
        border: '#fde68a',
        background: '#fffbeb',
        previousBackground: '#fff8e6',
        previousBorder: '#fde68a'
      },
      SONSTIGES: {
        accent: '#64748b',
        border: '#e2e8f0',
        background: '#f8fafc',
        previousBackground: '#f8fafc',
        previousBorder: '#e2e8f0'
      }
    };

    return themes[resolvedFamily] || themes.SONSTIGES;
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  getUnitDisplayName(unit) {
    if (!unit) return '';

    return unit.nummer || unit.bezeichnung || unit.einheit || unit.einheit_id || '';
  },

  getUnitEntranceLabel(unit) {
    if (!unit || !unit.eingang) return '';

    return String(unit.eingang).toLowerCase() === 'allgemein'
      ? 'Allgemein'
      : `Eingang ${unit.eingang}`;
  },

  formatMieterDisplayName(value) {
    const text = String(value || '').trim();

    if (!text || text === 'Leerstand') {
      return 'Leerstand';
    }

    return text
      .split(' / ')
      .map(part => {
        const pieces = part.split(',').map(piece => piece.trim()).filter(Boolean);

        if (pieces.length === 2) {
          return `${pieces[1]} ${pieces[0]}`;
        }

        return part.trim();
      })
      .join(' / ');
  },

  getUnitViewData(einheitId) {
    const viewRows = Array.isArray(dataService.state.view_aktive_mieter)
      ? dataService.state.view_aktive_mieter
      : [];

    return viewRows.find(v => String(v.einheit_id) === String(einheitId));
  },

  toBoolean(value) {
    if (value === true || value === false) {
      return value;
    }

    if (value === 1 || value === 0) {
      return value === 1;
    }

    const normalized = String(value ?? '').trim().toLowerCase();

    if (['true', '1', 'ja', 'wahr'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'nein', 'falsch'].includes(normalized)) {
      return false;
    }

    return null;
  },

  isExplicitFalse(value) {
    return this.toBoolean(value) === false;
  },

  isExplicitTrue(value) {
    return this.toBoolean(value) === true;
  },

  isTrueValue(value) {
    return this.isExplicitTrue(value);
  },

  isFalseValue(value) {
    return this.isExplicitFalse(value);
  },

  isZaehlerAktiv(zaehler) {
    return !this.isExplicitFalse(zaehler && zaehler.aktiv);
  },

  isZaehlerErfassbar(zaehler) {
    return !this.isExplicitFalse(zaehler && zaehler.erfassbar);
  },

  isZaehlerBerechnet(zaehler) {
    return this.isExplicitTrue(zaehler && zaehler.berechnet);
  },

  isZaehlerManuellErfassbar(zaehler) {
    return (
      this.isZaehlerAktiv(zaehler) &&
      this.isZaehlerErfassbar(zaehler) &&
      !this.isZaehlerBerechnet(zaehler)
    );
  },

  createFallbackValidationService() {
    const VALIDATION_STATUS = {
      OK: 'OK',
      WARNUNG: 'WARNUNG',
      FEHLER: 'FEHLER',
    };
    const toNumber = value => {
      if (value === null || value === undefined || value === '') {
        return null;
      }

      const normalized = typeof value === 'string'
        ? value.replace(',', '.').trim()
        : value;
      const number = Number(normalized);

      return Number.isFinite(number) ? number : null;
    };
    const toBoolean = value => (
      value === true ||
      value === 'TRUE' ||
      value === 'true' ||
      value === 1 ||
      value === '1'
    );
    const normalizeKey = value => String(value || '').trim().toLowerCase();
    const buildResult = (status, code, message, options = {}) => ({
      status,
      code,
      message,
      delta: options.delta ?? null,
      needsConfirmation: options.needsConfirmation ?? false,
    });
    const calculateOverflowDelta = (lastValue, newValue, digits) => {
      const maxValueExclusive = Math.pow(10, digits);
      return maxValueExclusive - lastValue + newValue;
    };
    const isReverseFillLevelMeter = zaehler => {
      const medium = normalizeKey(zaehler.medium);
      const zaehlerId = normalizeKey(zaehler.zaehler_id);

      return medium === 'oel_stand_cm' || zaehlerId.includes('oel_stand_in_cm');
    };

    return {
      VALIDATION_STATUS,
      validateZaehlerstand({ letzterWert, neuerWert, zaehler = {}, context = {} }) {
        const previous = toNumber(letzterWert);
        const current = toNumber(neuerWert);

        if (current === null) {
          return buildResult(VALIDATION_STATUS.FEHLER, 'INVALID_NEW_VALUE', 'Der neue Zählerstand ist keine gültige Zahl.');
        }

        if (current < 0) {
          return buildResult(VALIDATION_STATUS.FEHLER, 'NEGATIVE_NEW_VALUE', 'Der neue Zählerstand darf nicht negativ sein.');
        }

        if (previous === null) {
          return buildResult(VALIDATION_STATUS.OK, 'FIRST_READING', 'Erstablesung ohne vorherigen Vergleichswert.', { delta: null });
        }

        if (previous < 0) {
          return buildResult(VALIDATION_STATUS.FEHLER, 'INVALID_PREVIOUS_VALUE', 'Der vorherige Zählerstand ist ungültig.');
        }

        const maxPlausibleConsumption = toNumber(zaehler.max_plausibler_verbrauch);
        const isMeterChange = toBoolean(context.zaehlerwechsel) || toBoolean(zaehler.zaehlerwechsel);

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

            return buildResult(VALIDATION_STATUS.OK, 'FILL_LEVEL_DECREASE', 'Der niedrigere Füllstand ist als Verbrauch plausibel.', { delta });
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

          return buildResult(VALIDATION_STATUS.OK, 'NORMAL_INCREASE', 'Der neue Zählerstand ist plausibel.', { delta });
        }

        if (isMeterChange) {
          return buildResult(VALIDATION_STATUS.OK, 'METER_CHANGE', 'Der niedrigere Wert ist durch einen Zählerwechsel erklärbar.', { delta: null });
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

          return buildResult(VALIDATION_STATUS.OK, 'OVERFLOW', 'Der niedrigere Wert ist durch einen Zählerüberlauf erklärbar.', { delta });
        }

        return buildResult(
          VALIDATION_STATUS.WARNUNG,
          'LOWER_VALUE_WITHOUT_EXPLANATION',
          'Der neue Zählerstand ist niedriger als der vorherige Wert. Bitte Zählerwechsel, Überlauf oder Eingabefehler prüfen.',
          { delta: null, needsConfirmation: true }
        );
      }
    };
  },

  async getValidationService() {
    let validator = window.validationService;

    if (validator && typeof validator.validateZaehlerstand === 'function') {
      return validator;
    }

    try {
      let validationModule;

      try {
        validationModule = await import('./validation-service.js?v=20260628-validation-fallback-v2');
      } catch (versionedError) {
        validationModule = await import('./validation-service.js');
      }

      validator = {
        VALIDATION_STATUS: validationModule.VALIDATION_STATUS,
        validateZaehlerstand: validationModule.validateZaehlerstand
      };
    } catch (error) {
      validator = this.createFallbackValidationService();
    }

    window.validationService = validator;
    return validator;
  },

  // Muss zu KORREKTUR_FENSTER_MINUTEN in apps-script/Code.gs passen.
  KORREKTUR_FENSTER_MINUTEN: 15,

  /** Noch nicht übertragene Ablesungen aus der Offline-Queue (ohne abgelehnte). */
  getPendingReadings() {
    if (typeof cloudService === 'undefined' || typeof cloudService.getQueueSummary !== 'function') {
      return [];
    }

    return cloudService.getQueueSummary().entries
      .filter(entry => entry.status !== 'rejected' && entry.payload && Array.isArray(entry.payload.data))
      .reduce((all, entry) => all.concat(entry.payload.data), []);
  },

  // includePending: nur für die Plausibilitätsprüfung beim Erfassen. Die Anzeige „Letzter Stand“
  // zeigt ausschließlich, was in der Datenbank bestätigt ist.
  getLatestZaehlerstand(zaehlerOrId, { excludeStandId = '', correctionTime = null, includePending = false } = {}) {
    const confirmed = Array.isArray(dataService.state.zaehlerstaende)
      ? dataService.state.zaehlerstaende
      : [];
    const readings = includePending ? confirmed.concat(this.getPendingReadings()) : confirmed;
    const zaehler = typeof zaehlerOrId === 'object' && zaehlerOrId !== null
      ? zaehlerOrId
      : { zaehler_id: zaehlerOrId };

    const matchingReadings = readings
      .filter(row => {
        if (String(row.zaehler_id) !== String(zaehler.zaehler_id)) {
          return false;
        }

        if (zaehler.objekt_id && String(row.objekt_id) !== String(zaehler.objekt_id)) {
          return false;
        }

        if (zaehler.einheit_id && String(row.einheit_id) !== String(zaehler.einheit_id)) {
          return false;
        }

        // Mögliche Korrektur: Werte derselben Minute und der letzten Minuten davor sind keine
        // Vergleichswerte (der Tippfehler soll nicht die Korrektur blockieren).
        if (excludeStandId && this.getRowStandId(row) === excludeStandId) {
          return false;
        }

        if (correctionTime) {
          const age = correctionTime - this.parseGermanDate(row.zeitstempel);

          if (age >= 0 && age <= this.KORREKTUR_FENSTER_MINUTEN * 60000) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => this.parseGermanDate(b.zeitstempel) - this.parseGermanDate(a.zeitstempel));

    return matchingReadings[0] || null;
  },

  getLatestZaehlerstandDisplay(zaehler) {
    const latestReading = this.getLatestZaehlerstand(zaehler);

    if (!latestReading) {
      return {
        hasReading: false,
        label: 'Letzter Stand',
        valueText: 'Noch keine Ablesung vorhanden.',
        timestampText: ''
      };
    }

    const unit = this.getConsumptionDisplayUnit(zaehler);
    const unitLabel = unit ? ` ${unit}` : '';

    return {
      hasReading: true,
      label: 'Letzter Stand',
      valueText: `${this.formatDashboardNumber(latestReading.wert)}${unitLabel}`,
      timestampText: this.formatReadingTimestamp(latestReading.zeitstempel)
    };
  },

  getOilConsumptionReport(zaehler, year) {
    const service = typeof window !== 'undefined' ? window.heatingOilService : null;
    if (!service || typeof service.isOilLevelMeter !== 'function' || !service.isOilLevelMeter(zaehler)) {
      return null;
    }

    const readings = Array.isArray(dataService.state.zaehlerstaende) ? dataService.state.zaehlerstaende : [];
    const meters = Array.isArray(dataService.state.zaehler) ? dataService.state.zaehler : [];
    const fillReadings = typeof service.fillReadingsFor === 'function'
      ? service.fillReadingsFor(readings, meters, zaehler)
      : [];

    return service.calculate(
      readings,
      zaehler,
      Array.isArray(dataService.state.haustechnik) ? dataService.state.haustechnik : [],
      Number(year),
      { fillReadings }
    );
  },

  formatValidationMessage(zaehler, latestReading, result, neuerWert) {
    const name = this.getZaehlerLabel(zaehler);
    const alterWert = latestReading ? latestReading.wert : 'kein Vorwert';

    return [
      `${name}`,
      `Alt: ${alterWert}`,
      `Neu: ${neuerWert}`,
      result.delta !== null ? `Differenz: ${result.delta}` : null,
      result.message
    ].filter(Boolean).join(' | ');
  },

  getObjectDisplayName(objektId) {
    const objects = Array.isArray(dataService.state.objekte)
      ? dataService.state.objekte
      : [];
    const objData = objects.find(o => String(o.objekt_id) === String(objektId));

    return objData ? (objData.bezeichnung || objData.objekt_id) : objektId;
  },

  getAvailableConsumptionYears() {
    const viewRows = Array.isArray(dataService.state.view_verbrauch_jahr)
      ? dataService.state.view_verbrauch_jahr
      : [];
    const years = new Set();

    if (viewRows.length > 0) {
      viewRows.forEach(row => {
        if (row.jahr !== undefined && row.jahr !== null && row.jahr !== '') {
          years.add(String(row.jahr));
        }
      });
    } else {
      (Array.isArray(dataService.state.zaehlerstaende) ? dataService.state.zaehlerstaende : [])
        .map(reading => {
          const timestamp = this.parseGermanDate(reading.zeitstempel);
          return timestamp ? String(new Date(timestamp).getFullYear()) : '';
        })
        .filter(Boolean)
        .forEach(year => years.add(year));
    }

    if (years.size === 0) {
      years.add(String(new Date().getFullYear()));
    }

    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  },

  formatDashboardNumber(value) {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return '-';
    }

    return number.toLocaleString('de-DE', {
      maximumFractionDigits: 2
    });
  },

  getConsumptionStatusLabel(status) {
    const labels = {
      OK: 'OK',
      KANONISCH_ZUGEORDNET: 'Historisch zugeordnet',
      NUR_EIN_WERT: 'Nur ein Wert',
      KEINE_ABLESUNG: 'Keine Ablesung',
      UNGELOESTE_MESSWERTE: 'Ungelöst',
      MONATSZEILEN_ABWEICHUNG: 'Prüfen',
      WARNUNG_UEBERLAUF: 'Überlauf prüfen',
      WARNUNG_RUECKLAEUFIG: 'Rückläufig prüfen',
      WARNUNG_FUELLSTAND_GESTIEGEN: 'Füllstand prüfen',
      NICHT_BERECHENBAR: 'Nicht berechenbar',
      UEBERLAUF: 'Überlauf',
      EINZELWERT: 'Einzelwert',
      KEINE_WERTE: 'Keine Werte',
      UNBERECHENBAR: 'Prüfen',
      UNPLAUSIBEL_HOCH: 'Unplausibel',
      TEILWEISE_UNBERECHENBAR: 'Teilweise offen',
      RUECKLAEUFIG_UNGEKLAERT: 'Prüfen',
      FUELLSTAND_GESTIEGEN: 'Prüfen',
      FORTGESCHRIEBEN: 'Fortgeschrieben',
      ABLESUNG_VERALTET: 'Ablesung veraltet',
      DAUERNULL: 'Dauerhafte Nullwerte'
    };

    return labels[status] || status || '';
  },

  getConsumptionStatusColor(status) {
    if (status === 'OK') return '#15803d';
    if (status === 'UEBERLAUF' || status === 'EINZELWERT' || status === 'FORTGESCHRIEBEN' || status === 'KANONISCH_ZUGEORDNET') return '#0369a1';
    if (status === 'KEINE_WERTE' || status === 'KEINE_ABLESUNG' || status === 'ABLESUNG_VERALTET' || status === 'NUR_EIN_WERT') return '#64748b';
    return '#b45309';
  },

  toDashboardNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  },

  isTruthyValue(value) {
    return value === true || String(value).toLowerCase() === 'true';
  },

  getConsumptionDisplayUnit(row) {
    if (row && row.einheit) return row.einheit;

    const medium = String(row && row.medium ? row.medium : '').toLowerCase();

    if (medium.indexOf('kwh') !== -1) return 'kWh';
    if (medium.indexOf('m3') !== -1) return 'm3';
    if (medium.indexOf('_cm') !== -1) return 'cm';
    if (medium.endsWith('_l') || medium.indexOf('liter') !== -1) return 'l';

    return '';
  },

  getConsumptionMediumLabel(medium) {
    const normalized = String(medium || '').toLowerCase();
    if (normalized.indexOf('strom_') === 0) return 'Strom';

    const labels = {
      kaltwasser_m3: 'Kaltwasser',
      warmwasser_m3: 'Warmwasser',
      oel_stand_cm: 'Ölstand',
      oel_stand_l: 'Öl getankt'
    };

    return labels[normalized] || medium || 'Ohne Medium';
  },

  getConsumptionMediumFamily(medium) {
    const normalized = String(medium || '').toLowerCase();
    if (normalized.indexOf('strom_') === 0) return 'STROM';
    if (normalized.indexOf('kaltwasser') !== -1) return 'KALTWASSER';
    if (normalized.indexOf('warmwasser') !== -1) return 'WARMWASSER';
    if (normalized.indexOf('oel') !== -1) return 'OEL';
    return normalized || 'OHNE_MEDIUM';
  },

  getConsumptionMediumSortOrder(medium) {
    const order = {
      STROM: 10,
      KALTWASSER: 20,
      WARMWASSER: 30,
      OEL: 40
    };

    return order[this.getConsumptionMediumFamily(medium)] || 90;
  },

  getConsumptionGroupLabel(group) {
    const labels = {
      WOHNUNG: 'Wohnungen',
      GEWERBE: 'Gewerbe',
      ALLGEMEIN: 'Allgemein',
      HAUPTZAEHLER: 'Hauptzähler',
      BERECHNET: 'Berechnete Werte'
    };

    return labels[String(group || '').toUpperCase()] || group || '';
  },

  getConsumptionSubgroupLabel(subgroup) {
    const labels = {
      FLUR: 'Flur',
      HEIZUNG: 'Heizung',
      PRIVAT_HT: 'Privat HT',
      PRIVAT_NT: 'Privat NT',
      WW_ZULAUF: 'WW-Zulauf',
      HAUPTZAEHLER: 'Hauptzähler'
    };

    return labels[String(subgroup || '').toUpperCase()] || subgroup || '';
  },

  getConsumptionUnitSortNumber(row) {
    const unitId = String(row && row.einheit_id ? row.einheit_id : '');
    const match = unitId.match(/_GE_(\d+)/i) || unitId.match(/_WE_(\d+)/i);
    return match ? Number(match[1]) : 999;
  },

  isConsumptionCommercialUnit(row) {
    const unitId = String(row && row.einheit_id ? row.einheit_id : '');
    return /_GE_\d+/i.test(unitId);
  },

  getConsumptionSummarySection(row) {
    const group = String(row && row.verbrauchsgruppe ? row.verbrauchsgruppe : '').toUpperCase();

    if (group === 'GEWERBE' || this.isConsumptionCommercialUnit(row)) {
      const unitNumber = this.getConsumptionUnitSortNumber(row);
      return {
        key: `GEWERBE|${row.einheit_id || row.einheit_name || unitNumber}`,
        order: 20 + unitNumber / 100,
        label: row.einheit_name || `Gewerbe ${String(unitNumber).padStart(2, '0')}`
      };
    }

    if (group === 'WOHNUNG') {
      return { key: 'WOHNUNGEN', order: 40, label: 'Wohnungen' };
    }

    return { key: 'ALLGEMEIN', order: 10, label: 'Allgemein' };
  },

  getConsumptionSummaryQualifier(row) {
    const group = String(row && row.verbrauchsgruppe ? row.verbrauchsgruppe : '').toUpperCase();
    const subgroup = String(row && row.untergruppe ? row.untergruppe : '').toUpperCase();
    const meterId = String(row && row.zaehler_id ? row.zaehler_id : '');

    if (this.getConsumptionMediumFamily(row && row.medium) === 'OEL') {
      return '';
    }

    if (group === 'WOHNUNG') {
      return 'Wohnungen';
    }

    if (group === 'GEWERBE' || this.isConsumptionCommercialUnit(row)) {
      const unitLabel = row.einheit_name || this.getConsumptionGroupLabel('GEWERBE');
      const subgroupLabel = this.getConsumptionSubgroupLabel(subgroup);
      if (meterId === 'Z_STROM_KWH_BUERO') return `${unitLabel} · Büro`;
      if (meterId === 'Z_STROM_KWH_KODI_HT') return 'Kodi HT';
      if (meterId === 'Z_STROM_KWH_KODI_NT') return 'Kodi NT';
      return subgroupLabel ? `${unitLabel} · ${subgroupLabel}` : unitLabel;
    }

    if (subgroup) {
      return this.getConsumptionSubgroupLabel(subgroup);
    }

    if (group === 'HAUPTZAEHLER') {
      return 'Hauptzähler';
    }

    return this.getConsumptionGroupLabel(group);
  },

  getConsumptionSummaryLabel(row) {
    const medium = this.getConsumptionMediumLabel(row && row.medium);
    const qualifier = this.getConsumptionSummaryQualifier(row);

    if (qualifier) return `${medium} · ${qualifier}`;

    return medium;
  },

  getConsumptionRowUnitLabel(row) {
    const unitId = String(row && row.einheit_id ? row.einheit_id : '');
    if (unitId.indexOf('_Allgemein') !== -1) return 'Haus';
    return (row && (row.einheit_name || row.einheit_id)) || '';
  },

  getConsumptionTableGroupLabel(row) {
    return this.getConsumptionRowUnitLabel(row) || 'Ohne Einheit';
  },

  getConsumptionTableCellStyle(extra = '') {
    return `padding:10px; border-bottom:1px solid #e2e8f0; vertical-align:top; background:white; ${extra}`;
  },

  getConsumptionAuditByMeter() {
    const result = {};
    const auditRows = Array.isArray(dataService.state.view_verbrauch_audit)
      ? dataService.state.view_verbrauch_audit
      : [];

    auditRows.forEach(row => {
      const key = [row.objekt_id, row.einheit_id, row.zaehler_id].map(value => String(value || '').trim()).join('||');
      result[key] = row;
    });

    return result;
  },

  getConsumptionAuditForRow(row, auditByMeter) {
    const key = [row.objekt_id, row.einheit_id, row.zaehler_id].map(value => String(value || '').trim()).join('||');
    return auditByMeter[key] || null;
  },

  buildConsumptionPreviousYearMap(rows) {
    const result = {};

    rows.forEach(row => {
      const year = Number(row.jahr);
      if (!Number.isFinite(year)) return;

      const key = [year, row.objekt_id, row.einheit_id, row.zaehler_id]
        .map(value => String(value || '').trim())
        .join('||');
      result[key] = row;
    });

    return result;
  },

  getConsumptionPreviousYearRow(row, previousYearMap) {
    const year = Number(row && row.jahr);
    if (!Number.isFinite(year)) return null;

    const key = [year - 1, row.objekt_id, row.einheit_id, row.zaehler_id]
      .map(value => String(value || '').trim())
      .join('||');

    return previousYearMap[key] || null;
  },

  getConsumptionMeterYearKey(row, yearOverride) {
    const year = yearOverride !== undefined ? yearOverride : row && row.jahr;
    return [
      year,
      row && row.objekt_id,
      row && row.einheit_id,
      row && row.zaehler_id
    ].map(value => String(value || '').trim()).join('||');
  },

  buildConsumptionMonthRowsByMeterYear(rows) {
    const result = {};

    rows.forEach(row => {
      const key = this.getConsumptionMeterYearKey(row);
      if (!result[key]) result[key] = [];
      result[key].push(row);
    });

    Object.keys(result).forEach(key => {
      result[key].sort((a, b) => {
        const aRange = this.getConsumptionMonthRowDateRange(a);
        const bRange = this.getConsumptionMonthRowDateRange(b);
        return aRange.start - bRange.start;
      });
    });

    return result;
  },

  getConsumptionMonthRowsForRow(row, monthRowsByMeterYear) {
    return monthRowsByMeterYear[this.getConsumptionMeterYearKey(row)] || [];
  },

  parseConsumptionMonth(value) {
    if (typeof consumptionChartService !== 'undefined' &&
      typeof consumptionChartService.consumptionMonth === 'function') {
      return consumptionChartService.consumptionMonth({ monat: value });
    }

    const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})$/);
    if (!match) return null;

    return {
      year: Number(match[1]),
      month: Number(match[2])
    };
  },

  getMonthEndDate(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  },

  getConsumptionMonthRowDateRange(row) {
    const startTimestamp = this.parseGermanDate(row && row.start_datum);
    const endTimestamp = this.parseGermanDate(row && row.end_datum);

    if (startTimestamp && endTimestamp) {
      return {
        start: new Date(startTimestamp),
        end: new Date(endTimestamp)
      };
    }

    const month = this.parseConsumptionMonth(row && row.monat);

    if (month) {
      return {
        start: new Date(month.year, month.month - 1, 1),
        end: this.getMonthEndDate(month.year, month.month - 1)
      };
    }

    const year = Number(row && row.jahr);

    if (Number.isFinite(year)) {
      return {
        start: new Date(year, 0, 1),
        end: this.getMonthEndDate(year, 11)
      };
    }

    return {
      start: new Date(0),
      end: new Date(0)
    };
  },

  formatGermanDateOnly(value) {
    const timestamp = value instanceof Date
      ? value.getTime()
      : this.parseGermanDate(value);

    if (!timestamp) return '';

    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}.${month}.${year}`;
  },

  getConsumptionPeriodDisplay(row, monthRows) {
    const months = Number(row && row.anzahl_monate_mit_verbrauch);
    const monthCount = Number.isFinite(months) ? months : 0;

    if (!monthRows || monthRows.length === 0) {
      return {
        monthsText: `${this.formatDashboardNumber(monthCount)} Monate mit Verbrauch`,
        rangeText: monthCount > 0 ? 'Quellzeitraum nur aus Jahresview bekannt' : 'Kein Verbrauchszeitraum',
        hintText: ''
      };
    }

    const ranges = monthRows.map(monthRow => this.getConsumptionMonthRowDateRange(monthRow));
    const start = new Date(Math.min(...ranges.map(range => range.start.getTime())));
    const end = new Date(Math.max(...ranges.map(range => range.end.getTime())));
    const distinctMonths = new Set(monthRows.map(monthRow => String(monthRow.monat || ''))).size || monthRows.length;
    const monthsText = distinctMonths !== monthCount && monthCount > 0
      ? `${this.formatDashboardNumber(distinctMonths)} Monatssegmente · ${this.formatDashboardNumber(monthCount)} mit Verbrauch`
      : `${this.formatDashboardNumber(monthCount || distinctMonths)} Monate mit Verbrauch`;

    return {
      monthsText,
      rangeText: `Quellintervalle: ${this.formatGermanDateOnly(start)} - ${this.formatGermanDateOnly(end)}`,
      hintText: distinctMonths !== monthCount && monthCount > 0
        ? 'Nicht jedes Monatssegment enthält berechenbaren Verbrauch.'
        : ''
    };
  },

  getActiveTenantStartDate(row) {
    const viewRows = Array.isArray(dataService.state.view_aktive_mieter)
      ? dataService.state.view_aktive_mieter
      : [];
    const tenantRow = viewRows.find(viewRow => String(viewRow.einheit_id) === String(row && row.einheit_id));
    const timestamp = this.parseGermanDate(tenantRow && tenantRow.start_datum);

    return timestamp ? new Date(timestamp) : null;
  },

  getConsumptionRunningUsage(row, monthRows, selectedYear) {
    const year = Number(selectedYear || row && row.jahr);
    if (!Number.isFinite(year) || !monthRows || monthRows.length === 0) {
      return null;
    }

    const today = new Date();
    const isCurrentYear = year === today.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = isCurrentYear ? today : this.getMonthEndDate(year, 11);
    const tenantStart = this.getActiveTenantStartDate(row);
    const start = tenantStart && tenantStart.getFullYear() === year && tenantStart > yearStart
      ? tenantStart
      : yearStart;

    let value = 0;
    let usedRows = 0;

    monthRows.forEach(monthRow => {
      const monthValue = this.toDashboardNumber(monthRow.verbrauch_monat);
      if (monthValue === null) return;

      const range = this.getConsumptionMonthRowDateRange(monthRow);
      const overlapStart = new Date(Math.max(range.start.getTime(), start.getTime()));
      const overlapEnd = new Date(Math.min(range.end.getTime(), yearEnd.getTime()));

      if (overlapEnd < overlapStart) return;

      const rangeDays = Math.max(1, Math.ceil((range.end - range.start) / 86400000) + 1);
      const overlapDays = Math.max(1, Math.ceil((overlapEnd - overlapStart) / 86400000) + 1);
      const factor = Math.min(1, overlapDays / rangeDays);

      value += monthValue * factor;
      usedRows += 1;
    });

    if (usedRows === 0) return null;

    const startsAfterYearStart = start > yearStart;

    return {
      value,
      start,
      end: yearEnd,
      isPartial: startsAfterYearStart,
      note: startsAfterYearStart
        ? `unterjährig · ab Einzug ${this.formatGermanDateOnly(start)}`
        : (isCurrentYear ? 'laufendes Jahr bis heute' : 'volles Kalenderjahr'),
      rangeText: `${this.formatGermanDateOnly(start)} - ${this.formatGermanDateOnly(yearEnd)}`
    };
  },

  getConsumptionMeterKey(row) {
    return [
      row && row.objekt_id,
      row && row.einheit_id,
      row && row.zaehler_id
    ].map(value => String(value || '').trim()).join('||');
  },

  buildConsumptionFixedDisplayRows(allRows, selectedRows, objektId, year, includeCalculated) {
    const selectedByMeter = {};
    selectedRows.forEach(row => {
      selectedByMeter[this.getConsumptionMeterKey(row)] = row;
    });

    const meterTemplates = {};
    const masterMeters = Array.isArray(dataService.state.zaehler)
      ? dataService.state.zaehler
      : [];
    [...allRows, ...masterMeters]
      .filter(row => String(row.objekt_id) === String(objektId))
      .filter(row => includeCalculated || !this.isConsumptionCalculatedRow(row))
      .forEach(row => {
        const key = this.getConsumptionMeterKey(row);
        const currentTemplate = meterTemplates[key];

        if (!currentTemplate || Number(row.jahr || 0) > Number(currentTemplate.jahr || 0)) {
          meterTemplates[key] = row;
        }
      });

    return Object.keys(meterTemplates).map(key => {
      if (selectedByMeter[key]) {
        return selectedByMeter[key];
      }

      const template = meterTemplates[key];
      return {
        ...template,
        jahr: year,
        verbrauch_jahr: '',
        verbrauch_monat_durchschnitt: '',
        anzahl_monate_mit_verbrauch: 0,
        anzahl_warnungen: 0,
        plausibilitaet_status: 'KEINE_WERTE',
        in_summe_beruecksichtigen: false,
        is_missing_for_year: true
      };
    });
  },

  buildFallbackBlackInnBalanceRows(selectedRows) {
    const sourceFactors = {
      'Ra-HS-29||Ra-HS-29_GE_02||Z_STROM_KWH_PRIVAT_HT': 1,
      'Ra-HS-29||Ra-HS-29_GE_02||Z_STROM_KWH_PRIVAT_NT': 1,
      'Ra-HS-29||Ra-HS-29_Allgemein_Flur||Z_STROM_KWH_FLUR': -1,
      'Ra-HS-29||Ra-HS-29_Allgemein_Heizung||Z_STROM_KWH_HEIZUNG': -1,
      'Ra-HS-29||Ra-HS-29_GE_02||Z_STROM_KWH_BUERO': -1,
      'Ra-HS-29||Ra-HS-29_WE_03||Z_STROM_KWH_WOHNUNG_3': -1,
      'Ra-HS-29||Ra-HS-29_WE_04||Z_STROM_KWH_WOHNUNG_4': -1
    };
    const rowByKey = {};
    selectedRows.forEach(row => {
      rowByKey[this.getConsumptionMeterKey(row)] = row;
    });

    const sourceKeys = Object.keys(sourceFactors);
    const used = [];
    const missing = [];
    let value = 0;
    let months = 0;
    let warnings = 0;
    let year = '';

    sourceKeys.forEach(key => {
      const row = rowByKey[key];
      if (!row || row.in_summe_beruecksichtigen === false || String(row.in_summe_beruecksichtigen).toLowerCase() === 'false') {
        missing.push(key.split('||')[2]);
        return;
      }

      const rowValue = this.toDashboardNumber(row.verbrauch_jahr);
      if (rowValue === null) {
        missing.push(row.zaehler_id);
        return;
      }

      value += rowValue * sourceFactors[key];
      months = Math.max(months, Number(row.anzahl_monate_mit_verbrauch || 0));
      warnings += Number(row.anzahl_warnungen || 0);
      year = row.jahr;
      used.push(row.zaehler_id);
    });

    if (used.length === 0) return [];

    return [{
      jahr: year,
      objekt_id: 'Ra-HS-29',
      bilanz_id: 'BILANZ_STROM_BLACK_INN',
      label: 'Strom · Black Inn',
      medium: 'strom_ht_nt_kwh',
      einheit: 'kWh',
      wert: value,
      wert_monat_durchschnitt: months > 0 ? value / months : '',
      anzahl_monate_mit_verbrauch: months,
      source_zaehler_ids: used.join(', '),
      missing_source_zaehler_ids: missing.join(', '),
      formel_text: 'Privat HT + Privat NT - Flur - Heizung - Black Inn Büro - Wohnung 3 - Wohnung 4',
      plausibilitaet_status: missing.length > 0 ? 'QUELLWERTE_FEHLEN' : (warnings > 0 ? 'WARNUNGEN_IN_QUELLWERTEN' : 'OK')
    }];
  },

  buildConsumptionSummaryFromViews(rows) {
    const summaryMap = {};

    rows.forEach(row => {
      if (row.in_summe_beruecksichtigen === false || String(row.in_summe_beruecksichtigen).toLowerCase() === 'false') {
        return;
      }

      const value = this.toDashboardNumber(row.verbrauch_jahr);
      if (value === null) return;

      const einheit = this.getConsumptionDisplayUnit(row);
      const section = this.getConsumptionSummarySection(row);
      const mediumFamily = this.getConsumptionMediumFamily(row.medium);
      const qualifier = this.getConsumptionSummaryQualifier(row);
      const label = this.getConsumptionSummaryLabel(row);
      const key = [section.key, mediumFamily, qualifier, einheit].join('||');

      if (!summaryMap[key]) {
        summaryMap[key] = {
          medium: row.medium || 'Ohne Medium',
          label,
          einheit,
          sectionKey: section.key,
          sectionOrder: section.order,
          mediumOrder: this.getConsumptionMediumSortOrder(row.medium),
          verbrauch: 0,
          zaehler_count: 0,
          warnungen: 0
        };
      }

      summaryMap[key].verbrauch += value;
      summaryMap[key].zaehler_count++;
      summaryMap[key].warnungen += Number(row.anzahl_warnungen || 0);
    });

    return Object.values(summaryMap)
      .sort((a, b) => (
        a.sectionOrder - b.sectionOrder ||
        a.mediumOrder - b.mediumOrder ||
        String(a.label).localeCompare(String(b.label), 'de')
      ));
  },

  buildConsumptionMissingSummaryFromRows(displayRows, summary, balanceRows) {
    const existingLabels = new Set((summary || []).map(item => [item.label, item.einheit].join('||')));
    const result = [];

    (displayRows || []).forEach(row => {
      if (!row.is_missing_for_year || this.isConsumptionSummaryCoveredByBalance(row, balanceRows)) {
        return;
      }

      const label = this.getConsumptionSummaryLabel(row);
      const einheit = this.getConsumptionDisplayUnit(row);
      const key = [label, einheit].join('||');

      if (existingLabels.has(key)) {
        return;
      }

      existingLabels.add(key);
      result.push({
        medium: row.medium || 'Ohne Medium',
        label,
        einheit,
        sectionKey: this.getConsumptionSummarySection(row).key,
        sectionOrder: this.getConsumptionSummarySection(row).order,
        mediumOrder: this.getConsumptionMediumSortOrder(row.medium),
        verbrauch: null,
        zaehler_count: 1,
        warnungen: 0,
        missing: true
      });
    });

    return result.sort((a, b) => (
      a.sectionOrder - b.sectionOrder ||
      a.mediumOrder - b.mediumOrder ||
      String(a.label).localeCompare(String(b.label), 'de')
    ));
  },

  getConsumptionCardBlockOrder(item) {
    const mediumFamily = this.getConsumptionMediumFamily(item && item.medium);
    const sectionKey = String(item && item.sectionKey ? item.sectionKey : '').toUpperCase();
    const label = String(item && item.label ? item.label : '').toUpperCase();

    if (mediumFamily === 'OEL') return 40;
    if (sectionKey.indexOf('WOHNUNG') !== -1 || label.indexOf('WOHNUNG') !== -1) return 30;
    if (
      sectionKey.indexOf('GEWERBE') !== -1 ||
      label.indexOf('BLACK INN') !== -1 ||
      label.indexOf('KODI') !== -1 ||
      label.indexOf('KOCHDIPPE') !== -1
    ) {
      return 20;
    }

    return 10;
  },

  getConsumptionRowStatus(row, audit) {
    if (row && row.is_missing_for_year) return 'KEINE_WERTE';

    if (row && row.plausibilitaet_status && row.plausibilitaet_status !== 'OK') {
      return row.plausibilitaet_status;
    }

    return audit && audit.status ? audit.status : 'OK';
  },

  getConsumptionRowHint(row, audit) {
    if (row && row.plausibilitaet_status && row.plausibilitaet_status !== 'OK') {
      return row.plausibilitaet_status;
    }

    return audit && audit.hinweis ? audit.hinweis : '';
  },

  isConsumptionWarningStatus(status) {
    return ![
      'OK',
      'KANONISCH_ZUGEORDNET',
      ...[
        'KEINE_WERTE',
        'KEINE_ABLESUNG',
        'NUR_EIN_WERT',
        'UNGELOESTE_MESSWERTE',
        'MONATSZEILEN_ABWEICHUNG',
        'TEILWEISE_UNBERECHENBAR',
        'NICHT_BERECHENBAR',
        'UNBERECHENBAR'
      ]
    ].includes(String(status || ''));
  },

  isConsumptionMissingStatus(status) {
    return [
      'KEINE_WERTE',
      'KEINE_ABLESUNG',
      'ABLESUNG_VERALTET',
      'NUR_EIN_WERT',
      'UNGELOESTE_MESSWERTE',
      'MONATSZEILEN_ABWEICHUNG',
      'TEILWEISE_UNBERECHENBAR',
      'NICHT_BERECHENBAR',
      'UNBERECHENBAR'
    ].includes(String(status || ''));
  },

  isConsumptionCalculatedRow(row) {
    return (
      String(row && row.verbrauchsgruppe ? row.verbrauchsgruppe : '').toUpperCase() === 'BERECHNET' ||
      this.isTruthyValue(row && row.berechnet)
    );
  },

  filterConsumptionRowsByStatus(rows, filterValue) {
    if (filterValue === 'missing') {
      return rows.filter(row => this.isConsumptionMissingStatus(row.status));
    }

    if (filterValue === 'warnings') {
      return rows.filter(row => this.isConsumptionWarningStatus(row.status));
    }

    return rows;
  },

  buildConsumptionOverviewMetrics(rows, balanceRows, dataQualityRows) {
    const warningKeys = new Set();
    (rows || []).forEach(row => {
      if (this.isConsumptionWarningStatus(row.status)) {
        warningKeys.add(this.getConsumptionMeterKey(row));
      }
    });
    (dataQualityRows || []).forEach(row => {
      if (this.isConsumptionWarningStatus(row.status)) {
        warningKeys.add([row.objekt_id, row.einheit_id, row.zaehler_id].map(value => String(value || '').trim()).join('||'));
      }
    });

    return {
      consumptionRows: rows.length,
      missingRows: rows.filter(row => this.isConsumptionMissingStatus(row.status)).length,
      warningRows: warningKeys.size,
      calculatedRows: rows.filter(row => this.isConsumptionCalculatedRow(row)).length + (balanceRows || []).length
    };
  },

  getConsumptionReadingRows(row, readings) {
    const key = this.getConsumptionMeterKey(row);
    return (readings || [])
      .filter(reading => this.getConsumptionMeterKey(reading) === key)
      .filter(reading => this.toDashboardNumber(reading.wert) !== null)
      .sort((left, right) => this.parseGermanDate(left.zeitstempel) - this.parseGermanDate(right.zeitstempel));
  },

  getConsumptionDataQualityRow(rawRow, displayRow, status, hint) {
    return {
      ...rawRow,
      label: rawRow.bezeichnung || displayRow.bezeichnung || rawRow.zaehler_id || displayRow.zaehler_id || 'Zähler',
      unitLabel: this.getConsumptionRowUnitLabel(displayRow) || rawRow.einheit_id || displayRow.einheit_id || '',
      status,
      statusLabel: this.getConsumptionStatusLabel(status),
      hint: hint || rawRow.hinweis || '',
      readings_count: rawRow.readings_count ?? displayRow.readings_count,
      intervalle_count: rawRow.intervalle_count ?? displayRow.intervalle_count,
      monatszeilen: rawRow.monatszeilen ?? displayRow.monatszeilen
    };
  },

  buildConsumptionDataQualityRows(auditRows, rows, {
    readings = [],
    selectedYear = '',
    now = new Date()
  } = {}) {
    const rowByKey = {};
    (rows || []).forEach(row => {
      rowByKey[this.getConsumptionMeterKey(row)] = row;
    });

    const result = [];
    const seen = new Set();
    const add = (rawRow, displayRow, status, hint) => {
      if (!status || status === 'OK' || status === 'KANONISCH_ZUGEORDNET') return;
      const key = `${this.getConsumptionMeterKey(displayRow || rawRow)}||${status}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(this.getConsumptionDataQualityRow(rawRow, displayRow || rawRow, status, hint));
    };

    (auditRows || []).forEach(row => {
      const displayRow = rowByKey[this.getConsumptionMeterKey(row)] || row;
      add(row, displayRow, row.status, row.hinweis);
    });

    const hasRawReadings = Array.isArray(readings) && readings.some(reading => this.toDashboardNumber(reading.wert) !== null);
    const selectedYearNumber = Number(selectedYear);
    const currentYear = now instanceof Date ? now.getFullYear() : new Date(now).getFullYear();
    const staleCutoff = (now instanceof Date ? now : new Date(now)).getTime()
      - this.CONSUMPTION_STALE_READING_DAYS * 86400000;

    (rows || []).forEach(row => {
      const rowReadings = this.getConsumptionReadingRows(row, readings);
      if (!hasRawReadings) return;

      if (rowReadings.length === 0) {
        add(row, row, 'KEINE_ABLESUNG', 'Für diesen Zähler ist keine bestätigte Ablesung vorhanden.');
        return;
      }

      const latest = rowReadings[rowReadings.length - 1];
      const latestTimestamp = this.parseGermanDate(latest.zeitstempel);
      if (selectedYearNumber === currentYear && latestTimestamp > 0 && latestTimestamp < staleCutoff) {
        add(row, row, 'ABLESUNG_VERALTET', `Die letzte bestätigte Ablesung ist älter als ${this.CONSUMPTION_STALE_READING_DAYS} Tage (${this.formatReadingTimestamp(latest.zeitstempel)}).`);
      }

      const numericValues = rowReadings.map(reading => this.toDashboardNumber(reading.wert));
      const isVacant = String(row.mieter_name || '').trim().toLowerCase() === 'leerstand';
      if (!isVacant && !this.isConsumptionCalculatedRow(row) && numericValues.length >= 3 && numericValues.every(value => value === 0)) {
        add(row, row, 'DAUERNULL', 'Mehrere bestätigte Ablesungen sind unverändert 0. Bitte Leerstand, Defekt oder fehlende Erfassung unterscheiden.');
      }
    });

    return result;
  },

  async ensureConsumptionViewData() {
    const hasYearRows = Array.isArray(dataService.state.view_verbrauch_jahr) &&
      dataService.state.view_verbrauch_jahr.length > 0;

    if (hasYearRows) {
      this.updateConsumptionRefreshStatus({ _view_verbrauch_jahr: dataService.state.view_verbrauch_jahr });
      return;
    }

    if (typeof cloudService === 'undefined' || !cloudService.loadConsumptionData) {
      throw new Error('Die Verbrauchsdaten konnten nicht geladen werden.');
    }

    const data = await cloudService.loadConsumptionData();

    if (dataService.setConsumptionData) {
      dataService.setConsumptionData(data);
    } else {
      dataService.state.view_verbrauch_monat = data["_view_verbrauch_monat"] || [];
      dataService.state.view_verbrauch_jahr = data["_view_verbrauch_jahr"] || [];
      dataService.state.view_verbrauch_audit = data["_view_verbrauch_audit"] || [];
      dataService.state.view_verbrauch_bilanz_jahr = data["_view_verbrauch_bilanz_jahr"] || [];
    }

    this.updateConsumptionRefreshStatus(data);
  },

  formatConsumptionRefreshTimestamp(value) {
    if (!value) return '';
    const text = String(value).trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (match) {
      return `${match[3]}.${match[2]}.${match[1]} ${match[4] || '00'}:${match[5] || '00'}`;
    }
    return text;
  },

  updateConsumptionRefreshStatus(data) {
    const status = document.getElementById('consumption-view-refresh-status');
    if (!status) return;
    const rows = data && data._view_verbrauch_jahr;
    const firstRow = Array.isArray(rows) ? rows.find(row => row && row.berechnet_am) : null;
    const timestamp = firstRow && this.formatConsumptionRefreshTimestamp(firstRow.berechnet_am);
    if (timestamp) status.textContent = `Verbrauchsdaten zuletzt aktualisiert: ${timestamp}`;
  },

  async refreshConsumptionViews() {
    const button = document.getElementById('refresh-consumption-views');
    const status = document.getElementById('consumption-view-refresh-status');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Verbrauchsdaten werden aktualisiert...';

    try {
      if (typeof cloudService === 'undefined' || !cloudService.refreshConsumptionViews) {
        throw new Error('Die Aktualisierung der Verbrauchsdaten ist noch nicht verfügbar.');
      }
      const refreshResult = await cloudService.refreshConsumptionViews();
      const data = await cloudService.loadConsumptionData();
      if (dataService.setConsumptionData) dataService.setConsumptionData(data);
      this.updateConsumptionRefreshStatus(data);
      const refreshedAt = refreshResult && refreshResult.berechnetAm
        ? this.formatConsumptionRefreshTimestamp(refreshResult.berechnetAm)
        : '';
      await this.renderConsumptionDashboard();
      if (status && refreshedAt) status.textContent = `Verbrauchsdaten zuletzt aktualisiert: ${refreshedAt}`;
    } catch (error) {
      if (status) status.textContent = `Aktualisierung fehlgeschlagen: ${error.message || error}`;
    } finally {
      if (button) button.disabled = false;
    }
  },

  buildConsumptionBalanceSummary(rows) {
    return (rows || [])
      .map(row => ({
        label: row.label || row.bilanz_id || 'Bilanz',
        medium: row.medium || '',
        sectionKey: 'GEWERBE',
        sectionOrder: 20,
        mediumOrder: this.getConsumptionMediumSortOrder(row.medium),
        einheit: row.einheit || '',
        verbrauch: this.toDashboardNumber(row.wert) || 0,
        zaehler_count: row.source_zaehler_ids
          ? String(row.source_zaehler_ids).split(',').filter(Boolean).length
          : 0,
        warnungen: String(row.plausibilitaet_status || '') === 'OK' ? 0 : 1,
        status: row.plausibilitaet_status || 'OK',
        formel: row.formel_text || '',
        source_zaehler_ids: row.source_zaehler_ids || '',
        missing_source_zaehler_ids: row.missing_source_zaehler_ids || '',
        isBalance: true
      }))
      .sort((a, b) => (
        this.getConsumptionCardBlockOrder(a) - this.getConsumptionCardBlockOrder(b) ||
        a.mediumOrder - b.mediumOrder ||
        String(a.label).localeCompare(String(b.label), 'de')
      ));
  },

  isConsumptionSummaryCoveredByBalance(row, balanceRows) {
    const hasBlackInnBalance = (balanceRows || [])
      .some(balanceRow => String(balanceRow.bilanz_id) === 'BILANZ_STROM_BLACK_INN');

    if (!hasBlackInnBalance) return false;

    const key = [
      row && row.objekt_id,
      row && row.einheit_id,
      row && row.zaehler_id
    ].map(value => String(value || '').trim()).join('||');

    return [
      'Ra-HS-29||Ra-HS-29_GE_02||Z_STROM_KWH_PRIVAT_HT',
      'Ra-HS-29||Ra-HS-29_GE_02||Z_STROM_KWH_PRIVAT_NT',
      'Ra-HS-29||Ra-HS-29_GE_02||Z_STROM_KWH_BUERO'
    ].includes(key);
  },

  setNavigationState(activeView) {
    const contractsSection = document.getElementById('contracts-section');
    const contractsButton = document.getElementById('nav-contracts');
    if (contractsSection && activeView !== 'contracts') contractsSection.style.display = 'none';
    if (contractsButton) contractsButton.className = activeView === 'contracts' ? 'tab-btn-active' : 'tab-btn-inactive';
    const paymentsSection = document.getElementById('payments-section');
    const paymentsButton = document.getElementById('nav-payments');
    if (paymentsSection && activeView !== 'payments') paymentsSection.style.display = 'none';
    if (paymentsButton) paymentsButton.className = activeView === 'payments' ? 'tab-btn-active' : 'tab-btn-inactive';
    const meterButton = document.getElementById('nav-meter-entry');
    const dashboardButton = document.getElementById('nav-consumption-dashboard');

    if (meterButton) {
      meterButton.className = activeView === 'meter' ? 'tab-btn-active' : 'tab-btn-inactive';
    }

    if (dashboardButton) {
      dashboardButton.className = activeView === 'consumption' ? 'tab-btn-active' : 'tab-btn-inactive';
    }
  },

  showMeterEntryView() {
    const dashboardSection = document.getElementById('consumption-dashboard-section');
    const selectorSection = document.getElementById('object-selector-section');
    const unitSection = document.getElementById('unit-list-section');
    const paymentsSection = document.getElementById('payments-section');

    if (dashboardSection) dashboardSection.style.display = 'none';
    if (paymentsSection) paymentsSection.style.display = 'none';
    if (selectorSection) selectorSection.style.display = 'block';
    if (unitSection) unitSection.style.display = 'none';

    this.setNavigationState('meter');
  },

  showConsumptionDashboard() {
    const dashboardSection = document.getElementById('consumption-dashboard-section');
    const selectorSection = document.getElementById('object-selector-section');
    const unitSection = document.getElementById('unit-list-section');
    const paymentsSection = document.getElementById('payments-section');

    if (selectorSection) selectorSection.style.display = 'none';
    if (unitSection) unitSection.style.display = 'none';
    if (paymentsSection) paymentsSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';

    this.setNavigationState('consumption');
    return this.renderConsumptionDashboard();
  },

  renderConsumptionDashboardControls() {
    const objectSelect = document.getElementById('consumption-object-select');
    const yearSelect = document.getElementById('consumption-year-select');

    if (!objectSelect || !yearSelect) return;

    const currentObject = objectSelect.value;
    const currentYear = yearSelect.value;
    const objectIds = dataService.getUniqueObjects();
    const years = this.getAvailableConsumptionYears();

    objectSelect.innerHTML = objectIds
      .map(objId => `<option value="${this.escapeHtml(objId)}">${this.escapeHtml(this.getObjectDisplayName(objId))}</option>`)
      .join('');
    yearSelect.innerHTML = years
      .map(year => `<option value="${this.escapeHtml(year)}">${this.escapeHtml(year)}</option>`)
      .join('');

    if (currentObject && objectIds.includes(currentObject)) {
      objectSelect.value = currentObject;
    }

    if (currentYear && years.includes(currentYear)) {
      yearSelect.value = currentYear;
    }
  },

  async renderConsumptionDashboard() {
    const output = document.getElementById('consumption-dashboard-output');
    const objectSelect = document.getElementById('consumption-object-select');
    const yearSelect = document.getElementById('consumption-year-select');
    const includeCalculatedInput = document.getElementById('consumption-include-calculated');
    const statusFilterInput = document.getElementById('consumption-status-filter');

    if (!output || !objectSelect || !yearSelect) return;

    const renderRequestId = (this.consumptionRenderRequestId || 0) + 1;
    this.consumptionRenderRequestId = renderRequestId;
    const userSelectedObject = objectSelect.dataset && objectSelect.dataset.userSelected === 'true';
    const requestedYear = yearSelect.value;

    this.renderConsumptionDashboardControls();
    const objectValueBeforeLoad = objectSelect.value;
    const objectValueAtPreviousRender = this.consumptionObjectValueAtRenderStart;
    const objectChangedBeforeLoad = objectValueAtPreviousRender !== undefined &&
      objectValueBeforeLoad !== objectValueAtPreviousRender;
    this.consumptionObjectValueAtRenderStart = objectValueBeforeLoad;
    output.innerHTML = '<div style="padding:12px; background:white; border:1px solid #e2e8f0; border-radius:8px;">Verbrauchsdaten werden geladen...</div>';

    try {
      await this.ensureConsumptionViewData();
    } catch (error) {
      if (this.consumptionRenderRequestId !== renderRequestId) return;
      output.innerHTML = `<div style="padding:12px; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px;">Die Verbrauchsdaten konnten nicht geladen werden: ${this.escapeHtml(error.message || String(error))}</div>`;
      return;
    }

    if (this.consumptionRenderRequestId !== renderRequestId) return;

    this.renderConsumptionDashboardControls();

    const objectIds = dataService.getUniqueObjects();
    const allRows = Array.isArray(dataService.state.view_verbrauch_jahr)
      ? dataService.state.view_verbrauch_jahr
      : [];
    const monthRowsByMeterYear = this.buildConsumptionMonthRowsByMeterYear(
      Array.isArray(dataService.state.view_verbrauch_monat)
        ? dataService.state.view_verbrauch_monat
        : []
    );
    const year = yearSelect.value || this.getAvailableConsumptionYears()[0] || '';
    const previousYear = Number(year) - 1;
    let objektId = objectSelect.value || objectIds[0] || '';
    const firstObjectWithRows = objectIds.find(objId => allRows.some(row => String(row.objekt_id) === String(objId) && String(row.jahr) === String(year)));
    const objectChangedDuringLoad = objectSelect.value && objectSelect.value !== objectValueBeforeLoad;

    if (!userSelectedObject && !objectChangedBeforeLoad && !objectChangedDuringLoad && firstObjectWithRows) {
      objektId = firstObjectWithRows;
      objectSelect.value = firstObjectWithRows;
    }

    if (!requestedYear && year) {
      yearSelect.value = year;
    }

    const includeCalculated = includeCalculatedInput ? includeCalculatedInput.checked : true;
    const statusFilter = statusFilterInput ? statusFilterInput.value || 'all' : 'all';

    if (!objektId) {
      output.innerHTML = '<div style="padding:12px; background:white; border:1px solid #e2e8f0; border-radius:8px;">Keine Objektdaten geladen.</div>';
      return;
    }

    const auditByMeter = this.getConsumptionAuditByMeter();
    const selectedRows = allRows
      .filter(row => String(row.objekt_id) === String(objektId))
      .filter(row => String(row.jahr) === String(year))
      .filter(row => includeCalculated || String(row.verbrauchsgruppe).toUpperCase() !== 'BERECHNET');
    const selectedBalanceRows = (Array.isArray(dataService.state.view_verbrauch_bilanz_jahr) ? dataService.state.view_verbrauch_bilanz_jahr : [])
      .filter(row => String(row.objekt_id) === String(objektId))
      .filter(row => String(row.jahr) === String(year));
    const previousYearMap = this.buildConsumptionPreviousYearMap(allRows);
    const effectiveBalanceRows = selectedBalanceRows.length > 0
      ? selectedBalanceRows
      : this.buildFallbackBlackInnBalanceRows(selectedRows);
    const balanceSummary = this.buildConsumptionBalanceSummary(effectiveBalanceRows);
    const summaryRows = selectedRows
      .filter(row => !this.isConsumptionSummaryCoveredByBalance(row, effectiveBalanceRows));
    const summary = this.buildConsumptionSummaryFromViews(summaryRows);
    const auditRows = (Array.isArray(dataService.state.view_verbrauch_audit) ? dataService.state.view_verbrauch_audit : [])
      .filter(row => String(row.objekt_id) === String(objektId));
    const canonicalAuditRows = auditRows
      .filter(row => String(row.status) === 'KANONISCH_ZUGEORDNET');
    const displayRows = this.buildConsumptionFixedDisplayRows(allRows, selectedRows, objektId, year, includeCalculated);
    const sortedRows = displayRows
      .slice()
      .sort((a, b) => (
        String(this.getConsumptionRowUnitLabel(a)).localeCompare(String(this.getConsumptionRowUnitLabel(b)), 'de') ||
        this.getConsumptionMediumSortOrder(a.medium) - this.getConsumptionMediumSortOrder(b.medium) ||
        String(a.bezeichnung).localeCompare(String(b.bezeichnung), 'de')
      ));
    const missingSummary = this.buildConsumptionMissingSummaryFromRows(displayRows, summary, effectiveBalanceRows);
    const visibleCards = balanceSummary.concat(summary, missingSummary)
      .sort((a, b) => (
        this.getConsumptionCardBlockOrder(a) - this.getConsumptionCardBlockOrder(b) ||
        a.mediumOrder - b.mediumOrder ||
        String(a.label).localeCompare(String(b.label), 'de')
      ));
    const summaryHtml = visibleCards.length > 0
      ? visibleCards
        .map(item => `
          <div class="consumption-summary-item${item.isBalance ? ' consumption-summary-balance' : ''}">
            <div style="font-size:0.75rem; color:${item.isBalance ? '#1d4ed8' : '#64748b'}; font-weight:800;">${this.escapeHtml(item.label || item.medium || 'Ohne Medium')}</div>
            <div style="font-size:1.15rem; font-weight:900; color:#0f172a;">${item.missing ? 'Keine Werte' : `${this.formatDashboardNumber(item.verbrauch)} ${this.escapeHtml(item.einheit || '')}`}</div>
            <div style="font-size:0.75rem; color:#64748b;">${item.zaehler_count} ${item.isBalance ? 'Quellen' : 'Zähler'}${item.warnungen ? ` · ${this.escapeHtml(item.status || `${item.warnungen} Warnungen`)}` : ''}</div>
            ${item.isBalance ? `
              <span class="consumption-badge">Bilanz</span>
              <details class="consumption-card-details">
                <summary>Formel und Quellen</summary>
                <div>Dieser Wert wurde berechnet und nicht manuell erfasst.</div>
                <div><strong>Formel:</strong> ${this.escapeHtml(item.formel || 'Keine Formel hinterlegt')}</div>
                <div><strong>Quellen:</strong> ${this.escapeHtml(item.source_zaehler_ids || 'Keine Quellen hinterlegt')}</div>
                ${item.missing_source_zaehler_ids ? `<div><strong>Fehlend:</strong> ${this.escapeHtml(item.missing_source_zaehler_ids)}</div>` : ''}
              </details>
            ` : ''}
          </div>
        `)
        .join('')
      : '';
    const decoratedRows = sortedRows.map(row => {
        const audit = this.getConsumptionAuditForRow(row, auditByMeter);
        const status = this.getConsumptionRowStatus(row, audit);
        const hint = this.getConsumptionRowHint(row, audit);

        return {
          ...row,
          audit,
          status,
          hint
        };
      });
    const chartRows = decoratedRows.filter(row => row && row.zaehler_id);
    const hasChartSelection = Boolean(this.consumptionChartSelection);
    const chartKey = this.consumptionChartSelection || '';
    const chartMeter = typeof consumptionChartService !== 'undefined'
      ? chartRows.find(row => consumptionChartService.getMeterKey(row) === chartKey)
      : null;
    const chartService = typeof consumptionChartService !== 'undefined' ? consumptionChartService : null;
    const hasNumericValue = value => {
      if (chartService && typeof chartService.toNumber === 'function') {
        return chartService.toNumber(value) !== null;
      }
      if (value === null || value === undefined || String(value).trim() === '') return false;
      const numeric = Number(String(value).trim().replace(',', '.'));
      return Number.isFinite(numeric);
    };
    const chartRowsWithData = chartService ? chartRows.filter(row => {
      const matchesMeter = candidate => chartService.sameMeter
        ? chartService.sameMeter(row, candidate)
        : chartService.getMeterKey(candidate) === chartService.getMeterKey(row);
      const hasMonthlyData = (dataService.state.view_verbrauch_monat || []).some(monthRow =>
        matchesMeter(monthRow) &&
        (String(monthRow.jahr) === String(year) || String(monthRow.jahr) === String(Number(year) - 1)) &&
        hasNumericValue(monthRow.verbrauch_monat)
      );
      const hasAnnualData = allRows.some(yearRow =>
        matchesMeter(yearRow) &&
        String(yearRow.jahr) === String(year) &&
        hasNumericValue(yearRow.verbrauch_jahr)
      );
      const hasReadings = (dataService.state.zaehlerstaende || []).some(reading =>
        matchesMeter(reading) && hasNumericValue(reading.wert)
      );
      return hasMonthlyData || hasAnnualData || hasReadings;
    }) : [];
    const effectiveChartKey = hasChartSelection && chartMeter
      ? chartKey
      : (typeof consumptionChartService !== 'undefined' && chartRowsWithData.length
        ? consumptionChartService.getMeterKey(chartRowsWithData[0])
        : (typeof consumptionChartService !== 'undefined' && chartRows.length
          ? consumptionChartService.getMeterKey(chartRows[0])
          : '')
      );
    this.consumptionChartSelection = effectiveChartKey;
    let chartHtml = '';
    if (typeof consumptionChartService !== 'undefined') {
      try {
        chartHtml = consumptionChartService.render({
          meters: chartRows,
          selectedKey: effectiveChartKey,
          selectedYear: year,
          monthlyRows: dataService.state.view_verbrauch_monat || [],
          annualRows: allRows,
          readingRows: (dataService.state.zaehlerstaende || []).filter(row => String(row.objekt_id) === String(objektId)),
          haustechnikRows: dataService.state.haustechnik || []
        });
      } catch (error) {
        console.error('Verbrauchsdiagramme konnten nicht dargestellt werden:', error);
        chartHtml = '<section class="consumption-charts" aria-label="Verbrauchsdiagramme"><p class="consumption-chart-empty">Die Diagramme konnten nicht geladen werden. Tabelle und Datenqualität bleiben verfügbar.</p></section>';
      }
    }
    const dataQualityRows = this.buildConsumptionDataQualityRows(auditRows, decoratedRows, {
      readings: Array.isArray(dataService.state.zaehlerstaende) ? dataService.state.zaehlerstaende : [],
      selectedYear: year,
      now: new Date()
    });
    const overviewMetrics = this.buildConsumptionOverviewMetrics(decoratedRows, effectiveBalanceRows, dataQualityRows);
    const overviewCardsHtml = [
      {
        label: 'Verbrauchszeilen',
        value: overviewMetrics.consumptionRows,
        hint: 'Jahreswerte in der Tabelle'
      },
      {
        label: 'Fehlende Werte',
        value: overviewMetrics.missingRows,
        hint: 'Offene oder fehlende Verbräuche',
        filter: 'missing'
      },
      {
        label: 'Warnungen',
        value: overviewMetrics.warningRows,
        hint: 'Prüf- und Audit-Hinweise',
        filter: 'warnings'
      },
      {
        label: 'Berechnete Werte',
        value: overviewMetrics.calculatedRows,
        hint: 'Berechnete Werte und Bilanzen'
      }
    ].map(card => `
      <button
        type="button"
        class="consumption-overview-card"
        ${card.filter ? `onclick="document.getElementById('consumption-status-filter').value='${card.filter}'; uiService.renderConsumptionDashboard();"` : ''}
        ${card.filter ? '' : 'disabled'}
      >
        <span>${this.escapeHtml(card.label)}</span>
        <strong>${this.formatDashboardNumber(card.value)}</strong>
        <small>${this.escapeHtml(card.hint)}</small>
      </button>
    `).join('');
    const dataQualityHtml = dataQualityRows.length > 0
      ? dataQualityRows.map(row => `
        <div class="consumption-quality-row">
          <div>
            <strong>${this.escapeHtml(row.label)}</strong>
            <div style="font-size:0.78rem; color:#64748b;">
              ${this.escapeHtml([row.objekt_id, row.unitLabel].filter(Boolean).join(' · '))}
            </div>
          </div>
          <div>
            <span style="display:inline-block; padding:3px 7px; border-radius:999px; background:#fff7ed; color:${this.getConsumptionStatusColor(row.status)}; font-size:0.75rem; font-weight:800;">
              ${this.escapeHtml(row.statusLabel)}
            </span>
            ${row.hint ? `<div style="font-size:0.75rem; color:#64748b; margin-top:4px;">${this.escapeHtml(row.hint)}</div>` : ''}
          </div>
          <div style="font-size:0.78rem; color:#475569;">
            ${this.formatDashboardNumber(row.readings_count)} Rohwerte · ${this.formatDashboardNumber(row.intervalle_count)} Intervalle · ${this.formatDashboardNumber(row.monatszeilen)} Monatszeilen
          </div>
        </div>
      `).join('')
      : '<div style="color:#64748b;">Keine offenen Datenqualitäts-Hinweise für diese Auswahl.</div>';
    const filteredRows = this.filterConsumptionRowsByStatus(decoratedRows, statusFilter);
    const rowsHtml = filteredRows.length > 0
      ? filteredRows.map((row, index) => {
        const audit = row.audit;
        const unit = this.getConsumptionDisplayUnit(row);
        const unitLabel = this.getConsumptionRowUnitLabel(row);
        const groupLabel = this.getConsumptionTableGroupLabel(row);
        const previousGroupLabel = index > 0
          ? this.getConsumptionTableGroupLabel(filteredRows[index - 1])
          : '';
        const previousYearRow = this.getConsumptionPreviousYearRow(row, previousYearMap);
        const oilReport = this.getOilConsumptionReport(row, year);
        const previousOilReport = previousYearRow ? this.getOilConsumptionReport(row, previousYear) : null;
        const monthRows = this.getConsumptionMonthRowsForRow(row, monthRowsByMeterYear);
        const periodDisplay = this.getConsumptionPeriodDisplay(row, monthRows);
        const runningUsage = this.getConsumptionRunningUsage(row, monthRows, year);
        const status = row.status;
        const hint = row.hint;
        const theme = this.getZaehlerTheme(row);
        const mediumLabel = this.getConsumptionMediumLabel(row.medium);
        const groupHeaderHtml = groupLabel !== previousGroupLabel
          ? `
            <tr>
              <td colspan="7" style="padding:12px 10px 8px; border-top:3px solid #cbd5e1; background:#f8fafc;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                  <strong style="font-size:0.95rem; color:#0f172a;">${this.escapeHtml(groupLabel)}</strong>
                  <span style="font-size:0.72rem; color:#64748b; font-weight:800; text-transform:uppercase; letter-spacing:0.03em;">Verbrauchsblock</span>
                </div>
              </td>
            </tr>`
          : '';
        const firstCellStyle = this.getConsumptionTableCellStyle(`border-left:6px solid ${theme.accent};`);
        const cellStyle = this.getConsumptionTableCellStyle();

        return `
          ${groupHeaderHtml}
          <tr>
            <td style="${firstCellStyle}">
              <div style="font-weight:800;">${this.escapeHtml(unitLabel)}</div>
              ${row.mieter_name ? `<div style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(this.formatMieterDisplayName(row.mieter_name))}</div>` : ''}
            </td>
            <td style="${cellStyle}">
              <div style="font-weight:700;">${this.escapeHtml(row.bezeichnung)}</div>
              <div style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(this.getConsumptionSummaryLabel(row))}</div>
              <span style="display:inline-block; margin-top:5px; padding:3px 7px; border-radius:999px; background:${theme.background}; color:${theme.accent}; border:1px solid ${theme.border}; font-size:0.72rem; font-weight:800;">
                ${this.escapeHtml(mediumLabel)}
              </span>
              ${this.isConsumptionCalculatedRow(row) ? '<span class="consumption-badge">berechnet</span><div style="font-size:0.75rem; color:#64748b; margin-top:4px;">Dieser Wert wurde berechnet und nicht manuell erfasst.</div>' : ''}
            </td>
            <td style="${cellStyle}">
              <div><strong>${this.escapeHtml(periodDisplay.monthsText)}</strong></div>
              <div style="font-size:0.75rem; color:#475569;">${this.escapeHtml(periodDisplay.rangeText)}</div>
              ${periodDisplay.hintText ? `<div style="font-size:0.75rem; color:#b45309;">${this.escapeHtml(periodDisplay.hintText)}</div>` : ''}
              <div style="font-size:0.75rem; color:#64748b;">${audit ? `${this.formatDashboardNumber(audit.readings_count)} Rohwerte · ${this.formatDashboardNumber(audit.intervalle_count)} Intervalle` : 'Berechnete Daten'}</div>
            </td>
            <td style="${cellStyle}">
              ${row.is_missing_for_year ? `
                <span style="color:#94a3b8;">Keine Werte</span>
              ` : `
                <div style="font-weight:900;">${this.formatDashboardNumber(row.verbrauch_jahr)} ${this.escapeHtml(unit)}</div>
                <div style="font-size:0.75rem; color:#64748b;">Ø Monat: ${this.formatDashboardNumber(row.verbrauch_monat_durchschnitt)} ${this.escapeHtml(unit)}</div>
                ${oilReport ? `<div style="font-size:0.75rem; color:#92400e; font-weight:800;">Ölverbrauch: ${this.formatDashboardNumber(oilReport.totalLiters)} l</div>` : ''}
              `}
            </td>
            <td style="${cellStyle}">
              ${runningUsage ? `
                <div style="font-weight:800;">${this.formatDashboardNumber(runningUsage.value)} ${this.escapeHtml(unit)}</div>
                <div style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(runningUsage.rangeText)}</div>
                <div style="font-size:0.75rem; color:${runningUsage.isPartial ? '#b45309' : '#64748b'};">${this.escapeHtml(runningUsage.note)}</div>
              ` : '<span style="color:#94a3b8;">Keine Monatsdaten</span>'}
            </td>
            <td style="${cellStyle}">
              ${previousYearRow ? `
                <div style="font-weight:800;">${this.formatDashboardNumber(previousYearRow.verbrauch_jahr)} ${this.escapeHtml(unit)}</div>
                <div style="font-size:0.75rem; color:#64748b;">Ø Monat: ${this.formatDashboardNumber(previousYearRow.verbrauch_monat_durchschnitt)} ${this.escapeHtml(unit)}</div>
                ${previousOilReport ? `<div style="font-size:0.75rem; color:#92400e; font-weight:800;">Ölverbrauch: ${this.formatDashboardNumber(previousOilReport.totalLiters)} l</div>` : ''}
              ` : '<span style="color:#94a3b8;">Keine Daten</span>'}
            </td>
            <td style="${cellStyle}">
              <span style="display:inline-block; padding:3px 7px; border-radius:999px; background:#f8fafc; color:${this.getConsumptionStatusColor(status)}; font-size:0.75rem; font-weight:800;">
                ${this.escapeHtml(this.getConsumptionStatusLabel(status))}
              </span>
              ${hint ? `<div style="font-size:0.75rem; color:#64748b; margin-top:4px;">${this.escapeHtml(hint)}</div>` : ''}
            </td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="7" style="padding:14px; color:#64748b;">Keine Zähler für diesen Filter gefunden.</td></tr>';

    output.innerHTML = `
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; color:#475569; font-size:0.85rem;">
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">${this.escapeHtml(year)} · ${this.escapeHtml(this.getObjectDisplayName(objektId))}</span>
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">${sortedRows.length} Jahreszeilen</span>
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">${filteredRows.length} angezeigt</span>
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">${dataQualityRows.length} offene Datenqualitätshinweise</span>
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">${canonicalAuditRows.length} historisch zugeordnet</span>
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">Summen nach Medium und Gruppe</span>
      </div>

      <div class="consumption-overview-grid">
        ${overviewCardsHtml}
      </div>

      ${chartHtml}

      <section class="consumption-quality-section">
        <h3>Datenqualität</h3>
        <p class="consumption-quality-note">Neben den Backend-Hinweisen werden fehlende, veraltete oder wiederholt unveränderte Ablesungen angezeigt. Diese Hinweise blockieren keine Eingabe.</p>
        ${dataQualityHtml}
      </section>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:10px; margin-bottom:14px;">
        ${summaryHtml}
      </div>

      <section style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px; color:#475569; font-size:0.86rem;">
        <strong style="display:block; color:#334155; margin-bottom:4px;">Hinweis zur Verbrauchstabelle</strong>
        <div><strong>Jahresverbrauch:</strong> Summe der Monatsverbräuche im ausgewählten Jahr aus <code>_view_verbrauch_jahr</code>.</div>
        <div><strong>Abrechnung bis heute:</strong> Summe der Monatswerte des gewählten Jahres bis heute; bei Einzug im Jahr ab Startdatum des Mietvertrags. Ohne unterjährigen Mietbeginn kann dieser Wert im aktuellen Jahr mit dem Jahresverbrauch identisch sein, weil keine Zukunft prognostiziert wird.</div>
        <div><strong>Berechneter Zeitraum:</strong> zeigt die Monatssegmente und die Quellintervalle aus <code>_view_verbrauch_monat</code>. Wenn Segmentanzahl und Monate mit Verbrauch abweichen, gibt es Monatssegmente ohne berechenbaren Verbrauch.</div>
        <div><strong>Vorjahr gesamt:</strong> Jahresverbrauch des gleichen Zählers aus dem Vorjahr.</div>
      </section>

      <div style="overflow:auto; background:white; border:1px solid #e2e8f0; border-radius:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
          <thead>
            <tr style="background:#f8fafc; color:#334155; text-align:left;">
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Einheit</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Zähler</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Berechneter Zeitraum</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Jahresverbrauch</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Abrechnung bis heute</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Vorjahr gesamt</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  },

  renderAll() {
    const container = document.getElementById('object-selector');

    if (!container) return;

    container.innerHTML = '';

    dataService.getUniqueObjects().forEach(objId => {
      const objData = dataService.state.objekte.find(o => String(o.objekt_id) === String(objId));
      const name = objData ? (objData.bezeichnung || objData.objekt_id) : objId;

      const btn = document.createElement('button');
      btn.className = 'object-card';

      this.applyStyles(btn, {
        width: '100%',
        padding: '20px',
        margin: '10px 0',
        backgroundColor: '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        fontSize: '16px'
      });

      btn.onclick = () => uiService.selectObject(objId);
      btn.innerHTML = `<strong>${name}</strong><br><small style="opacity:0.8">ID: ${objId}</small>`;

      container.appendChild(btn);
    });
  },

  selectObject(objId) {
    this.currentSelection = String(objId || '');
    const tenantList = document.getElementById('tenant-list');
    const selectorSection = document.getElementById('object-selector-section');
    const unitSection = document.getElementById('unit-list-section');

    if (!tenantList) return;

    tenantList.innerHTML = `
      <button class="btn-back" onclick="uiService.backToObjects()"
        style="padding:10px; margin-bottom:20px; cursor:pointer; background:#6c757d; color:white; border:none; border-radius:5px;">
        ← Zurück zur Auswahl
      </button>

      <h3 style="margin-bottom:15px;">Objekt: ${objId}</h3>
    `;

    dataService.getUnitsByObject(objId).forEach(unit => {
      const viewData = this.getUnitViewData(unit.einheit_id);
      const bewohnerText = this.formatMieterDisplayName(viewData && viewData.mieter_name ? viewData.mieter_name : 'Leerstand');
      const unitName = this.getUnitDisplayName(unit);
      const entranceLabel = this.getUnitEntranceLabel(unit);

      const card = document.createElement('div');
      card.className = 'unit-card';

      this.applyStyles(card, {
        padding: '15px',
        margin: '8px 0',
        backgroundColor: 'white',
        border: '1px solid #dee2e6',
        borderRadius: '6px',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      });

      card.onclick = () => uiService.showZaehlerMaske(unit.einheit_id);

      card.innerHTML = `
        <div>
          <div style="font-weight:bold; color:#333;">${this.escapeHtml(unitName)}</div>
          ${entranceLabel ? `<div style="font-size:0.85em; color:#666;">${this.escapeHtml(entranceLabel)}</div>` : ''}
          <div style="font-size:0.9em; color:#666;">Mieter: ${this.escapeHtml(bewohnerText)}</div>
        </div>

        <div style="color:#007bff; font-weight:bold;">➔</div>
      `;

      tenantList.appendChild(card);
    });

    if (selectorSection) selectorSection.style.display = 'none';
    if (unitSection) unitSection.style.display = 'block';
  },

  showZaehlerMaske(id) {
    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');

    if (!modal || !modalBody) return;

    const activeMeters = dataService.state.zaehler.filter(z =>
      String(z.einheit_id) === String(id) &&
      this.isZaehlerManuellErfassbar(z)
    );
    const units = Array.isArray(dataService.state.einheiten)
      ? dataService.state.einheiten
      : [];
    const unit = units.find(row => String(row.einheit_id) === String(id));
    const viewData = this.getUnitViewData(id);
    const unitName = this.getUnitDisplayName(unit) || id;
    const entranceLabel = this.getUnitEntranceLabel(unit);
    const tenantName = this.formatMieterDisplayName(viewData && viewData.mieter_name ? viewData.mieter_name : 'Leerstand');

    const inputsHtml = activeMeters.length > 0
      ? `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px; margin-top:15px;">
          ${activeMeters.map(z => {
            const label = this.getZaehlerLabel(z);
            const latestReadingDisplay = this.getLatestZaehlerstandDisplay(z);
            const theme = this.getZaehlerTheme(z);
            const locationHtml = z.einbauort
              ? `<div style="font-size:0.75rem; color:#666; margin:4px 0 6px;">Einbauort: ${this.escapeHtml(z.einbauort)}</div>`
              : '';
            const latestReadingHtml = `
              <div style="
                display:flex;
                flex-direction:column;
                gap:3px;
                margin:6px 0 8px;
                padding:8px 10px;
                border:1px solid ${latestReadingDisplay.hasReading ? theme.previousBorder : '#e2e8f0'};
                border-radius:12px;
                background:${latestReadingDisplay.hasReading ? theme.previousBackground : '#f8fafc'};
              ">
                <span style="
                  color:#64748b;
                  font-size:0.68rem;
                  font-weight:800;
                  letter-spacing:0.02em;
                  text-transform:uppercase;
                ">${this.escapeHtml(latestReadingDisplay.label)}</span>
                <span style="
                  display:flex;
                  flex-wrap:wrap;
                  gap:2px 10px;
                  align-items:baseline;
                  justify-content:space-between;
                ">
                  <strong style="color:#0f172a; font-size:0.95rem; line-height:1.2;">${this.escapeHtml(latestReadingDisplay.valueText)}</strong>
                  ${latestReadingDisplay.timestampText ? `<span style="color:#475569; font-size:0.76rem; font-weight:700; line-height:1.2;">${this.escapeHtml(latestReadingDisplay.timestampText)}</span>` : ''}
                </span>
              </div>`;

            return `
              <div style="padding:10px; border:1px solid ${theme.border}; border-left:6px solid ${theme.accent}; border-radius:8px; background:${theme.background};">
                <label for="input-${z.zaehler_id}" style="font-size:0.8rem;">${this.escapeHtml(label)}</label>
                ${locationHtml}
                ${latestReadingHtml}
                <input type="number" id="input-${z.zaehler_id}" step="0.01" style="width:100%;">
              </div>`;
          }).join('')}
        </div>`
      : `
        <div style="margin-top:15px; padding:12px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; color:#475569;">
          Für diese Einheit sind keine manuell erfassbaren Zähler vorhanden.
        </div>`;

    modalBody.innerHTML = `
      <h3>Zählererfassung</h3>

      <p style="margin-bottom:4px;">Einheit: ${this.escapeHtml(unitName)}${entranceLabel ? ` · ${this.escapeHtml(entranceLabel)}` : ''}</p>
      <p style="margin-top:0; color:#666;">Mieter: ${this.escapeHtml(tenantName)}</p>

      ${inputsHtml}

      <div id="meter-save-progress" class="meter-save-progress" role="status" aria-live="polite" hidden>
        <div class="meter-save-progress-visual">
          <img id="meter-save-animation" src="assets/hausmeister-stempel-loading.svg" alt="Der Hausmeister sucht den richtigen Stempel">
        </div>
        <span class="meter-save-progress-copy">
          <strong id="meter-save-title">Der Hausmeister sucht noch den richtigen Stempel …</strong>
          <small id="meter-save-detail">Die Ablesung wird gerade eingetragen.</small>
        </span>
      </div>

      <div style="margin-top:20px;">
        ${activeMeters.length > 0 ? '<button id="save-meter-values" onclick="uiService.saveZaehler()" style="background:#28a745; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer;">Speichern</button>' : ''}
        <button id="cancel-meter-values" onclick="uiService.closeModal()" style="background:#6c757d; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer; margin-left:10px;">Abbrechen</button>
      </div>
    `;

    this.currentActiveMetersObjects = activeMeters;
    modal.style.display = 'flex';
  },

  getOilRefillSuggestion(transactions) {
    const service = typeof window !== 'undefined' ? window.heatingOilService : null;
    if (!service || typeof service.isOilFillMeter !== 'function' || typeof service.isOilLevelMeter !== 'function') {
      return null;
    }

    const meters = Array.isArray(this.currentActiveMetersObjects) ? this.currentActiveMetersObjects : [];
    const fillTransaction = transactions.find(transaction => {
      const meter = meters.find(row => String(row.zaehler_id) === String(transaction.zaehler_id));
      return meter && service.isOilFillMeter(meter);
    });
    const fillMeter = fillTransaction
      ? meters.find(row => String(row.zaehler_id) === String(fillTransaction.zaehler_id))
      : null;
    const fillTankId = fillMeter && typeof service.tankIdForMeter === 'function'
      ? service.tankIdForMeter(fillMeter)
      : null;
    const levelMeter = meters.find(meter => service.isOilLevelMeter(meter) && (
      !fillTankId || typeof service.tankIdForMeter !== 'function' || service.tankIdForMeter(meter) === fillTankId
    ));
    if (!fillTransaction || !levelMeter || transactions.some(transaction =>
      String(transaction.zaehler_id) === String(levelMeter.zaehler_id)
    )) {
      return null;
    }

    const config = service.getTankConfig(
      levelMeter,
      Array.isArray(dataService.state.haustechnik) ? dataService.state.haustechnik : []
    );
    if (!config || config.max_fuellstand_cm === null) return null;

    return { fillTransaction, levelMeter, config, fillTankId };
  },

  getRowStandId(row) {
    const value = row && (row.stand_id !== undefined && row.stand_id !== '' ? row.stand_id : row['stand.id']);
    return value === undefined || value === null ? '' : String(value).trim();
  },

  formatZaehlerSaveSuccess(res) {
    const counts = [res && res.angelegt, res && res.bereits_vorhanden, res && res.ueberschrieben]
      .map(value => value === undefined || value === null || value === '' ? NaN : Number(value));
    if (!counts.some(Number.isFinite)) return 'Erfolgreich gespeichert!';

    const [angelegt, bereitsVorhanden, ueberschrieben] = counts
      .map(value => Number.isFinite(value) ? value : 0);

    if (angelegt === 0 && bereitsVorhanden > 0 && ueberschrieben === 0) {
      const countText = bereitsVorhanden === 1
        ? 'Die identische Eingabe war bereits verarbeitet.'
        : `${bereitsVorhanden} identische Eingaben waren bereits verarbeitet.`;
      return `${countText} Es wurde keine neue Zeile und kein neuer Zeitstempel angelegt.`;
    }

    const details = [];
    if (angelegt > 0) {
      details.push(angelegt === 1 ? '1 neuer Zählerstand' : `${angelegt} neue Zählerstände`);
    }
    if (ueberschrieben > 0) {
      details.push(ueberschrieben === 1
        ? '1 Zählerstand korrigiert; der bestehende Zeitstempel bleibt unverändert'
        : `${ueberschrieben} Zählerstände korrigiert; die bestehenden Zeitstempel bleiben unverändert`);
    }
    if (bereitsVorhanden > 0) {
      details.push(bereitsVorhanden === 1
        ? '1 identische Eingabe war bereits verarbeitet'
        : `${bereitsVorhanden} identische Eingaben waren bereits verarbeitet`);
    }

    return details.length > 0
      ? `Erfolgreich gespeichert! ${details.join('; ')}.`
      : 'Erfolgreich verarbeitet. Es wurde keine neue Zeile angelegt.';
  },

  /** stand_id wie im Backend: ST_{zaehler_id}_{YYYY-MM-DD HH:mm}, aus dem deutschen Zeitstempel. */
  buildStandId(zaehlerId, germanTimestamp) {
    const match = String(germanTimestamp).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2}):(\d{2})$/);
    if (!match) return '';
    const pad = value => String(value).padStart(2, '0');
    return `ST_${String(zaehlerId).trim()}_${match[3]}-${pad(match[2])}-${pad(match[1])} ${pad(match[4])}:${match[5]}`;
  },

  /**
   * Warnung und Pflichtgrund, bevor ein bereits gespeicherter Zählerstand überschrieben wird.
   * Liefert den Grund oder null, wenn abgebrochen wurde.
   */
  askOverwriteReason(conflicts, totalCount = 0) {
    const meters = Array.isArray(this.currentActiveMetersObjects) ? this.currentActiveMetersObjects : [];
    const lines = (Array.isArray(conflicts) ? conflicts : []).map(conflict => {
      const meter = meters.find(m => String(m.zaehler_id) === String(conflict.zaehler_id)) ||
        (Array.isArray(dataService.state.zaehler)
          ? dataService.state.zaehler.find(m => String(m.zaehler_id) === String(conflict.zaehler_id))
          : null);
      const label = meter ? this.getZaehlerLabel(meter) : conflict.zaehler_id;
      const when = conflict.art === 'NAHE_ABLESUNG'
        ? `vor ${conflict.minuten_abstand} Min. (${conflict.alte_zeit}) `
        : '';
      return `• ${label}: ${when}gespeichert ${conflict.alter_wert} → neu ${conflict.neuer_wert}`;
    });

    const conflictCount = Array.isArray(conflicts) ? conflicts.length : 0;
    const others = totalCount > conflictCount ? totalCount - conflictCount : 0;
    const othersText = others > 0
      ? (others === 1
        ? '\n\nZusätzlich wird 1 weiterer Zählerstand dieser Eingabe (ohne Konflikt) gespeichert.'
        : `\n\nZusätzlich werden ${others} weitere Zählerstände dieser Eingabe (ohne Konflikt) gespeichert.`)
      : '';

    const confirmed = confirm(
      '⚠️ Für diesen Zähler ist gerade erst ein anderer Zählerstand gespeichert:\n\n' +
      lines.join('\n') +
      othersText +
      '\n\nDer gespeicherte Wert würde überschrieben. Die Änderung wird mit Grund protokolliert.\n\nÜberschreiben?'
    );
    this.lastOverwriteAnswer = confirmed ? 'bestaetigt' : 'abgelehnt';
    if (!confirmed) return null;

    const reason = prompt('Grund für das Überschreiben (Pflichtfeld, z. B. Tippfehler):');
    const trimmed = reason === null || reason === undefined ? '' : String(reason).trim();
    if (trimmed.length < 3) {
      this.lastOverwriteAnswer = 'ohne_grund';
      alert('Ohne Grund wird nichts überschrieben. Es wurde nichts geändert.');
      return null;
    }
    return trimmed;
  },

  /** Nur kurz zurückliegende Werte (nicht die gleiche Minute) dürfen auch als neue Ablesung gespeichert werden. */
  canSaveAsNewReading(conflicts) {
    return Array.isArray(conflicts) && conflicts.length > 0 &&
      conflicts.every(conflict => conflict.art === 'NAHE_ABLESUNG');
  },

  /**
   * Entscheidung bei Konflikt: { aktion: 'ueberschreiben', grund } | { aktion: 'neue_ablesung' } | null.
   */
  resolveConflict(conflicts, totalCount = 0) {
    const grund = this.askOverwriteReason(conflicts, totalCount);

    if (grund) {
      return { aktion: 'ueberschreiben', grund };
    }

    if (this.canSaveAsNewReading(conflicts) && this.lastOverwriteAnswer !== 'ohne_grund' &&
      confirm(`Stattdessen ${totalCount > 1 ? `alle ${totalCount} Zählerstände dieser Eingabe` : 'den Wert'} als zusätzliche, neue Ablesung speichern?\n\nDie bereits gespeicherten Werte bleiben unverändert.`)) {
      return { aktion: 'neue_ablesung' };
    }

    return null;
  },

  // --- Anzeige nicht gespeicherter Einträge (Offline-Queue) ---------------
  syncQueueDetailsOpen: false,

  describeQueueItem(item) {
    const meters = Array.isArray(dataService.state.zaehler) ? dataService.state.zaehler : [];
    const meter = meters.find(m => String(m.zaehler_id) === String(item.zaehler_id));
    const label = meter ? this.getZaehlerLabel(meter) : item.zaehler_id;
    return `${label}: ${item.wert} (${item.zeitstempel || 'ohne Zeit'})`;
  },

  /** Alle Zählerstände eines Queue-Eintrags; Konflikte sind markiert (Zähler mit Konfliktmeldung). */
  describeEntryItems(entry) {
    const data = entry.payload && Array.isArray(entry.payload.data) ? entry.payload.data : [entry.payload && entry.payload.data];
    const conflicts = Array.isArray(entry.conflicts) ? entry.conflicts : [];
    return data.filter(Boolean).map(item => ({
      text: this.describeQueueItem(item),
      conflict: conflicts.some(conflict => String(conflict.zaehler_id) === String(item.zaehler_id))
    }));
  },

  renderSyncQueueStatus() {
    const el = document.getElementById('sync-queue-status');
    if (!el || typeof cloudService === 'undefined' || !cloudService.getQueueSummary) return;

    const summary = cloudService.getQueueSummary();
    const problems = Array.isArray(summary.problems) ? summary.problems : [];
    const problemHtml = problems.length > 0
      ? `<div class="sync-queue-summary sync-queue-rejected">
          ❌ Die gespeicherte Offline-Queue ist beschädigt und konnte nicht gelesen werden. Die Daten sind unverändert
          erhalten, es können aber keine Werte offline zwischengespeichert werden, bis sie gesichert wurden.
          <button type="button" onclick="uiService.showCorruptQueue()">Rohdaten anzeigen</button>
          <button type="button" onclick="uiService.resetCorruptQueue()">Sichern und zurücksetzen</button>
        </div>`
      : '';

    if (summary.entries.length === 0) {
      el.style.display = problems.length > 0 ? 'block' : 'none';
      el.innerHTML = problemHtml;
      return;
    }

    const rejectedText = summary.rejected > 0
      ? ` ${summary.rejected} wurde${summary.rejected === 1 ? '' : 'n'} abgelehnt und braucht eine Entscheidung.`
      : '';
    const detailsHtml = this.syncQueueDetailsOpen
      ? `<ul class="sync-queue-list">${summary.entries.map(entry => {
          const rejected = entry.status === 'rejected';
          const id = this.escapeHtml(entry.id);
          const items = this.describeEntryItems(entry);
          const conflictCount = items.filter(item => item.conflict).length;
          const countText = rejected && conflictCount > 0 && items.length > 1
            ? `<div class="sync-queue-state">${items.length} Zählerstände gehören zu dieser Eingabe, davon ${conflictCount} mit Konflikt. ` +
              'Nichts davon ist gespeichert; die Entscheidung gilt für die ganze Eingabe.</div>'
            : '';
          return `<li class="${rejected ? 'sync-queue-rejected' : ''}">
            <div>${items.map(item => `${item.conflict ? '⚠️ Konflikt: ' : ''}${this.escapeHtml(item.text)}`).join('<br>')}</div>
            ${countText}
            <div class="sync-queue-state">${rejected
              ? this.escapeHtml(entry.message || 'Vom Backend abgelehnt.')
              : 'Wartet auf Übertragung.'}</div>
            ${rejected && Array.isArray(entry.conflicts) ? entry.conflicts.map(conflict =>
              `<div class="sync-queue-state">Gespeichert ist ${this.escapeHtml(conflict.alter_wert)}, erfasst wurde ${this.escapeHtml(conflict.neuer_wert)}${conflict.art === 'NAHE_ABLESUNG' ? ` (gespeichert vor ${this.escapeHtml(conflict.minuten_abstand)} Min.)` : ''}.</div>`).join('') : ''}
            <div class="sync-queue-actions">
              ${rejected && entry.code !== 'CONFLICT' ? `<button type="button" onclick="uiService.retryQueueEntry('${id}')">Erneut versuchen</button>` : ''}
              ${rejected && entry.code === 'CONFLICT' ? `<button type="button" onclick="uiService.overwriteQueueEntry('${id}')">Überschreiben …</button>` : ''}
              ${rejected && entry.code === 'CONFLICT' && this.canSaveAsNewReading(entry.conflicts) ? `<button type="button" onclick="uiService.saveQueueEntryAsNew('${id}')">Als neue Ablesung speichern</button>` : ''}
              <button type="button" onclick="uiService.discardQueueEntry('${id}')">Verwerfen</button>
            </div>
          </li>`;
        }).join('')}</ul>`
      : '';

    el.style.display = 'block';
    el.innerHTML = `
      ${problemHtml}
      <div class="sync-queue-summary">
        ⚠️ ${summary.values} Wert${summary.values === 1 ? '' : 'e'} noch nicht in der Datenbank gespeichert.${rejectedText}
        ${summary.pending > 0 ? '<button type="button" id="sync-queue-retry" onclick="uiService.retrySyncQueue()">Jetzt erneut senden</button>' : ''}
        <button type="button" onclick="uiService.toggleSyncQueueDetails()">${this.syncQueueDetailsOpen ? 'Details ausblenden' : 'Details anzeigen'}</button>
      </div>
      ${detailsHtml}`;
  },

  toggleSyncQueueDetails() {
    this.syncQueueDetailsOpen = !this.syncQueueDetailsOpen;
    this.renderSyncQueueStatus();
  },

  async retrySyncQueue() {
    const button = document.getElementById('sync-queue-retry');
    if (button) button.disabled = true;
    try {
      // force: navigator.onLine ist in schlechten Netzen unzuverlässig, der Versuch entscheidet.
      const summary = await cloudService.processOfflineQueue({ force: true, allowPrompt: true });
      if (summary.entries.length === 0) {
        alert('Alle Werte wurden gespeichert.');
      } else if (summary.pending > 0) {
        alert('Die Übertragung war nicht möglich (keine oder zu schlechte Verbindung). Die Werte bleiben gespeichert, bitte später erneut versuchen.');
      }
    } finally {
      this.renderSyncQueueStatus();
    }
  },

  /** Abgelehnten Eintrag (kein fachlicher Konflikt) nach Behebung der Ursache erneut senden. */
  async retryQueueEntry(id) {
    cloudService.retryEntry(id);
    await this.retrySyncQueue();
  },

  discardQueueEntry(id) {
    const entry = cloudService.getQueueSummary().entries.find(candidate => candidate.id === id);
    const items = entry ? this.describeEntryItems(entry) : [];
    const conflictCount = items.filter(item => item.conflict).length;
    const withoutConflict = items.length - conflictCount;
    const list = items.map(item => `• ${item.conflict ? '⚠️ Konflikt: ' : ''}${item.text}`).join('\n');
    const warning = items.length > 1 && withoutConflict > 0
      ? `\n\nAchtung: ${withoutConflict} dieser Zählerstände haben keinen Konflikt und gehen ebenfalls verloren.`
      : '';

    const confirmed = confirm(
      `Eintrag mit ${items.length} ${items.length === 1 ? 'Zählerstand' : 'Zählerständen'} verwerfen?\n\n${list}${warning}\n\n` +
      'Keiner dieser Werte wird gespeichert. Das kann nicht rückgängig gemacht werden.'
    );
    if (!confirmed) return;
    cloudService.discardQueueEntry(id);
  },

  showCorruptQueue() {
    const problems = cloudService.getQueueProblems();
    const raw = problems.map(problem => cloudService.getCorruptRaw(problem.key)).filter(Boolean).join('\n');
    prompt('Beschädigte Queue-Daten (zum Kopieren und Aufbewahren):', raw);
  },

  resetCorruptQueue() {
    if (!confirm('Die beschädigten Daten werden zuerst gesichert und dann entfernt. Danach ist die Queue wieder leer und nutzbar.\n\nFortfahren?')) return;
    const result = cloudService.resolveCorruptQueue();
    alert(result.message); // beschreibt den tatsächlichen Zustand, auch bei Teilfehlern
    this.renderSyncQueueStatus();
  },

  async saveQueueEntryAsNew(id) {
    const entry = cloudService.getQueueSummary().entries.find(candidate => candidate.id === id);
    if (!entry) return;
    const count = this.describeEntryItems(entry).length;
    if (!confirm(`${count > 1 ? `Alle ${count} Zählerstände dieser Eingabe` : 'Den Wert'} als zusätzliche, neue Ablesung speichern? Die bereits gespeicherten Werte bleiben unverändert.`)) return;
    cloudService.prepareNewReading(id);
    await this.retrySyncQueue();
  },

  async overwriteQueueEntry(id) {
    const entry = cloudService.getQueueSummary().entries.find(candidate => candidate.id === id);
    if (!entry) return;
    const grund = this.askOverwriteReason(entry.conflicts, this.describeEntryItems(entry).length);
    if (!grund) return;
    cloudService.prepareOverwrite(id, grund);
    await this.retrySyncQueue();
  },

  setZaehlerSaveBusy(isBusy) {
    const saveButton = document.getElementById('save-meter-values');
    const cancelButton = document.getElementById('cancel-meter-values');
    const progress = document.getElementById('meter-save-progress');

    if (saveButton) {
      saveButton.disabled = isBusy;
      saveButton.textContent = isBusy ? 'Speichern läuft …' : 'Speichern';
      if (typeof saveButton.setAttribute === 'function') {
        saveButton.setAttribute('aria-busy', String(isBusy));
      }
    }

    if (cancelButton) cancelButton.disabled = isBusy;

    (this.currentActiveMetersObjects || []).forEach(zaehler => {
      const input = document.getElementById(`input-${zaehler.zaehler_id}`);
      if (input) input.disabled = isBusy;
    });

    if (progress) {
      progress.hidden = !isBusy;
      progress.style.display = isBusy ? 'flex' : 'none';
      if (isBusy) this.setZaehlerSaveLoading();
    }
  },

  setZaehlerSaveLoading() {
    const animation = document.getElementById('meter-save-animation');
    const title = document.getElementById('meter-save-title');
    const detail = document.getElementById('meter-save-detail');
    const progress = document.getElementById('meter-save-progress');

    if (animation) {
      animation.src = 'assets/hausmeister-stempel-loading.svg';
      animation.alt = 'Der Hausmeister sucht den richtigen Stempel';
    }
    if (title) title.textContent = 'Der Hausmeister sucht noch den richtigen Stempel …';
    if (detail) detail.textContent = 'Die Ablesung wird gerade eingetragen.';
    if (progress && progress.dataset) progress.dataset.state = 'loading';
  },

  setZaehlerSaveSuccess(message) {
    const animation = document.getElementById('meter-save-animation');
    const title = document.getElementById('meter-save-title');
    const detail = document.getElementById('meter-save-detail');
    const progress = document.getElementById('meter-save-progress');

    if (animation) {
      animation.src = 'assets/hausmeister-stempel-erfolg.svg';
      animation.alt = 'Die Ablesung wurde erfolgreich gespeichert';
    }
    if (title) title.textContent = 'Amtlich gespeichert!';
    if (detail) detail.textContent = message;
    if (progress && progress.dataset) progress.dataset.state = 'success';
  },

  async finishZaehlerSaveSuccess(message) {
    this.setZaehlerSaveSuccess(message);
    const duration = Number(this.saveSuccessDisplayMs);
    if (Number.isFinite(duration) && duration > 0) {
      await new Promise(resolve => setTimeout(resolve, duration));
    }
  },

  formatZaehlerSaveSuccess(res) {
    const rawCounts = [res && res.angelegt, res && res.bereits_vorhanden, res && res.ueberschrieben]
      .map(Number);
    const hasCounters = rawCounts.some(Number.isFinite);
    const [angelegt, bereitsVorhanden, ueberschrieben] = rawCounts.map(value => Number.isFinite(value) ? value : 0);

    if (!hasCounters) return 'Erfolgreich gespeichert!';

    if (angelegt === 0 && bereitsVorhanden > 0 && ueberschrieben === 0) {
      const existingText = bereitsVorhanden === 1 ? '1 Wert war bereits vorhanden' : `${bereitsVorhanden} Werte waren bereits vorhanden`;
      return `Bereits gespeichert: ${existingText}. ` +
        'Es wurde keine neue Zeile und kein neuer Zeitstempel angelegt.';
    }

    const details = [];
    if (angelegt > 0) {
      details.push(angelegt === 1 ? '1 neuer Zählerstand' : `${angelegt} neue Zählerstände`);
    }
    if (ueberschrieben > 0) {
      details.push(ueberschrieben === 1
        ? '1 Zählerstand korrigiert; der bestehende Zeitstempel bleibt unverändert'
        : `${ueberschrieben} Zählerstände korrigiert; die bestehenden Zeitstempel bleiben unverändert`);
    }
    if (bereitsVorhanden > 0) {
      details.push(bereitsVorhanden === 1 ? '1 Wert war bereits vorhanden' : `${bereitsVorhanden} Werte waren bereits vorhanden`);
    }

    return details.length > 0
      ? `Erfolgreich gespeichert! ${details.join('; ')}.`
      : 'Erfolgreich verarbeitet. Es wurde keine neue Zeile angelegt.';
  },

  /**
   * Nach bestätigtem Speichern den Datenbestand aus der Datenbank neu lesen, damit die Anzeige dem
   * Sheet entspricht (kein Phantomwert bei „bereits vorhanden“, richtige Zeile bei Überschreiben).
   * Ist das Nachladen nicht möglich, wird nur lokal nachgeführt, wenn die Antwort belegt, dass das
   * Backend genau das Gesendete angelegt oder überschrieben hat.
   */
  async refreshZaehlerstaendeAfterSave(res, transactions, overwrittenByZaehler) {
    if (typeof cloudService.loadZaehlerstaende === 'function') {
      try {
        dataService.setZaehlerstaende(await cloudService.loadZaehlerstaende());
        return;
      } catch (error) {
        console.warn('Zählerstände konnten nicht nachgeladen werden:', error && error.message);
      }
    }

    if (res && res.bereits_vorhanden > 0) {
      return; // lokal nicht eindeutig bestimmbar; beim nächsten Laden stimmt die Anzeige wieder
    }

    if (!Array.isArray(dataService.state.zaehlerstaende)) {
      dataService.state.zaehlerstaende = [];
    }

    transactions.forEach(transaction => {
      // Beim Überschreiben ist die Zielzeile die vorhandene (bei Minutenwechsel eine ältere) Zeile.
      const overwritten = overwrittenByZaehler[transaction.zaehler_id];
      const targetStandId = overwritten && overwritten.stand_id ? overwritten.stand_id : transaction.stand_id;
      const existing = dataService.state.zaehlerstaende.find(
        row => this.getRowStandId(row) === targetStandId
      );

      if (existing) {
        existing.wert = transaction.wert;
      } else {
        dataService.state.zaehlerstaende.push({ ...transaction });
      }
    });
  },

  async saveZaehler() {
    const transactions = [];
    const warnings = [];
    const errors = [];
    const zeitstempel = this.formatGermanTimestamp(new Date());

    const validator = await this.getValidationService();

    if (!validator || typeof validator.validateZaehlerstand !== 'function') {
      alert('Plausibilitätsprüfung konnte nicht geladen werden. Speicherung wurde aus Sicherheitsgründen abgebrochen.');
      return;
    }

    this.currentActiveMetersObjects.forEach(zaehler => {
      const input = document.getElementById(`input-${zaehler.zaehler_id}`);

      if (!input || input.value === '') {
        return;
      }

      const standId = this.buildStandId(zaehler.zaehler_id, zeitstempel);
      const latestReading = this.getLatestZaehlerstand(zaehler, {
        excludeStandId: standId,
        correctionTime: this.parseGermanDate(zeitstempel),
        includePending: true
      });

      const validationResult = validator.validateZaehlerstand({
        letzterWert: latestReading ? latestReading.wert : null,
        neuerWert: input.value,
        zaehler
      });

      const message = this.formatValidationMessage(
        zaehler,
        latestReading,
        validationResult,
        input.value
      );

      if (validationResult.status === validator.VALIDATION_STATUS.FEHLER) {
        errors.push(message);
        return;
      }

      if (
        validationResult.status === validator.VALIDATION_STATUS.WARNUNG ||
        validationResult.needsConfirmation
      ) {
        warnings.push(message);
      }

      transactions.push({
        objekt_id: zaehler.objekt_id,
        einheit_id: zaehler.einheit_id,
        zaehler_id: zaehler.zaehler_id,
        wert: parseFloat(String(input.value).replace(',', '.')),
        zeitstempel: zeitstempel,
        stand_id: standId,
        quelle: 'UI'
      });
    });

    if (errors.length > 0) {
      alert(
        'Folgende Eingaben sind fehlerhaft und wurden nicht gespeichert:\n\n' +
        errors.join('\n\n')
      );
      return;
    }

    if (transactions.length === 0) {
      alert('Keine Werte eingetragen.');
      return;
    }

    const oilRefillSuggestion = this.getOilRefillSuggestion(transactions);
    if (oilRefillSuggestion) {
      const confirmed = confirm(
        `Eine Tankfüllung wurde erfasst, aber kein neuer Ölstand.\n\n` +
        `Vollgetankt? Ja setzt den Füllstand des Haupttanks auf ` +
        `${this.formatDashboardNumber(oilRefillSuggestion.config.max_fuellstand_cm)} cm.\n\n` +
        `Nein speichert nur die Tankfüllung.`
      );

      if (confirmed) {
        const { levelMeter, config, fillTransaction } = oilRefillSuggestion;
        transactions.push({
          objekt_id: levelMeter.objekt_id,
          einheit_id: levelMeter.einheit_id,
          zaehler_id: levelMeter.zaehler_id,
          wert: config.max_fuellstand_cm,
          zeitstempel: fillTransaction.zeitstempel,
          stand_id: this.buildStandId(levelMeter.zaehler_id, fillTransaction.zeitstempel),
          quelle: 'UI',
          hinweis: 'Füllstand automatisch auf Tankmaximum gesetzt; Tankfüllung in derselben Erfassung.'
        });
      }
    }

    if (warnings.length > 0) {
      const confirmed = confirm(
        'Es gibt Plausibilitätswarnungen:\n\n' +
        warnings.join('\n\n') +
        '\n\nTrotzdem speichern?'
      );

      if (!confirmed) {
        return;
      }
    }

    const payload = { typ: 'ZAEHLERSTAND_NEU', data: transactions };
    const requestSave = async requestPayload => {
      this.setZaehlerSaveBusy(true);
      return cloudService.saveTransaction(requestPayload);
    };
    let res;
    const overwrittenByZaehler = {};

    try {
      res = await requestSave(payload);

      if (res && res.status === 'error' && res.code === 'CONFLICT') {
        // Für die Rückfrage muss der Dialog wieder bedienbar sein. Nach der Entscheidung
        // startet requestSave den Ladezustand erneut und hält ihn bis zur Rückmeldung.
        this.setZaehlerSaveBusy(false);
        const decision = this.resolveConflict(res.conflicts, transactions.length);

        if (!decision) {
          return;
        }

        if (decision.aktion === 'neue_ablesung') {
          res = await requestSave({ ...payload, neueAblesung: true });
        } else {
          (res.conflicts || []).forEach(conflict => {
            overwrittenByZaehler[conflict.zaehler_id] = conflict;
          });
          res = await requestSave({ ...payload, ueberschreiben: { grund: decision.grund } });
        }
      }

    if (res && res.status === 'success') {
      if (res.queued) {
        // Nur lokal in der Queue gesichert: nicht in den Datenbestand eintragen. Die Anzeige
        // „nicht gespeichert“ zeigt den Eintrag, bis das Backend ihn bestätigt hat.
        this.setZaehlerSaveBusy(false);
        alert('Offline gespeichert. Die Werte sind noch NICHT in der Datenbank und werden gesendet, sobald eine Verbindung besteht. Den Status siehst du oben auf der Seite.');
        this.closeModal();
      } else {
        // Auch das Nachladen gehört zum Speichervorgang: Erst danach entspricht die Anzeige
        // sicher dem Backend. Der Ladezustand bleibt bis zur Erfolgsmeldung aktiv.
        await this.refreshZaehlerstaendeAfterSave(res, transactions, overwrittenByZaehler);
        await this.finishZaehlerSaveSuccess(this.formatZaehlerSaveSuccess(res));
        // Der Erfolgshinweis wird noch angezeigt, bevor der Dialog in den Normalzustand
        // zurückkehrt. Dadurch verschwindet die Ladeanimation nicht vor der Rückmeldung.
        alert(this.formatZaehlerSaveSuccess(res));
        this.setZaehlerSaveBusy(false);
        this.closeModal();
      }
    } else {
      this.setZaehlerSaveBusy(false);
      alert('Fehler: ' + (res ? res.message : 'Unbekannter Fehler'));
    }
    } catch (error) {
    this.setZaehlerSaveBusy(false);
    alert('Fehler beim Speichern: ' + (error && error.message ? error.message : error));
    }
  },

  closeModal() {
    const modal = document.getElementById('modal-container');

    if (modal) {
      modal.style.display = 'none';
    }
  },

  backToObjects() {
    const unitSection = document.getElementById('unit-list-section');
    const selectorSection = document.getElementById('object-selector-section');

    if (unitSection) unitSection.style.display = 'none';
    if (selectorSection) selectorSection.style.display = 'block';
  }
};

/**
 * UI-SERVICE (v2.8.2 - Zähler-Plausibilitätsprüfung integriert)
 */
const uiService = {
  currentSelection: null,
  currentActiveMetersObjects: [],

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

  getZaehlerLabel(zaehler) {
    return (
      zaehler.bezeichnung ||
      zaehler.medium ||
      zaehler.typ ||
      zaehler.zaehler_id ||
      'Zähler'
    );
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

  isTrueValue(value) {
    return value === true || value === 'TRUE' || value === 'true' || value === 1 || value === '1';
  },

  isFalseValue(value) {
    return value === false || value === 'FALSE' || value === 'false' || value === 0 || value === '0';
  },

  isZaehlerManuellErfassbar(zaehler) {
    return (
      !this.isFalseValue(zaehler.aktiv) &&
      !this.isFalseValue(zaehler.erfassbar) &&
      !this.isTrueValue(zaehler.berechnet)
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

  getLatestZaehlerstand(zaehlerOrId) {
    const readings = Array.isArray(dataService.state.zaehlerstaende)
      ? dataService.state.zaehlerstaende
      : [];
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

        return true;
      })
      .sort((a, b) => this.parseGermanDate(b.zeitstempel) - this.parseGermanDate(a.zeitstempel));

    return matchingReadings[0] || null;
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
      FORTGESCHRIEBEN: 'Fortgeschrieben'
    };

    return labels[status] || status || '';
  },

  getConsumptionStatusColor(status) {
    if (status === 'OK') return '#15803d';
    if (status === 'UEBERLAUF' || status === 'EINZELWERT' || status === 'FORTGESCHRIEBEN' || status === 'KANONISCH_ZUGEORDNET') return '#0369a1';
    if (status === 'KEINE_WERTE' || status === 'KEINE_ABLESUNG' || status === 'NUR_EIN_WERT') return '#64748b';
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

  async ensureConsumptionViewData() {
    const hasYearRows = Array.isArray(dataService.state.view_verbrauch_jahr) &&
      dataService.state.view_verbrauch_jahr.length > 0;

    if (hasYearRows) {
      return;
    }

    if (typeof cloudService === 'undefined' || !cloudService.loadConsumptionData) {
      throw new Error('Verbrauchsviews können nicht geladen werden.');
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
  },

  buildConsumptionBalanceSummary(rows) {
    return (rows || [])
      .map(row => ({
        label: row.label || row.bilanz_id || 'Bilanz',
        einheit: row.einheit || '',
        verbrauch: this.toDashboardNumber(row.wert) || 0,
        zaehler_count: row.source_zaehler_ids
          ? String(row.source_zaehler_ids).split(',').filter(Boolean).length
          : 0,
        warnungen: String(row.plausibilitaet_status || '') === 'OK' ? 0 : 1,
        status: row.plausibilitaet_status || 'OK',
        formel: row.formel_text || ''
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), 'de'));
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

    if (dashboardSection) dashboardSection.style.display = 'none';
    if (selectorSection) selectorSection.style.display = 'block';
    if (unitSection) unitSection.style.display = 'none';

    this.setNavigationState('meter');
  },

  showConsumptionDashboard() {
    const dashboardSection = document.getElementById('consumption-dashboard-section');
    const selectorSection = document.getElementById('object-selector-section');
    const unitSection = document.getElementById('unit-list-section');

    if (selectorSection) selectorSection.style.display = 'none';
    if (unitSection) unitSection.style.display = 'none';
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

    if (!output || !objectSelect || !yearSelect) return;

    const userSelectedObject = objectSelect.dataset && objectSelect.dataset.userSelected === 'true';
    const requestedYear = yearSelect.value;

    this.renderConsumptionDashboardControls();
    output.innerHTML = '<div style="padding:12px; background:white; border:1px solid #e2e8f0; border-radius:8px;">Verbrauchsviews werden geladen...</div>';

    try {
      await this.ensureConsumptionViewData();
    } catch (error) {
      output.innerHTML = `<div style="padding:12px; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px;">Verbrauchsviews konnten nicht geladen werden: ${this.escapeHtml(error.message || String(error))}</div>`;
      return;
    }

    this.renderConsumptionDashboardControls();

    const objectIds = dataService.getUniqueObjects();
    const allRows = Array.isArray(dataService.state.view_verbrauch_jahr)
      ? dataService.state.view_verbrauch_jahr
      : [];
    const year = yearSelect.value || this.getAvailableConsumptionYears()[0] || '';
    let objektId = objectSelect.value || objectIds[0] || '';
    const firstObjectWithRows = objectIds.find(objId => allRows.some(row => String(row.objekt_id) === String(objId) && String(row.jahr) === String(year)));

    if (!userSelectedObject && firstObjectWithRows) {
      objektId = firstObjectWithRows;
      objectSelect.value = firstObjectWithRows;
    }

    if (!requestedYear && year) {
      yearSelect.value = year;
    }

    const includeCalculated = includeCalculatedInput ? includeCalculatedInput.checked : true;

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
    const balanceSummary = this.buildConsumptionBalanceSummary(selectedBalanceRows);
    const summaryRows = selectedRows
      .filter(row => !this.isConsumptionSummaryCoveredByBalance(row, selectedBalanceRows));
    const summary = this.buildConsumptionSummaryFromViews(summaryRows);
    const auditRows = (Array.isArray(dataService.state.view_verbrauch_audit) ? dataService.state.view_verbrauch_audit : [])
      .filter(row => String(row.objekt_id) === String(objektId));
    const openAuditRows = auditRows
      .filter(row => ['NUR_EIN_WERT', 'KEINE_ABLESUNG', 'UNGELOESTE_MESSWERTE', 'MONATSZEILEN_ABWEICHUNG'].includes(String(row.status)));
    const canonicalAuditRows = auditRows
      .filter(row => String(row.status) === 'KANONISCH_ZUGEORDNET');
    const sortedRows = selectedRows
      .slice()
      .sort((a, b) => (
        String(this.getConsumptionRowUnitLabel(a)).localeCompare(String(this.getConsumptionRowUnitLabel(b)), 'de') ||
        String(a.medium).localeCompare(String(b.medium), 'de') ||
        String(a.bezeichnung).localeCompare(String(b.bezeichnung), 'de')
      ));
    const summaryHtml = summary.length > 0
      ? summary
        .map(item => `
          <div class="consumption-summary-item">
            <div style="font-size:0.75rem; color:#64748b; font-weight:700;">${this.escapeHtml(item.label || item.medium || 'Ohne Medium')}</div>
            <div style="font-size:1.15rem; font-weight:900; color:#0f172a;">${this.formatDashboardNumber(item.verbrauch)} ${this.escapeHtml(item.einheit || '')}</div>
            <div style="font-size:0.75rem; color:#64748b;">${item.zaehler_count} Zähler${item.warnungen ? ` · ${item.warnungen} Warnungen` : ''}</div>
          </div>
        `)
        .join('')
      : '<div style="color:#64748b;">Keine Summen verfügbar.</div>';
    const balanceSummaryHtml = balanceSummary.length > 0
      ? balanceSummary
        .map(item => `
          <div class="consumption-summary-item" style="border-color:#bfdbfe; background:#eff6ff;">
            <div style="font-size:0.75rem; color:#1d4ed8; font-weight:800;">${this.escapeHtml(item.label)}</div>
            <div style="font-size:1.15rem; font-weight:900; color:#0f172a;">${this.formatDashboardNumber(item.verbrauch)} ${this.escapeHtml(item.einheit || '')}</div>
            <div style="font-size:0.75rem; color:#475569;">${item.zaehler_count} Quellen${item.warnungen ? ` · ${this.escapeHtml(item.status)}` : ''}</div>
          </div>
        `)
        .join('')
      : '';
    const rowsHtml = sortedRows.length > 0
      ? sortedRows.map(row => {
        const audit = this.getConsumptionAuditForRow(row, auditByMeter);
        const unit = this.getConsumptionDisplayUnit(row);
        const unitLabel = this.getConsumptionRowUnitLabel(row);
        const previousYearRow = this.getConsumptionPreviousYearRow(row, previousYearMap);
        const status = row.plausibilitaet_status && row.plausibilitaet_status !== 'OK'
          ? row.plausibilitaet_status
          : (audit && audit.status ? audit.status : 'OK');
        const hint = row.plausibilitaet_status && row.plausibilitaet_status !== 'OK'
          ? row.plausibilitaet_status
          : (audit && audit.hinweis ? audit.hinweis : '');

        return `
          <tr>
            <td>
              <div style="font-weight:800;">${this.escapeHtml(unitLabel)}</div>
              ${row.mieter_name ? `<div style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(this.formatMieterDisplayName(row.mieter_name))}</div>` : ''}
            </td>
            <td>
              <div style="font-weight:700;">${this.escapeHtml(row.bezeichnung)}</div>
              <div style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(this.getConsumptionSummaryLabel(row))}</div>
            </td>
            <td>
              <div><strong>Monate:</strong> ${this.formatDashboardNumber(row.anzahl_monate_mit_verbrauch)}</div>
              <div style="font-size:0.75rem; color:#64748b;">${audit ? `${this.formatDashboardNumber(audit.readings_count)} Rohwerte · ${this.formatDashboardNumber(audit.intervalle_count)} Intervalle` : 'View-Datensatz'}</div>
            </td>
            <td>
              <div style="font-weight:900;">${this.formatDashboardNumber(row.verbrauch_jahr)} ${this.escapeHtml(unit)}</div>
              <div style="font-size:0.75rem; color:#64748b;">Ø Monat: ${this.formatDashboardNumber(row.verbrauch_monat_durchschnitt)} ${this.escapeHtml(unit)}</div>
            </td>
            <td>
              ${previousYearRow ? `
                <div style="font-weight:800;">${this.formatDashboardNumber(previousYearRow.verbrauch_jahr)} ${this.escapeHtml(unit)}</div>
                <div style="font-size:0.75rem; color:#64748b;">Ø Monat: ${this.formatDashboardNumber(previousYearRow.verbrauch_monat_durchschnitt)} ${this.escapeHtml(unit)}</div>
              ` : '<span style="color:#94a3b8;">Keine Daten</span>'}
            </td>
            <td>
              <span style="display:inline-block; padding:3px 7px; border-radius:999px; background:#f8fafc; color:${this.getConsumptionStatusColor(status)}; font-size:0.75rem; font-weight:800;">
                ${this.escapeHtml(this.getConsumptionStatusLabel(status))}
              </span>
              ${hint ? `<div style="font-size:0.75rem; color:#64748b; margin-top:4px;">${this.escapeHtml(hint)}</div>` : ''}
            </td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="6" style="padding:14px; color:#64748b;">Keine Zähler für Auswahl gefunden.</td></tr>';

    output.innerHTML = `
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; color:#475569; font-size:0.85rem;">
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">${this.escapeHtml(year)} · ${this.escapeHtml(this.getObjectDisplayName(objektId))}</span>
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">${sortedRows.length} Jahreszeilen</span>
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">${openAuditRows.length} offene Audit-Hinweise</span>
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">${canonicalAuditRows.length} historisch zugeordnet</span>
        <span style="background:white; border:1px solid #e2e8f0; border-radius:999px; padding:5px 9px;">Summen nach Medium und Gruppe</span>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:10px; margin-bottom:14px;">
        ${balanceSummaryHtml}
        ${summaryHtml}
      </div>

      <div style="overflow:auto; background:white; border:1px solid #e2e8f0; border-radius:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
          <thead>
            <tr style="background:#f8fafc; color:#334155; text-align:left;">
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Einheit</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Zähler</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Zeitraum</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Verbrauch</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Verbrauch Vorjahr</th>
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

    let inputsHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:15px;">`;

    activeMeters.forEach(z => {
      const label = this.getZaehlerLabel(z);
      const locationHtml = z.einbauort
        ? `<div style="font-size:0.75rem; color:#666; margin:4px 0 6px;">Einbauort: ${this.escapeHtml(z.einbauort)}</div>`
        : '';

      inputsHtml += `
        <div style="padding:10px; border:1px solid #ccc; border-radius:4px; background:#f9f9f9;">
          <label for="input-${z.zaehler_id}" style="font-size:0.8rem;">${this.escapeHtml(label)}</label>
          ${locationHtml}
          <input type="number" id="input-${z.zaehler_id}" step="0.01" style="width:100%;">
        </div>`;
    });

    inputsHtml += `</div>`;

    modalBody.innerHTML = `
      <h3>Zählererfassung</h3>

      <p style="margin-bottom:4px;">Einheit: ${this.escapeHtml(unitName)}${entranceLabel ? ` · ${this.escapeHtml(entranceLabel)}` : ''}</p>
      <p style="margin-top:0; color:#666;">Mieter: ${this.escapeHtml(tenantName)}</p>

      ${inputsHtml}

      <div style="margin-top:20px;">
        <button onclick="uiService.saveZaehler()" style="background:#28a745; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer;">Speichern</button>
        <button onclick="uiService.closeModal()" style="background:#6c757d; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer; margin-left:10px;">Abbrechen</button>
      </div>
    `;

    this.currentActiveMetersObjects = activeMeters;
    modal.style.display = 'flex';
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

      const latestReading = this.getLatestZaehlerstand(zaehler);

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

    const res = await cloudService.saveTransaction({
      typ: 'ZAEHLERSTAND_NEU',
      data: transactions
    });

    if (res && res.status === 'success') {
      if (!Array.isArray(dataService.state.zaehlerstaende)) {
        dataService.state.zaehlerstaende = [];
      }

      transactions.forEach(transaction => {
        dataService.state.zaehlerstaende.push({ ...transaction });
      });

      alert('Erfolgreich gespeichert!');
      this.closeModal();
    } else {
      alert('Fehler: ' + (res ? res.message : 'Unbekannter Fehler'));
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

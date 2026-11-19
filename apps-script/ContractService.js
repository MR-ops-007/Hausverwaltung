/** Shared contract rules for browser and Apps Script. No persistence or UI. */
const contractService = {
  fields: ['vertragsdokument_url', 'sondervereinbarungen_url', 'vertrag_hinweis',
    'nk_betriebskosten', 'nk_heizung_warmwasser', 'index_basis_monat', 'index_basis_wert', 'index_reihe',
    'zahlungsziel_typ', 'zahlungsziel_wert'],
  editable: ['mietmodell', 'erhoehungs_typ', 'soll_kaltmiete', 'soll_nebenkosten',
    'vertragsdokument_url', 'sondervereinbarungen_url', 'vertrag_hinweis',
    'nk_betriebskosten', 'nk_heizung_warmwasser', 'index_basis_monat', 'index_basis_wert', 'index_reihe',
    'zahlungsziel_typ', 'zahlungsziel_wert'],
  tenantChangeFields: ['vertrag_id', 'einheit_id', 'hauptperson_id', 'start_datum', 'end_datum', 'aktiv',
    'mietmodell', 'erhoehungs_typ', 'letzte_anpassung', 'soll_kaltmiete', 'soll_nebenkosten', 'soll_gesamt',
    'kaution_soll', 'kaution_ist', 'zahlungsziel_typ', 'zahlungsziel_wert',
    'vertragsdokument_url', 'sondervereinbarungen_url', 'vertrag_hinweis',
    'nk_betriebskosten', 'nk_heizung_warmwasser', 'index_basis_monat', 'index_basis_wert', 'index_reihe'],
  tenantChangeProtocolHeaders: ['mieterwechsel_id', 'vertrag_alt_id', 'vertrag_neu_id', 'request_fingerprint', 'erfasst_am'],
  historyHeaders: ['anpassung_id', 'vertrag_id', 'art', 'erfasst_am', 'wirksam_ab',
    'zugang_datum', 'erklaerung_url', 'index_neu_monat', 'index_neu_wert', 'index_reihe',
    'vorher_json', 'nachher_json'],

  number(value, label, optional = false) {
    if (value === undefined || value === null || typeof value === 'string' && value.trim() === '') {
      if (optional) return '';
      throw new Error(label + ' fehlt.');
    }
    if (typeof value !== 'number' && typeof value !== 'string') throw new Error(label + ' ist ungueltig.');
    const number = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
    if (!Number.isFinite(number) || number < 0) throw new Error(label + ' ist ungueltig.');
    return number;
  },

  money(value) {
    if (!Number.isFinite(value) || Math.abs(value * 100) > Number.MAX_SAFE_INTEGER) throw new Error('Geldbetrag ausserhalb des gueltigen Bereichs.');
    return Math.round((value + Number.EPSILON) * 100) / 100;
  },

  date(value) {
    const text = value instanceof Date ? value.toISOString() : String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
      const instant = new Date(text);
      if (!Number.isFinite(instant.getTime())) throw new Error('Ungueltiges Datum.');
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
      const part = type => parts.find(item => item.type === type).value;
      return this.date(part('year') + '-' + part('month') + '-' + part('day'));
    }
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (!match) {
      const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:$|\s)/);
      if (german) match = [text, german[3], german[2], german[1]];
    }
    if (!match) throw new Error('Gueltiges Datum erforderlich.');
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const result = new Date(Date.UTC(year, month - 1, day));
    if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day) {
      throw new Error('Ungueltiges Kalenderdatum.');
    }
    return result;
  },

  iso(date) { return date.toISOString().slice(0, 10); },

  month(value) {
    const text = String(value || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw new Error('Indexmonat muss YYYY-MM sein.');
    return text;
  },

  documentUrl(value) {
    const text = String(value || '').trim();
    if (text && !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(text)) {
      throw new Error('Dokumentlink muss eine HTTPS-Adresse sein.');
    }
    return text;
  },

  blank(value) { return value === undefined || value === null || String(value).trim() === ''; },

  isActive(value) {
    return !([false, 0, '0', 'false', 'FALSE', 'nein', 'NEIN', 'falsch', 'FALSCH'].includes(value));
  },

  /**
   * Derives current activity from the contract period. Legacy rows without a
   * start date keep their explicit flag so they remain visible for repair.
   */
  isCurrentlyActive(contract, now = new Date()) {
    if (!contract) return false;
    if (this.blank(contract.start_datum)) return this.isActive(contract.aktiv);
    try {
      const today = this.iso(this.date(now));
      const start = this.iso(this.date(contract.start_datum));
      const end = this.blank(contract.end_datum) ? '' : this.iso(this.date(contract.end_datum));
      return start <= today && (!end || end >= today);
    } catch (error) {
      return false;
    }
  },

  isVacancyPlaceholder(contract) {
    if (!contract || !this.blank(contract.start_datum)) return false;
    const amountIsZero = value => {
      if (this.blank(value)) return true;
      const number = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
      return Number.isFinite(number) && Math.abs(number) < 0.005;
    };
    return this.blank(contract.hauptperson_id)
      && amountIsZero(contract.soll_gesamt)
      && amountIsZero(contract.kaution_soll)
      && amountIsZero(contract.kaution_ist);
  },

  paymentDeadlineType(value) {
    const type = this.blank(value) ? 'WERKTAG' : String(value).trim().toUpperCase();
    if (!['WERKTAG', 'KALENDERTAG'].includes(type)) throw new Error('Zahlungszieltyp ungueltig.');
    return type;
  },

  paymentDeadlineValue(value, type = 'WERKTAG') {
    if (this.blank(value)) return type === 'WERKTAG' ? 3 : 1;
    const number = Number(String(value).trim().replace(',', '.'));
    const maximum = type === 'WERKTAG' ? 23 : 31;
    if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error('Zahlungszielwert ungueltig.');
    return number;
  },

  /** Value equality for sheet values vs. form strings: '' == undefined, 600 == '600' == '600,00'. */
  same(a, b) {
    if (this.blank(a) || this.blank(b)) return this.blank(a) && this.blank(b);
    const numeric = value => typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
    const x = numeric(a), y = numeric(b);
    if (Number.isFinite(x) && Number.isFinite(y) && String(a).trim() !== '' && String(b).trim() !== '') return x === y;
    return String(a).trim() === String(b).trim();
  },

  /** Returns only the editable fields whose form value differs from the stored contract. */
  diff(current, values) {
    return this.editable.reduce((patch, key) => {
      if (Object.prototype.hasOwnProperty.call(values, key) && !this.same(current[key], values[key])) patch[key] = values[key];
      return patch;
    }, {});
  },

  /**
   * Builds and validates the new contract side of an atomic tenant change.
   * Identity and period fields are intentionally separate from preparePatch:
   * a tenant change creates a new historical record instead of mutating one.
   */
  prepareTenantChange(current, input) {
    if (!current || !input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Daten fuer den neuen Mietvertrag fehlen.');
    }
    Object.keys(input).forEach(key => {
      if (!this.tenantChangeFields.includes(key)) throw new Error('Nicht bearbeitbares Feld im Mieterwechsel: ' + key);
    });
    if (this.blank(input.vertrag_id)) throw new Error('Neue Vertrags-ID fehlt.');
    if (this.blank(input.einheit_id) || String(input.einheit_id) !== String(current.einheit_id)) {
      throw new Error('Einheit des neuen Vertrags muss der bisherigen Einheit entsprechen.');
    }
    if (this.blank(input.hauptperson_id)) throw new Error('Hauptperson des neuen Vertrags fehlt.');
    const start = this.iso(this.date(input.start_datum));
    const end = this.blank(input.end_datum) ? '' : this.iso(this.date(input.end_datum));
    if (end && end < start) throw new Error('Das neue Vertragsende liegt vor dem Vertragsbeginn.');

    const source = Object.assign({}, current, input);
    if (!['Pauschal', 'Warmmiete', 'Kalt+NK'].includes(source.mietmodell)) throw new Error('Mietmodell ungueltig.');
    if (!['Index', 'Staffel', 'Normal'].includes(source.erhoehungs_typ)) throw new Error('Erhoehungstyp ungueltig.');
    const cold = this.money(this.number(source.soll_kaltmiete, 'Nettokaltmiete'));
    const costs = this.money(this.number(source.soll_nebenkosten, 'Nebenkosten'));
    const depositSoll = Object.prototype.hasOwnProperty.call(input, 'kaution_soll') ? input.kaution_soll : source.kaution_soll;
    const result = Object.assign({}, source, {
      vertrag_id: String(input.vertrag_id).trim(),
      einheit_id: String(input.einheit_id).trim(),
      hauptperson_id: String(input.hauptperson_id).trim(),
      start_datum: start,
      end_datum: end,
      aktiv: this.isCurrentlyActive({ start_datum: start, end_datum: end, aktiv: true }),
      soll_kaltmiete: cold,
      soll_nebenkosten: costs,
      soll_gesamt: this.money(cold + costs),
      kaution_soll: this.number(this.blank(depositSoll) ? 0 : depositSoll, 'Kaution Soll'),
      // The paid deposit is derived from payment rows, never trusted from the client.
      kaution_ist: 0
    });
    if (Object.prototype.hasOwnProperty.call(input, 'letzte_anpassung') && !this.blank(input.letzte_anpassung)) {
      result.letzte_anpassung = this.iso(this.date(input.letzte_anpassung));
    }
    if (Object.prototype.hasOwnProperty.call(input, 'zahlungsziel_typ') || Object.prototype.hasOwnProperty.call(input, 'zahlungsziel_wert')) {
      const type = this.paymentDeadlineType(source.zahlungsziel_typ);
      result.zahlungsziel_typ = type;
      result.zahlungsziel_wert = this.paymentDeadlineValue(source.zahlungsziel_wert, type);
    }
    ['vertragsdokument_url', 'sondervereinbarungen_url'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(input, key)) result[key] = this.documentUrl(input[key]);
    });
    return result;
  },

  /**
   * Validates historical contract periods per unit without changing data.
   * Overlaps are errors; gaps and mid-month changes are review warnings.
   */
  validateContractPeriods(contracts = []) {
    const errors = [];
    const warnings = [];
    const periods = [];
    const day = 24 * 60 * 60 * 1000;

    if (!Array.isArray(contracts)) {
      return { valid: false, errors: [{ code: 'PERIODS_NOT_ARRAY', message: 'Vertragszeitraeume muessen als Liste uebergeben werden.' }], warnings: [], periods: [] };
    }

    contracts.forEach((contract, index) => {
      if (!contract || this.blank(contract.vertrag_id) || this.blank(contract.einheit_id)) {
        errors.push({ code: 'PERIOD_IDENTITY_MISSING', index, message: 'Vertrag und Einheit muessen fuer eine Zeitraumpruefung eindeutig sein.' });
        return;
      }

      let start;
      let end = '';
      try {
        if (this.blank(contract.start_datum)) {
          // Empty rows represent vacancies, even if the sheet's activation
          // flag is blank or stale. A real active contract without a start
          // date remains a period data error.
          if (this.isVacancyPlaceholder(contract) || !this.isActive(contract.aktiv)) return;
          throw new Error('Startdatum fehlt.');
        }
        start = this.iso(this.date(contract.start_datum));
        if (!this.blank(contract.end_datum)) end = this.iso(this.date(contract.end_datum));
      } catch (error) {
        errors.push({
          code: 'PERIOD_DATE_INVALID', index, vertragId: String(contract.vertrag_id),
          unitId: String(contract.einheit_id), message: String(error.message || error)
        });
        return;
      }

      if (end && end < start) {
        errors.push({
          code: 'PERIOD_END_BEFORE_START', vertragId: String(contract.vertrag_id),
          unitId: String(contract.einheit_id), start, end,
          message: 'Das Vertragsende liegt vor dem Vertragsbeginn.'
        });
        return;
      }

      periods.push({
        vertragId: String(contract.vertrag_id),
        unitId: String(contract.einheit_id),
        start,
        end,
        startTime: this.date(start).getTime(),
        endTime: end ? this.date(end).getTime() : Infinity
      });
    });

    const grouped = periods.reduce((result, period) => {
      if (!result[period.unitId]) result[period.unitId] = [];
      result[period.unitId].push(period);
      return result;
    }, {});

    Object.keys(grouped).forEach(unitId => {
      const unitPeriods = grouped[unitId].sort((a, b) => a.startTime - b.startTime || a.vertragId.localeCompare(b.vertragId));
      let coverageEnd = -Infinity;
      let coveragePeriod = null;
      unitPeriods.forEach((period, index) => {
        if (coveragePeriod && period.startTime <= coverageEnd) {
          errors.push({
            code: 'PERIOD_OVERLAP', unitId, previousVertragId: coveragePeriod.vertragId, vertragId: period.vertragId,
            previousStart: coveragePeriod.start, previousEnd: coveragePeriod.end, start: period.start, end: period.end,
            message: 'Vertragszeiträume derselben Einheit überschneiden sich.'
          });
        } else if (coveragePeriod) {
          const previous = coveragePeriod;
          const gapStart = new Date(previous.endTime + day);
          const gapEnd = new Date(period.startTime - day);
          if (previous.end && gapStart.getTime() <= gapEnd.getTime()) {
            warnings.push({
              code: 'PERIOD_GAP', unitId, previousVertragId: previous.vertragId, vertragId: period.vertragId,
              from: this.iso(gapStart), to: this.iso(gapEnd),
              message: 'Zwischen den Vertragszeiträumen besteht eine Lücke.'
            });
          }

          const previousEnd = this.date(previous.end);
          const currentStart = this.date(period.start);
          if (previous.end && previous.end.slice(0, 7) === period.start.slice(0, 7) &&
              previousEnd.getUTCDate() !== new Date(Date.UTC(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth() + 1, 0)).getUTCDate() &&
              currentStart.getUTCDate() !== 1) {
            warnings.push({
              code: 'MID_MONTH_CHANGE', unitId, previousVertragId: previous.vertragId, vertragId: period.vertragId,
              month: period.start.slice(0, 7), previousEnd: previous.end, start: period.start,
              message: 'Der Mieterwechsel erfolgt innerhalb eines Monats; eine anteilige Sollregel ist erforderlich.'
            });
          }
        }

        if (!coveragePeriod || period.endTime > coverageEnd) {
          coveragePeriod = period;
          coverageEnd = period.endTime;
        }
      });
    });

    return { valid: errors.length === 0, errors, warnings, periods };
  },

  /**
   * Calculates a conservative reminder for the next rent-increase review.
   * This is an internal reminder, not a legal entitlement or an automatic change.
   */
  rentIncreaseReminder(contract, adjustments = [], now = new Date()) {
    const type = String(contract && contract.erhoehungs_typ || '').trim() || 'Normal';
    const today = this.iso(this.date(now));
    const parseDate = value => {
      if (this.blank(value)) return null;
      try { return this.date(value); } catch (error) { return null; }
    };
    const entries = (Array.isArray(adjustments) ? adjustments : [])
      .filter(row => String(row && row.vertrag_id || '') === String(contract && contract.vertrag_id || ''))
      .map(row => {
        let after = {};
        try { after = row && row.nachher_json ? JSON.parse(row.nachher_json) : {}; } catch (error) { after = {}; }
        const effective = parseDate(row && row.wirksam_ab)
          || parseDate(after.letzte_anpassung)
          || parseDate(row && row.erfasst_am);
        return effective ? { date: effective, estimated: !row.wirksam_ab, source: row } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.date.getTime() - right.date.getTime());
    const contractDate = parseDate(contract && contract.letzte_anpassung);
    const historyDate = entries.length ? entries[entries.length - 1] : null;
    const last = contractDate && (!historyDate || contractDate.getTime() >= historyDate.date.getTime())
      ? { date: contractDate, estimated: !historyDate, source: 'Vertrag' }
      : historyDate;
    const start = parseDate(contract && contract.start_datum);
    const base = last ? last.date : start;
    const historyIncomplete = Boolean(contractDate && (!historyDate
      || contractDate.getTime() !== historyDate.date.getTime()));
    const dateLabel = date => date ? this.iso(date) : '';
    const internalReviewDate = date => {
      if (!date) return null;
      const result = new Date(Date.UTC(date.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()));
      return result;
    };
    const indexReviewDate = date => {
      if (!date) return null;
      const anniversary = new Date(Date.UTC(date.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()));
      return new Date(Date.UTC(
        anniversary.getUTCFullYear(),
        anniversary.getUTCMonth() + (anniversary.getUTCDate() === 1 ? 0 : 1),
        1
      ));
    };
    const result = {
      vertragId: String(contract && contract.vertrag_id || ''),
      type,
      typeLabel: type === 'Index' ? 'Indexmiete' : type === 'Staffel' ? 'Staffelmiete' : 'Normale Mieterhöhung',
      lastAdjustment: last ? dateLabel(last.date) : '',
      lastAdjustmentEstimated: Boolean(last && last.estimated),
      historyIncomplete,
      earliestReview: '',
      status: 'NO_ADJUSTMENT',
      statusLabel: 'Keine Anpassung dokumentiert',
      reason: '',
      today
    };

    if (!start) {
      result.status = 'REQUIRED';
      result.statusLabel = 'Prüfung erforderlich';
      result.reason = 'Startdatum fehlt oder ist ungültig.';
      return result;
    }

    if (!base) {
      result.status = 'REQUIRED';
      result.statusLabel = 'Prüfung erforderlich';
      result.reason = 'Startdatum und letzte Anpassung fehlen.';
      return result;
    }

    if (type === 'Staffel') {
      result.status = 'REQUIRED';
      result.statusLabel = 'Prüfung erforderlich';
      result.reason = 'Staffeltermine sind im Vertragsmodell noch nicht hinterlegt.';
      return result;
    }

    if (type === 'Index' && (this.blank(contract.index_basis_monat)
      || this.blank(contract.index_basis_wert)
      || this.blank(contract.index_reihe))) {
      result.status = 'REQUIRED';
      result.statusLabel = 'Prüfung erforderlich';
      result.reason = 'Indexbasis ist unvollständig hinterlegt.';
      return result;
    }

    const earliest = type === 'Index' ? indexReviewDate(base) : internalReviewDate(base);
    result.earliestReview = dateLabel(earliest);
    if (!last) {
      result.status = 'NO_ADJUSTMENT';
      result.statusLabel = 'Keine Anpassung dokumentiert';
    } else if (historyIncomplete) {
      result.status = 'REQUIRED';
      result.statusLabel = 'Prüfung erforderlich';
    } else {
      result.status = result.earliestReview <= today ? 'DUE' : 'PENDING';
      result.statusLabel = result.status === 'DUE' ? 'Prüfung fällig' : 'Noch nicht möglich';
    }
    result.reason = type === 'Index'
      ? 'Früheste interne Prüfung nach der jährlichen Bindungsfrist.'
      : 'Früheste interne Prüfung nach zwölf Monaten unverändertem Soll.';
    if (!last) result.reason = 'Seit Vertragsbeginn ist keine Mieterhöhung dokumentiert.';
    if (historyIncomplete) {
      result.reason += historyDate
        ? ' Anpassungsdatum am Vertrag stimmt nicht mit der letzten Historienzeile überein.'
        : ' Anpassungsdatum am Vertrag vorhanden, aber kein vollständiger Historieneintrag.';
    }
    if (result.lastAdjustmentEstimated) result.reason += ' Das letzte Anpassungsdatum ist geschätzt.';
    return result;
  },

  snapshot(contract) {
    return JSON.stringify(Object.keys(contract).sort().reduce((result, key) => {
      const value = contract[key];
      result[key] = value instanceof Date ? value.toISOString() : (value === undefined ? '' : value);
      return result;
    }, {}));
  },

  preparePatch(current, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Vertragsfelder fehlen.');
    Object.keys(patch).forEach(key => {
      if (!this.editable.includes(key)) throw new Error('Nicht bearbeitbares Feld: ' + key);
    });
    const next = Object.assign({}, current, patch);
    if (!['Pauschal', 'Warmmiete', 'Kalt+NK'].includes(next.mietmodell)) throw new Error('Mietmodell ungueltig.');
    if (!['Index', 'Staffel', 'Normal'].includes(next.erhoehungs_typ)) throw new Error('Erhoehungstyp ungueltig.');
    const result = Object.assign({}, patch);
    ['soll_kaltmiete', 'soll_nebenkosten'].forEach(key => {
      result[key] = this.money(this.number(next[key], key));
    });
    ['nk_betriebskosten', 'nk_heizung_warmwasser', 'index_basis_wert'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(patch, key)) result[key] = this.number(patch[key], key, true);
    });
    ['vertragsdokument_url', 'sondervereinbarungen_url'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(patch, key)) result[key] = this.documentUrl(patch[key]);
    });
    if (Object.prototype.hasOwnProperty.call(patch, 'zahlungsziel_typ') || Object.prototype.hasOwnProperty.call(patch, 'zahlungsziel_wert')) {
      const type = this.paymentDeadlineType(next.zahlungsziel_typ);
      result.zahlungsziel_typ = type;
      result.zahlungsziel_wert = this.paymentDeadlineValue(next.zahlungsziel_wert, type);
    }
    if (patch.index_basis_monat) result.index_basis_monat = this.month(patch.index_basis_monat);
    result.soll_gesamt = this.money(result.soll_kaltmiete + result.soll_nebenkosten);
    // Rent/index changes need the separate documented adjustment flow once a baseline exists.
    if (current.erhoehungs_typ === 'Index' && current.soll_kaltmiete !== '' && current.soll_kaltmiete != null &&
        result.soll_kaltmiete !== Number(current.soll_kaltmiete)) {
      throw new Error('Indexmiete nur ueber dokumentierte Indexanpassung aendern.');
    }
    if (!this.blank(current.index_basis_wert)) {
      // Stored values are protected; empty companion fields (e.g. a missing series) may be completed.
      ['index_basis_wert', 'index_basis_monat', 'index_reihe'].forEach(key => {
        if (key in patch && !this.blank(current[key]) && !this.same(patch[key], current[key])) {
          throw new Error('Bestehende Indexbasis nicht ueber Stammdaten aendern.');
        }
      });
    }
    return result;
  },

  previewIndex(contract, input, unit, now = new Date()) {
    if (contract.erhoehungs_typ !== 'Index') throw new Error('Kein Indexmietvertrag.');
    if (!unit || unit.typ !== 'Wohnung') throw new Error('Indexpruefung ist nur fuer Wohnraum vorbereitet.');
    const base = this.number(contract.index_basis_wert, 'Basisindex');
    const target = this.number(input.index_neu_wert, 'Neuer Index');
    if (base <= 0 || target <= 0) throw new Error('Indexstaende muessen positiv sein.');
    const baseMonth = this.month(contract.index_basis_monat);
    const targetMonth = this.month(input.index_neu_monat);
    if (targetMonth <= baseMonth) throw new Error('Neuer Indexmonat muss nach dem Basismonat liegen.');
    if (!contract.index_reihe || input.index_reihe !== contract.index_reihe) {
      throw new Error('Identische Indexreihe und identisches Basisjahr erforderlich.');
    }
    const today = this.date(now);
    if (targetMonth > this.iso(today).slice(0, 7)) throw new Error('Zukuenftiger Indexmonat unzulaessig.');
    const cold = this.number(contract.soll_kaltmiete, 'Nettokaltmiete');
    const costs = this.number(contract.soll_nebenkosten, 'Nebenkosten');
    const previous = this.date(contract.letzte_anpassung || contract.start_datum);
    const anniversary = new Date(previous.getTime());
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    const firstAnnualMonth = new Date(Date.UTC(anniversary.getUTCFullYear(), anniversary.getUTCMonth() + (anniversary.getUTCDate() === 1 ? 0 : 1), 1));
    const access = input.zugang_datum ? this.date(input.zugang_datum) : null;
    if (access && targetMonth > this.iso(access).slice(0, 7)) {
      throw new Error('Indexmonat liegt nach dem Zugang der Erklaerung.');
    }
    const accessBasis = access || today;
    const afterAccess = new Date(Date.UTC(accessBasis.getUTCFullYear(), accessBasis.getUTCMonth() + 2, 1));
    const earliest = new Date(Math.max(firstAnnualMonth.getTime(), afterAccess.getTime()));
    const newCold = this.money(cold * target / base);
    return {
      prozent: (target / base - 1) * 100, kalt_alt: cold, kalt_neu: newCold,
      differenz: this.money(newCold - cold), nebenkosten: costs,
      gesamt_neu: this.money(newCold + costs), fruehestens_ab: this.iso(earliest),
      zugang_angenommen: !access,
      sperrfrist_bis: this.iso(anniversary), zugang_datum: access ? this.iso(access) : '',
      heute: this.iso(today)
    };
  },

  prepareIndex(contract, input, unit, now = new Date()) {
    const preview = this.previewIndex(contract, input, unit, now);
    if (input.bestaetigt !== true || input.textform_bestaetigt !== true || !input.zugang_datum) {
      throw new Error('Bestaetigung, Textform und Zugang der Erklaerung erforderlich.');
    }
    const url = this.documentUrl(input.erklaerung_url);
    if (!url) throw new Error('Dokumentierte Erklaerung erforderlich.');
    const effective = this.iso(this.date(input.wirksam_ab));
    if (!effective.endsWith('-01') || effective < preview.fruehestens_ab) throw new Error('Wirksamkeitsdatum zu frueh oder kein Monatserster.');
    if (effective > preview.heute || preview.zugang_datum > preview.heute) {
      throw new Error('Zukuenftige Anpassung erst am Wirksamkeitstag uebernehmen.');
    }
    if (contract.end_datum && effective > this.iso(this.date(contract.end_datum))) throw new Error('Anpassung liegt nach Vertragsende.');
    return {
      soll_kaltmiete: preview.kalt_neu, soll_nebenkosten: preview.nebenkosten,
      soll_gesamt: preview.gesamt_neu, letzte_anpassung: effective,
      index_basis_wert: this.number(input.index_neu_wert, 'Neuer Index'),
      index_basis_monat: this.month(input.index_neu_monat), index_reihe: input.index_reihe
    };
  }
};

/** Shared contract rules for browser and Apps Script. No persistence or UI. */
const contractService = {
  fields: ['vertragsdokument_url', 'sondervereinbarungen_url', 'vertrag_hinweis',
    'nk_betriebskosten', 'nk_heizung_warmwasser', 'index_basis_monat', 'index_basis_wert', 'index_reihe'],
  editable: ['mietmodell', 'erhoehungs_typ', 'soll_kaltmiete', 'soll_nebenkosten',
    'vertragsdokument_url', 'sondervereinbarungen_url', 'vertrag_hinweis',
    'nk_betriebskosten', 'nk_heizung_warmwasser', 'index_basis_monat', 'index_basis_wert', 'index_reihe'],
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

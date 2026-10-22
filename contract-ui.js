const contractUiService = {
  selectedId: '',
  busy: false,
  renderVersion: 0,
  indexRequests: {},
  escape(value) { return uiService.escapeHtml(value); },
  current() { return dataService.state.vertraege.find(row => String(row.vertrag_id) === this.selectedId); },
  unit(contract) { return dataService.state.einheiten.find(row => String(row.einheit_id) === String(contract.einheit_id)); },
  field(name) { return document.getElementById('contract-' + name); },
  messageSeq: 0,
  /** Shows a status toast (fixed at the bottom of the screen). kind: info | success | error. */
  message(text, kind = 'info') {
    const element = document.getElementById('contract-message');
    if (!element) return;
    const seq = ++this.messageSeq;
    element.textContent = text;
    element.className = 'contract-status contract-status-' + kind;
    if (element.setAttribute) element.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    // Success and info fade out on their own; errors stay until clicked or replaced.
    if (kind !== 'error' && text) {
      setTimeout(() => {
        const current = document.getElementById('contract-message');
        if (current && this.messageSeq === seq) current.textContent = '';
      }, 6000);
    }
  },

  objectId(contract) {
    const unit = this.unit(contract);
    if (unit) return String(unit.objekt_id);
    const id = String(contract.einheit_id || '');
    const object = (dataService.state.objekte || []).find(row => id.startsWith(String(row.objekt_id) + '_'));
    return object ? String(object.objekt_id) : 'UNZUGEORDNET';
  },

  unitLabel(contract) {
    const unit = this.unit(contract);
    if (unit) return String(unit.nummer || unit.bezeichnung || unit.einheit_id).replace(/^WE\s+0*(\d+)/i, 'Wohnung $1');
    const match = String(contract.einheit_id || '').match(/_WE_0*(\d+)(?:_(\w+))?$/);
    const label = match ? `Wohnung ${match[1]}${match[2] ? ' ' + match[2] : ''}` : contract.einheit_id;
    return `${label} (alte Einheit, Zuordnung fehlt)`;
  },

  tenantLabel(contract) {
    const people = dataService.state.personen || [];
    const name = id => {
      const person = people.find(row => String(row.person_id) === String(id));
      return person ? [person.vorname, person.name].filter(Boolean).join(' ').trim() : '';
    };
    const parties = (dataService.state.vertragsparteien || [])
      .filter(row => String(row.vertrag_id) === String(contract.vertrag_id) && String(row.rolle).toLowerCase() === 'hauptmieter')
      .sort((a, b) => Number(a.ordnet || 0) - Number(b.ordnet || 0))
      .map(row => name(row.person_id)).filter(Boolean);
    return parties.length ? parties.join(' / ') : name(contract.hauptperson_id) || 'Keine Person zugeordnet';
  },

  startLabel(contract) {
    try { return contractService.iso(contractService.date(contract.start_datum)).split('-').reverse().join('.'); }
    catch (error) { return 'Mietbeginn fehlt'; }
  },

  selectObject(id) {
    const contract = dataService.state.vertraege.find(row => row.einheit_id && this.objectId(row) === id);
    this.selectedId = contract ? String(contract.vertrag_id) : '';
    this.render();
  },

  selectUnit(id) {
    const objectId = this.objectId(this.current());
    const contract = dataService.state.vertraege.find(row => this.objectId(row) === objectId && String(row.einheit_id) === id);
    this.selectedId = contract ? String(contract.vertrag_id) : '';
    this.render();
  },

  show() {
    ['object-selector-section', 'unit-list-section', 'consumption-dashboard-section'].forEach(id => {
      document.getElementById(id).style.display = 'none';
    });
    document.getElementById('contracts-section').style.display = 'block';
    uiService.setNavigationState('contracts');
    this.render();
  },

  render() {
    this.renderVersion++;
    const output = document.getElementById('contracts-output');
    const contracts = (dataService.state.vertraege || []).filter(row => row.vertrag_id !== '' && row.vertrag_id != null && row.einheit_id);
    if (!contracts.length) {
      output.innerHTML = '<p>Vertragsdaten noch nicht geladen. Bitte nach dem Laden erneut oeffnen.</p>';
      return;
    }
    const contract = this.current() || contracts.find(row => this.objectId(row) === 'Ra-HS-29') || contracts[0];
    this.selectedId = String(contract.vertrag_id);
    const tenant = this.tenantLabel(contract);
    const objectId = this.objectId(contract);
    const objectIds = [...new Set(contracts.map(row => this.objectId(row)))];
    const objectContracts = contracts.filter(row => this.objectId(row) === objectId);
    const unitIds = [...new Set(objectContracts.map(row => String(row.einheit_id)))];
    const unitContracts = objectContracts.filter(row => String(row.einheit_id) === String(contract.einheit_id));
    const input = (name, label, type = 'text') => `<label>${label}<input id="contract-${name}" type="${type}" ${type === 'number' ? 'step="0.01" min="0"' : ''} value="${this.escape(contract[name] === undefined ? '' : contract[name])}"></label>`;
    const select = (name, label, options) => `<label>${label}<select id="contract-${name}">${[''].concat(options).map(option => `<option value="${this.escape(option)}" ${contract[name] === option ? 'selected' : ''}>${this.escape(option || 'Nicht hinterlegt')}</option>`).join('')}</select></label>`;
    const link = (name, label) => {
      try {
        const url = contractService.documentUrl(contract[name]);
        return url ? `<a href="${this.escape(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
      } catch (error) { return `<span>${label}: ungueltiger Link</span>`; }
    };
    const history = (dataService.state.mietanpassungen || []).filter(row => String(row.vertrag_id) === this.selectedId);
    const schemaReady = contractService.fields.every(field => Object.prototype.hasOwnProperty.call(contract, field));
    const standardSeries = typeof vpiService !== 'undefined' ? vpiService.seriesLabel : 'VPI Deutschland 2020=100';
    this.loadedSnapshot = contractService.snapshot(contract);
    output.innerHTML = `
      <div class="contract-fields">
        <label>Objekt<select id="contract-object-selector" onchange="contractUiService.selectObject(this.value)">${objectIds.map(id => {
          const object = (dataService.state.objekte || []).find(row => String(row.objekt_id) === id);
          const label = id === 'TEST' ? 'TEST · Testdaten' : object && object.bezeichnung || id;
          return `<option value="${this.escape(id)}" ${id === objectId ? 'selected' : ''}>${this.escape(label)}</option>`;
        }).join('')}</select></label>
        <label>Wohnung / Einheit<select id="contract-unit-selector" onchange="contractUiService.selectUnit(this.value)">${unitIds.map(id => {
          const row = objectContracts.find(item => String(item.einheit_id) === id);
          return `<option value="${this.escape(id)}" ${id === String(contract.einheit_id) ? 'selected' : ''}>${this.escape(this.unitLabel(row))}</option>`;
        }).join('')}</select></label>
        <label>Mieter · Vertrag ab<select id="contract-tenancy-selector" onchange="contractUiService.selectedId=this.value; contractUiService.render()">${unitContracts.map(row =>
          `<option value="${this.escape(row.vertrag_id)}" ${String(row.vertrag_id) === this.selectedId ? 'selected' : ''}>${this.escape(this.tenantLabel(row))} · ab ${this.escape(this.startLabel(row))}</option>`
        ).join('')}</select></label>
      </div>
      ${!this.unit(contract) ? '<p role="status">Dieser Vertrag verweist auf eine nicht mehr vorhandene Einheit. Bitte die Zuordnung in den Stammdaten klären.</p>' : ''}
      <p><strong>${this.escape(tenant)}</strong> · ${uiService.isTrueValue(contract.aktiv) ? 'Aktiv' : 'Inaktiv'}</p>
      <div class="contract-documents">${link('vertragsdokument_url', 'Mietvertrag oeffnen')} ${link('sondervereinbarungen_url', 'Sondervereinbarungen oeffnen')}</div>
      ${!schemaReady ? '<p class="contract-notice">Speichern ist noch nicht freigeschaltet: Die Vertrags-Erweiterung muss zuerst im Backend eingerichtet werden. Die Indexvorschau kannst du bereits ausprobieren.</p>' : ''}
      <form id="contract-form" onsubmit="event.preventDefault(); contractUiService.save(false)">
        <div class="contract-fields">
          ${select('mietmodell', 'Mietmodell', ['Pauschal', 'Warmmiete', 'Kalt+NK'])}
          ${select('erhoehungs_typ', 'Erhoehungstyp', ['Normal', 'Staffel', 'Index'])}
          ${input('soll_kaltmiete', 'Nettokaltmiete (EUR)', 'number')}
          ${input('soll_nebenkosten', 'Nebenkosten gesamt (EUR) *', 'number')}
          ${input('nk_betriebskosten', 'Davon Betriebskosten (optional)', 'number')}
          ${input('nk_heizung_warmwasser', 'Davon Heizung / Warmwasser (optional)', 'number')}
          ${input('vertragsdokument_url', 'Mietvertrag (HTTPS-Link)', 'url')}
          ${input('sondervereinbarungen_url', 'Sondervereinbarungen (HTTPS-Link)', 'url')}
          ${input('vertrag_hinweis', 'Vertragliche Besonderheiten')}
        </div>
        <section id="contract-index-agreement" ${contract.erhoehungs_typ !== 'Index' ? 'hidden' : ''}>
          <h3>Indexvereinbarung</h3>
          <p class="contract-field-note">Letzte Anpassung: ${contract.letzte_anpassung ? this.escape(this.startLabel({ start_datum: contract.letzte_anpassung })) : 'Keine dokumentiert'}</p>
          <div class="contract-fields">
            ${input('index_basis_monat', 'Bezugsmonat der bisherigen Miete', 'month')}
            ${input('index_basis_wert', 'Verbraucherpreisindex im Bezugsmonat', 'number')}
            ${select('index_reihe', 'Verbraucherpreisindex / Bezugsbasis', [...new Set([standardSeries, contract.index_reihe].filter(Boolean))])}
          </div>
          <p class="contract-field-note">Deutschland · Gesamtindex · unbereinigt · Basis 2020 = 100. Bei der ersten Anpassung zählt der Monat des Mietbeginns; danach die dokumentierte Indexbasis.</p>
          <button class="contract-button-secondary" type="button" onclick="contractUiService.loadIndexValue('basis', true)">Indexwert abrufen</button>
          <p id="contract-index-basis-source" class="contract-field-note" aria-live="polite"></p>
        </section>
        <p>Gesamtmiete: <strong id="contract-total">${uiService.formatDashboardNumber(contract.soll_gesamt)} EUR</strong><span id="contract-nk-hint"></span></p>
        <details class="contract-access" ${!schemaReady ? 'hidden' : ''}><summary>Administratorzugang</summary>
          <label>Zugangsschlüssel für Vertragsänderungen<input id="contract-token" type="password" autocomplete="off"></label>
          <p class="contract-field-note">Zum Speichern geschützter Vertragsdaten erforderlich. Der Schlüssel wird nicht dauerhaft im Browser gespeichert.</p>
        </details>
        <button class="contract-button-primary" type="submit" ${!schemaReady ? 'disabled aria-describedby="contract-save-reason"' : ''}>Vertragsdaten speichern</button>
        ${!schemaReady ? '<p id="contract-save-reason" class="contract-field-note">Noch nicht eingerichtet – deshalb ist dieser Button deaktiviert.</p>' : ''}
      </form>
      <section id="contract-index-adjustment" class="contract-index" ${contract.erhoehungs_typ !== 'Index' ? 'hidden' : ''}>
        <h3>Indexanpassung</h3>
        <div class="contract-fields">
          <label>Neuer Indexmonat<input id="contract-index_neu_monat" type="month"></label>
          <label>Neuer Indexstand<input id="contract-index_neu_wert" type="number" min="0" step="0.01"></label>
          <label>Zugang der Erklaerung<input id="contract-zugang_datum" type="date"></label>
          <label>Wirksam ab<input id="contract-wirksam_ab" type="date"></label>
          <label>Erklaerung (HTTPS-Link)<input id="contract-erklaerung_url" type="url"></label>
        </div>
        <button class="contract-button-secondary" type="button" onclick="contractUiService.loadIndexValue('neu', true)">Neuen Indexwert abrufen</button>
        <p id="contract-index-neu-source" class="contract-field-note" aria-live="polite"></p>
        <button class="contract-button-primary" type="button" onclick="contractUiService.preview()">Indexvorschau berechnen</button>
        <p id="contract-index-preview" aria-live="polite"></p>
        <label class="contract-checkbox"><input id="contract-textform_bestaetigt" type="checkbox"> Die Erklärung mit Indexänderung und Mietbetrag wurde dem Mieter in Textform zugestellt.</label>
        <label class="contract-checkbox"><input id="contract-bestaetigt" type="checkbox"> Ich bestätige die Übernahme der neuen Miete ab dem angegebenen Wirksamkeitsdatum.</label>
        <p class="contract-field-note">Das Anhaken allein ändert keine Miete. Erst der folgende Button übernimmt und dokumentiert die Anpassung.</p>
        <button class="contract-button-primary" type="button" onclick="contractUiService.save(true)" ${!schemaReady ? 'disabled' : ''}>Dokumentierte Anpassung übernehmen</button>
      </section>
      <p id="contract-message" class="contract-status" role="status" title="Zum Schließen klicken" onclick="this.textContent=''"></p>
      <section><h3>Aenderungsverlauf</h3>${history.length ? history.map(row => {
        let before = {}, after = {};
        try { before = JSON.parse(row.vorher_json); after = JSON.parse(row.nachher_json); } catch (error) { /* Preserve legacy history display. */ }
        return `<details><summary>${this.escape(row.art)} · ${this.escape(row.wirksam_ab || row.erfasst_am)}</summary><p>Nettokaltmiete: ${this.escape(before.soll_kaltmiete)} → ${this.escape(after.soll_kaltmiete)} EUR</p><p>Nebenkosten: ${this.escape(after.soll_nebenkosten)} EUR · Gesamt: ${this.escape(after.soll_gesamt)} EUR</p></details>`;
      }).join('') : '<p>Noch keine dokumentierten Aenderungen.</p>'}</section>`;
    ['soll_kaltmiete', 'soll_nebenkosten', 'nk_betriebskosten', 'nk_heizung_warmwasser'].forEach(name => {
      this.field(name).addEventListener('input', () => this.updateTotals());
    });
    this.updateTotals();
    this.field('erhoehungs_typ').addEventListener('change', () => this.updateIndexVisibility());
    ['basis', 'neu'].forEach(kind => {
      const monthField = kind === 'basis' ? 'index_basis_monat' : 'index_neu_monat';
      const valueField = kind === 'basis' ? 'index_basis_wert' : 'index_neu_wert';
      this.field(monthField).addEventListener('change', () => {
        this.field(valueField).value = '';
        this.loadIndexValue(kind, true);
      });
      this.field(valueField).addEventListener('input', () => {
        this.indexRequests[kind] = (this.indexRequests[kind] || 0) + 1;
        document.getElementById('contract-index-' + kind + '-source').textContent = 'Manuell eingetragener Wert – bitte gegen die Quelle prüfen.';
      });
    });
    if (contract.index_basis_wert !== '' && contract.index_basis_wert != null) {
      this.field('index_basis_monat').readOnly = true;
      this.field('index_basis_wert').readOnly = true;
    }
    if (contract.erhoehungs_typ === 'Index') this.initializeIndexBasis();
  },

  updateIndexVisibility() {
    const hidden = this.field('erhoehungs_typ').value !== 'Index';
    document.getElementById('contract-index-agreement').hidden = hidden;
    document.getElementById('contract-index-adjustment').hidden = hidden;
    if (!hidden) this.initializeIndexBasis();
  },

  initializeIndexBasis() {
    if (typeof vpiService === 'undefined') return;
    if (!this.field('index_reihe').value) this.field('index_reihe').value = vpiService.seriesLabel;
    if (!this.field('index_basis_monat').value && !this.field('index_basis_wert').value && !this.current().letzte_anpassung && this.current().start_datum) {
      try { this.field('index_basis_monat').value = contractService.iso(contractService.date(this.current().start_datum)).slice(0, 7); }
      catch (error) { return; }
    }
    if (!this.field('index_basis_wert').value && this.field('index_basis_monat').value) this.loadIndexValue('basis');
  },

  async loadIndexValue(kind, replace = false) {
    if (typeof vpiService === 'undefined') return;
    const monthField = kind === 'basis' ? 'index_basis_monat' : 'index_neu_monat';
    const valueField = kind === 'basis' ? 'index_basis_wert' : 'index_neu_wert';
    const status = document.getElementById('contract-index-' + kind + '-source');
    const month = this.field(monthField).value;
    const originalValue = this.field(valueField).value;
    const version = this.renderVersion;
    const request = (this.indexRequests[kind] || 0) + 1;
    this.indexRequests[kind] = request;
    if (!month || (!replace && originalValue)) return;
    const stillCurrent = () => this.renderVersion === version && this.indexRequests[kind] === request &&
      this.field(monthField).value === month && this.field(valueField).value === originalValue;
    try {
      if (this.field('index_reihe').value !== vpiService.seriesLabel) throw new Error('Automatischer Abruf ist nur für VPI Deutschland 2020=100 verfügbar.');
      if (kind === 'basis' && this.current().index_basis_wert !== '' && this.current().index_basis_wert != null) {
        throw new Error('Die gespeicherte Indexbasis bleibt erhalten. Eine Änderung benötigt eine dokumentierte Anpassung.');
      }
      status.textContent = 'Offizieller Indexwert wird geladen …';
      const result = await vpiService.load(month);
      if (!stillCurrent()) return;
      this.field(valueField).value = String(result.value);
      status.innerHTML = `Quelle: <a href="${this.escape(result.source)}" target="_blank" rel="noopener noreferrer">Bundesbank · Destatis-Daten · ${this.escape(result.month)}</a>`;
    } catch (error) {
      if (stillCurrent()) status.textContent = error.name === 'AbortError' ? 'Indexabruf hat zu lange gedauert. Bitte erneut versuchen.' : error.message;
    }
  },

  updateTotals() {
    try {
      const cold = contractService.number(this.field('soll_kaltmiete').value, 'Kaltmiete');
      const costs = contractService.number(this.field('soll_nebenkosten').value, 'Nebenkosten');
      document.getElementById('contract-total').textContent = uiService.formatDashboardNumber(contractService.money(cold + costs)) + ' EUR';
      const operating = this.field('nk_betriebskosten').value;
      const heating = this.field('nk_heizung_warmwasser').value;
      document.getElementById('contract-nk-hint').textContent = operating !== '' && heating !== '' &&
        Math.abs(Number(operating) + Number(heating) - costs) > 0.009 ? ' · Aufschluesselung weicht von Nebenkosten gesamt ab.' : '';
    } catch (error) { document.getElementById('contract-total').textContent = 'Unvollstaendig'; }
  },

  indexInput() {
    return ['index_neu_monat', 'index_neu_wert', 'zugang_datum', 'wirksam_ab', 'erklaerung_url'].reduce((input, key) => {
      input[key] = this.field(key).value;
      return input;
    }, { index_reihe: this.current().index_reihe,
      textform_bestaetigt: this.field('textform_bestaetigt').checked, bestaetigt: this.field('bestaetigt').checked });
  },

  preview() {
    try {
      const draft = { ...this.current() };
      ['erhoehungs_typ', 'soll_kaltmiete', 'soll_nebenkosten', 'index_basis_monat', 'index_basis_wert', 'index_reihe'].forEach(key => {
        draft[key] = this.field(key).value;
      });
      const input = { ...this.indexInput(), index_reihe: draft.index_reihe };
      const result = contractService.previewIndex(draft, input, this.unit(this.current()));
      document.getElementById('contract-index-preview').textContent =
        `${uiService.formatDashboardNumber(result.prozent)} % · Nettokaltmiete ${uiService.formatDashboardNumber(result.kalt_neu)} EUR · Gesamt ${uiService.formatDashboardNumber(result.gesamt_neu)} EUR · fruehestens ${result.fruehestens_ab}${result.zugang_angenommen ? ' (bei Zugang heute)' : ''}`;
    } catch (error) { document.getElementById('contract-index-preview').textContent = error.message; }
  },

  async save(isIndex) {
    if (this.busy) return;
    try {
      const current = this.current();
      const data = isIndex ? this.indexInput() : contractService.diff(current, contractService.editable.reduce((values, key) => {
        values[key] = this.field(key).value;
        return values;
      }, {}));
      if (!isIndex && !Object.keys(data).length) { this.message('Keine Änderungen zu speichern.', 'info'); return; }
      if (isIndex) contractService.prepareIndex(current, data, this.unit(current));
      else contractService.preparePatch(current, data);
      const token = this.field('token').value;
      if (!token) throw new Error('Schreibfreigabe fehlt.');
      this.busy = true;
      this.message('Wird gespeichert ...', 'info');
      const result = await cloudService.saveContract({ typ: isIndex ? 'INDEX_ANWENDEN' : 'VERTRAG_AKTUALISIEREN',
        vertrag_id: current.vertrag_id, erwarteter_stand: this.loadedSnapshot, data, token });
      const index = dataService.state.vertraege.findIndex(row => String(row.vertrag_id) === String(current.vertrag_id));
      dataService.state.vertraege[index] = result.vertrag;
      dataService.state.view_aktive_mieter.forEach(row => {
        if (String(row.vertrag_id) === String(current.vertrag_id)) row.soll_gesamt = result.vertrag.soll_gesamt;
      });
      dataService.state.mietanpassungen.push(result.anpassung);
      this.render();
      this.message(result.view_warning ? '✓ Gespeichert. Mieteransicht konnte noch nicht aktualisiert werden.' : '✓ Gespeichert und im Verlauf dokumentiert.', 'success');
    } catch (error) { this.message(error.message, 'error'); }
    finally { this.busy = false; }
  }
};

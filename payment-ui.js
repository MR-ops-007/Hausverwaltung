/**
 * PAYMENT-UI
 * Manuelle Mieteingänge und CSV-Vorschläge.
 *
 * Die fachliche Wahrheit für Mietverträge und Zahlungen bleibt im Backend.
 * Dieses Modul berechnet nur die Anzeige und sendet bestätigte append-only
 * Zahlungsbuchungen über den bestehenden ZAHLUNG-Schreibweg.
 */
const paymentUiService = {
  selectedObject: '',
  selectedYear: '',
  busy: false,
  importRows: [],
  GRACE_DAYS: 7,
  MONTH_NAMES: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],

  escape(value) {
    if (typeof uiService !== 'undefined' && typeof uiService.escapeHtml === 'function') {
      return uiService.escapeHtml(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value).trim().replace(/\s/g, '');
    if (!text) return null;
    const normalized = text.includes(',')
      ? text.replace(/\./g, '').replace(',', '.')
      : text;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  },

  parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const text = String(value).trim();
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
    match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0));
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },

  monthKey(value) {
    const date = this.parseDate(value);
    if (!date) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  },

  todayInput(now = new Date()) {
    const date = this.parseDate(now) || new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  isActive(value) {
    return !([false, 0, '0', 'false', 'FALSE', 'nein', 'NEIN', 'falsch', 'FALSCH'].includes(value));
  },

  objectId(contract) {
    const unit = (dataService.state.einheiten || []).find(row => String(row.einheit_id) === String(contract.einheit_id));
    if (unit && unit.objekt_id) return String(unit.objekt_id);
    const unitId = String(contract.einheit_id || '');
    const object = (dataService.state.objekte || []).find(row => unitId.startsWith(String(row.objekt_id) + '_'));
    return object ? String(object.objekt_id) : '';
  },

  tenantName(contract) {
    const people = dataService.state.personen || [];
    const personName = id => {
      const person = people.find(row => String(row.person_id) === String(id));
      return person ? [person.vorname, person.name].filter(Boolean).join(' ').trim() : '';
    };
    const parties = (dataService.state.vertragsparteien || [])
      .filter(row => String(row.vertrag_id) === String(contract.vertrag_id))
      .filter(row => String(row.rolle || '').toLowerCase() === 'hauptmieter')
      .sort((a, b) => Number(a.ordnet || 0) - Number(b.ordnet || 0))
      .map(row => personName(row.person_id))
      .filter(Boolean);
    return parties.join(' / ') || personName(contract.hauptperson_id) || 'Leerstand';
  },

  unitName(contract) {
    const unit = (dataService.state.einheiten || []).find(row => String(row.einheit_id) === String(contract.einheit_id));
    return unit ? (unit.nummer || unit.bezeichnung || unit.einheit_id) : (contract.einheit_id || 'Einheit unbekannt');
  },

  objectName(objectId) {
    const object = (dataService.state.objekte || []).find(row => String(row.objekt_id) === String(objectId));
    return object ? (object.bezeichnung || object.objekt_id) : objectId;
  },

  getContracts(objectId = '') {
    return (dataService.state.vertraege || [])
      .filter(contract => contract.vertrag_id !== '' && contract.vertrag_id !== null && contract.einheit_id)
      .filter(contract => this.isActive(contract.aktiv))
      .filter(contract => !objectId || this.objectId(contract) === String(objectId))
      .sort((a, b) => this.unitName(a).localeCompare(this.unitName(b), 'de'));
  },

  getPaymentMonth(payment) {
    return this.monthKey(payment.datum || payment.buchungsdatum || payment.zahlungsdatum);
  },

  getPaymentsFor(contractId, month) {
    return (dataService.state.zahlungen || [])
      .filter(payment => String(payment.vertrag_id) === String(contractId) && this.getPaymentMonth(payment) === month);
  },

  monthlyDue(contract) {
    const total = this.parseNumber(contract.soll_gesamt);
    if (total !== null) return total;
    return (this.parseNumber(contract.soll_kaltmiete) || 0) + (this.parseNumber(contract.soll_nebenkosten) || 0);
  },

  summarizeMonth(contract, month, now = new Date()) {
    const payments = this.getPaymentsFor(contract.vertrag_id, month);
    const paid = payments.reduce((sum, payment) => sum + (this.parseNumber(payment.betrag) || 0), 0);
    const due = this.monthlyDue(contract);
    const [year, monthNumber] = month.split('-').map(Number);
    const dueDate = new Date(year, monthNumber - 1, 1 + this.GRACE_DAYS);
    const current = this.parseDate(now) || new Date();
    let status = 'offen';
    if (paid >= due - 0.009) status = 'bezahlt';
    else if (paid > 0) status = 'teilbezahlt';
    else if (current > dueDate) status = 'überfällig';
    else if (dueDate > current) status = 'zukünftig';
    return { month, paid, due, remaining: Math.max(due - paid, 0), status, payments };
  },

  buildMatrix({ contracts = [], payments = [], year, now = new Date() } = {}) {
    const previous = dataService.state.zahlungen;
    dataService.state.zahlungen = payments;
    try {
      return contracts.map(contract => ({
        contract,
        objectId: this.objectId(contract),
        tenant: this.tenantName(contract),
        unit: this.unitName(contract),
        due: this.monthlyDue(contract),
        months: Array.from({ length: 12 }, (_, index) => this.summarizeMonth(contract, `${year}-${String(index + 1).padStart(2, '0')}`, now))
      }));
    } finally {
      dataService.state.zahlungen = previous;
    }
  },

  formatMoney(value) {
    const number = this.parseNumber(value);
    return number === null ? '-' : number.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  statusLabel(status) {
    return { bezahlt: 'Bezahlt', teilbezahlt: 'Teilbezahlt', offen: 'Offen', überfällig: 'Überfällig', zukünftig: 'Zukünftig' }[status] || status;
  },

  statusClass(status) {
    return `payment-status-${status.replace('ä', 'ae').replace('ü', 'ue')}`;
  },

  getYears() {
    const years = new Set([String(new Date().getFullYear())]);
    (dataService.state.vertraege || []).forEach(contract => {
      [contract.start_datum, contract.end_datum].forEach(value => {
        const date = this.parseDate(value);
        if (date) years.add(String(date.getFullYear()));
      });
    });
    (dataService.state.zahlungen || []).forEach(payment => {
      const date = this.parseDate(payment.datum);
      if (date) years.add(String(date.getFullYear()));
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  },

  show() {
    ['object-selector-section', 'unit-list-section', 'consumption-dashboard-section', 'contracts-section'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.style.display = 'none';
    });
    const section = document.getElementById('payments-section');
    if (section) section.style.display = 'block';
    if (typeof uiService !== 'undefined' && typeof uiService.setNavigationState === 'function') uiService.setNavigationState('payments');
    this.render();
  },

  render() {
    const output = document.getElementById('payments-output');
    if (!output) return;
    const years = this.getYears();
    if (!this.selectedYear || !years.includes(String(this.selectedYear))) this.selectedYear = years[0];
    const objectIds = Array.from(new Set(this.getContracts().map(contract => this.objectId(contract))));
    if (!this.selectedObject || !objectIds.includes(this.selectedObject)) this.selectedObject = objectIds[0] || '';
    const contracts = this.getContracts(this.selectedObject);
    const matrix = this.buildMatrix({ contracts, payments: dataService.state.zahlungen || [], year: this.selectedYear });
    const monthHeaders = this.MONTH_NAMES.map((name, index) => `<th scope="col">${name}<span class="payment-month-number">${index + 1}</span></th>`).join('');
    const rows = matrix.map(item => `
      <tr>
        <th scope="row" class="payment-tenant-cell"><strong>${this.escape(item.unit)}</strong><span>${this.escape(item.tenant)}</span><small>${this.formatMoney(item.due)} EUR / Monat</small></th>
        ${item.months.map(month => `<td><button class="payment-cell ${this.statusClass(month.status)}" type="button" onclick="paymentUiService.openPaymentDialog('${this.escape(item.contract.vertrag_id)}','${month.month}')" title="${this.escape(this.statusLabel(month.status))}"><strong>${this.escape(this.statusLabel(month.status))}</strong><span>${this.formatMoney(month.paid)} / ${this.formatMoney(month.due)} EUR</span></button></td>`).join('')}
      </tr>`).join('');
    output.innerHTML = `
      <div class="payment-page-heading"><div><h2>Mieteingänge</h2><p>Monatliche Zahlungseingänge je aktivem Mietvertrag</p></div></div>
      <div class="payments-toolbar">
        <label>Objekt<select id="payment-object-select" onchange="paymentUiService.selectedObject=this.value; paymentUiService.render()"><option value="">Alle Objekte</option>${objectIds.map(id => `<option value="${this.escape(id)}" ${id === this.selectedObject ? 'selected' : ''}>${this.escape(this.objectName(id))}</option>`).join('')}</select></label>
        <label>Jahr<select id="payment-year-select" onchange="paymentUiService.selectedYear=this.value; paymentUiService.render()">${years.map(year => `<option value="${year}" ${year === String(this.selectedYear) ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
      </div>
      <p class="payment-help"><strong>Monatsübersicht:</strong> Ein Klick auf einen Monat öffnet die Erfassung. Teilzahlungen werden mitgerechnet; eine rote Markierung bedeutet überfällig, nicht automatisch falsch.</p>
      <div class="payment-legend"><span class="payment-status-bezahlt">Bezahlt</span><span class="payment-status-teilbezahlt">Teilbezahlt</span><span class="payment-status-offen">Offen</span><span class="payment-status-ueberfaellig">Überfällig</span><span class="payment-status-zukuenftig">Zukünftig</span></div>
      ${matrix.length ? `<div class="payment-table-wrap"><table class="payment-table"><thead><tr><th scope="col">Mieter / Einheit</th>${monthHeaders}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="payment-empty">Keine aktiven Verträge für diese Auswahl vorhanden.</p>'}
      <section class="payment-import-section"><div class="payment-section-heading"><div><h3>Kontoauszug als CSV</h3><p>Die Datei wird lokal gelesen. Buchungen werden erst nach deiner Zuordnung gespeichert.</p></div><label class="payment-file-button">CSV auswählen<input type="file" accept=".csv,text/csv,text/plain" onchange="paymentUiService.handleImportFile(this.files && this.files[0])"></label></div><div id="payment-import-output"></div></section>`;
  },

  openPaymentDialog(contractId, month) {
    const contract = (dataService.state.vertraege || []).find(row => String(row.vertrag_id) === String(contractId));
    if (!contract) return;
    const summary = this.summarizeMonth(contract, month);
    const remaining = summary.remaining;
    const modal = document.getElementById('modal-container');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    body.innerHTML = `<div class="payment-dialog"><div class="payment-dialog-heading"><div><h2>Mieteingang erfassen</h2><p>${this.escape(this.unitName(contract))} · ${this.escape(this.tenantName(contract))}</p></div><button type="button" class="payment-dialog-close" onclick="uiService.closeModal()" aria-label="Schließen">×</button></div><p class="payment-dialog-context"><strong>${this.escape(month)}</strong> · Soll ${this.formatMoney(summary.due)} EUR · bisher ${this.formatMoney(summary.paid)} EUR</p><form onsubmit="event.preventDefault(); paymentUiService.savePayment('${this.escape(contractId)}','${month}')"><label>Betrag (EUR)<input id="payment-amount" type="number" min="0" step="0.01" value="${this.escape(remaining.toFixed(2))}" required></label><label>Eingangsdatum<input id="payment-date" type="date" value="${this.todayInput()}" required></label><label>Art<select id="payment-art"><option value="Miete">Miete</option><option value="Kaution">Kaution</option><option value="Nachzahlung">Nachzahlung</option><option value="Erstattung">Erstattung</option></select></label><div class="payment-dialog-actions"><button class="btn-primary" type="submit">Zahlung speichern</button><button class="btn-secondary" type="button" onclick="uiService.closeModal()">Abbrechen</button></div></form>${summary.payments.length ? `<div class="payment-history"><h3>Bereits erfasst</h3>${summary.payments.map(payment => `<div><span>${this.escape(payment.datum || '')} · ${this.formatMoney(payment.betrag)} EUR · ${this.escape(payment.art || 'Zahlung')}</span><button class="btn-link-danger" type="button" onclick="paymentUiService.saveStorno('${this.escape(contractId)}','${month}','${this.escape(payment.zahlung_id)}',${this.parseNumber(payment.betrag) || 0})">Rückgängig</button></div>`).join('')}</div>` : ''}</div>`;
    modal.style.display = 'flex';
  },

  makePaymentId(contractId, month, suffix = '') {
    return `Miete_${contractId}_${month}${suffix ? '_' + suffix : ''}`;
  },

  makeStornoId(paymentId) {
    return `Storno_${paymentId}_${Date.now()}`;
  },

  async savePayment(contractId, month) {
    const amount = this.parseNumber(document.getElementById('payment-amount')?.value);
    const date = document.getElementById('payment-date')?.value || this.todayInput();
    const art = document.getElementById('payment-art')?.value || 'Miete';
    if (amount === null || amount <= 0) return this.showMessage('Bitte einen Betrag größer als 0 eingeben.', 'error');
    const contract = (dataService.state.vertraege || []).find(row => String(row.vertrag_id) === String(contractId));
    const remaining = contract ? this.summarizeMonth(contract, month).remaining : amount;
    const suffix = amount >= remaining - 0.009 ? 'voll' : `teil_${this.hash(`${date}|${amount}`)}`;
    const id = this.makePaymentId(contractId, month, suffix);
    await this.persistPayment({ zahlung_id: id, vertrag_id: contractId, datum: date, betrag: amount, art });
  },

  async saveStorno(contractId, month, paymentId, amount) {
    if (!confirm(`Zahlung ${this.formatMoney(amount)} EUR wirklich stornieren? Es wird eine Gegenbuchung angelegt.`)) return;
    await this.persistPayment({ zahlung_id: this.makeStornoId(paymentId), vertrag_id: contractId, datum: this.todayInput(), betrag: -Math.abs(amount), art: 'Storno' });
  },

  async persistPayment(payment) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const result = await cloudService.saveTransaction({ typ: 'ZAHLUNG', data: [payment] });
      if (!result || result.status !== 'success') throw new Error(result && result.message || 'Zahlung wurde nicht bestätigt.');
      if (result.queued === true) {
        if (typeof uiService !== 'undefined' && typeof uiService.closeModal === 'function') uiService.closeModal();
        this.render();
        this.showMessage('Zahlung vorgemerkt. Sie wird übertragen, sobald die Verbindung wieder verfügbar ist.', 'info');
        return result;
      }
      const existing = dataService.state.zahlungen || (dataService.state.zahlungen = []);
      if (!existing.some(row => String(row.zahlung_id) === String(payment.zahlung_id))) existing.push(payment);
      if (typeof uiService !== 'undefined' && typeof uiService.closeModal === 'function') uiService.closeModal();
      this.render();
      this.showMessage(result.bereits_vorhanden ? 'Diese Zahlung war bereits gespeichert.' : 'Zahlung gespeichert.', 'success');
      return result;
    } catch (error) {
      this.showMessage(error.message || String(error), 'error');
      return null;
    } finally {
      this.busy = false;
    }
  },

  showMessage(message, kind = 'info') {
    const output = document.getElementById('payment-import-output');
    if (output) output.innerHTML = `<p class="payment-message payment-message-${kind}" role="status">${this.escape(message)}</p>`;
  },

  parseCsv(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const delimiter = (source.split(/\r?\n/, 1)[0].match(/;/g) || []).length > (source.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (char === '"' && quoted && source[index + 1] === '"') { cell += '"'; index++; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (!quoted && char === delimiter) { row.push(cell.trim()); cell = ''; continue; }
      if (!quoted && (char === '\n' || char === '\r')) {
        if (char === '\r' && source[index + 1] === '\n') index++;
        row.push(cell.trim()); cell = '';
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
        continue;
      }
      cell += char;
    }
    if (cell || row.length) { row.push(cell.trim()); if (row.some(value => value !== '')) rows.push(row); }
    if (rows.length < 2) return [];
    const headers = rows.shift().map(value => String(value).toLowerCase().replace(/[^a-z0-9äöüß]/g, ''));
    const find = names => headers.findIndex(header => names.some(name => header.includes(name)));
    const dateIndex = find(['datum', 'buchungstag', 'valuta', 'date']);
    const amountIndex = find(['betrag', 'umsatz', 'amount']);
    const textIndex = find(['verwendungszweck', 'zweck', 'buchungstext', 'text', 'purpose']);
    const nameIndex = find(['name', 'auftraggeber', 'absender', 'payer']);
    return rows.map(values => ({
      raw: values,
      datum: dateIndex >= 0 ? values[dateIndex] : '',
      betrag: amountIndex >= 0 ? this.parseNumber(values[amountIndex]) : null,
      verwendungszweck: textIndex >= 0 ? values[textIndex] : '',
      name: nameIndex >= 0 ? values[nameIndex] : '',
      vertrag_id: '',
      matchReason: ''
    })).filter(row => row.datum && row.betrag !== null && row.betrag > 0);
  },

  suggestImportRows(rows, contracts = this.getContracts()) {
    return (rows || []).map(row => {
      const haystack = `${row.name} ${row.verwendungszweck}`.toLowerCase();
      const scored = contracts.map(contract => {
        const tenant = this.tenantName(contract).toLowerCase();
        const parts = tenant.split(/\s+\/\s+|\s+/).filter(part => part.length >= 3);
        let score = 0;
        if (haystack.includes(String(contract.vertrag_id).toLowerCase())) score += 5;
        if (tenant !== 'leerstand' && parts.every(part => haystack.includes(part))) score += 4;
        if (Math.abs((this.parseNumber(row.betrag) || 0) - this.monthlyDue(contract)) < 0.01) score += 2;
        return { contract, score };
      }).sort((a, b) => b.score - a.score);
      const best = scored[0];
      return { ...row, vertrag_id: best && best.score >= 2 ? String(best.contract.vertrag_id) : '', matchReason: best && best.score >= 2 ? `Vorschlag: ${this.tenantName(best.contract)} (${best.score} Punkte)` : 'Keine eindeutige Zuordnung' };
    });
  },

  async handleImportFile(file) {
    if (!file) return;
    try {
      const rows = this.suggestImportRows(this.parseCsv(await file.text()));
      this.importRows = rows;
      this.renderImportRows();
    } catch (error) {
      this.showMessage(`CSV konnte nicht gelesen werden: ${error.message || error}`, 'error');
    }
  },

  renderImportRows() {
    const output = document.getElementById('payment-import-output');
    if (!output) return;
    const contracts = this.getContracts();
    if (!this.importRows.length) { output.innerHTML = '<p class="payment-message payment-message-info">Keine verwertbaren CSV-Zeilen gefunden.</p>'; return; }
    output.innerHTML = `<div class="payment-import-actions"><strong>${this.importRows.length} Buchungen gefunden</strong><span>Bitte Vorschläge prüfen und einzeln übernehmen.</span></div><div class="payment-import-list">${this.importRows.map((row, index) => `<div class="payment-import-row"><div><strong>${this.escape(row.datum)} · ${this.formatMoney(row.betrag)} EUR</strong><span>${this.escape(row.name || row.verwendungszweck || 'Ohne Buchungstext')}</span><small>${this.escape(row.matchReason)}</small></div><select onchange="paymentUiService.importRows[${index}].vertrag_id=this.value; paymentUiService.importRows[${index}].matchReason=this.value ? 'Manuell zugeordnet' : 'Keine Zuordnung'; paymentUiService.renderImportRows()"><option value="">Nicht zugeordnet</option>${contracts.map(contract => `<option value="${this.escape(contract.vertrag_id)}" ${String(contract.vertrag_id) === String(row.vertrag_id) ? 'selected' : ''}>${this.escape(this.unitName(contract))} · ${this.escape(this.tenantName(contract))}</option>`).join('')}</select><button class="btn-primary" type="button" ${row.vertrag_id ? '' : 'disabled'} onclick="paymentUiService.importPayment(${index})">Übernehmen</button></div>`).join('')}</div>`;
  },

  async importPayment(index) {
    const row = this.importRows[index];
    if (!row || !row.vertrag_id) return;
    const month = this.monthKey(row.datum);
    const key = `${row.datum}|${row.betrag}|${row.name}|${row.verwendungszweck}|${row.vertrag_id}`;
    const id = `Import_${this.hash(key)}`;
    const result = await this.persistPayment({ zahlung_id: id, vertrag_id: row.vertrag_id, datum: row.datum, betrag: row.betrag, art: 'Miete' });
    if (result && result.queued !== true) {
      this.importRows.splice(index, 1);
      this.renderImportRows();
      if (month) this.render();
    } else if (result && result.queued === true) {
      this.showMessage('Buchung vorgemerkt. Sie bleibt in der Importliste, bis die Übertragung bestätigt ist.', 'info');
    }
  },

  hash(value) {
    let hash = 2166136261;
    for (let index = 0; index < String(value).length; index++) {
      hash ^= String(value).charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
};

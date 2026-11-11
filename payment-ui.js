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
    return String(payment.mietmonat || '').trim() || this.monthKey(payment.datum || payment.buchungsdatum || payment.zahlungsdatum);
  },

  paymentArt(payment) {
    return String(payment && payment.art || 'Miete').trim().toLowerCase();
  },

  isDepositPayment(payment) {
    const art = this.paymentArt(payment);
    return art === 'kaution' || (art === 'storno' && String(payment.gegen_art || '').trim().toLowerCase() === 'kaution');
  },

  isRentPayment(payment) {
    return !this.isDepositPayment(payment);
  },

  getPaymentsFor(contractId, month) {
    return (dataService.state.zahlungen || [])
      .filter(payment => String(payment.vertrag_id) === String(contractId)
        && this.isRentPayment(payment)
        && this.getPaymentMonth(payment) === month);
  },

  getDepositPayments(contractId) {
    return (dataService.state.zahlungen || [])
      .filter(payment => String(payment.vertrag_id) === String(contractId) && this.isDepositPayment(payment));
  },

  monthlyDue(contract) {
    const total = this.parseNumber(contract.soll_gesamt);
    if (total !== null) return total;
    return (this.parseNumber(contract.soll_kaltmiete) || 0) + (this.parseNumber(contract.soll_nebenkosten) || 0);
  },

  depositDue(contract) {
    return this.parseNumber(contract.kaution_soll) || 0;
  },

  summarizeDeposit(contract) {
    const payments = this.getDepositPayments(contract.vertrag_id);
    const paid = payments.reduce((sum, payment) => sum + (this.parseNumber(payment.betrag) || 0), 0);
    const due = this.depositDue(contract);
    const remaining = Math.max(due - paid, 0);
    const status = due <= 0 ? 'nicht_vereinbart' : paid >= due - 0.009 ? 'vollständig' : paid > 0 ? 'teilweise' : 'offen';
    return { due, paid, remaining, status, payments };
  },

  settledDate(payments, due) {
    if (due <= 0) return null;
    let total = 0;
    return payments
      .filter(payment => (this.parseNumber(payment.betrag) || 0) > 0 && this.parseDate(payment.datum))
      .sort((a, b) => this.parseDate(a.datum) - this.parseDate(b.datum))
      .find(payment => {
        total += this.parseNumber(payment.betrag) || 0;
        return total >= due - 0.009;
      })?.datum || null;
  },

  summarizeMonth(contract, month, now = new Date()) {
    const payments = this.getPaymentsFor(contract.vertrag_id, month);
    const paid = payments.reduce((sum, payment) => sum + (this.parseNumber(payment.betrag) || 0), 0);
    const due = this.monthlyDue(contract);
    const [year, monthNumber] = month.split('-').map(Number);
    const dueDate = new Date(year, monthNumber - 1, 1 + this.GRACE_DAYS);
    const current = this.parseDate(now) || new Date();
    const settled = this.settledDate(payments, due);
    let status = due <= 0 ? 'leerstand' : 'offen';
    if (due > 0) {
      if (paid >= due - 0.009) status = 'bezahlt';
      else if (paid > 0) status = 'teilbezahlt';
      else if (current > dueDate) status = 'überfällig';
      else if (dueDate > current) status = 'zukünftig';
    }
    const settledLate = settled && this.parseDate(settled) > dueDate;
    const stillOpenLate = current > dueDate && ['offen', 'teilbezahlt', 'überfällig'].includes(status);
    const verspaetet = due > 0 && (settledLate || stillOpenLate);
    return {
      month,
      paid,
      due,
      remaining: Math.max(due - paid, 0),
      credit: Math.max(paid - due, 0),
      status,
      verspaetet,
      settledDate: settled,
      payments
    };
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
        deposit: this.summarizeDeposit(contract),
        months: Array.from({ length: 12 }, (_, index) => this.summarizeMonth(contract, `${year}-${String(index + 1).padStart(2, '0')}`, now))
      }));
    } finally {
      dataService.state.zahlungen = previous;
    }
  },

  summarizeOverview(matrix, year, now = new Date()) {
    const current = this.parseDate(now) || new Date();
    const currentMonth = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    const visibleMonths = matrix.flatMap(item => item.months)
      .filter(month => String(year) < String(current.getFullYear()) || month.month <= currentMonth);
    const openAmount = visibleMonths.reduce((sum, month) => sum + month.remaining, 0);
    const creditAmount = visibleMonths.reduce((sum, month) => sum + month.credit, 0);
    const overdueMonths = visibleMonths.filter(month => month.status === 'überfällig').length;
    const lateMonths = visibleMonths.filter(month => month.verspaetet).length;
    const repeatedDelay = matrix.filter(item => item.months.filter(month => month.verspaetet).length >= 2).length;
    const depositDue = matrix.reduce((sum, item) => sum + item.deposit.due, 0);
    const depositPaid = matrix.reduce((sum, item) => sum + item.deposit.paid, 0);
    return {
      contractCount: matrix.length,
      openAmount,
      creditAmount,
      overdueMonths,
      lateMonths,
      repeatedDelay,
      depositDue,
      depositPaid,
      depositRemaining: Math.max(depositDue - depositPaid, 0)
    };
  },

  formatMoney(value) {
    const number = this.parseNumber(value);
    return number === null ? '-' : number.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  depositStatusHtml(deposit) {
    if (deposit.status === 'vollständig') {
      return '<span class="payment-deposit-summary payment-deposit-vollstaendig" title="Die vereinbarte Kaution ist vollständig eingegangen">✓ Kaution vollständig hinterlegt: ' + this.formatMoney(deposit.paid) + ' EUR</span>';
    }
    if (deposit.status === 'nicht_vereinbart') {
      return '<span class="payment-deposit-summary payment-deposit-nicht_vereinbart" title="Für diesen Vertrag ist keine Kaution hinterlegt">Keine Kaution vereinbart</span>';
    }
    return '<span class="payment-deposit-summary payment-deposit-' + deposit.status + '" title="Die Kaution ist noch nicht vollständig eingegangen">Kaution: ' + this.formatMoney(deposit.paid) + ' / ' + this.formatMoney(deposit.due) + ' EUR · ' + this.formatMoney(deposit.remaining) + ' EUR offen</span>';
  },

  statusLabel(status) {
    return { bezahlt: 'Bezahlt', teilbezahlt: 'Teilbezahlt', offen: 'Offen', überfällig: 'Überfällig', zukünftig: 'Zukünftig', leerstand: 'Leerstand' }[status] || status;
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
      const paymentDate = this.parseDate(payment.datum);
      const month = String(payment.mietmonat || '').trim();
      if (month) years.add(month.slice(0, 4));
      else if (paymentDate) years.add(String(paymentDate.getFullYear()));
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
    const overview = this.summarizeOverview(matrix, this.selectedYear);
    const contractSummary = matrix.map(item => '<div class="payment-contract-summary-item"><strong>' + this.escape(item.unit) + ' · ' + this.escape(item.tenant) + '</strong><span>' + this.formatMoney(item.due) + ' EUR / Monat</span>' + this.depositStatusHtml(item.deposit) + '</div>').join('');
    const monthHeaders = this.MONTH_NAMES.map((name, index) => `<th scope="col">${name}<span class="payment-month-number">${index + 1}</span></th>`).join('');
    const rows = matrix.map(item => `
      <tr>
        <th scope="row" class="payment-tenant-cell"><strong>${this.escape(item.unit)}</strong><span>${this.escape(item.tenant)}</span><small>${this.formatMoney(item.due)} EUR / Monat</small><span class="payment-deposit payment-deposit-${item.deposit.status}">Kaution: ${this.formatMoney(item.deposit.paid)} / ${this.formatMoney(item.deposit.due)} EUR</span><button class="payment-deposit-action" type="button" onclick="paymentUiService.openPaymentDialog('${this.escape(item.contract.vertrag_id)}','','Kaution')">Kaution erfassen</button></th>
        ${item.months.map(month => `<td><button class="payment-cell ${this.statusClass(month.status)}${month.verspaetet ? ' payment-cell-late' : ''}" type="button" onclick="paymentUiService.openPaymentDialog('${this.escape(item.contract.vertrag_id)}','${month.month}')" title="${this.escape(this.statusLabel(month.status) + (month.verspaetet ? ' · verspätet beglichen oder überfällig' : ''))}"><strong>${this.escape(this.statusLabel(month.status))}${month.verspaetet ? '<small>verspätet</small>' : ''}</strong><span>${this.formatMoney(month.paid)} / ${this.formatMoney(month.due)} EUR</span></button></td>`).join('')}
      </tr>`).join('');
    output.innerHTML = `
      <div class="payment-page-heading"><div><h2>Mieteingänge</h2><p>Monatliche Zahlungseingänge je aktivem Mietvertrag</p></div></div>
      <div class="payments-toolbar">
        <label>Objekt<select id="payment-object-select" onchange="paymentUiService.selectedObject=this.value; paymentUiService.render()"><option value="">Alle Objekte</option>${objectIds.map(id => `<option value="${this.escape(id)}" ${id === this.selectedObject ? 'selected' : ''}>${this.escape(this.objectName(id))}</option>`).join('')}</select></label>
        <label>Jahr<select id="payment-year-select" onchange="paymentUiService.selectedYear=this.value; paymentUiService.render()">${years.map(year => `<option value="${year}" ${year === String(this.selectedYear) ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
      </div>
      <div class="payment-overview" aria-label="Zusammenfassung der Mieteingänge"><div><strong>Offene Miete</strong><b>${this.formatMoney(overview.openAmount)} EUR</b><small>bis zum aktuellen Monat</small></div><div><strong>Überfällige Monate</strong><b>${overview.overdueMonths}</b><small>${overview.lateMonths} verspätete oder offene Monate</small></div><div><strong>Wiederholte Verspätungen</strong><b>${overview.repeatedDelay}</b><small>Verträge mit mindestens 2 Hinweisen</small></div><div><strong>Guthaben / Überzahlungen</strong><b>${this.formatMoney(overview.creditAmount)} EUR</b><small>positiver Saldo aus Monatsbuchungen</small></div><div><strong>Kaution</strong><b>${this.formatMoney(overview.depositPaid)} / ${this.formatMoney(overview.depositDue)} EUR</b><small>${this.formatMoney(overview.depositRemaining)} EUR offen</small></div></div>
      <p class="payment-help"><strong>So wird zugeordnet:</strong> Das Eingangsdatum dokumentiert, wann das Geld eingegangen ist. Der ausgewählte Mietmonat bestimmt, für welchen Monat es zählt. Deshalb kann eine Zahlung vom 11.11.2026 den Februar vollständig oder teilweise ausgleichen. Wird der Monatsbetrag erreicht, wird der Monat grün; eine verspätete Zahlung bleibt zusätzlich markiert.</p>
      <div class="payment-legend"><span class="payment-status-bezahlt">Bezahlt</span><span class="payment-status-teilbezahlt">Teilbezahlt</span><span class="payment-status-offen">Offen</span><span class="payment-status-ueberfaellig">Überfällig</span><span class="payment-status-zukuenftig">Zukünftig</span><span class="payment-status-leerstand">Leerstand</span></div>
      ${matrix.length ? `<div class="payment-table-wrap"><table class="payment-table"><thead><tr><th scope="col">Mieter / Einheit</th>${monthHeaders}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="payment-empty">Keine aktiven Verträge für diese Auswahl vorhanden.</p>'}
      <section class="payment-import-section"><div class="payment-section-heading"><div><h3>Kontoauszug als CSV</h3><p>Die Datei wird lokal gelesen. Buchungen werden erst nach deiner Zuordnung gespeichert.</p></div><label class="payment-file-button">CSV auswählen<input type="file" accept=".csv,text/csv,text/plain" onchange="paymentUiService.handleImportFile(this.files && this.files[0])"></label></div><div id="payment-import-output"></div></section>`;
    output.innerHTML = output.innerHTML.replace('<p class="payment-help">', '<section class="payment-contract-summary" aria-label="Vertrags- und Kautionsstatus"><h3>Vertragsstatus</h3><div class="payment-contract-summary-grid">' + contractSummary + '</div></section><p class="payment-help">');
    output.innerHTML = output.innerHTML
      .replace('<span class="payment-status-bezahlt">Bezahlt</span>', '<span class="payment-status-bezahlt" title="Grün: Sollbetrag für den Monat ist vollständig erreicht">Bezahlt</span>')
      .replace('<span class="payment-status-teilbezahlt">Teilbezahlt</span>', '<span class="payment-status-teilbezahlt" title="Gelb: Es ist ein Teilbetrag eingegangen">Teilbezahlt</span>')
      .replace('<span class="payment-status-offen">Offen</span>', '<span class="payment-status-offen" title="Grau: Noch keine Zahlung und die Frist ist noch nicht überschritten">Offen</span>')
      .replace('<span class="payment-status-ueberfaellig">Überfällig</span>', '<span class="payment-status-ueberfaellig" title="Rot: Der Monat ist fällig und noch nicht vollständig ausgeglichen">Überfällig</span>')
      .replace('<span class="payment-status-zukuenftig">Zukünftig</span>', '<span class="payment-status-zukuenftig" title="Blau: Der Monat liegt noch in der Zukunft">Zukünftig</span>')
      .replace('<span class="payment-status-leerstand">Leerstand</span>', '<span class="payment-status-leerstand" title="Weiß: Leerstand ohne vereinbarte Sollmiete">Leerstand</span>');
  },

  openPaymentDialog(contractId, month, initialArt = 'Miete') {
    const contract = (dataService.state.vertraege || []).find(row => String(row.vertrag_id) === String(contractId));
    if (!contract) return;
    const isDeposit = initialArt === 'Kaution';
    const summary = isDeposit ? this.summarizeDeposit(contract) : this.summarizeMonth(contract, month);
    const remaining = summary.remaining;
    const modal = document.getElementById('modal-container');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    const historyMonth = isDeposit ? '' : month;
    const history = summary.payments.length ? `<div class="payment-history"><h3>Bereits erfasst</h3>${summary.payments.map(payment => {
      const originalArt = payment.gegen_art || payment.art || 'Miete';
      const assignedMonth = payment.mietmonat || (isDeposit ? '' : this.getPaymentMonth(payment));
      const undo = this.paymentArt(payment) === 'storno' ? '' : `<button class="btn-link-danger" type="button" onclick="paymentUiService.saveStorno('${this.escape(contractId)}','${this.escape(historyMonth)}','${this.escape(payment.zahlung_id)}',${this.parseNumber(payment.betrag) || 0},'${this.escape(originalArt)}','${this.escape(assignedMonth)}')">Rückgängig</button>`;
      return `<div><span>${this.escape(payment.datum || '')}${assignedMonth ? ` · Monat ${this.escape(assignedMonth)}` : ''} · ${this.formatMoney(payment.betrag)} EUR · ${this.escape(payment.art || 'Zahlung')}</span>${undo}</div>`;
    }).join('')}</div>` : '';
    const title = isDeposit ? 'Kaution erfassen' : 'Mieteingang erfassen';
    const context = isDeposit
      ? `Soll ${this.formatMoney(summary.due)} EUR · bisher ${this.formatMoney(summary.paid)} EUR`
      : `<strong>${this.escape(month)}</strong> · Soll ${this.formatMoney(summary.due)} EUR · bisher ${this.formatMoney(summary.paid)} EUR`;
    body.innerHTML = `<div class="payment-dialog"><div class="payment-dialog-heading"><div><h2>${title}</h2><p>${this.escape(this.unitName(contract))} · ${this.escape(this.tenantName(contract))}</p></div><button type="button" class="payment-dialog-close" onclick="uiService.closeModal()" aria-label="Schließen">×</button></div><p class="payment-dialog-context">${context}</p><form onsubmit="event.preventDefault(); paymentUiService.savePayment('${this.escape(contractId)}','${this.escape(month)}')"><label>Betrag (EUR)<input id="payment-amount" type="number" min="-1000000" step="0.01" value="${this.escape(remaining.toFixed(2))}" required></label><label>Eingangsdatum<input id="payment-date" type="date" value="${this.todayInput()}" required></label><label>Zugeordneter Mietmonat (bei Kaution leer lassen)<input id="payment-month" type="month" value="${this.escape(month)}"></label><label>Art<select id="payment-art"><option value="Miete" ${initialArt === 'Miete' ? 'selected' : ''}>Miete</option><option value="Kaution" ${initialArt === 'Kaution' ? 'selected' : ''}>Kaution</option><option value="Nachzahlung" ${initialArt === 'Nachzahlung' ? 'selected' : ''}>Nachzahlung</option><option value="Erstattung" ${initialArt === 'Erstattung' ? 'selected' : ''}>Erstattung (wird negativ gespeichert)</option></select></label><p class="payment-dialog-hint">Das Eingangsdatum ist der tatsächliche Geldfluss. Der Mietmonat steuert die fachliche Zuordnung.</p><div class="payment-dialog-actions"><button class="btn-primary" type="submit">Zahlung speichern</button><button class="btn-secondary" type="button" onclick="uiService.closeModal()">Abbrechen</button></div></form>${history}</div>`;
    const monthInput = body.querySelector ? body.querySelector('#payment-month') : null;
    if (monthInput) {
      monthInput.readOnly = true;
      monthInput.setAttribute('aria-label', 'Fachlicher Mietmonat aus der angeklickten Spalte');
      const monthLabel = monthInput.closest('label');
      if (monthLabel && monthLabel.firstChild) monthLabel.firstChild.textContent = 'Fachlicher Mietmonat (aus der angeklickten Spalte)';
    }
    const dialogHint = body.querySelector ? body.querySelector('.payment-dialog-hint') : null;
    if (dialogHint) dialogHint.textContent = 'Eingangsdatum und fachlicher Mietmonat werden getrennt gespeichert. Für einen anderen Mietmonat bitte die entsprechende Monatsspalte öffnen.';
    modal.style.display = 'flex';
  },

  makePaymentId(contractId, month, suffix = '', art = 'Miete') {
    const prefix = art === 'Miete' ? 'Miete' : String(art || 'Zahlung').replace(/[^a-zA-Z0-9_-]/g, '_');
    const assignment = month || 'ohne_monat';
    return `${prefix}_${contractId}_${assignment}${suffix ? '_' + suffix : ''}`;
  },

  makeStornoId(paymentId) {
    return `Storno_${paymentId}_${Date.now()}`;
  },

  async savePayment(contractId, month) {
    const rawAmount = this.parseNumber(document.getElementById('payment-amount')?.value);
    const date = document.getElementById('payment-date')?.value || this.todayInput();
    const art = document.getElementById('payment-art')?.value || 'Miete';
    const amount = art === 'Erstattung' && rawAmount !== null ? -Math.abs(rawAmount) : rawAmount;
    if (amount === null || amount === 0 || (art !== 'Erstattung' && amount < 0)) return this.showMessage('Bitte einen gültigen Betrag eingeben. Erstattungen werden als negativer Betrag gespeichert.', 'error');
    const assignedMonth = art === 'Kaution' ? '' : String(month || '').trim();
    if (art !== 'Kaution' && !/^\d{4}-\d{2}$/.test(assignedMonth)) return this.showMessage('Bitte einen Mietmonat für diese Buchung auswählen.', 'error');
    const contract = (dataService.state.vertraege || []).find(row => String(row.vertrag_id) === String(contractId));
    const remaining = contract ? (art === 'Kaution' ? this.summarizeDeposit(contract).remaining : this.summarizeMonth(contract, assignedMonth).remaining) : Math.abs(amount);
    const suffix = amount >= remaining - 0.009 ? 'voll' : `teil_${this.hash(`${date}|${amount}`)}`;
    const id = this.makePaymentId(contractId, assignedMonth || date, suffix, art);
    await this.persistPayment({ zahlung_id: id, vertrag_id: contractId, datum: date, mietmonat: assignedMonth, betrag: amount, art });
  },

  async saveStorno(contractId, month, paymentId, amount, originalArt = 'Miete', assignedMonth = '') {
    if (!confirm(`Zahlung ${this.formatMoney(amount)} EUR wirklich stornieren? Es wird eine Gegenbuchung angelegt.`)) return;
    const stornoAmount = amount >= 0 ? -Math.abs(amount) : Math.abs(amount);
    await this.persistPayment({ zahlung_id: this.makeStornoId(paymentId), vertrag_id: contractId, datum: this.todayInput(), mietmonat: originalArt === 'Kaution' ? '' : assignedMonth || month, betrag: stornoAmount, art: 'Storno', storno_von: paymentId, gegen_art: originalArt });
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

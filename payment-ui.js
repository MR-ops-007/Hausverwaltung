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
  actionSequence: 0,
  pendingPaymentIntent: null,
  DEFAULT_PAYMENT_DEADLINE_TYPE: 'WERKTAG',
  DEFAULT_PAYMENT_DEADLINE_VALUE: 3,
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

  extractPaymentMonth(text) {
    const value = String(text || '');
    const match = value.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])(?:[-/.]\d{1,2})?\b/);
    return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}` : '';
  },

  todayInput(now = new Date()) {
    const date = this.parseDate(now) || new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  paymentDeadlineConfig(contract) {
    const type = String(contract && contract.zahlungsziel_typ || this.DEFAULT_PAYMENT_DEADLINE_TYPE).trim().toUpperCase();
    const normalizedType = ['WERKTAG', 'KALENDERTAG'].includes(type) ? type : this.DEFAULT_PAYMENT_DEADLINE_TYPE;
    const fallback = normalizedType === 'WERKTAG' ? this.DEFAULT_PAYMENT_DEADLINE_VALUE : 1;
    const value = Number(contract && contract.zahlungsziel_wert || fallback);
    return { type: normalizedType, value: Number.isInteger(value) && value > 0 ? value : fallback };
  },

  easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4);
    const e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  },

  germanHolidays(year) {
    const easter = this.easterSunday(year);
    const offset = (days) => new Date(year, easter.getMonth(), easter.getDate() + days);
    return new Set([
      `${year}-01-01`, `${year}-05-01`, `${year}-10-03`, `${year}-12-25`, `${year}-12-26`,
      this.todayInput(offset(-2)), this.todayInput(offset(1)), this.todayInput(offset(39)), this.todayInput(offset(50))
    ]);
  },

  isWorkingDay(date) {
    const day = date.getDay();
    return day !== 0 && day !== 6 && !this.germanHolidays(date.getFullYear()).has(this.todayInput(date));
  },

  nthWorkingDay(year, monthIndex, occurrence) {
    const date = new Date(year, monthIndex, 1);
    let count = 0;
    while (date.getMonth() === monthIndex) {
      if (this.isWorkingDay(date) && ++count === occurrence) return new Date(date.getTime());
      date.setDate(date.getDate() + 1);
    }
    return new Date(year, monthIndex + 1, 0);
  },

  contractPeriodStatus(contract, month) {
    const start = this.parseDate(contract && contract.start_datum);
    const end = this.parseDate(contract && contract.end_datum);
    const startMonth = start ? this.monthKey(start) : '';
    const endMonth = end ? this.monthKey(end) : '';
    if (startMonth && month < startMonth) return 'vor_mietbeginn';
    if (endMonth && month > endMonth) return 'nach_mietende';
    return '';
  },

  paymentDeadlineDate(contract, month) {
    const [year, monthNumber] = String(month).split('-').map(Number);
    if (!year || !monthNumber) return null;
    const config = this.paymentDeadlineConfig(contract);
    let date = config.type === 'WERKTAG'
      ? this.nthWorkingDay(year, monthNumber - 1, config.value)
      : new Date(year, monthNumber - 1, Math.min(config.value, new Date(year, monthNumber, 0).getDate()));
    if (config.type === 'KALENDERTAG') {
      while (!this.isWorkingDay(date)) date.setDate(date.getDate() + 1);
    }
    const start = this.parseDate(contract && contract.start_datum);
    if (start && this.monthKey(start) === month && start > date) return start;
    return date;
  },

  formatDate(value) {
    const date = this.parseDate(value);
    return date ? `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}` : '-';
  },

  startOfDay(value) {
    const date = this.parseDate(value);
    return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
  },

  paymentDeadlineLabel(contract, month) {
    const date = this.paymentDeadlineDate(contract, month);
    if (!date) return 'Frist unbekannt';
    const config = this.paymentDeadlineConfig(contract);
    const rule = config.type === 'WERKTAG' ? `${config.value}. Werktag` : `${config.value}. Kalendertag, nächster Werktag falls nötig`;
    return `Mieteingang spätestens am ${this.formatDate(date)} (${rule})`;
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
    return this.normalizePaymentMonth(payment && payment.mietmonat);
  },

  normalizePaymentMonth(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return this.monthKey(value);
    const text = String(value ?? '').trim();
    if (!text) return '';
    const iso = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
    if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return `${iso[1]}-${iso[2]}`;
    const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (german && Number(german[2]) >= 1 && Number(german[2]) <= 12) return `${german[3]}-${String(german[2]).padStart(2, '0')}`;
    return '';
  },

  isExplicitCredit(payment) {
    return !this.getPaymentMonth(payment)
      && Boolean(String(payment && payment.zahlungsgruppe_id || '').trim());
  },

  getEffectivePaymentMonth(payment) {
    const assigned = this.getPaymentMonth(payment);
    if (assigned) return assigned;
    // Legacy rows may now contain an empty optional column after the schema
    // migration. Only an explicit allocation row with a group ID represents
    // intentional, unassigned credit; legacy rows retain their receipt month.
    return this.isExplicitCredit(payment) ? '' : this.getReceiptMonth(payment);
  },

  getReceiptMonth(payment) {
    return this.monthKey(payment && (payment.datum || payment.buchungsdatum || payment.zahlungsdatum));
  },

  paymentArt(payment) {
    return String(payment && payment.art || 'Miete').trim().toLowerCase();
  },

  isDepositPayment(payment) {
    const art = this.paymentArt(payment);
    return art === 'kaution' || (art === 'storno' && String(payment.gegen_art || '').trim().toLowerCase() === 'kaution');
  },

  isRentSettlementPayment(payment) {
    const art = this.paymentArt(payment);
    return art === 'miete' || art === 'nachzahlung' || (art === 'storno' && String(payment.gegen_art || '').trim().toLowerCase() !== 'kaution' && String(payment.gegen_art || '').trim().toLowerCase() !== 'erstattung');
  },

  isRefundPayment(payment) {
    return this.paymentArt(payment) === 'erstattung';
  },

  getPaymentsFor(contractId, month) {
    return (dataService.state.zahlungen || [])
      .filter(payment => String(payment.vertrag_id) === String(contractId)
        && this.isRentSettlementPayment(payment)
        && this.getEffectivePaymentMonth(payment) === month);
  },

  getRefundPayments(contractId, month) {
    return (dataService.state.zahlungen || [])
      .filter(payment => String(payment.vertrag_id) === String(contractId)
        && this.isRefundPayment(payment)
        && this.getEffectivePaymentMonth(payment) === month);
  },

  getPaymentsEnteredInMonth(contractId, month) {
    return (dataService.state.zahlungen || [])
      .filter(payment => String(payment.vertrag_id) === String(contractId))
      .filter(payment => this.isRentSettlementPayment(payment) || this.isRefundPayment(payment))
      .filter(payment => this.getReceiptMonth(payment) === month);
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
    const refunds = this.getRefundPayments(contract.vertrag_id, month);
    const paid = payments.reduce((sum, payment) => sum + (this.parseNumber(payment.betrag) || 0), 0);
    const outsidePeriod = this.contractPeriodStatus(contract, month);
    const due = outsidePeriod ? 0 : this.monthlyDue(contract);
    const dueDate = this.paymentDeadlineDate(contract, month);
    const current = this.parseDate(now) || new Date();
    const currentDay = this.startOfDay(current);
    const dueDay = this.startOfDay(dueDate);
    const settled = this.settledDate(payments, due);
    let status = outsidePeriod || (due <= 0 ? 'leerstand' : 'offen');
    if (due > 0) {
      if (paid >= due - 0.009) status = 'bezahlt';
      else if (paid > 0) status = 'teilbezahlt';
      else if (dueDay && currentDay > dueDay) status = 'überfällig';
      else if (dueDay && dueDay > currentDay) status = 'zukünftig';
    }
    const settledLate = settled && dueDay && this.startOfDay(settled) > dueDay;
    const stillOpenLate = dueDay && currentDay > dueDay && ['offen', 'teilbezahlt', 'überfällig'].includes(status);
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
      dueDate,
      deadlineLabel: this.paymentDeadlineLabel(contract, month),
      payments,
      refunds
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
    const monthlyCredit = visibleMonths.reduce((sum, month) => sum + month.credit, 0);
    const contractIds = new Set(matrix.map(item => String(item.contract.vertrag_id)));
    const unassignedCredit = (dataService.state.zahlungen || [])
      .filter(payment => contractIds.has(String(payment.vertrag_id)))
      .filter(payment => this.isRentSettlementPayment(payment))
      .filter(payment => !this.getEffectivePaymentMonth(payment))
      .filter(payment => this.getReceiptMonth(payment).slice(0, 4) === String(year))
      .reduce((sum, payment) => {
        const amount = this.parseNumber(payment.betrag) || 0;
        return sum + (amount > 0 ? amount : 0);
      }, 0);
    const creditAmount = monthlyCredit + unassignedCredit;
    const overdueMonths = visibleMonths.filter(month => month.status === 'überfällig').length;
    const lateMonths = visibleMonths.filter(month => month.verspaetet).length;
    const repeatedDelay = matrix.filter(item => item.months.filter(month => month.verspaetet).length >= 2).length;
    const depositDue = matrix.reduce((sum, item) => sum + item.deposit.due, 0);
    const depositPaid = matrix.reduce((sum, item) => sum + item.deposit.paid, 0);
    const depositOpenContracts = matrix.filter(item => item.deposit.status === 'offen' || item.deposit.status === 'teilweise').length;
    return {
      contractCount: matrix.length,
      openAmount,
      creditAmount,
      unassignedCredit,
      overdueMonths,
      lateMonths,
      repeatedDelay,
      depositDue,
      depositPaid,
      depositRemaining: Math.max(depositDue - depositPaid, 0),
      depositOpenContracts
    };
  },

  formatMoney(value) {
    const number = this.parseNumber(value);
    return number === null ? '-' : number.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  depositStatusHtml(deposit) {
    if (deposit.status === 'vollständig') {
      return '<span class="payment-deposit-summary payment-deposit-vollstaendig" title="Die vereinbarte Kaution ist vollständig eingegangen">✓ Kaution vollständig hinterlegt</span>';
    }
    if (deposit.status === 'nicht_vereinbart') {
      return '<span class="payment-deposit-summary payment-deposit-nicht_vereinbart" title="Für diesen Vertrag ist keine Kaution hinterlegt">Keine Kaution vereinbart</span>';
    }
    return '<span class="payment-deposit-summary payment-deposit-' + deposit.status + '" title="Die Kaution ist noch nicht vollständig eingegangen">Kaution: ' + this.formatMoney(deposit.paid) + ' / ' + this.formatMoney(deposit.due) + ' EUR · ' + this.formatMoney(deposit.remaining) + ' EUR offen</span>';
  },

  statusLabel(status) {
    return { bezahlt: 'Bezahlt', teilbezahlt: 'Teilbezahlt', offen: 'Offen', überfällig: 'Überfällig', zukünftig: 'Zukünftig', leerstand: 'Leerstand', vor_mietbeginn: 'Vor Mietbeginn', nach_mietende: 'Nach Mietende' }[status] || status;
  },

  statusTitle(month) {
    const deadline = month.deadlineLabel || 'Frist unbekannt';
    const descriptions = {
      bezahlt: 'Grün: Der Sollbetrag ist vollständig erreicht.',
      teilbezahlt: 'Gelb: Ein Teilbetrag ist eingegangen; der Rest ist noch offen.',
      offen: `Grau: Noch keine Zahlung. ${deadline} ist noch nicht überschritten.`,
      überfällig: `Rot: Der Sollbetrag ist nicht vollständig erreicht. ${deadline} ist überschritten.`,
      zukünftig: `Blau: Dieser Mietmonat liegt noch vor der Frist. ${deadline}.`,
      leerstand: 'Weiß: Leerstand ohne vereinbarte Sollmiete.',
      vor_mietbeginn: 'Neutral: Der Mietvertrag begann in diesem Monat noch nicht.',
      nach_mietende: 'Neutral: Der Mietvertrag war in diesem Monat bereits beendet.'
    };
    return descriptions[month.status] || 'Status des Mietmonats.';
  },

  legendHtml() {
    const items = [
      ['bezahlt', 'Bezahlt', 'Grün: Sollbetrag vollständig erreicht.'],
      ['teilbezahlt', 'Teilbezahlt', 'Gelb: Teilbetrag eingegangen; Rest offen.'],
      ['offen', 'Offen', 'Grau: Noch keine Zahlung; die individuelle Frist ist noch nicht überschritten.'],
      ['überfällig', 'Überfällig', 'Rot: Frist überschritten und Sollbetrag nicht vollständig erreicht.'],
      ['zukünftig', 'Zukünftig', 'Blau: Mietmonat liegt vor seiner individuellen Frist.'],
      ['leerstand', 'Leerstand', 'Weiß: Kein aktiver Mietvertrag mit Sollmiete.']
    ];
    return '<div class="payment-legend" aria-label="Farblegende für Mietstatus">' + items.map(([status, label, detail]) =>
      `<button type="button" class="payment-legend-item ${this.statusClass(status)}" aria-expanded="false" onclick="paymentUiService.toggleLegend(this)"><span>${label}</span><small>${detail}</small></button>`).join('') + '</div>';
  },

  toggleLegend(button) {
    if (!button) return;
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    button.classList.toggle('is-open', !open);
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
    const currentObject = typeof uiService !== 'undefined' ? String(uiService.currentSelection || '') : '';
    if (currentObject) this.selectedObject = currentObject;
    this.render();
  },

  hasOpenInteraction() {
    const modal = typeof document?.getElementById === 'function'
      ? document.getElementById('modal-container')
      : null;
    const modalOpen = Boolean(modal && modal.style && modal.style.display !== 'none');
    return modalOpen || (Array.isArray(this.importRows) && this.importRows.length > 0);
  },

  render() {
    const output = document.getElementById('payments-output');
    if (!output) return;
    const years = this.getYears();
    if (!this.selectedYear || !years.includes(String(this.selectedYear))) this.selectedYear = years[0];
    const objectIds = Array.from(new Set(this.getContracts().map(contract => this.objectId(contract))));
    const currentObject = typeof uiService !== 'undefined' ? String(uiService.currentSelection || '') : '';
    if (!this.selectedObject || !objectIds.includes(this.selectedObject)) {
      this.selectedObject = objectIds.includes(currentObject) ? currentObject : (objectIds[0] || '');
    }
    const contracts = this.getContracts(this.selectedObject);
    const matrix = this.buildMatrix({ contracts, payments: dataService.state.zahlungen || [], year: this.selectedYear });
    const overview = this.summarizeOverview(matrix, this.selectedYear);
    const depositSummary = overview.depositRemaining > 0
      ? `⚠ ${this.formatMoney(overview.depositRemaining)} EUR Kaution offen`
      : '✓ Kautionen vollständig hinterlegt oder nicht vereinbart';
    const contractSummary = matrix.map(item => '<div class="payment-contract-summary-item"><strong>' + this.escape(item.unit) + ' · ' + this.escape(item.tenant) + '</strong><span>' + this.formatMoney(item.due) + ' EUR / Monat</span>' + this.depositStatusHtml(item.deposit) + '</div>').join('');
    const monthHeaders = this.MONTH_NAMES.map((name, index) => `<th scope="col">${name}<span class="payment-month-number">${index + 1}</span></th>`).join('');
    const rows = matrix.map(item => `
      <tr>
        <th scope="row" class="payment-tenant-cell"><strong>${this.escape(item.unit)}</strong><span>${this.escape(item.tenant)}</span><small>${this.formatMoney(item.due)} EUR / Monat</small><span class="payment-deposit payment-deposit-${item.deposit.status}">${item.deposit.due > 0 ? 'Kaution: ' + this.formatMoney(item.deposit.paid) + ' / ' + this.formatMoney(item.deposit.due) + ' EUR' : 'Keine Kaution vereinbart'}</span>${item.deposit.due > 0 && item.deposit.status !== 'vollständig' ? `<button class="payment-deposit-action" type="button" onclick="paymentUiService.openPaymentDialog('${this.escape(item.contract.vertrag_id)}','','Kaution')">Kaution erfassen</button>` : ''}</th>
        ${item.months.map(month => `<td><button class="payment-cell ${this.statusClass(month.status)}${month.verspaetet ? ' payment-cell-late' : ''}" type="button" onclick="paymentUiService.openPaymentDialog('${this.escape(item.contract.vertrag_id)}','${month.month}')" title="${this.escape(this.statusTitle(month) + (month.verspaetet ? ' Zusätzlich verspätet beglichen oder aktuell überfällig.' : ''))}"><strong>${this.escape(this.statusLabel(month.status))}${month.verspaetet ? '<small>verspätet</small>' : ''}</strong><span>${this.formatMoney(month.paid)} / ${this.formatMoney(month.due)} EUR</span></button></td>`).join('')}
      </tr>`).join('');
    output.innerHTML = `
      <div class="payment-page-heading"><div><h2>Mieteingänge</h2><p>Monatliche Zahlungseingänge je aktivem Mietvertrag</p></div></div>
      <div class="payments-toolbar">
        <label>Objekt<select id="payment-object-select" onchange="paymentUiService.selectedObject=this.value; paymentUiService.render()"><option value="">Alle Objekte</option>${objectIds.map(id => `<option value="${this.escape(id)}" ${id === this.selectedObject ? 'selected' : ''}>${this.escape(this.objectName(id))}</option>`).join('')}</select></label>
        <label>Jahr<select id="payment-year-select" onchange="paymentUiService.selectedYear=this.value; paymentUiService.render()">${years.map(year => `<option value="${year}" ${year === String(this.selectedYear) ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
      </div>
      <div class="payment-overview" aria-label="Zusammenfassung der Mieteingänge"><div><strong>Offene Miete</strong><b>${this.formatMoney(overview.openAmount)} EUR</b><small>bis zum aktuellen Monat</small></div><div><strong>Überfällige Monate</strong><b>${overview.overdueMonths}</b><small>${overview.lateMonths} verspätete oder offene Monate</small></div><div><strong>Wiederholte Verspätungen</strong><b>${overview.repeatedDelay}</b><small>Verträge mit mindestens 2 Hinweisen</small></div><div><strong>Guthaben / Überzahlungen</strong><b>${this.formatMoney(overview.creditAmount)} EUR</b><small>inklusive nicht zugeordneter Reste</small></div><div><strong>Kaution</strong><b>${this.formatMoney(overview.depositPaid)} / ${this.formatMoney(overview.depositDue)} EUR</b><small>${this.formatMoney(overview.depositRemaining)} EUR offen</small></div></div>
      <details class="payment-contract-summary"><summary><strong>Vertragsstatus</strong><span class="payment-contract-summary-overall">${depositSummary}</span></summary><div class="payment-contract-summary-grid">${contractSummary}</div></details>
      <p class="payment-help"><strong>So wird zugeordnet:</strong> Das Eingangsdatum dokumentiert den tatsächlichen Geldfluss. Der ausgewählte Mietmonat bestimmt die fachliche Zuordnung. <strong>Miete</strong> ist der reguläre Monatsbetrag; eine <strong>Nachzahlung</strong> gleicht einen zusätzlich offenen Betrag für den zugeordneten Monat aus. Eine <strong>Erstattung</strong> wird als negative Rückzahlung geführt und verändert den Zahlungsstatus der Miete nicht. Die Frist wird je Vertrag als 3. Werktag oder individueller Kalendertag berechnet.</p>
      ${this.legendHtml()}
      ${matrix.length ? `<div class="payment-table-wrap"><table class="payment-table"><thead><tr><th scope="col">Mieter / Einheit</th>${monthHeaders}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="payment-empty">Keine aktiven Verträge für diese Auswahl vorhanden.</p>'}
      <section class="payment-import-section"><div class="payment-section-heading"><div><h3>Kontoauszug als CSV</h3><p>Die Datei wird lokal gelesen. Buchungen werden erst nach deiner Zuordnung gespeichert.</p></div><label class="payment-file-button">CSV auswählen<input type="file" accept=".csv,text/csv,text/plain" onchange="paymentUiService.handleImportFile(this.files && this.files[0])"></label></div><div id="payment-import-output"></div></section>`;
  },

  openPaymentDialog(contractId, month, initialArt = 'Miete') {
    const contract = (dataService.state.vertraege || []).find(row => String(row.vertrag_id) === String(contractId));
    if (!contract) return;
    this.pendingAllocation = null;
    this.pendingPaymentIntent = {
      id: this.makeActionId('zahlung'),
      contractId: String(contractId),
      month: initialArt === 'Kaution' ? '' : String(month || ''),
      art: initialArt
    };
    const isDeposit = initialArt === 'Kaution';
    const summary = isDeposit ? this.summarizeDeposit(contract) : this.summarizeMonth(contract, month);
    const remaining = summary.remaining;
    const modal = document.getElementById('modal-container');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    const historyMonth = isDeposit ? '' : month;
    const assignedPayments = summary.payments;
    const assignedIds = new Set(assignedPayments.map(payment => String(payment.zahlung_id)));
    const enteredPayments = isDeposit ? [] : this.getPaymentsEnteredInMonth(contractId, month)
      .filter(payment => !assignedIds.has(String(payment.zahlung_id)));
    const historyPayments = [...assignedPayments, ...enteredPayments]
      .sort((a, b) => String(a.datum || '').localeCompare(String(b.datum || '')));
    const history = historyPayments.length ? `<div class="payment-history"><h3>Bereits erfasst</h3><p class="payment-history-note">Fachlich zugeordnete Zahlungen und Zahlungen, die in diesem Monat eingegangen sind.</p>${historyPayments.map(payment => {
      const originalArt = payment.gegen_art || payment.art || 'Miete';
      const assignedMonth = this.getPaymentMonth(payment) || (isDeposit ? '' : this.getEffectivePaymentMonth(payment));
      const reversed = this.isPaymentReversed(payment.zahlung_id);
      const undo = this.paymentArt(payment) === 'storno'
        ? ''
        : reversed
          ? '<span class="payment-reversed-label">storniert</span>'
          : `<button class="btn-link-danger" type="button" onclick="paymentUiService.saveStorno('${this.escape(contractId)}','${this.escape(historyMonth)}','${this.escape(payment.zahlung_id)}',${this.parseNumber(payment.betrag) || 0},'${this.escape(originalArt)}','${this.escape(assignedMonth)}')">Rückgängig</button>`;
      return `<div><span>${this.escape(payment.datum || '')}${assignedMonth ? ` · Monat ${this.escape(assignedMonth)}` : ''} · ${this.formatMoney(payment.betrag)} EUR · ${this.escape(payment.art || 'Zahlung')}</span>${undo}</div>`;
    }).join('')}</div>` : '';
    const title = isDeposit ? 'Kaution erfassen' : 'Mieteingang erfassen';
    const context = isDeposit
      ? `Soll ${this.formatMoney(summary.due)} EUR · bisher ${this.formatMoney(summary.paid)} EUR`
      : `<strong>${this.escape(month)}</strong> · Soll ${this.formatMoney(summary.due)} EUR · bisher ${this.formatMoney(summary.paid)} EUR · ${this.escape(this.paymentDeadlineLabel(contract, month))}`;
    const monthField = isDeposit ? '' : `<label>Fachlicher Mietmonat<input id="payment-month" type="month" value="${this.escape(month)}" readonly aria-label="Fachlicher Mietmonat aus der angeklickten Spalte"></label>`;
    const dialogHint = isDeposit
      ? 'Die Kaution wird separat vom Mietmonat geführt. Das Eingangsdatum dokumentiert den tatsächlichen Geldfluss.'
      : 'Eingangsdatum und fachlicher Mietmonat werden getrennt gespeichert. Für einen anderen Mietmonat bitte die entsprechende Monatsspalte öffnen.';
    body.innerHTML = `<div class="payment-dialog"><div class="payment-dialog-heading"><div><h2>${title}</h2><p>${this.escape(this.unitName(contract))} · ${this.escape(this.tenantName(contract))}</p></div><button type="button" class="payment-dialog-close" onclick="uiService.closeModal()" aria-label="Schließen">×</button></div><p class="payment-dialog-context">${context}</p><form onsubmit="event.preventDefault(); paymentUiService.savePayment('${this.escape(contractId)}','${this.escape(month)}')"><label>Betrag (EUR)<input id="payment-amount" type="number" min="-1000000" step="0.01" value="${this.escape(remaining.toFixed(2))}" required></label><label>Eingangsdatum<input id="payment-date" type="date" value="${this.todayInput()}" required></label>${monthField}<label>Art<select id="payment-art"><option value="Miete" ${initialArt === 'Miete' ? 'selected' : ''}>Miete</option><option value="Kaution" ${initialArt === 'Kaution' ? 'selected' : ''}>Kaution</option><option value="Nachzahlung" ${initialArt === 'Nachzahlung' ? 'selected' : ''}>Nachzahlung</option><option value="Erstattung" ${initialArt === 'Erstattung' ? 'selected' : ''}>Erstattung (wird negativ gespeichert)</option></select></label><p class="payment-dialog-hint">${dialogHint}</p><p class="payment-art-hint">Miete = regulärer Monatsbetrag · Nachzahlung = zusätzlicher Betrag für den ausgewählten Mietmonat · Erstattung = Rückzahlung an den Mieter und keine offene Miete.</p><p data-payment-dialog-message class="payment-message payment-message-error" role="alert" hidden></p><div class="payment-dialog-actions"><button class="btn-primary" type="submit">Zahlung speichern</button><button class="btn-secondary" type="button" onclick="uiService.closeModal()">Abbrechen</button></div></form>${history}</div>`;
    modal.style.display = 'flex';
  },

  makePaymentId(contractId, month, suffix = '', art = 'Miete') {
    const prefix = art === 'Miete' ? 'Miete' : String(art || 'Zahlung').replace(/[^a-zA-Z0-9_-]/g, '_');
    const assignment = month || 'ohne_monat';
    return `${prefix}_${contractId}_${assignment}_${suffix || this.makeActionId('zahlung')}`;
  },

  makeActionId(prefix = 'aktion') {
    this.actionSequence += 1;
    const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}_${this.actionSequence}_${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}_${randomId}`;
  },

  clearPaymentIntent() {
    this.pendingPaymentIntent = null;
  },

  getPaymentIntent(contractId, month, art) {
    const expectedMonth = art === 'Kaution' ? '' : String(month || '');
    if (!this.pendingPaymentIntent
      || this.pendingPaymentIntent.contractId !== String(contractId)
      || this.pendingPaymentIntent.month !== expectedMonth) {
      this.pendingPaymentIntent = {
        id: this.makeActionId('zahlung'),
        contractId: String(contractId),
        month: expectedMonth,
        art
      };
    }
    return this.pendingPaymentIntent;
  },

  makeStornoId(paymentId) {
    return `Storno_${paymentId}`;
  },

  isPaymentReversed(paymentId) {
    return (dataService.state.zahlungen || []).some(payment => this.paymentArt(payment) === 'storno'
      && String(payment.storno_von || '') === String(paymentId));
  },

  getAllocationCandidates(contractId, selectedMonth, year = String(selectedMonth || '').slice(0, 4), now = new Date()) {
    const contract = (dataService.state.vertraege || []).find(row => String(row.vertrag_id) === String(contractId));
    if (!contract || !/^\d{4}$/.test(String(year))) return [];
    const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
      .map(month => this.summarizeMonth(contract, month, now))
      .filter(summary => summary.due > 0 && summary.remaining > 0);
    return months
      .sort((a, b) => {
        if (a.month === selectedMonth) return -1;
        if (b.month === selectedMonth) return 1;
        return a.month.localeCompare(b.month);
      })
      .map(summary => ({
        month: summary.month,
        due: summary.due,
        paid: summary.paid,
        remaining: summary.remaining,
        status: summary.status,
        verspaetet: summary.verspaetet,
        deadlineLabel: summary.deadlineLabel
      }));
  },

  planPaymentAllocation(contractId, selectedMonth, amount, art = 'Miete', now = new Date()) {
    const numericAmount = this.parseNumber(amount) || 0;
    const candidates = this.getAllocationCandidates(contractId, selectedMonth, String(selectedMonth || '').slice(0, 4), now);
    let remaining = Math.max(numericAmount, 0);
    const allocations = candidates.map(candidate => {
      const allocated = Math.min(remaining, candidate.remaining);
      remaining = Math.max(remaining - allocated, 0);
      return { ...candidate, amount: Math.round(allocated * 100) / 100 };
    });
    return {
      contractId: String(contractId),
      selectedMonth: String(selectedMonth || ''),
      amount: Math.round(numericAmount * 100) / 100,
      art,
      allocations,
      unassigned: Math.round(remaining * 100) / 100
    };
  },

  makePaymentGroupId(contractId, date, amount, art, allocations, intentId = '') {
    return `ZG_${contractId}_${intentId || this.makeActionId('gruppe')}`;
  },

  buildAllocationRows(plan, date, intentId = '') {
    const rows = plan.allocations
      .filter(item => Number(item.amount) > 0)
      .map(item => ({ month: item.month, amount: Number(item.amount) }));
    if (Number(plan.unassigned) > 0) rows.push({ month: '', amount: Number(plan.unassigned) });
    const groupId = this.makePaymentGroupId(plan.contractId, date, plan.amount, plan.art, rows, intentId);
    return rows.map((item, index) => ({
      zahlung_id: this.makePaymentId(plan.contractId, item.month || date, `gruppe_${groupId}_${index + 1}`, plan.art),
      vertrag_id: plan.contractId,
      datum: date,
      mietmonat: item.month,
      betrag: Math.round(item.amount * 100) / 100,
      art: plan.art,
      zahlungsgruppe_id: groupId
    }));
  },

  showAllocationDialog(pending) {
    const modal = document.getElementById('modal-container');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    this.pendingAllocation = pending;
    const rows = pending.plan.allocations.map(item => `<label class="payment-allocation-row"><span><strong>${this.escape(item.month)}</strong><small>${this.formatMoney(item.remaining)} EUR offen${item.verspaetet ? ' · überfällig' : ''}</small></span><input type="number" min="0" step="0.01" data-payment-allocation-month="${this.escape(item.month)}" value="${this.escape(item.amount.toFixed(2))}"></label>`).join('');
    body.innerHTML = `<div class="payment-dialog payment-allocation-dialog"><div class="payment-dialog-heading"><div><h2>Zahlung verteilen</h2><p>${this.escape(this.unitName(pending.contract))} · ${this.escape(this.tenantName(pending.contract))}</p></div><button type="button" class="payment-dialog-close" onclick="uiService.closeModal()" aria-label="Schließen">×</button></div><p class="payment-dialog-context">${this.formatMoney(pending.plan.amount)} EUR Eingang für ${this.escape(pending.plan.selectedMonth)}. Der angeklickte Monat wird zuerst vorgeschlagen, danach die ältesten offenen Monate.</p><div class="payment-allocation-list">${rows || '<p class="payment-dialog-hint">Für diesen Vertrag sind keine weiteren offenen Mietmonate vorhanden.</p>'}<label class="payment-allocation-row payment-allocation-credit"><span><strong>Als Guthaben stehen lassen</strong><small>Wird keinem Mietmonat zugeordnet und später in der Übersicht als Guthaben gezeigt.</small></span><input type="number" min="0" step="0.01" data-payment-allocation-month="" value="${this.escape(pending.plan.unassigned.toFixed(2))}"></label></div><p class="payment-allocation-total">Verteilt: <strong data-payment-allocation-total>0,00 EUR</strong> · Eingang: <strong>${this.formatMoney(pending.plan.amount)} EUR</strong></p><p class="payment-allocation-message" data-payment-allocation-message role="status" aria-live="polite" hidden></p><p data-payment-dialog-message class="payment-message payment-message-error" role="alert" hidden></p><p class="payment-dialog-hint">Die Summe muss exakt dem Zahlungseingang entsprechen. Es wird nichts automatisch in einen anderen Monat verschoben.</p><div class="payment-dialog-actions"><button class="btn-primary" type="button" data-payment-allocation-save onclick="paymentUiService.confirmPaymentAllocation()">Verteilung speichern</button><button class="btn-secondary" type="button" onclick="uiService.closeModal()">Abbrechen</button></div></div>`;
    modal.style.display = 'flex';
    const inputs = body.querySelectorAll('[data-payment-allocation-month]');
    const updateTotal = () => {
      const total = Array.from(inputs).reduce((sum, input) => sum + (this.parseNumber(input.value) || 0), 0);
      const output = body.querySelector('[data-payment-allocation-total]');
      if (output) output.textContent = `${this.formatMoney(total)} EUR`;
      const message = body.querySelector('[data-payment-allocation-message]');
      const save = body.querySelector('[data-payment-allocation-save]');
      const matches = Math.abs(total - pending.plan.amount) <= 0.009;
      if (message) {
        message.textContent = matches ? '' : `Bitte Summe prüfen: verteilt sind ${this.formatMoney(total)} EUR, der Zahlungseingang beträgt ${this.formatMoney(pending.plan.amount)} EUR.`;
        message.hidden = matches;
      }
      if (save) save.disabled = !matches;
    };
    inputs.forEach(input => input.addEventListener('input', updateTotal));
    updateTotal();
  },

  async confirmPaymentAllocation() {
    const pending = this.pendingAllocation;
    const body = document.getElementById('modal-body');
    if (!pending || !body) return null;
    const inputs = Array.from(body.querySelectorAll('[data-payment-allocation-month]'));
    const rows = inputs.map(input => ({ month: input.getAttribute('data-payment-allocation-month') || '', amount: this.parseNumber(input.value) || 0 }));
    if (rows.some(row => row.amount < 0)) return this.setAllocationMessage('Bitte Summe prüfen: Teilbeträge dürfen nicht negativ sein.', 'error');
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    if (Math.abs(total - pending.plan.amount) > 0.009) return this.setAllocationMessage(`Bitte Summe prüfen: verteilt sind ${this.formatMoney(total)} EUR, der Zahlungseingang beträgt ${this.formatMoney(pending.plan.amount)} EUR.`, 'error');
    const plan = { ...pending.plan, allocations: rows.filter(row => row.month), unassigned: rows.find(row => !row.month)?.amount || 0 };
    const payments = this.buildAllocationRows(plan, pending.date, pending.intentId);
    if (!payments.length) return this.showMessage('Bitte mindestens einen Teilbetrag verteilen oder als Guthaben stehen lassen.', 'error');
    const result = await this.persistPayment(payments, 'Zahlung verteilt und gespeichert.');
    if (result) {
      this.pendingAllocation = null;
      this.clearPaymentIntent();
    }
    return result;
  },

  setAllocationMessage(message, kind = 'error') {
    const output = document.getElementById('modal-body')?.querySelector('[data-payment-allocation-message]');
    if (output) {
      output.textContent = message;
      output.hidden = !message;
      output.className = `payment-allocation-message payment-message-${kind}`;
      return;
    }
    this.showMessage(message, kind);
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
    if (contract && ['Miete', 'Nachzahlung'].includes(art) && amount > remaining + 0.009) {
      const plan = this.planPaymentAllocation(contractId, assignedMonth, amount, art);
      const intent = this.getPaymentIntent(contractId, assignedMonth, art);
      return this.showAllocationDialog({ contract, date, plan, intentId: intent.id });
    }
    const intent = this.getPaymentIntent(contractId, assignedMonth, art);
    const suffix = `${intent.id}_${amount >= remaining - 0.009 ? 'voll' : 'teil'}`;
    const id = this.makePaymentId(contractId, assignedMonth || date, suffix, art);
    const result = await this.persistPayment({ zahlung_id: id, vertrag_id: contractId, datum: date, mietmonat: assignedMonth, betrag: amount, art });
    if (result) this.clearPaymentIntent();
    return result;
  },

  async saveStorno(contractId, month, paymentId, amount, originalArt = 'Miete', assignedMonth = '') {
    if (!confirm(`Zahlung ${this.formatMoney(amount)} EUR wirklich stornieren? Es wird eine Gegenbuchung angelegt.`)) return;
    const stornoAmount = amount >= 0 ? -Math.abs(amount) : Math.abs(amount);
    const original = (dataService.state.zahlungen || []).find(payment => String(payment.zahlung_id) === String(paymentId));
    const originalMonth = original
      ? (this.isDepositPayment(original) || this.isExplicitCredit(original) ? '' : this.getEffectivePaymentMonth(original))
      : originalArt === 'Kaution' ? '' : assignedMonth || month;
    const payload = { zahlung_id: this.makeStornoId(paymentId), vertrag_id: contractId, datum: this.todayInput(), mietmonat: originalMonth, betrag: stornoAmount, art: 'Storno', storno_von: paymentId, gegen_art: originalArt };
    if (original && Object.prototype.hasOwnProperty.call(original, 'zahlungsgruppe_id')) payload.zahlungsgruppe_id = String(original.zahlungsgruppe_id || '');
    await this.persistPayment(payload);
  },

  async persistPayment(paymentOrPayments, successMessage = '') {
    if (this.busy) return null;
    this.busy = true;
    const payments = Array.isArray(paymentOrPayments) ? paymentOrPayments : [paymentOrPayments];
    try {
      if (typeof cloudService.loadPaymentCapabilities === 'function'
        && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        try {
          await cloudService.loadPaymentCapabilities();
        } catch (error) {
          // Bei einem vorübergehenden Netzfehler muss der eigentliche Schreibweg
          // weiterlaufen, damit saveTransaction die Zahlung in die Offline-Queue
          // legen kann. Schema- und Berechtigungsfehler bleiben blockierend.
          if (typeof cloudService.isTransient !== 'function' || !cloudService.isTransient(error)) throw error;
        }
      }
      const result = await cloudService.saveTransaction({ typ: 'ZAHLUNG', data: payments });
      if (!result || result.status !== 'success') throw new Error(result && result.message || 'Zahlung wurde nicht bestätigt.');
      if (result.queued === true) {
        if (typeof uiService !== 'undefined' && typeof uiService.closeModal === 'function') uiService.closeModal();
        this.render();
        this.showMessage('Zahlung vorgemerkt. Sie wird übertragen, sobald die Verbindung wieder verfügbar ist.', 'info');
        return result;
      }
      const existing = dataService.state.zahlungen || (dataService.state.zahlungen = []);
      payments.forEach(payment => {
        if (!existing.some(row => String(row.zahlung_id) === String(payment.zahlung_id))) existing.push(payment);
      });
      if (typeof uiService !== 'undefined' && typeof uiService.closeModal === 'function') uiService.closeModal();
      this.render();
      const message = result.bereits_vorhanden && !result.angelegt
        ? 'Diese Zahlung war bereits gespeichert.'
        : successMessage || (payments.length > 1 ? 'Zahlung verteilt und gespeichert.' : 'Zahlung gespeichert.');
      this.showMessage(message, 'success');
      return result;
    } catch (error) {
      this.showMessage(error.message || String(error), 'error');
      return null;
    } finally {
      this.busy = false;
    }
  },

  showMessage(message, kind = 'info') {
    const modal = document.getElementById('modal-container');
    const modalOutput = document.getElementById('modal-body')?.querySelector('[data-payment-dialog-message]');
    if (modal && modal.style && modal.style.display !== 'none' && modalOutput) {
      modalOutput.textContent = message;
      modalOutput.className = `payment-message payment-message-${kind}`;
      modalOutput.hidden = !message;
      return;
    }
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
      const detectedMonth = row.mietmonat || this.extractPaymentMonth(`${row.name} ${row.verwendungszweck}`) || this.monthKey(row.datum);
      return { ...row, mietmonat: detectedMonth, vertrag_id: best && best.score >= 2 ? String(best.contract.vertrag_id) : '', matchReason: best && best.score >= 2 ? `Vorschlag: ${this.tenantName(best.contract)} (${best.score} Punkte)` : 'Keine eindeutige Zuordnung' };
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
    output.innerHTML = `<div class="payment-import-actions"><strong>${this.importRows.length} Buchungen gefunden</strong><span>Bitte Vertrag und fachlichen Mietmonat prüfen, dann einzelne Buchungen übernehmen.</span></div><div class="payment-import-list">${this.importRows.map((row, index) => `<div class="payment-import-row"><div><strong>${this.escape(row.datum)} · ${this.formatMoney(row.betrag)} EUR</strong><span>${this.escape(row.name || row.verwendungszweck || 'Ohne Buchungstext')}</span><small>${this.escape(row.matchReason)}</small></div><select onchange="paymentUiService.importRows[${index}].vertrag_id=this.value; paymentUiService.importRows[${index}].matchReason=this.value ? 'Manuell zugeordnet' : 'Keine Zuordnung'; paymentUiService.renderImportRows()"><option value="">Nicht zugeordnet</option>${contracts.map(contract => `<option value="${this.escape(contract.vertrag_id)}" ${String(contract.vertrag_id) === String(row.vertrag_id) ? 'selected' : ''}>${this.escape(this.unitName(contract))} · ${this.escape(this.tenantName(contract))}</option>`).join('')}</select><label class="payment-import-month">Mietmonat<input type="month" value="${this.escape(row.mietmonat || '')}" onchange="paymentUiService.importRows[${index}].mietmonat=this.value"></label><button class="btn-primary" type="button" ${row.vertrag_id && row.mietmonat ? '' : 'disabled'} onclick="paymentUiService.importPayment(${index})">Übernehmen</button></div>`).join('')}</div>`;
  },

  async importPayment(index) {
    const row = this.importRows[index];
    if (!row || !row.vertrag_id) return;
    const month = row.mietmonat || this.monthKey(row.datum);
    const id = row.zahlung_id || (row.zahlung_id = this.makeActionId('Import'));
    const result = await this.persistPayment({ zahlung_id: id, vertrag_id: row.vertrag_id, datum: row.datum, mietmonat: month, betrag: row.betrag, art: 'Miete' });
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

/**
 * Sichtbare Rückmeldung für jede Aktion, die mit dem Backend spricht.
 *
 * - Antippen: Schaltflächen reagieren sofort (iOS zeigt :active nur mit touchstart-Listener).
 * - Anfrage läuft: Die zuletzt angetippte Schaltfläche zeigt einen Spinner und ist gesperrt,
 *   damit ein zweiter Tipp nichts doppelt auslöst. Unten erscheint ein Hinweis
 *   („Zahlung wird gespeichert …“).
 * - Fertig: Der Hinweis zeigt kurz „✓ Gespeichert · 14:03“ und verschwindet.
 *
 * cloudService.post meldet jede Anfrage über begin()/end(). Hintergrundabrufe ohne
 * vorherigen Tipp (Start, Vorladen) bleiben unsichtbar; Schreibvorgänge werden immer gezeigt.
 */
const busyIndicator = {
  // Ein Tipp gehört zu einer Anfrage, wenn sie kurz danach startet.
  ACTIVATOR_WINDOW_MS: 800,
  // Folgeanfragen derselben Aktion (z. B. erst Rechte prüfen, dann speichern) behalten den Spinner.
  RELEASE_GRACE_MS: 250,
  RESULT_VISIBLE_MS: 2500,

  WRITE_LABELS: {
    ZAHLUNG: 'Zahlung wird gespeichert …',
    ZAEHLERSTAND_NEU: 'Zählerstand wird gespeichert …',
    VERBRAUCH_VIEWS_AKTUALISIEREN: 'Verbrauchsdaten werden neu berechnet …'
  },

  doc: null,
  activator: null,
  activatorAt: 0,
  busyElement: null,
  releaseTimer: null,
  resultTimer: null,
  pending: [],
  nextId: 1,

  now() { return Date.now(); },

  init(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc || this.doc === doc) return;
    this.doc = doc;
    // Ohne touchstart-Listener zeigt iOS Safari keinen :active-Zustand an.
    doc.addEventListener('touchstart', () => {}, { passive: true });
    doc.addEventListener('click', event => this.onClick(event), true);
    const view = doc.defaultView;
    if (view && typeof view.confirm === 'function' && !view.confirm.busyIndicatorWrapped) {
      // Eine Rückfrage („Wirklich stornieren?“) verzögert die Anfrage: danach gilt der Tipp neu.
      const original = view.confirm.bind(view);
      const wrapped = (...args) => {
        const answer = original(...args);
        if (answer && this.activator) this.activatorAt = this.now();
        return answer;
      };
      wrapped.busyIndicatorWrapped = true;
      view.confirm = wrapped;
    }
  },

  activatorFor(target) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest('button, [role="button"], [onclick], a[href], summary, .tab-btn');
  },

  onClick(event) {
    const element = this.activatorFor(event.target);
    if (!element) return;
    if (this.isBusy(element)) {
      // Zweiter Tipp während des Speicherns: verwerfen statt doppelt auslösen.
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.activator = element;
    this.activatorAt = this.now();
  },

  isBusy(element) {
    return Boolean(element && element.classList && element.classList.contains('is-busy'));
  },

  labelFor(payload) {
    const typ = payload && payload.typ ? String(payload.typ) : '';
    if (!typ || typ === 'LESEN') return { write: false, text: 'Wird geladen …' };
    return { write: true, text: this.WRITE_LABELS[typ] || 'Wird gespeichert …' };
  },

  /** Meldet den Beginn einer Anfrage; gibt ein Kennzeichen für end() zurück. */
  begin(payload) {
    this.init();
    const label = this.labelFor(payload);
    const fromTap = this.activator && this.now() - this.activatorAt <= this.ACTIVATOR_WINDOW_MS
      && this.activator.isConnected !== false;
    if (fromTap) this.markBusy(this.activator);
    else if (this.busyElement && this.releaseTimer) this.cancelRelease();
    const visible = label.write || fromTap || Boolean(this.busyElement);
    const entry = { id: this.nextId++, write: label.write, text: label.text, visible };
    this.pending.push(entry);
    if (visible) this.showProgress();
    return entry.id;
  },

  /** Meldet das Ende einer Anfrage. ok=false bei Fehler (die Ansicht meldet ihn selbst). */
  end(id, { ok = true } = {}) {
    const index = this.pending.findIndex(entry => entry.id === id);
    if (index < 0) return;
    const [entry] = this.pending.splice(index, 1);
    if (this.pending.some(item => item.visible)) {
      this.showProgress();
      return;
    }
    this.scheduleRelease();
    if (!entry.visible) return;
    if (entry.write && ok) this.showResult(`✓ Gespeichert · ${this.formatTime(new Date(this.now()))}`, 'success');
    else if (entry.write) this.showResult('Nicht gespeichert – Hinweis beachten', 'error');
    else this.hide();
  },

  markBusy(element) {
    this.cancelRelease();
    if (this.busyElement && this.busyElement !== element) this.unmark(this.busyElement);
    this.busyElement = element;
    this.activator = null;
    element.classList.add('is-busy');
    element.setAttribute('aria-busy', 'true');
  },

  unmark(element) {
    if (!element || !element.classList) return;
    element.classList.remove('is-busy');
    element.removeAttribute('aria-busy');
  },

  cancelRelease() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
  },

  scheduleRelease() {
    if (!this.busyElement) return;
    this.cancelRelease();
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      if (this.pending.some(item => item.visible)) return;
      this.unmark(this.busyElement);
      this.busyElement = null;
    }, this.RELEASE_GRACE_MS);
  },

  formatTime(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  element() {
    if (!this.doc) return null;
    let output = this.doc.getElementById('busy-indicator');
    if (!output && this.doc.body) {
      output = this.doc.createElement('div');
      output.id = 'busy-indicator';
      output.className = 'busy-indicator';
      output.setAttribute('role', 'status');
      output.setAttribute('aria-live', 'polite');
      output.hidden = true;
      this.doc.body.appendChild(output);
    }
    return output;
  },

  showProgress() {
    const output = this.element();
    if (!output) return;
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.resultTimer = null;
    const visible = this.pending.filter(item => item.visible);
    const current = visible.find(item => item.write) || visible[visible.length - 1];
    output.className = 'busy-indicator busy-indicator-progress';
    output.innerHTML = '<span class="busy-indicator-spinner" aria-hidden="true"></span>';
    output.appendChild(this.doc.createTextNode(current ? current.text : 'Bitte warten …'));
    output.hidden = false;
  },

  showResult(text, kind) {
    const output = this.element();
    if (!output) return;
    output.className = `busy-indicator busy-indicator-${kind}`;
    output.textContent = text;
    output.hidden = false;
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.resultTimer = setTimeout(() => this.hide(), this.RESULT_VISIBLE_MS);
  },

  hide() {
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.resultTimer = null;
    const output = this.doc && this.doc.getElementById('busy-indicator');
    if (output) output.hidden = true;
  }
};

if (typeof window !== 'undefined') {
  window.busyIndicator = busyIndicator;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => busyIndicator.init());
    else busyIndicator.init();
  }
}

/**
 * Sichtbare Rückmeldung für jede Aktion, die mit dem Backend spricht.
 *
 * - Antippen: Schaltflächen reagieren sofort (iOS zeigt :active nur mit touchstart-Listener).
 * - Speichern per Tipp: Ein graues Overlay sperrt die ganze App, der Hausmeister sucht den
 *   Stempel („Zahlung wird gespeichert …“). Danach kurz „Amtlich gespeichert!“ mit Uhrzeit.
 *   So kann während des Speicherns keine zweite Aktion ausgelöst werden.
 * - Laden per Tipp (z. B. Reiter): Spinner auf der Schaltfläche, unten „Wird geladen …“.
 * - Zählerstände haben im Erfassungsdialog eine eigene Stempel-Animation; dort nur Spinner.
 * - Schreiben ohne Tipp (Offline-Warteschlange): nur der Hinweis unten, kein Overlay.
 *
 * cloudService.post meldet jede Anfrage über begin()/end(). Hintergrundabrufe ohne
 * vorherigen Tipp (Start, Vorladen) bleiben unsichtbar.
 */
const busyIndicator = {
  // Ein Tipp gehört zu einer Anfrage, wenn sie kurz danach startet.
  ACTIVATOR_WINDOW_MS: 800,
  // Folgeanfragen derselben Aktion (z. B. erst Rechte prüfen, dann speichern) behalten den Spinner.
  RELEASE_GRACE_MS: 250,
  RESULT_VISIBLE_MS: 2500,
  // So lange bleibt der Erfolgsstempel stehen (wie beim Zählerstand).
  STAMP_SUCCESS_MS: 1200,

  WRITE_LABELS: {
    ZAHLUNG: 'Zahlung wird gespeichert …',
    ZAEHLERSTAND_NEU: 'Zählerstand wird gespeichert …',
    MIETERHOEHUNG_PRUEFUNG_SPEICHERN: 'Prüfung wird gespeichert …',
    VERBRAUCH_VIEWS_AKTUALISIEREN: 'Verbrauchsdaten werden neu berechnet …'
  },
  // Diese Schreibvorgänge zeigen ihre Animation selbst im Dialog.
  OWN_ANIMATION_TYPES: ['ZAEHLERSTAND_NEU'],

  doc: null,
  activator: null,
  activatorAt: 0,
  busyElement: null,
  releaseTimer: null,
  resultTimer: null,
  overlayTimer: null,
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
    if (this.isOverlayOpen()) {
      // Während gespeichert wird, ist die App gesperrt.
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const element = this.activatorFor(event.target);
    if (!element) return;
    if (this.isBusy(element)) {
      // Zweiter Tipp während des Ladens: verwerfen statt doppelt auslösen.
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
    if (!typ || typ === 'LESEN') return { typ, write: false, text: 'Wird geladen …' };
    return { typ, write: true, text: this.WRITE_LABELS[typ] || 'Wird gespeichert …' };
  },

  /** Meldet den Beginn einer Anfrage; gibt ein Kennzeichen für end() zurück. */
  begin(payload) {
    this.init();
    const label = this.labelFor(payload);
    const fromTap = Boolean(this.activator) && this.now() - this.activatorAt <= this.ACTIVATOR_WINDOW_MS
      && this.activator.isConnected !== false;
    // Folgeanfrage derselben Aktion: Die Schaltfläche dreht sich noch.
    const continuing = !fromTap && Boolean(this.busyElement);
    if (fromTap) this.markBusy(this.activator);
    else if (continuing) this.cancelRelease();
    const interactive = fromTap || continuing;
    const overlay = label.write && interactive && !this.OWN_ANIMATION_TYPES.includes(label.typ);
    const visible = label.write || interactive;
    const entry = { id: this.nextId++, write: label.write, text: label.text, visible, overlay };
    this.pending.push(entry);
    if (overlay) this.showOverlay(entry.text);
    else if (visible && !this.isOverlayOpen()) this.showProgress();
    return entry.id;
  },

  /** Meldet das Ende einer Anfrage. ok=false bei Fehler (die Ansicht meldet ihn selbst). */
  end(id, { ok = true } = {}) {
    const index = this.pending.findIndex(entry => entry.id === id);
    if (index < 0) return;
    const [entry] = this.pending.splice(index, 1);
    if (this.pending.some(item => item.overlay)) return;
    if (this.pending.some(item => item.visible)) {
      if (!this.isOverlayOpen()) this.showProgress();
      return;
    }
    this.scheduleRelease();
    if (entry.overlay) {
      if (ok) this.showOverlaySuccess(`${this.successText(entry)} · ${this.formatTime(new Date(this.now()))}`);
      else this.hideOverlay();
      this.hide();
      return;
    }
    if (!entry.visible) return;
    if (entry.write && ok) this.showResult(`✓ Gespeichert · ${this.formatTime(new Date(this.now()))}`, 'success');
    else if (entry.write) this.showResult('Nicht gespeichert – Hinweis beachten', 'error');
    else this.hide();
  },

  successText(entry) {
    if (entry.text.indexOf('Zahlung') === 0) return 'Zahlung gespeichert';
    if (entry.text.indexOf('Prüfung') === 0) return 'Prüfung gespeichert';
    if (entry.text.indexOf('Verbrauchsdaten') === 0) return 'Verbrauchsdaten neu berechnet';
    return 'Gespeichert';
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

  // --- Hinweis unten -----------------------------------------------------------
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
  },

  // --- Overlay mit Hausmeister-Stempel -----------------------------------------
  overlay() {
    if (!this.doc) return null;
    let overlay = this.doc.getElementById('busy-overlay');
    if (!overlay && this.doc.body) {
      overlay = this.doc.createElement('div');
      overlay.id = 'busy-overlay';
      overlay.className = 'busy-overlay';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-live', 'assertive');
      overlay.hidden = true;
      overlay.innerHTML = '<div class="busy-overlay-card">'
        + '<img class="busy-overlay-stamp" alt="" src="assets/hausmeister-stempel-loading.svg">'
        + '<strong class="busy-overlay-title"></strong><small class="busy-overlay-detail"></small></div>';
      this.doc.body.appendChild(overlay);
    }
    return overlay;
  },

  isOverlayOpen() {
    const overlay = this.doc && this.doc.getElementById('busy-overlay');
    return Boolean(overlay && !overlay.hidden);
  },

  setOverlay(state, title, detail) {
    const overlay = this.overlay();
    if (!overlay) return;
    if (this.overlayTimer) clearTimeout(this.overlayTimer);
    this.overlayTimer = null;
    overlay.dataset.state = state;
    const stamp = overlay.querySelector('.busy-overlay-stamp');
    if (stamp) {
      stamp.src = state === 'success' ? 'assets/hausmeister-stempel-erfolg.svg' : 'assets/hausmeister-stempel-loading.svg';
      stamp.alt = state === 'success' ? 'Erfolgreich gespeichert' : 'Der Hausmeister sucht den richtigen Stempel';
    }
    const titleElement = overlay.querySelector('.busy-overlay-title');
    if (titleElement) titleElement.textContent = title;
    const detailElement = overlay.querySelector('.busy-overlay-detail');
    if (detailElement) detailElement.textContent = detail;
    overlay.hidden = false;
  },

  showOverlay(text) {
    this.setOverlay('loading', 'Der Hausmeister sucht noch den richtigen Stempel …', text);
  },

  showOverlaySuccess(detail) {
    this.setOverlay('success', 'Amtlich gespeichert!', detail);
    this.overlayTimer = setTimeout(() => this.hideOverlay(), this.STAMP_SUCCESS_MS);
  },

  hideOverlay() {
    if (this.overlayTimer) clearTimeout(this.overlayTimer);
    this.overlayTimer = null;
    const overlay = this.doc && this.doc.getElementById('busy-overlay');
    if (overlay) overlay.hidden = true;
  }
};

if (typeof window !== 'undefined') {
  window.busyIndicator = busyIndicator;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => busyIndicator.init());
    else busyIndicator.init();
  }
}

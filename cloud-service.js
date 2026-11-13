/**
 * CLOUD-SERVICE (v3.0 - Zugangsschlüssel, Lesen per POST)
 *
 * Alle Backend-Aufrufe laufen über post(): Der Zugangsschlüssel wird angehängt, bei
 * UNAUTHORIZED wird einmal nachgefragt und die Anfrage wiederholt.
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL,
    ENABLE_OFFLINE_SYNC: true,
    ACCESS_KEY_STORAGE: 'hv_access_key',
    LEGACY_ACCESS_KEY_STORAGE: 'hv_access_key',
    QUEUE_KEY: 'offline_queue',
    LEGACY_FAILED_QUEUE_KEY: 'offline_queue_failed',
    MAX_KEY_ATTEMPTS: 5,
    REQUEST_TIMEOUT_MS: 20000,   // Schreiben: bei schlechter Verbindung nicht ewig warten, sondern queuen
    READ_TIMEOUT_MS: 60000,      // Lesen großer Datenmengen darf länger dauern
    RETRY_DELAYS_MS: [30000, 120000, 300000], // begrenzte automatische Wiederholungen (danach nur noch Auslöser)
    processingQueue: false,
    retryAttempt: 0,
    retryTimer: null,
    paymentCapabilitiesCache: null,
    PAYMENT_CAPABILITIES_CACHE_MS: 5 * 60 * 1000,

    // --- Zugangsschlüssel -------------------------------------------------
    getAccessKeyStorage() {
        const environment = CONFIG && CONFIG.ENVIRONMENT;
        return environment ? `${this.ACCESS_KEY_STORAGE}:${environment}` : this.LEGACY_ACCESS_KEY_STORAGE;
    },

    getLocalConfiguredAccessKey() {
        const environment = CONFIG && CONFIG.ENVIRONMENT;
        // Lokale Schlüssel sind ausschließlich für die TEST-Abnahme zulässig.
        // Ein versehentlich befüllter Produktionswert darf niemals verwendet werden.
        if (environment !== 'test') return '';
        const keys = CONFIG && CONFIG.LOCAL_ACCESS_KEYS;
        if (!environment || !keys || typeof keys !== 'object') return '';
        return String(keys[environment] || '').trim();
    },

    getAccessKey() {
        try {
            const scopedKey = localStorage.getItem(this.getAccessKeyStorage()) || '';
            if (scopedKey || this.getAccessKeyStorage() === this.LEGACY_ACCESS_KEY_STORAGE) return scopedKey;

            // Ein vorhandener Schlüssel aus der Zeit vor dem Umgebungs-Switch wird
            // einmalig der aktuell aktiven Umgebung zugeordnet. Danach bleibt er getrennt.
            const legacyKey = localStorage.getItem(this.LEGACY_ACCESS_KEY_STORAGE) || '';
            if (legacyKey) {
                localStorage.setItem(this.getAccessKeyStorage(), legacyKey);
                localStorage.removeItem(this.LEGACY_ACCESS_KEY_STORAGE);
                return legacyKey;
            }
            const configuredKey = this.getLocalConfiguredAccessKey();
            if (configuredKey) {
                localStorage.setItem(this.getAccessKeyStorage(), configuredKey);
                return configuredKey;
            }
            return '';
        } catch (e) { return ''; }
    },

    setAccessKey(key) {
        try { localStorage.setItem(this.getAccessKeyStorage(), key); } catch (e) { /* Speicher nicht verfügbar */ }
    },

    clearAccessKey() {
        try { localStorage.removeItem(this.getAccessKeyStorage()); } catch (e) { /* Speicher nicht verfügbar */ }
        this.paymentCapabilitiesCache = null;
    },

    accessError(message) {
        const error = new Error(message || 'Zugangsschlüssel erforderlich.');
        error.code = 'UNAUTHORIZED';
        return error;
    },

    // Netzwerkfehler und vorübergehende HTTP-Fehler dürfen gequeued werden, Ablehnungen des Backends nicht.
    isTransient(error) {
        return error instanceof TypeError || (error && error.transient === true);
    },

    // --- Anfragen ---------------------------------------------------------
    /** Eine Anfrage mit Zeitlimit. Ein hängender Abruf darf die Queue nicht dauerhaft blockieren. */
    async requestText(body, timeoutMs) {
        if (!this.scriptUrl) {
            const error = new Error('Keine Backend-URL konfiguriert. Bitte config.local.js für die gewünschte Umgebung anlegen.');
            error.code = 'CONFIGURATION_ERROR';
            throw error;
        }
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const response = await fetch(this.scriptUrl, controller
                ? { method: 'POST', body, signal: controller.signal }
                : { method: 'POST', body });
            if (!response.ok) {
                const error = new Error(`HTTP-Fehler! ${response.status}`);
                error.transient = response.status >= 500 || response.status === 429;
                throw error;
            }
            return await response.text();
        } catch (error) {
            if (error && error.name === 'AbortError') {
                const timeout = new Error('Zeitüberschreitung: keine Antwort vom Server.');
                timeout.transient = true;
                throw timeout;
            }
            throw error;
        } finally {
            if (timer) clearTimeout(timer);
        }
    },

    async post(payload, { allowPrompt = true, timeoutMs = this.REQUEST_TIMEOUT_MS } = {}) {
        for (let attempt = 0; attempt < this.MAX_KEY_ATTEMPTS; attempt++) {
            const text = await this.requestText(JSON.stringify({ ...payload, key: this.getAccessKey() }), timeoutMs);
            let result = null;
            if (text && text.trim() !== '') {
                try { result = JSON.parse(text); } catch (e) {
                    const error = new Error('Antwortformat nicht lesbar.');
                    error.unclear = true;
                    throw error;
                }
            }
            if (!result || result.code !== 'UNAUTHORIZED') return result;

            if (!allowPrompt || typeof accessUi === 'undefined') throw this.accessError(result.message);
            const hadKey = Boolean(this.getAccessKey());
            this.clearAccessKey();
            const entered = await accessUi.prompt(hadKey
                ? 'Der gespeicherte Zugangsschlüssel wurde abgelehnt. Bitte erneut eingeben.'
                : 'Für den Zugriff auf die Daten wird der Zugangsschlüssel benötigt.');
            if (!entered) throw this.accessError('Zugangsschlüssel nicht eingegeben.');
            this.setAccessKey(entered);
        }
        throw this.accessError('Zugangsschlüssel wurde mehrfach abgelehnt.');
    },

    async read(view) {
        // data: [] schützt ein älteres Backend (< 4.8.0): Es würde die Anfrage sonst als Zählerstand anhängen.
        const result = await this.post({ typ: 'LESEN', view, data: [] }, { timeoutMs: this.READ_TIMEOUT_MS });
        if (!result || result.status === 'success' || result.status === 'error') {
            throw new Error((result && result.status === 'error' && result.message)
                || 'Das Backend unterstützt Lesen per POST nicht (Version 4.8.0 erforderlich).');
        }
        return result;
    },

    loadCapabilities() { return this.read('vertrag_capabilities'); },

    async loadPaymentCapabilities(force = false) {
        if (!force && this.paymentCapabilitiesCache
            && Date.now() - this.paymentCapabilitiesCache.loadedAt < this.PAYMENT_CAPABILITIES_CACHE_MS) {
            return this.paymentCapabilitiesCache.value;
        }
        const capabilities = await this.loadCapabilities();
        if (capabilities.payment_writes !== true || capabilities.payment_schema_ready !== true) {
            const missing = Array.isArray(capabilities.payment_schema_missing) && capabilities.payment_schema_missing.length
                ? ` Fehlende Spalten: ${capabilities.payment_schema_missing.join(', ')}.`
                : '';
            const error = new Error(`Der Zahlungsbereich ist im Backend noch nicht freigegeben.${missing}`);
            error.code = 'PAYMENT_SCHEMA_NOT_READY';
            throw error;
        }
        this.paymentCapabilitiesCache = { loadedAt: Date.now(), value: capabilities };
        return capabilities;
    },

    loadDashboardData() { return this.read('dashboard'); },
    loadConsumptionData() { return this.read('verbrauch'); },
    loadZaehlerstaende() { return this.read('zaehlerstaende'); },

    async refreshConsumptionViews() {
        const result = await this.post({ typ: 'VERBRAUCH_VIEWS_AKTUALISIEREN' });
        if (!result || result.status !== 'success') {
            throw new Error(result && result.message || 'Die Verbrauchsdaten konnten nicht aktualisiert werden.');
        }
        return result;
    },

    async loadBackgroundData() {
        // Erst offene Einträge senden, dann lesen: So zeigen die geladenen Daten den Stand der Datenbank
        // nach der Synchronisation und nicht davor.
        await this.processOfflineQueue();
        return this.read('alle');
    },

    async saveContract(payload) {
        // Financial changes must receive an explicit server acknowledgement; never queue them.
        const capabilities = await this.loadCapabilities();
        if (capabilities.contract_writes !== true) throw new Error('Backend unterstützt Vertragsänderungen noch nicht.');
        const result = await this.post(payload);
        if (!result || result.status !== 'success' || !result.vertrag || !result.anpassung) {
            throw new Error(result && result.message || 'Vertragsänderung nicht bestätigt.');
        }
        return result;
    },

    /** Legt den Eintrag in die Queue. Nur wenn er nachweislich gespeichert wurde, gilt er als offline gesichert. */
    queueForLater(transactionData, message) {
        if (!this.saveToOfflineQueue(transactionData)) {
            if (this.getQueueProblems().length > 0) {
                return {
                    status: 'error',
                    code: 'QUEUE_CORRUPT',
                    message: 'Die gespeicherte Offline-Queue ist beschädigt, deshalb kann nichts zwischengespeichert werden. ' +
                        'Bitte oben auf der Seite „Sichern und zurücksetzen“ wählen und danach erneut speichern.'
                };
            }
            return {
                status: 'error',
                code: 'QUEUE_WRITE_FAILED',
                message: 'Der Wert konnte nicht gesendet und auch nicht auf diesem Gerät zwischengespeichert werden. ' +
                    'Bitte die Eingabe nicht schließen und später erneut speichern (oder den Wert notieren).'
            };
        }
        this.scheduleRetry();
        return { status: 'success', queued: true, message };
    },

    async saveTransaction(transactionData) {
        if (this.ENABLE_OFFLINE_SYNC && !navigator.onLine) {
            return this.queueForLater(transactionData, 'Offline gespeichert');
        }
        try {
            const result = await this.post(transactionData);

            // Nur eine ausdrückliche Bestätigung des Backends gilt als gespeichert.
            if (result && result.status === 'success') {
                const confirmed = { status: 'success', message: result.message || 'Erfolgreich' };
                ['angelegt', 'bereits_vorhanden', 'ueberschrieben'].forEach(key => {
                    if (typeof result[key] === 'number') confirmed[key] = result[key];
                });
                return confirmed;
            }
            if (result && result.status === 'error') {
                if (this.ENABLE_OFFLINE_SYNC && result.transient === true) {
                    return this.queueForLater(transactionData, 'In Queue verschoben');
                }
                return {
                    status: 'error',
                    code: result.code,
                    conflicts: result.conflicts,
                    message: result.message || 'Backend-Fehler'
                };
            }
            return this.handleUnclearResponse(transactionData);
        } catch (error) {
            if (this.ENABLE_OFFLINE_SYNC && this.isTransient(error)) {
                return this.queueForLater(transactionData, 'In Queue verschoben');
            }
            if (error && error.unclear) {
                return this.handleUnclearResponse(transactionData);
            }
            // Ablehnungen (falscher Schlüssel, Validierung) werden gemeldet, nicht gequeued.
            return { status: 'error', code: error.code, message: error.message };
        }
    },

    /**
     * Leere oder nicht lesbare Antwort: Ob das Backend gespeichert hat, ist unklar. Zählerstände sind über
     * die stand_id idempotent und werden deshalb sicher erneut gesendet; alles andere gilt als nicht bestätigt.
     */
    handleUnclearResponse(transactionData) {
        if (this.ENABLE_OFFLINE_SYNC && transactionData && transactionData.typ === 'ZAEHLERSTAND_NEU') {
            return this.queueForLater(transactionData, 'Antwort unklar, wird erneut gesendet');
        }
        return { status: 'error', message: 'Das Backend hat das Speichern nicht eindeutig bestätigt.' };
    },

    // --- Offline-Queue ----------------------------------------------------
    // Eintrag: { id, payload, status: 'pending' | 'rejected', queued_at, code?, message?, conflicts? }
    // pending  = noch nicht bestätigt, wird erneut versucht.
    // rejected = vom Backend abgelehnt (z. B. CONFLICT); bleibt sichtbar, bis der Nutzer entscheidet.
    // Schlüssel, deren Inhalt nicht lesbar war. Solange ein Schlüssel hier steht, wird er nicht überschrieben.
    corruptKeys: {},

    readQueue(key) {
        let raw = null;
        try { raw = localStorage.getItem(key); } catch (e) {
            this.corruptKeys[key] = { unreadable: true };
            return [];
        }
        if (!raw) {
            delete this.corruptKeys[key];
            return [];
        }
        try {
            const queue = JSON.parse(raw);
            if (Array.isArray(queue)) {
                delete this.corruptKeys[key];
                return queue;
            }
        } catch (e) { /* defekt, siehe unten */ }
        // Defekte Daten nicht als leere Queue behandeln und nicht überschreiben: Sie bleiben unverändert
        // liegen, die Anzeige meldet den Fehler, bis der Nutzer sie bewusst sichert und zurücksetzt.
        this.corruptKeys[key] = { unreadable: false };
        return [];
    },

    /** Beschädigte Queue-Daten (leer, wenn alles lesbar ist). */
    getQueueProblems() {
        return Object.keys(this.corruptKeys).map(key => ({ key, ...this.corruptKeys[key] }));
    },

    /** Rohtext einer beschädigten Queue, zum Kopieren und für manuelle Rettung. */
    getCorruptRaw(key) {
        try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
    },

    /**
     * Sichert beschädigte Queue-Daten und setzt sie zurück, in zwei Phasen:
     * 1. Alle beschädigten Schlüssel werden unter eigenen Schlüsseln gesichert und durch Zurücklesen
     *    geprüft. Misslingt eine Sicherung, bleiben alle Originale unverändert (bereits angelegte
     *    Sicherungskopien sind harmlos und werden gemeldet).
     * 2. Erst danach werden die Originale entfernt. Misslingt das für einen Schlüssel, wird genau gemeldet,
     *    was bereits zurückgesetzt wurde und was noch beschädigt ist. Ein erneuter Aufruf schließt den Rest ab.
     * Die Meldung (message) beschreibt in jedem Fall den tatsächlichen Zustand.
     */
    resolveCorruptQueue() {
        this.readEntries(); // Zustand aktualisieren, bevor etwas gesichert wird
        const backups = [];
        const toRemove = [];

        for (const key of Object.keys(this.corruptKeys)) {
            let raw;
            try { raw = localStorage.getItem(key); } catch (e) {
                return { ok: false, backups, message: 'Der Speicher ist nicht lesbar. Die beschädigten Originale wurden nicht verändert.' };
            }
            if (!raw) { toRemove.push({ key, backupKey: null }); continue; }
            const backupKey = `${key}_defekt_${this.legacyEntryId(raw, 0, '')}`;
            try {
                localStorage.setItem(backupKey, raw);
                if (localStorage.getItem(backupKey) !== raw) throw new Error('nicht gespeichert');
            } catch (e) {
                const copies = backups.length > 0 ? ` Bereits angelegte Sicherungskopien: ${backups.join(', ')}.` : '';
                return {
                    ok: false,
                    backups,
                    message: `Die Sicherung von „${key}“ konnte nicht gespeichert werden. Die beschädigten Originale wurden nicht verändert.${copies}`
                };
            }
            backups.push(backupKey);
            toRemove.push({ key, backupKey });
        }

        const reset = [];
        for (const { key } of toRemove) {
            let removed = false;
            try {
                localStorage.removeItem(key);
                removed = localStorage.getItem(key) === null;
            } catch (e) { removed = false; }
            if (!removed) {
                const remaining = toRemove.map(item => item.key).filter(candidate => !reset.includes(candidate));
                this.notifyQueueChange();
                return {
                    ok: false,
                    partial: reset.length > 0,
                    backups,
                    reset,
                    remaining,
                    message: `Teilweise abgeschlossen. Gesichert unter: ${backups.join(', ') || '–'}. ` +
                        `Zurückgesetzt: ${reset.join(', ') || 'nichts'}. ` +
                        `Noch beschädigt und nicht zurückgesetzt: ${remaining.join(', ')}. ` +
                        'Bitte „Sichern und zurücksetzen“ erneut wählen.'
                };
            }
            delete this.corruptKeys[key];
            reset.push(key);
        }

        this.notifyQueueChange();
        return { ok: true, backups, reset, message: `Gesichert unter: ${backups.join(', ') || '(nichts zu sichern)'}` };
    },

    /** Schreibt die Queue und prüft durch Zurücklesen, ob sie wirklich gespeichert wurde. */
    writeQueue(key, queue) {
        if (this.corruptKeys[key]) return false; // beschädigte Daten niemals überschreiben
        try {
            if (queue.length === 0) {
                localStorage.removeItem(key);
                return true;
            }
            const text = JSON.stringify(queue);
            localStorage.setItem(key, text);
            return localStorage.getItem(key) === text;
        } catch (e) {
            return false;
        }
    },

    newEntryId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    },

    /** Stabile ID für übernommene ältere Einträge, damit sie auch ohne erfolgreiches Speichern wiederzufinden sind. */
    legacyEntryId(raw, index, prefix) {
        const text = JSON.stringify(raw) || '';
        let hash = 5381;
        for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
        return `${prefix}${hash.toString(36)}-${index}`;
    },

    isEntry(raw) {
        return Boolean(raw && typeof raw === 'object' && raw.id && raw.payload);
    },

    /**
     * Liest die Queue; ältere Formate (rohe Payloads, Liste offline_queue_failed) werden übernommen.
     * Die alte Liste wird erst entfernt, nachdem die übernommene Queue nachweislich gespeichert ist.
     */
    readEntries() {
        const stored = this.readQueue(this.QUEUE_KEY);
        const legacyFailed = this.readQueue(this.LEGACY_FAILED_QUEUE_KEY);
        let changed = legacyFailed.length > 0;

        const entries = stored.map((raw, index) => {
            if (this.isEntry(raw)) return raw;
            changed = true;
            return { id: this.legacyEntryId(raw, index, 'q'), payload: raw, status: 'pending', queued_at: null };
        });
        legacyFailed.forEach((raw, index) => {
            const entry = this.isEntry(raw) ? raw : {
                id: this.legacyEntryId(raw, index, 'f'),
                payload: raw,
                status: 'rejected',
                queued_at: null,
                message: 'Früher vom Backend abgelehnt (Grund nicht gespeichert).'
            };
            if (!entries.some(existing => existing.id === entry.id)) entries.push(entry);
        });

        if (changed) {
            const persisted = this.writeQueue(this.QUEUE_KEY, entries);
            if (persisted && legacyFailed.length > 0) this.writeQueue(this.LEGACY_FAILED_QUEUE_KEY, []);
        }
        return entries;
    },

    updateEntry(id, change) {
        return this.writeQueue(this.QUEUE_KEY, this.readEntries().map(entry => (entry.id === id ? change(entry) : entry)));
    },

    removeEntry(id) {
        return this.writeQueue(this.QUEUE_KEY, this.readEntries().filter(entry => entry.id !== id));
    },

    dispatch(eventName) {
        if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
            document.dispatchEvent(new CustomEvent(eventName));
        }
    },

    notifyQueueChange() {
        this.dispatch('hv-queue-changed');
    },

    /** true nur, wenn der Eintrag nachweislich persistent gespeichert wurde. */
    saveToOfflineQueue(transaction) {
        const entries = this.readEntries();
        entries.push({
            id: this.newEntryId(),
            payload: transaction,
            status: 'pending',
            queued_at: new Date().toISOString()
        });
        const persisted = this.writeQueue(this.QUEUE_KEY, entries);
        if (persisted) this.notifyQueueChange();
        return persisted;
    },

    getQueueSummary() {
        const entries = this.readEntries();
        const countValues = list => list.reduce((sum, entry) => {
            const data = entry.payload && entry.payload.data;
            return sum + (Array.isArray(data) ? data.length : 1);
        }, 0);
        const pending = entries.filter(entry => entry.status !== 'rejected');
        const rejected = entries.filter(entry => entry.status === 'rejected');
        return {
            entries,
            pending: pending.length,
            rejected: rejected.length,
            values: countValues(entries),
            problems: this.getQueueProblems()
        };
    },

    discardQueueEntry(id) {
        this.removeEntry(id);
        this.notifyQueueChange();
    },

    resetEntry(id, payloadChange) {
        this.updateEntry(id, entry => ({
            ...entry,
            status: 'pending',
            code: undefined,
            message: undefined,
            conflicts: undefined,
            payload: payloadChange ? payloadChange(entry.payload) : entry.payload
        }));
        this.notifyQueueChange();
    },

    /** Abgelehnten Eintrag unverändert erneut versuchen (nicht für fachliche Konflikte gedacht). */
    retryEntry(id) {
        this.resetEntry(id);
    },

    /** Konflikt bewusst auflösen: vorhandenen Wert mit Grund überschreiben. */
    prepareOverwrite(id, grund) {
        this.resetEntry(id, payload => ({ ...payload, ueberschreiben: { grund } }));
    },

    /** Konflikt bewusst auflösen: Wert ausdrücklich als zusätzliche Ablesung speichern. */
    prepareNewReading(id) {
        this.resetEntry(id, payload => ({ ...payload, neueAblesung: true }));
    },

    hasPending() {
        return this.readEntries().some(entry => entry.status !== 'rejected');
    },

    // Begrenzte automatische Wiederholung (kein Dauer-Polling). Danach lösen nur noch App-Start,
    // online-Ereignis, Zurückkehren zur App und der Button eine Übertragung aus.
    scheduleRetry() {
        if (!this.ENABLE_OFFLINE_SYNC || this.retryTimer || typeof setTimeout !== 'function') return;
        if (this.retryAttempt >= this.RETRY_DELAYS_MS.length) return;
        const delay = this.RETRY_DELAYS_MS[this.retryAttempt];
        this.retryAttempt += 1;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.processOfflineQueue({ scheduled: true });
        }, delay);
    },

    cancelRetry() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    },

    /**
     * Sendet offene (pending) Einträge der Reihe nach. Nur bestätigte Einträge verlassen die Queue.
     * Netz-, Zeitlimit-, Schlüssel-, unklare und vorübergehende Backend-Fehler lassen den Rest liegen
     * und planen eine begrenzte Wiederholung. Echte Ablehnungen werden mit Grund markiert und
     * bleiben sichtbar, bis der Nutzer sie auflöst oder verwirft; sie blockieren den Rest nicht.
     * force und zeitgesteuerte Wiederholungen (scheduled) ignorieren navigator.onLine (der Wert ist in
     * schlechten Netzen unzuverlässig).
     */
    async processOfflineQueue({ force = false, allowPrompt = false, scheduled = false } = {}) {
        if (!this.ENABLE_OFFLINE_SYNC || this.processingQueue) return this.getQueueSummary();
        if (!scheduled) {
            this.cancelRetry();
            this.retryAttempt = 0;
        }
        if (!this.hasPending()) return this.getQueueSummary();
        // Zeitgesteuerte Wiederholungen und ausdrückliche Auslöser entscheiden per Versuch, nicht per
        // navigator.onLine. Der Wert kann fälschlich false sein; die Versuche sind begrenzt.
        if (!force && !scheduled && !navigator.onLine) return this.getQueueSummary();

        this.processingQueue = true;
        let confirmed = 0;
        let interrupted = false;
        try {
            const ids = this.readEntries().filter(entry => entry.status !== 'rejected').map(entry => entry.id);
            for (const id of ids) {
                const entry = this.readEntries().find(candidate => candidate.id === id);
                if (!entry) continue;
                let result;
                try {
                    result = await this.post(entry.payload, { allowPrompt });
                } catch (error) {
                    interrupted = true; // Netzwerk, Zeitlimit, Schlüssel, unlesbare Antwort: später erneut
                    break;
                }
                if (result && result.status === 'success') {
                    this.removeEntry(id);
                    confirmed += 1;
                    continue;
                }
                if (result && result.status === 'error' && result.transient !== true) {
                    this.updateEntry(id, current => ({
                        ...current,
                        status: 'rejected',
                        code: result.code,
                        message: result.message,
                        conflicts: result.conflicts,
                        rejected_at: new Date().toISOString()
                    }));
                    console.warn('Queue-Eintrag vom Backend abgelehnt:', result.message);
                    continue;
                }
                interrupted = true; // leere/unklare Antwort oder vorübergehender Fehler: nicht als abgelehnt werten
                break;
            }
        } finally {
            this.processingQueue = false;
            if (confirmed > 0) this.dispatch('hv-queue-synced');
            this.notifyQueueChange();
        }
        if (this.hasPending()) {
            if (interrupted) this.scheduleRetry();
        } else {
            this.retryAttempt = 0;
        }
        return this.getQueueSummary();
    }
};

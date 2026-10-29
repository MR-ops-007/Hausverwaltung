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
    QUEUE_KEY: 'offline_queue',
    FAILED_QUEUE_KEY: 'offline_queue_failed',
    MAX_KEY_ATTEMPTS: 5,
    processingQueue: false,

    // --- Zugangsschlüssel -------------------------------------------------
    getAccessKey() {
        try { return localStorage.getItem(this.ACCESS_KEY_STORAGE) || ''; } catch (e) { return ''; }
    },

    setAccessKey(key) {
        try { localStorage.setItem(this.ACCESS_KEY_STORAGE, key); } catch (e) { /* Speicher nicht verfügbar */ }
    },

    clearAccessKey() {
        try { localStorage.removeItem(this.ACCESS_KEY_STORAGE); } catch (e) { /* Speicher nicht verfügbar */ }
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
    async post(payload, { allowPrompt = true } = {}) {
        for (let attempt = 0; attempt < this.MAX_KEY_ATTEMPTS; attempt++) {
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                body: JSON.stringify({ ...payload, key: this.getAccessKey() })
            });
            if (!response.ok) {
                const error = new Error(`HTTP-Fehler! ${response.status}`);
                error.transient = response.status >= 500 || response.status === 429;
                throw error;
            }
            const text = await response.text();
            let result = null;
            if (text && text.trim() !== '') {
                try { result = JSON.parse(text); } catch (e) { throw new Error('Antwortformat nicht lesbar.'); }
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
        const result = await this.post({ typ: 'LESEN', view, data: [] });
        if (!result || result.status === 'success' || result.status === 'error') {
            throw new Error((result && result.status === 'error' && result.message)
                || 'Das Backend unterstützt Lesen per POST nicht (Version 4.8.0 erforderlich).');
        }
        return result;
    },

    loadCapabilities() { return this.read('vertrag_capabilities'); },
    loadDashboardData() { return this.read('dashboard'); },
    loadConsumptionData() { return this.read('verbrauch'); },

    async refreshConsumptionViews() {
        const result = await this.post({ typ: 'VERBRAUCH_VIEWS_AKTUALISIEREN' });
        if (!result || result.status !== 'success') {
            throw new Error(result && result.message || 'Die Verbrauchsdaten konnten nicht aktualisiert werden.');
        }
        return result;
    },

    async loadBackgroundData() {
        const data = await this.read('alle');
        await this.processOfflineQueue();
        return data;
    },

    async saveContract(payload) {
        // Financial changes must receive an explicit server acknowledgement; never queue them.
        const capabilities = await this.loadCapabilities();
        if (capabilities.contract_writes !== true) throw new Error('Backend unterstuetzt Vertragsaenderungen noch nicht.');
        const result = await this.post(payload);
        if (!result || result.status !== 'success' || !result.vertrag || !result.anpassung) {
            throw new Error(result && result.message || 'Vertragsaenderung nicht bestaetigt.');
        }
        return result;
    },

    async saveTransaction(transactionData) {
        if (this.ENABLE_OFFLINE_SYNC && !navigator.onLine) {
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert' };
        }
        try {
            const result = await this.post(transactionData);
            if (result && result.status === 'error') {
                return { status: 'error', message: result.message || 'Backend-Fehler' };
            }
            return { status: 'success', message: (result && result.message) || 'Erfolgreich' };
        } catch (error) {
            if (this.ENABLE_OFFLINE_SYNC && this.isTransient(error)) {
                this.saveToOfflineQueue(transactionData);
                return { status: 'success', message: 'In Queue verschoben' };
            }
            // Ablehnungen (falscher Schlüssel, Validierung) werden gemeldet, nicht gequeued.
            return { status: 'error', message: error.message };
        }
    },

    // --- Offline-Queue ----------------------------------------------------
    readQueue(key) {
        try {
            const queue = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(queue) ? queue : [];
        } catch (e) { return []; }
    },

    writeQueue(key, queue) {
        try {
            if (queue.length) localStorage.setItem(key, JSON.stringify(queue));
            else localStorage.removeItem(key);
        } catch (e) { /* Speicher nicht verfügbar */ }
    },

    saveToOfflineQueue(transaction) {
        const queue = this.readQueue(this.QUEUE_KEY);
        queue.push(transaction);
        this.writeQueue(this.QUEUE_KEY, queue);
    },

    async processOfflineQueue() {
        if (!this.ENABLE_OFFLINE_SYNC || !navigator.onLine || this.processingQueue) return;
        const queue = this.readQueue(this.QUEUE_KEY);
        if (queue.length === 0) return;

        this.processingQueue = true;
        const remaining = [];
        const rejected = [];
        try {
            for (let i = 0; i < queue.length; i++) {
                let result;
                try {
                    result = await this.post(queue[i], { allowPrompt: false });
                } catch (error) {
                    // Netzwerk- oder Zugriffsproblem: Rest behalten und später erneut versuchen.
                    remaining.push(...queue.slice(i));
                    break;
                }
                if (result && result.status === 'success') continue; // bestätigt, aus der Queue entfernen
                // Vom Backend abgelehnt: nicht verlieren, aber auch die übrigen Einträge nicht blockieren.
                rejected.push(queue[i]);
                console.warn('Queue-Eintrag vom Backend abgelehnt:', result && result.message);
            }
        } finally {
            // Einträge, die während des Durchlaufs neu dazukamen, bleiben erhalten.
            const added = this.readQueue(this.QUEUE_KEY).slice(queue.length);
            this.writeQueue(this.QUEUE_KEY, remaining.concat(added));
            if (rejected.length) {
                this.writeQueue(this.FAILED_QUEUE_KEY, this.readQueue(this.FAILED_QUEUE_KEY).concat(rejected));
            }
            this.processingQueue = false;
        }
    }
};

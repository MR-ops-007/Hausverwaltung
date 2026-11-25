/**
 * LOCAL-CACHE (v1.0 - Sofortstart aus dem letzten geladenen Stand)
 *
 * Speichert den zuletzt vollständig geladenen Stand (Dashboard und Stammdaten) je
 * Umgebung in IndexedDB auf dem Gerät. Beim nächsten Start zeigt die App diesen
 * Stand sofort an und lädt im Hintergrund nach.
 *
 * Grenzen:
 * - Nur Lesedaten. Schreibvorgänge gehen immer direkt an das Backend.
 * - Verbrauchs-Views (mehrere MB) liegen in einem eigenen Eintrag (`verbrauch:<umgebung>`),
 *   damit der Startstand klein bleibt.
 * - Wird der Zugangsschlüssel abgelehnt oder „Lokale Daten löschen“ gewählt,
 *   werden die gespeicherten Daten der Umgebung entfernt.
 */
const localCache = {
    DB_NAME: 'hausverwaltung-cache',
    STORE: 'snapshots',
    FORMAT: 1,
    MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000,
    // Für Tests austauschbar: { get(key), put(key, value), delete(key), keys() }
    backend: null,
    dbPromise: null,

    environment() {
        return (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.ENVIRONMENT) || 'default';
    },

    KINDS: ['snapshot', 'verbrauch'],

    // Blätter, ohne die ein Stand nicht angezeigt oder als „aktuell“ bestätigt werden darf.
    // dataService.setInitialData ersetzt fehlende Blätter durch leere Listen; ein Stand ohne
    // z. B. Zahlungen sähe deshalb gültig aus, wäre fachlich aber falsch.
    REQUIRED_SHEETS: ['Objekte', 'Einheiten', 'Personen', 'Vertraege', 'Vertragsparteien',
        'Mietanpassungen', 'Zaehler', 'Zaehlerstaende', 'Zahlungen'],

    isCompleteStammdaten(stammdaten) {
        if (!stammdaten || typeof stammdaten !== 'object' || Array.isArray(stammdaten)) return false;
        return this.REQUIRED_SHEETS.every(name => Array.isArray(stammdaten[name]));
    },

    key(environment = this.environment(), kind = 'snapshot') {
        return `${kind}:${environment}`;
    },

    // --- IndexedDB --------------------------------------------------------------
    openDb() {
        if (this.dbPromise) return this.dbPromise;
        this.dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined' || !indexedDB) {
                reject(new Error('IndexedDB nicht verfügbar'));
                return;
            }
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(this.STORE)) {
                    request.result.createObjectStore(this.STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB konnte nicht geöffnet werden'));
        });
        this.dbPromise.catch(() => { this.dbPromise = null; });
        return this.dbPromise;
    },

    async idb(mode, action) {
        const db = await this.openDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE, mode);
            const request = action(transaction.objectStore(this.STORE));
            transaction.oncomplete = () => resolve(request ? request.result : undefined);
            transaction.onerror = () => reject(transaction.error || new Error('IndexedDB-Fehler'));
            transaction.onabort = () => reject(transaction.error || new Error('IndexedDB-Vorgang abgebrochen'));
        });
    },

    storage() {
        if (this.backend) return this.backend;
        return {
            get: key => this.idb('readonly', store => store.get(key)),
            put: (key, value) => this.idb('readwrite', store => store.put(value, key)),
            delete: key => this.idb('readwrite', store => store.delete(key)),
            keys: () => this.idb('readonly', store => store.getAllKeys())
        };
    },

    // --- Öffentliche Schnittstelle ---------------------------------------------
    /** Letzter Stand der aktiven Umgebung oder null (fehlt, zu alt, unlesbar). */
    async load(now = Date.now()) {
        try {
            const snapshot = await this.storage().get(this.key());
            if (!snapshot || snapshot.format !== this.FORMAT) return null;
            if (!this.isCompleteStammdaten(snapshot.stammdaten)) return null;
            const savedAt = Date.parse(snapshot.savedAt);
            if (!Number.isFinite(savedAt) || now - savedAt > this.MAX_AGE_MS) return null;
            return snapshot;
        } catch (error) {
            return null;
        }
    },

    /** Speichert den frisch geladenen Stand. Fehler stören die App nie. */
    async save(dashboard, stammdaten, savedAt = new Date()) {
        if (!this.isCompleteStammdaten(stammdaten)) return false;
        try {
            await this.storage().put(this.key(), {
                format: this.FORMAT,
                environment: this.environment(),
                savedAt: savedAt.toISOString(),
                dashboard: dashboard && typeof dashboard === 'object' ? dashboard : {},
                stammdaten
            });
            return true;
        } catch (error) {
            return false;
        }
    },

    /** Letzte Verbrauchs-Views der aktiven Umgebung oder null. */
    async loadConsumption(now = Date.now()) {
        try {
            const entry = await this.storage().get(this.key(this.environment(), 'verbrauch'));
            if (!entry || entry.format !== this.FORMAT || !entry.data || typeof entry.data !== 'object') return null;
            if (!Array.isArray(entry.data._view_verbrauch_jahr)) return null;
            const savedAt = Date.parse(entry.savedAt);
            if (!Number.isFinite(savedAt) || now - savedAt > this.MAX_AGE_MS) return null;
            return entry;
        } catch (error) {
            return null;
        }
    },

    async saveConsumption(data, savedAt = new Date()) {
        if (!data || typeof data !== 'object' || !Array.isArray(data._view_verbrauch_jahr)) return false;
        try {
            await this.storage().put(this.key(this.environment(), 'verbrauch'), {
                format: this.FORMAT,
                environment: this.environment(),
                savedAt: savedAt.toISOString(),
                data
            });
            return true;
        } catch (error) {
            return false;
        }
    },

    /** Entfernt alle Einträge der aktiven Umgebung (oder aller Umgebungen). */
    async clear({ all = false } = {}) {
        try {
            const storage = this.storage();
            if (!all) {
                await Promise.all(this.KINDS.map(kind => storage.delete(this.key(this.environment(), kind))));
                return true;
            }
            const keys = await storage.keys();
            await Promise.all((keys || [])
                .filter(key => this.KINDS.some(kind => String(key).startsWith(`${kind}:`)))
                .map(key => storage.delete(key)));
            return true;
        } catch (error) {
            return false;
        }
    },

    /** „25.11. 08:15“ für die Statuszeile. */
    formatSavedAt(snapshot) {
        const date = new Date(snapshot && snapshot.savedAt);
        if (Number.isNaN(date.getTime())) return '';
        const pad = value => String(value).padStart(2, '0');
        return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}. ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
};

// data-service.js
const dataService = {
    state: {
        objekte: [],
        einheiten: [],
        mieter: [],
        zaehler: [],
        parameter: [],
        fixkosten: [],
        queue: []
    },

    // Initialisierung: Lädt Daten aus dem LocalStorage (Offline-First)
    init() {
        const saved = localStorage.getItem('hv_data_state');
        if (saved) {
            this.state = JSON.parse(saved);
        }
    },

    // Speichert den aktuellen Status lokal
    save() {
        localStorage.setItem('hv_data_state', JSON.stringify(this.state));
    },

    // Aktualisiert den gesamten State mit den Daten aus der Cloud
    updateFromCloud(cloudData) {
        if (!cloudData) return;
        
        // Wir mappen die Cloud-Tabellen auf unseren State
        this.state.objekte = cloudData.objekte || [];
        this.state.einheiten = cloudData.einheiten || [];
        this.state.mieter = cloudData.mieter || [];
        this.state.zaehler = cloudData.zaehler || [];
        this.state.parameter = cloudData.parameter || [];
        this.state.fixkosten = cloudData.fixkosten || [];
        
        this.save();
    },

    // --- Relationale Hilfsfunktionen (Helper) ---

    // Holt alle Einheiten eines bestimmten Objekts
    getEinheitenByObjekt(objektId) {
        return this.state.einheiten.filter(e => e.objekt_id === objektId);
    },

    // Findet den aktuell aktiven Mieter einer Einheit
    getActiveMieter(einheitId) {
        if (!einheitId) return null;
        // Wir geben einfach den Mieter zurück, der zu dieser ID gehört.
        // Falls es mehrere gibt (historisch), nehmen wir den neuesten.
        return this.state.mieter.find(m => String(m.einheit_id).trim() === String(einheitId).trim());
    },

    // Holt die letzten Zählerstände einer Einheit
    getZaehlerStaende(einheitId) {
        return this.state.zaehler.find(z => z.einheit_id === einheitId) || {};
    },

    // Holt einen spezifischen Parameter (z.B. Strompreis) für ein Objekt
    getParameter(objektId, bezeichnung) {
        const date = new Date();
        return this.state.parameter.find(p => 
            p.objekt_id === objektId && 
            p.bezeichnung === bezeichnung &&
            new Date(p.gueltig_ab) <= date && 
            (!p.gueltig_bis || new Date(p.gueltig_bis) >= date)
        ) || { wert: 0 };
    }
};

dataService.init();

/**
 * DATA-SERVICE (Architektur-Standard v1.0)
 * Stand: 03.03.2026
 * Fokus: Harmonisierung der Schreibweise (Lowercase-State)
 */
const dataService = {
    // Der State ist die interne Datenbank des Frontends.
    // Standard: Alle Keys sind konsequent kleingeschrieben.
    state: {
        objekte: [],
        einheiten: [],
        mieter: [],
        zaehler_staende: [],
        parameter: [],
        fixkosten: [],
        transaktionen: []
    },

    /**
     * Normalisierungs-Schicht:
     * Nimmt Daten vom Backend (Großschreibung) entgegen und mappt sie in den kleingeschriebenen State.
     */
    setInitialData(data) {
        if (!data) {
            console.error("DataService: Keine Daten zur Initialisierung empfangen.");
            return;
        }

        // Mapping: Backend (Groß) -> State (Klein)
        this.state.objekte = data.Objekte || [];
        this.state.einheiten = data.Einheiten || [];
        this.state.mieter = data.Mieter || [];
        this.state.zaehler_staende = data.Zaehler_Staende || [];
        this.state.parameter = data.Parameter || [];
        this.state.fixkosten = data.Fixkosten || [];
        this.state.transaktionen = data.Transaktionen || [];
        
        console.log("DataService: State erfolgreich harmonisiert.", this.state);
    },

    /**
     * API für UI-Service (Zeile 12 in ui-service.js)
     */
    getUniqueObjects() {
        if (!this.state.einheiten) return [];
        const ids = this.state.einheiten.map(e => e.objekt_id);
        return [...new Set(ids)].filter(id => id && String(id).trim() !== "");
    },

    /**
     * API für UI-Service (Zeile 39 in ui-service.js)
     */
    getUnitsByObject(objektId) {
        if (!this.state.einheiten) return [];
        return this.state.einheiten.filter(e => String(e.objekt_id) === String(objektId));
    },

    /**
     * API für UI-Service (Zählermaske)
     * Sucht den aktiven Mieter für eine Einheit.
     */
    getActiveMieter(einheitId) {
        if (!this.state.mieter) return null;
        
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        return this.state.mieter.find(m => {
            const isMatch = String(m.einheit_id) === String(einheitId);
            // Wir normalisieren auch den Vergleichswert 'aktiv' auf Lowercase
            const istAktiv = String(m.aktiv).toLowerCase() === 'true';
            
            let istNichtAusgezogen = true;
            if (m.auszug_datum && String(m.auszug_datum).trim() !== "") {
                const auszug = new Date(m.auszug_datum);
                if (auszug < heute) istNichtAusgezogen = false;
            }
            return isMatch && istAktiv && istNichtAusgezogen;
        });
    }
};

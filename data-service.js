/**
 * DATA-SERVICE (v1.5 - Full Integrity)
 * Fokus: Kleinschreibung & Vollständige Mieter-Logik
 */
const dataService = {
    state: {
        objekte: [],
        einheiten: [],
        mieter: [],
        zaehler_staende: [],
        parameter: [],
        fixkosten: [],
        transaktionen: []
    },

    setInitialData(data) {
        // Blatt-Namen (Keys) sind GROSS, Inhalte sind KLEIN
        this.state.objekte = data.Objekte || [];
        this.state.einheiten = data.Einheiten || [];
        this.state.mieter = data.Mieter || [];
        this.state.zaehler_staende = data.Zaehler_Staende || [];
        this.state.parameter = data.Parameter || [];
        this.state.fixkosten = data.Fixkosten || [];
        this.state.transaktionen = data.Transaktionen || [];
        
        console.log("DataService: State erfolgreich befüllt.", this.state);
    },

    getUniqueObjects() {
        // Wir nehmen direkt die IDs aus dem Objekte-Array (laut Log vorhanden!)
        if (!this.state.objekte || this.state.objekte.length === 0) {
            console.warn("DataService: Keine Objekte im State gefunden.");
            return [];
        }
        const ids = this.state.objekte.map(o => o.objekt_id);
        console.log("DataService: IDs aus 'objekte' extrahiert:", ids);
        return ids;
    },

    getUnitsByObject(objektId) {
        if (!this.state.einheiten) return [];
        return this.state.einheiten.filter(e => String(e.objekt_id) === String(objektId));
    },

    getActiveMieter(einheitId) {
        if (!this.state.mieter) return null;
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        return this.state.mieter.find(m => {
            const matchesId = String(m.einheit_id) === String(einheitId);
            const istAktiv = String(m.aktiv).toLowerCase() === 'true';
            
            let nichtAusgezogen = true;
            if (m.auszug_datum && String(m.auszug_datum).trim() !== "") {
                const auszug = new Date(m.auszug_datum);
                if (auszug < heute) nichtAusgezogen = false;
            }
            
            return matchesId && istAktiv && nichtAusgezogen;
        });
    }
};

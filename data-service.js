/**
 * REF-20260303-01: Fix für Daten-Mapping & Lade-Blocker
 * Ziel: Sicherstellen, dass der State unabhängig von der Schreibweise des Backends befüllt wird.
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
        if (!data) return;

        // Robustes Mapping: Akzeptiert 'Einheiten' (Backend) oder 'einheiten' (State)
        this.state.objekte = data.Objekte || data.objekte || [];
        this.state.einheiten = data.Einheiten || data.einheiten || [];
        this.state.mieter = data.Mieter || data.mieter || [];
        this.state.zaehler_staende = data.Zaehler_Staende || data.zaehler_staende || [];
        this.state.parameter = data.Parameter || data.parameter || [];
        this.state.fixkosten = data.Fixkosten || data.fixkosten || [];
        this.state.transaktionen = data.Transaktionen || data.transaktionen || [];
        
        console.log("State erfolgreich initialisiert. Einheiten geladen:", this.state.einheiten.length);
    },

    // ... (getUniqueObjects und getUnitsByObject bleiben UNVERÄNDERT, um API-Bruch zu vermeiden)
    getUniqueObjects() {
        if (!this.state.einheiten) return [];
        const ids = this.state.einheiten.map(e => e.objekt_id);
        return [...new Set(ids)].filter(id => id);
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
            const isMatch = String(m.einheit_id) === String(einheitId);
            const istAktiv = String(m.aktiv).toLowerCase() === 'true' || m.aktiv === true;
            
            let istNichtAusgezogen = true;
            if (m.auszug_datum && String(m.auszug_datum).trim() !== "") {
                const auszug = new Date(m.auszug_datum);
                if (auszug < heute) istNichtAusgezogen = false;
            }
            return isMatch && istAktiv && istNichtAusgezogen;
        });
    }
};

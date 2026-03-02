/**
 * DATA-SERVICE: Das Gehirn der App.
 * Stand: 03.03.2026 - Konsolidierte Fassung
 */
const dataService = {
    // Zentraler State für alle 7 Tabellen gemäß DATA_MODEL.md
    state: {
        Objekte: [],
        Einheiten: [],
        Mieter: [],
        Zaehler_Staende: [],
        Parameter: [],
        Fixkosten: [],
        Transaktionen: []
    },

    /**
     * Initialisiert den State mit den Daten aus der Cloud.
     * Stellt sicher, dass keine Tabelle 'undefined' ist.
     */
    setInitialData(data) {
        this.state.Objekte = data.Objekte || [];
        this.state.Einheiten = data.Einheiten || [];
        this.state.Mieter = data.Mieter || [];
        this.state.Zaehler_Staende = data.Zaehler_Staende || [];
        this.state.Parameter = data.Parameter || [];
        this.state.Fixkosten = data.Fixkosten || [];
        this.state.Transaktionen = data.Transaktionen || [];
        
        console.log("State erfolgreich initialisiert.");
    },

    /**
     * ESSENZIELL: Gibt eine eindeutige Liste aller Objekt-IDs zurück.
     * Wird von uiService.renderAll() benötigt.
     */
    getUniqueObjects() {
        // Falls Einheiten noch nicht geladen, leeres Array zurückgeben
        if (!this.state.Einheiten || this.state.Einheiten.length === 0) return [];
        
        // Mappt alle vorhandenen objekt_ids aus der Einheiten-Tabelle
        const ids = this.state.Einheiten.map(e => e.objekt_id);
        
        // Nutzt Set für Eindeutigkeit und filtert leere Werte aus
        return [...new Set(ids)].filter(id => id && String(id).trim() !== "");
    },

    /**
     * Findet alle Einheiten, die zu einem bestimmten Objekt gehören.
     */
    getEinheitenByObjekt(objektId) {
        return this.state.Einheiten.filter(e => String(e.objekt_id) === String(objektId));
    },

    /**
     * Ermittelt den aktuell gültigen Mieter für eine Einheit.
     * Logik: aktiv=true UND (auszug_datum leer ODER in der Zukunft)
     */
    getActiveMieter(einheitId) {
        if (!this.state.Mieter || this.state.Mieter.length === 0) return null;

        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        return this.state.Mieter.find(m => {
            const isMatch = String(m.einheit_id) === String(einheitId);
            const istAktiv = String(m.aktiv).toLowerCase() === 'true' || m.aktiv === true;
            
            let istNichtAusgezogen = true;
            if (m.auszug_datum && String(m.auszug_datum).trim() !== "") {
                const auszug = new Date(m.auszug_datum);
                if (auszug < heute) {
                    istNichtAusgezogen = false;
                }
            }

            return isMatch && istAktiv && istNichtAusgezogen;
        });
    }
};

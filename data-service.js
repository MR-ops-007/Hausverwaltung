/**
 * DATA-SERVICE: Das Gehirn der App.
 * Verwaltet den State für alle 7 Tabellen aus DATA_MODEL.md.
 */
const dataService = {
    // Initialer State mit leeren Arrays, um "undefined"-Fehler zu vermeiden
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
     * Befüllt den State mit den Daten aus der Cloud (doGet).
     */
    setInitialData(data) {
        this.state.Objekte = data.Objekte || [];
        this.state.Einheiten = data.Einheiten || [];
        this.state.Mieter = data.Mieter || [];
        this.state.Zaehler_Staende = data.Zaehler_Staende || [];
        this.state.Parameter = data.Parameter || [];
        this.state.Fixkosten = data.Fixkosten || [];
        this.state.Transaktionen = data.Transaktionen || [];
        
        console.log("State erfolgreich initialisiert für alle 7 Tabellen.");
    },

    /**
     * Findet den aktuell gültigen Mieter für eine Einheit.
     * Berücksichtigt 'aktiv'-Flag und das Auszugsdatum.
     */
    getActiveMieter(einheitId) {
        if (!this.state.Mieter || this.state.Mieter.length === 0) return null;

        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        return this.state.Mieter.find(m => {
            const isMatch = String(m.einheit_id) === String(einheitId);
            const istAktiv = String(m.aktiv).toLowerCase() === 'true' || m.aktiv === true;
            
            let istNichtAusgezogen = true;
            if (m.auszug_datum && m.auszug_datum !== "") {
                const auszug = new Date(m.auszug_datum);
                if (auszug < heute) {
                    istNichtAusgezogen = false;
                }
            }

            return isMatch && istAktiv && istNichtAusgezogen;
        });
    },

    /**
     * Hilfsfunktion: Gibt alle Einheiten eines bestimmten Objekts zurück.
     */
    getEinheitenByObjekt(objektId) {
        return this.state.Einheiten.filter(e => String(e.objekt_id) === String(objektId));
    }
};

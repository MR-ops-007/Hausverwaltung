/**
 * DATA-SERVICE: Zentraler Datenspeicher
 * RESTAURIERTE FASSUNG (Stand 03.03.2026)
 * Fixes: getUnitsByObject wiederhergestellt, Mieter-Logik korrigiert.
 */
const dataService = {
    // Wir behalten die Kleinschreibung bei, da ui-service.js darauf basiert
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
     * Befüllt den State. Mappt Groß- auf Kleinschreibung für Kompatibilität.
     */
    setInitialData(data) {
        this.state.objekte = data.Objekte || [];
        this.state.einheiten = data.Einheiten || [];
        this.state.mieter = data.Mieter || [];
        this.state.zaehler_staende = data.Zaehler_Staende || [];
        this.state.parameter = data.Parameter || [];
        this.state.fixkosten = data.Fixkosten || [];
        this.state.transaktionen = data.Transaktionen || [];
        console.log("State erfolgreich initialisiert.");
    },

    /**
     * KRITISCH: Wird von ui-service.js benötigt.
     */
    getUniqueObjects() {
        if (!this.state.einheiten) return [];
        const ids = this.state.einheiten.map(e => e.objekt_id);
        return [...new Set(ids)].filter(id => id);
    },

    /**
     * KRITISCH: Wird von ui-service.js benötigt.
     */
    getUnitsByObject(objektId) {
        if (!this.state.einheiten) return [];
        return this.state.einheiten.filter(e => String(e.objekt_id) === String(objektId));
    },

    /**
     * NEU: Findet nur den AKTUELLEN Mieter (Fix für Inaktive).
     */
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

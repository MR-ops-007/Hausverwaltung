/**
 * Data-Service
 * Zentraler Datenspeicher und Abfrage-Logik
 */
const dataService = {
    state: {
        einheiten: [],
        mieter: [],
        zaehler_staende: [],
        parameter: [],
        transaktionen: []
    },

    // Wird beim App-Start aufgerufen, um die Daten aus Google Sheets zu speichern
    setInitialData(data) {
        this.state.einheiten = data.einheiten || [];
        this.state.mieter = data.mieter || [];
        // Support für beide Namensvarianten (zaehler oder zaehler_staende)
        this.state.zaehler_staende = data.zaehler_staende || data.zaehler || [];
        this.state.parameter = data.parameter || [];
        this.state.transaktionen = data.transaktionen || [];
        console.log("DataService: Daten erfolgreich geladen", this.state);
    },

    // Liefert die eindeutigen Namen der Häuser/Objekte für die Buttons
    getUniqueObjects() {
        const objects = this.state.einheiten.map(u => u.objekt);
        return [...new Set(objects)].filter(obj => obj);
    },

    // Filtert alle Wohnungen eines bestimmten Hauses
    getUnitsByObject(objName) {
        return this.state.einheiten.filter(u => u.objekt === objName);
    },

    // Findet den Mieter zu einer Einheit (Die Aktiv-Logik macht der calcService!)
    getActiveMieter(einheitId) {
        if (!einheitId) return null;
        return this.state.mieter.find(m => String(m.einheit_id).trim() === String(einheitId).trim());
    },

    /**
     * Holt einen Wert aus der Parameter-Tabelle (z.B. "preis_oel")
     * @param {string} key - Der Name des Parameters
     * @returns {number|string|null}
     */
    getParameter(key) {
        const param = this.state.parameter.find(p => p.key === key);
        if (!param) {
            console.warn(`Parameter '${key}' nicht gefunden.`);
            return null;
        }
        // Versuchen, den Wert als Zahl zurückzugeben, sonst als String
        const num = parseFloat(param.wert);
        return isNaN(num) ? param.wert : num;
    }
};

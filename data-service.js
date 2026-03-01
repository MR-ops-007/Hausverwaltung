/**
 * Data-Service
 * Zentraler Datenspeicher und Abfrage-Logik
 */
const dataService = {
    state: {
        einheiten: [],
        mieter: [],
        zaehler_staende: [],
        parameter: []
    },

    setInitialData(data) {
        console.log("DataService: Rohdaten erhalten", data);
        
        // Google Sheets liefert oft ein Objekt, das die Tabellennamen als Keys hat
        // Wir mappen hier extrem tolerant gegen Groß-/Kleinschreibung
        const getSheet = (name) => {
            return data[name] || data[name.toLowerCase()] || data[name.charAt(0).toUpperCase() + name.slice(1)] || [];
        };

        this.state.einheiten = getSheet('Einheiten');
        this.state.mieter = getSheet('Mieter');
        this.state.zaehler_staende = getSheet('Zaehler_Staende') || getSheet('Zaehler');
        this.state.parameter = getSheet('Parameter');

        console.log("DataService: State befüllt", this.state);
    },

    getUniqueObjects() {
        if (!this.state.einheiten || this.state.einheiten.length === 0) return [];
        // Wir suchen nach 'Objekt' oder 'objekt' in den Spalten
        const objects = this.state.einheiten.map(u => u.Objekt || u.objekt || u.Haus);
        return [...new Set(objects)].filter(obj => obj);
    },

    getUnitsByObject(objName) {
        return this.state.einheiten.filter(u => (u.Objekt || u.objekt || u.Haus) === objName);
    },

    getActiveMieter(einheitId) {
        return this.state.mieter.find(m => String(m.Einheit_ID || m.einheit_id) === String(einheitId));
    }
};

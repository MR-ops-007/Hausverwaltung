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
        console.log("DataService: Verarbeite Rohdaten...", data);
        
        // Helfer-Funktion, die Daten findet, egal ob groß oder klein geschrieben
        const getSheet = (name) => {
            return data[name] || data[name.toLowerCase()] || data[name.charAt(0).toUpperCase() + name.slice(1)] || [];
        };

        this.state.einheiten = getSheet('Einheiten');
        this.state.mieter = getSheet('Mieter');
        this.state.zaehler_staende = getSheet('Zaehler_Staende') || getSheet('Zaehler');
        this.state.parameter = getSheet('Parameter');

        console.log("DataService: State erfolgreich befüllt:", this.state);
    },

    getUniqueObjects() {
        if (!this.state.einheiten || this.state.einheiten.length === 0) return [];
        // Sucht in der Tabelle 'Einheiten' nach der Spalte für das Haus/Objekt
        const objects = this.state.einheiten.map(u => u.Objekt || u.objekt || u.Haus || u.haus);
        return [...new Set(objects)].filter(obj => obj);
    },

    getUnitsByObject(objName) {
        return this.state.einheiten.filter(u => (u.Objekt || u.objekt || u.Haus || u.haus) === objName);
    },

    getActiveMieter(einheitId) {
        if (!einheitId) return null;
        // Findet den Mieter passend zur Wohnung-ID
        return this.state.mieter.find(m => String(m.Einheit_ID || m.einheit_id) === String(einheitId));
    },

    getParameter(key) {
        const param = this.state.parameter.find(p => p.key === key || p.Key === key);
        return param ? (parseFloat(param.wert || param.Wert) || param.wert || param.Wert) : null;
    }
};

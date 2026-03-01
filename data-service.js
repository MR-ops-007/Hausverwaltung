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
        const getSheet = (name) => {
            return data[name] || data[name.toLowerCase()] || data[name.charAt(0).toUpperCase() + name.slice(1)] || [];
        };

        this.state.einheiten = getSheet('Einheiten');
        this.state.mieter = getSheet('Mieter');
        this.state.zaehler_staende = getSheet('Zaehler_Staende') || getSheet('Zaehler');
        this.state.parameter = getSheet('Parameter');
        console.log("DataService: State befüllt.");
    },

    getUniqueObjects() {
        if (!this.state.einheiten || this.state.einheiten.length === 0) return [];
        // Nutzt primär objekt_id laut deinem Konsolen-Log
        const objects = this.state.einheiten.map(u => u.objekt_id || u.Objekt || u.objekt || u.Haus);
        return [...new Set(objects)].filter(obj => obj);
    },

    getUnitsByObject(objId) {
        return this.state.einheiten.filter(u => (u.objekt_id || u.Objekt || u.objekt) === objId);
    },

    getActiveMieter(einheitId) {
        if (!einheitId) return null;
        // Nutzt mietername laut deinem Konsolen-Log
        return this.state.mieter.find(m => String(m.einheit_id || m.Einheit_ID) === String(einheitId));
    },

    getParameter(objId, key) {
        // Parameter sind oft objekt-spezifisch
        const param = this.state.parameter.find(p => 
            (p.objekt_id === objId) && (p.bezeichnung === key || p.key === key)
        );
        return param ? parseFloat(param.wert) : null;
    }
};

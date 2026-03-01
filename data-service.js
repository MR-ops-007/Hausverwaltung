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
        
        const getSheet = (name) => {
            return data[name] || data[name.toLowerCase()] || data[name.charAt(0).toUpperCase() + name.slice(1)] || [];
        };

        this.state.einheiten = getSheet('Einheiten');
        this.state.mieter = getSheet('Mieter');
        this.state.zaehler_staende = getSheet('Zaehler_Staende') || getSheet('Zaehler');
        this.state.parameter = getSheet('Parameter');

        console.log("DataService: State befüllt. Einheiten gefunden:", this.state.einheiten.length);
    },

    getUniqueObjects() {
        if (!this.state.einheiten || this.state.einheiten.length === 0) {
            console.warn("DataService: getUniqueObjects aufgerufen, aber einheiten ist leer.");
            return [];
        }
        // Nutzt exakt 'objekt_id' aus deinem Konsolen-Log
        const objects = this.state.einheiten.map(u => u.objekt_id || u.Objekt || u.objekt);
        const unique = [...new Set(objects)].filter(obj => obj);
        console.log("DataService: Eindeutige Objekte extrahiert:", unique);
        return unique;
    },

    getUnitsByObject(objId) {
        return this.state.einheiten.filter(u => (u.objekt_id || u.Objekt || u.objekt) === objId);
    },

    getActiveMieter(einheitId) {
        if (!einheitId) return null;
        // Nutzt 'mietername' aus deinem Konsolen-Log
        return this.state.mieter.find(m => String(m.einheit_id || m.Einheit_ID) === String(einheitId));
    }
};

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
        console.log("DataService empfängt:", data);
        // Robustes Mapping: Wir prüfen verschiedene Key-Schreibweisen
        this.state.einheiten = data.einheiten || data.Einheiten || [];
        this.state.mieter = data.mieter || data.Mieter || [];
        this.state.zaehler_staende = data.zaehler_staende || data.Zaehler_Staende || data.zaehler || [];
        this.state.parameter = data.parameter || data.Parameter || [];
        
        console.log("State nach Mapping:", this.state);
    },

    getUniqueObjects() {
        // Falls einheiten leer ist, können wir nichts rendern
        if (!this.state.einheiten || this.state.einheiten.length === 0) return [];
        
        // Wir holen die Objektnamen und filtern Duplikate
        const objects = this.state.einheiten.map(u => u.objekt || u.Objekt);
        return [...new Set(objects)].filter(obj => obj);
    },

    getUnitsByObject(objName) {
        return this.state.einheiten.filter(u => (u.objekt || u.Objekt) === objName);
    },

    getActiveMieter(einheitId) {
        return this.state.mieter.find(m => String(m.einheit_id || m.Einheit_ID) === String(einheitId));
    }
};

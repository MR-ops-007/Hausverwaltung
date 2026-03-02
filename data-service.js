/**
 * DATA-SERVICE: Das Gehirn der App.
 * Verwaltet den State und filtert Mieter/Einheiten.
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
     * Mappt die Keys exakt so, wie sie im Google Sheet heißen.
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
     * Sucht den aktuell gültigen Mieter für eine Einheit.
     * Logik: 
     * 1. einheit_id muss passen
     * 2. aktiv muss 'true' sein
     * 3. falls ein auszug_datum gesetzt ist, darf dieses nicht in der Vergangenheit liegen
     */
    getActiveMieter(einheitId) {
        if (!this.state.Mieter || this.state.Mieter.length === 0) return null;

        const heute = new Date();
        // Wir setzen die Uhrzeit auf 00:00, um nur das Datum zu vergleichen
        heute.setHours(0, 0, 0, 0);

        return this.state.Mieter.find(m => {
            // 1. ID Check (String-Vergleich zur Sicherheit)
            const isMatch = String(m.einheit_id) === String(einheitId);
            
            // 2. Aktiv-Status Check (robust gegen 'true', 'TRUE' oder echte Booleans)
            const istAktiv = String(m.aktiv).toLowerCase() === 'true' || m.aktiv === true;
            
            // 3. Auszugsdatum Check
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
     * Hilfsfunktion: Gibt alle Einheiten eines bestimmten Objekts zurück
     */
    getEinheitenByObjekt(objektId) {
        return this.state.Einheiten.filter(e => String(e.objekt_id) === String(objektId));
    }
};/**
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

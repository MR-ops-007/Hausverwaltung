/**
 * DATA-SERVICE (v2.1.1 - Bugfix: Fallback-Schutz für leere Google Sheets)
 */
const dataService = {
    state: {
        objekte: [],
        einheiten: [],
        personen: [],
        vertraege: [],
        vertragsparteien: [],
        zaehler: [],
        zaehlerstaende: [],
        zahlungen: [],
        parameter: [],
        fixkosten: [],
        view_aktive_mieter: [] 
    },

    setDashboardData(data) {
        this.state.view_aktive_mieter = data["_view_aktive_mieter"] || [];

        // Generiert die Objekt-Liste aus der config.js
        this.state.objekte = Object.keys(CONFIG)
            .filter(k => typeof CONFIG[k] === 'object' && CONFIG[k].name)
            .map(k => ({ objekt_id: k, bezeichnung: CONFIG[k].name }));

        // Generiert die Einheiten temporär aus der config.js
        let tempEinheiten = [];
        Object.keys(CONFIG).forEach(objId => {
            const conf = CONFIG[objId];
            if (conf && conf.units) {
                for(let i=1; i<=conf.units; i++) {
                    if (conf.excludeUnits && conf.excludeUnits.includes(i)) continue;
                    tempEinheiten.push({ einheit_id: `${objId}_WE_${String(i).padStart(2,'0')}`, objekt_id: objId, nummer: `WE ${i}` });
                }
                if (conf.gewerbe) {
                    for(let i=1; i<=conf.gewerbe; i++) {
                        tempEinheiten.push({ einheit_id: `${objId}_GE_${String(i).padStart(2,'0')}`, objekt_id: objId, nummer: `GE ${i}` });
                    }
                }
                tempEinheiten.push({ einheit_id: `${objId}_Allgemein`, objekt_id: objId, nummer: `Allgemein` });
            }
        });
        this.state.einheiten = tempEinheiten;
        console.log("DataService: Stufe 1 (Dashboard) mit Config-Fallback befüllt.");
    },

    setInitialData(data) {
        // BUGFIX: Überschreibe die funktionierenden Config-Daten NUR, 
        // wenn das Google Sheet auch WIRKLICH gefüllt ist (mehr als 0 Einträge).
        if (data.Objekte && data.Objekte.length > 0) {
            this.state.objekte = data.Objekte;
        }
        
        if (data.Einheiten && data.Einheiten.length > 0) {
            this.state.einheiten = data.Einheiten;
        }
        
        // Die restlichen Daten wie gewohnt übernehmen
        this.state.personen = data.Personen || [];
        this.state.vertraege = data.Vertraege || [];
        this.state.vertragsparteien = data.Vertragsparteien || [];
        this.state.zaehler = data.Zaehler || [];
        this.state.zaehlerstaende = data.Zaehlerstaende || [];
        this.state.zahlungen = data.Zahlungen || [];
        this.state.parameter = data.Parameter || [];
        this.state.fixkosten = data.Fixkosten || [];
        
        console.log("DataService: Stufe 2 (Hintergrund-State) geschützt befüllt.");
    },

    getUniqueObjects() {
        if (!this.state.objekte) return [];
        return this.state.objekte.map(o => o.objekt_id);
    },

    getUnitsByObject(objektId) {
        if (!this.state.einheiten) return [];
        return this.state.einheiten.filter(e => String(e.objekt_id) === String(objektId));
    }
};

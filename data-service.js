/**
 * DATA-SERVICE (v2.1 - Integration Lese-Cache & config.js Fallback)
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
        view_aktive_mieter: [] // Der neue Hochgeschwindigkeits-Cache
    },

    setDashboardData(data) {
        // Speichert die flache Tabelle aus dem Backend
        this.state.view_aktive_mieter = data["_view_aktive_mieter"] || [];

        // Generiert die Objekt-Liste temporär aus der config.js, 
        // damit die UI in Stufe 1 sofort rendern kann (bevor das Google Sheet komplett geladen ist).
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
        console.log("DataService: Stufe 1 (Dashboard) befüllt.");
    },

    setInitialData(data) {
        // Überschreibt die temporären config.js Daten nun mit den echten Daten aus dem Google Sheet
        this.state.objekte = data.Objekte || this.state.objekte;
        this.state.einheiten = data.Einheiten || this.state.einheiten;
        this.state.personen = data.Personen || [];
        this.state.vertraege = data.Vertraege || [];
        this.state.vertragsparteien = data.Vertragsparteien || [];
        this.state.zaehler = data.Zaehler || [];
        this.state.zaehlerstaende = data.Zaehlerstaende || [];
        this.state.zahlungen = data.Zahlungen || [];
        this.state.parameter = data.Parameter || [];
        this.state.fixkosten = data.Fixkosten || [];
        
        console.log("DataService: Stufe 2 (Hintergrund-State) komplett befüllt.");
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

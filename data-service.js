/**
 * DATA-SERVICE (v2.1.2 - Robustes Error-Handling gegen Null-Response)
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
        view_aktive_mieter: [],
        view_verbrauch_monat: [],
        view_verbrauch_jahr: [],
        view_verbrauch_audit: []
    },

    setDashboardData(data) {
        // Defensive Programmierung: Prüfe ob data existiert
        if (!data || typeof data !== 'object') {
            console.warn("DataService: Ungültige Dashboard-Daten empfangen.");
            return;
        }

        this.state.view_aktive_mieter = data["_view_aktive_mieter"] || [];

        // Sichere Generierung aus CONFIG
        if (typeof CONFIG !== 'undefined') {
            this.state.objekte = Object.keys(CONFIG)
                .filter(k => CONFIG[k] && typeof CONFIG[k] === 'object' && CONFIG[k].name)
                .map(k => ({ objekt_id: k, bezeichnung: CONFIG[k].name }));

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
        }
        console.log("DataService: Stufe 1 (Dashboard) initialisiert.");
    },

    setConsumptionData(data) {
        if (!data || typeof data !== 'object') {
            console.warn("DataService: Ungültige Verbrauchsview-Daten empfangen.");
            return;
        }

        this.state.view_verbrauch_monat = data["_view_verbrauch_monat"] || [];
        this.state.view_verbrauch_jahr = data["_view_verbrauch_jahr"] || [];
        this.state.view_verbrauch_audit = data["_view_verbrauch_audit"] || [];

        console.log("DataService: Verbrauchsviews übernommen.");
    },

    setInitialData(data) {
        // Defensive Programmierung: Wenn data null/undefined ist, nicht weiterverarbeiten
        if (!data || typeof data !== 'object') {
            console.error("DataService: Initialdaten sind null oder undefiniert.");
            return;
        }

        // Sicherer Zugriff auf Array-Properties mit Fallback auf leere Arrays
        this.state.objekte = (Array.isArray(data.Objekte) && data.Objekte.length > 0) ? data.Objekte : this.state.objekte;
        this.state.einheiten = (Array.isArray(data.Einheiten) && data.Einheiten.length > 0) ? data.Einheiten : this.state.einheiten;
        
        this.state.personen = data.Personen || [];
        this.state.vertraege = data.Vertraege || [];
        this.state.vertragsparteien = data.Vertragsparteien || [];
        this.state.zaehler = data.Zaehler || [];
        this.state.zaehlerstaende = data.Zaehlerstaende || [];
        this.state.zahlungen = data.Zahlungen || [];
        this.state.parameter = data.Parameter || [];
        this.state.fixkosten = data.Fixkosten || [];
        
        console.log("DataService: Stufe 2 (Hintergrund-State) sicher übernommen.");
    },

    getUniqueObjects() {
        return Array.isArray(this.state.objekte) ? this.state.objekte.map(o => o.objekt_id) : [];
    },

    getUnitsByObject(objektId) {
        if (!Array.isArray(this.state.einheiten)) return [];
        return this.state.einheiten.filter(e => String(e.objekt_id) === String(objektId));
    }
};

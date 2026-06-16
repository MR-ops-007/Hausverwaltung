// --- START: KOMPLETTES DATA-SERVICE.JS (VERSION 2.0) ---
/**
 * DATA-SERVICE (v2.0 - Refactoring nach DATA_MODEL.md)
 * Fokus: Relationales Datenmodell (Vertraege, Personen, Vertragsparteien)
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
        fixkosten: []
    },

    setInitialData(data) {
        // Blatt-Namen (Keys) aus GAS sind GROSS/CamelCase, wir mappen auf unsere state-keys (KLEIN)
        this.state.objekte = data.Objekte || [];
        this.state.einheiten = data.Einheiten || [];
        this.state.personen = data.Personen || [];
        this.state.vertraege = data.Vertraege || [];
        this.state.vertragsparteien = data.Vertragsparteien || [];
        this.state.zaehler = data.Zaehler || [];
        this.state.zaehlerstaende = data.Zaehlerstaende || [];
        this.state.zahlungen = data.Zahlungen || [];
        this.state.parameter = data.Parameter || [];
        this.state.fixkosten = data.Fixkosten || [];
        
        console.log("DataService: State erfolgreich befüllt.", this.state);
    },

    getUniqueObjects() {
        if (!this.state.objekte || this.state.objekte.length === 0) {
            console.warn("DataService: Keine Objekte im State gefunden.");
            return [];
        }
        const ids = this.state.objekte.map(o => o.objekt_id);
        console.log("DataService: IDs aus 'objekte' extrahiert:", ids);
        return ids;
    },

    getUnitsByObject(objektId) {
        if (!this.state.einheiten) return [];
        return this.state.einheiten.filter(e => String(e.objekt_id) === String(objektId));
    },

    /**
     * NEU: Löst die alte 'getActiveMieter' Funktion ab.
     * Gibt ein Objekt zurück, das den Vertrag und ein Array aller Hauptmieter enthält.
     */
    getActiveVertragInfo(einheitId) {
        if (!this.state.vertraege || this.state.vertraege.length === 0) return null;
        
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        // 1. Aktiven Vertrag für diese Einheit finden
        const aktiverVertrag = this.state.vertraege.find(v => {
            const matchesId = String(v.einheit_id) === String(einheitId);
            const istAktiv = String(v.aktiv).toLowerCase() === 'true';
            
            let nichtBeendet = true;
            if (v.end_datum && String(v.end_datum).trim() !== "") {
                // Konvertierung von DD.MM.YYYY zu Date-Objekt (falls notwendig) oder direkter Parse
                // Hier gehen wir von einem Standard-Datumsformat aus, das JS parsen kann.
                const endeTeile = String(v.end_datum).split('.');
                let ende = new Date(v.end_datum);
                if(endeTeile.length === 3) {
                    ende = new Date(`${endeTeile[2]}-${endeTeile[1]}-${endeTeile[0]}`);
                }
                if (ende < heute) nichtBeendet = false;
            }
            
            return matchesId && istAktiv && nichtBeendet;
        });

        if (!aktiverVertrag) return null;

        // 2. Vertragsparteien (Hauptmieter) zu diesem Vertrag finden
        const hauptmieterParteien = this.state.vertragsparteien.filter(vp => 
            String(vp.vertrag_id) === String(aktiverVertrag.vertrag_id) && 
            String(vp.rolle).toLowerCase() === 'hauptmieter'
        );

        // 3. Echte Personendaten (Namen) anhand der person_id auflösen
        const personenDaten = hauptmieterParteien.map(vp => {
            return this.state.personen.find(p => String(p.person_id) === String(vp.person_id));
        }).filter(p => p !== undefined); // Nur gültige Treffer behalten

        return {
            vertrag: aktiverVertrag,
            hauptmieter: personenDaten
        };
    }
};
// --- ENDE: KOMPLETTES DATA-SERVICE.JS (VERSION 2.0) ---

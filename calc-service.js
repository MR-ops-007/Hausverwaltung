// calc-service.js
const calcService = {
    isMieterAktiv(mieter) {
        if (!mieter || !mieter.mietername) return false;

        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        const toDate = (val) => {
            if (!val || String(val).trim() === "") return null;
            const d = new Date(val);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const einzug = toDate(mieter.einzug_datum);
        const auszug = toDate(mieter.auszug_datum);

        // DIAGNOSE-LOG (Nur für Azeem oder Problemfälle)
        if (mieter.mietername.includes("Azeem") || auszug !== null) {
            console.log(`Prüfung für ${mieter.mietername}:`);
            console.log(` -> Heute: ${heute.toISOString()}`);
            console.log(` -> Auszug: ${auszug ? auszug.toISOString() : 'keiner'}`);
            console.log(` -> Vergleich (auszug <= heute): ${auszug <= heute}`);
        }

        // Die Kern-Logik
        if (einzug && einzug > heute) return false;
        
        // HIER liegt vermutlich der Hund begraben:
        if (auszug && auszug <= heute) {
            return false;
        }

        return true;
    },

    getUnitStatus(unit, mieter) {
        if (!unit) return "Fehler: Einheit fehlt";
        if (unit.typ === "Allgemein") return "Allgemeinkosten / Haus";
        
        const aktiv = this.isMieterAktiv(mieter);
        
        // Wenn aktiv true ist, MUSS der Name kommen
        if (aktiv === true) {
            return mieter.mietername;
        }
        
        return "Leerstand";
    }
};

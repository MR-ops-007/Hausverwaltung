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

        // Jetzt greift die Logik:
        if (einzug && einzug > heute) return false; // Noch nicht eingezogen
        if (auszug && auszug <= heute) return false; // Schon ausgezogen

        return true; // Aktiv! (Trifft auf Azeem 2027 zu)
    },

    getUnitStatus(unit, mieter) {
        if (!unit) return "Fehler";
        if (unit.typ === "Allgemein") return "Allgemeinkosten / Haus";
        
        return this.isMieterAktiv(mieter) ? mieter.mietername : "Leerstand";
    }
};

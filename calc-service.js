// calc-service.js
const calcService = {
    isMieterAktiv(mieter) {
        // 1. Sicherheit: Ohne Mieter oder Name kein aktiver Status
        if (!mieter || !mieter.mietername) return false;

        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        // Hilfsfunktion zur Datumsumwandlung
        const toDate = (val) => {
            if (!val || String(val).trim() === "") return null;
            const d = new Date(val);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const einzug = toDate(mieter.einzug_datum);
        const auszug = toDate(mieter.auszug_datum);

        // LOGIK-CHECK (Hier lag der Fehler):
        
        // A: Ist er schon eingezogen? (Einzug muss <= heute sein)
        if (einzug && einzug > heute) return false;

        // B: Ist er SCHON WIEDER ausgezogen?
        // Er ist NUR DANN ausgezogen, wenn ein Datum da ist UND dieses <= heute liegt.
        if (auszug && auszug <= heute) {
            return false;
        }

        // Wenn A und B nicht zutreffen, ist der Mieter AKTIV.
        return true;
    },

    getUnitStatus(unit, mieter) {
        if (!unit) return "Fehler: Einheit fehlt";
        
        // Haus Allgemein
        if (unit.typ === "Allgemein") return "Allgemeinkosten / Haus";
        
        // Nutze die korrigierte Logik
        if (this.isMieterAktiv(mieter)) {
            return mieter.mietername;
        }
        
        return "Leerstand";
    }
};

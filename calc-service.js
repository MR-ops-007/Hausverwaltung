// calc-service.js

const calcService = {
    isMieterAktiv(mieter) {
        // 1. Grund-Check: Existiert das Objekt und hat es einen Namen?
        if (!mieter || !mieter.mietername || String(mieter.mietername).trim() === "") {
            return false;
        }

        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        // 2. Hilfsfunktion: Wandelt ISO-Strings oder deutsche Daten sicher um
        const toDate = (val) => {
            if (!val || String(val).trim() === "") return null;
            const d = new Date(val);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const einzug = toDate(mieter.einzug_datum);
        const auszug = toDate(mieter.auszug_datum);

        // 3. Logik-Entscheidung (Schritt für Schritt)
        
        // A: Mieter ist noch nicht eingezogen?
        if (einzug && einzug > heute) {
            return false;
        }

        // B: Mieter ist bereits ausgezogen? 
        // WICHTIG: Nur wenn ein Datum da ist UND es HEUTE oder in der VERGANGENHEIT liegt.
        if (auszug && auszug <= heute) {
            return false;
        }

        // C: In allen anderen Fällen (Einzug <= heute UND (Auszug leer ODER Auszug > heute))
        return true;
    },

    getUnitStatus(unit, mieter) {
        if (!unit) return "Fehler: Einheit fehlt";
        
        // Falls Haus "Allgemein"
        if (unit.typ === "Allgemein") return "Allgemeinkosten / Haus";
        
        // Prüfung über isMieterAktiv
        if (this.isMieterAktiv(mieter)) {
            return mieter.mietername;
        }
        
        return "Leerstand";
    }
};

// calc-service.js
const calcService = {
    /**
     * Prüft, ob ein Mieter zum jetzigen Zeitpunkt aktiv ist.
     */
    isMieterAktiv(mieter) {
        if (!mieter || !mieter.mietername || mieter.mietername.trim() === "") return false;
    
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);
    
        // Hilfsfunktion: Macht aus egal was ein sauberes Datums-Objekt um 00:00 Uhr
        const normalizeDate = (input) => {
            if (!input || String(input).trim() === "") return null;
            const d = new Date(input);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        };
    
        const einzug = normalizeDate(mieter.einzug_datum);
        const auszug = normalizeDate(mieter.auszug_datum);
    
        // Logik-Check:
        // 1. Ist der Mieter überhaupt schon eingezogen?
        if (einzug && einzug > heute) {
            return false; 
        }
    
        // 2. Ist der Mieter bereits wieder ausgezogen?
        // Nur wenn ein Auszugsdatum existiert UND dieses in der Vergangenheit oder HEUTE liegt.
        if (auszug && auszug <= heute) {
            return false;
        }
    
        // Wenn er eingezogen ist und das Auszugsdatum entweder leer oder in der Zukunft liegt:
        return true;
    },

    /**
     * Ermittelt den Status-Text für eine Einheit
     */
    getUnitStatus(unit, mieter) {
        // Sicherheitscheck: Falls unit aus irgendeinem Grund leer ist
        if (!unit) return "Fehler: Keine Einheit"; 
        
        if (unit.typ === "Allgemein") return "Allgemeinkosten / Haus";
        
        if (this.isMieterAktiv(mieter)) return mieter.mietername;
        
        return "Leerstand";
    }
};

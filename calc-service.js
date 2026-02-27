// calc-service.js
const calcService = {
    /**
     * Prüft, ob ein Mieter zum jetzigen Zeitpunkt aktiv ist.
     */
    isMieterAktiv(mieter) {
        if (!mieter || !mieter.mietername) return false;
    
        const heute = new Date();
        heute.setHours(0, 0, 0, 0); // Zeit ignorieren, nur Datum zählen
    
        // Hilfsfunktion zur Datumsumwandlung
        const parseDate = (dateStr) => {
            if (!dateStr || String(dateStr).trim() === "") return null;
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? null : d;
        };
    
        const einzug = parseDate(mieter.einzug_datum);
        const auszug = parseDate(mieter.auszug_datum);
    
        // LOGIK-PRÜFUNG:
        // 1. Wenn noch nicht eingezogen -> nicht aktiv
        if (einzug && einzug > heute) return false;
    
        // 2. Wenn ausgezogen (Auszugsdatum liegt in der Vergangenheit oder ist heute) -> nicht aktiv
        // Wichtig: Wenn auszug > heute, ist er NOCH aktiv!
        if (auszug && auszug <= heute) return false;
    
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

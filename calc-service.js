// calc-service.js
const calcService = {
    /**
     * Prüft, ob ein Mieter zum jetzigen Zeitpunkt aktiv ist.
     */
    isMieterAktiv(mieter) {
        if (!mieter || !mieter.mietername) return false;
    
        // Wir setzen "heute" auf den Beginn des Tages (00:00:00)
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);
    
        const parseDate = (dateStr) => {
            if (!dateStr || String(dateStr).trim() === "") return null;
            
            const d = new Date(dateStr);
            // Da Google ISO-Strings schickt, setzen wir auch hier die Zeit auf 0,
            // damit wir nur die Kalendertage vergleichen.
            if (!isNaN(d.getTime())) {
                d.setHours(0, 0, 0, 0);
                return d;
            }
            return null;
        };
    
        const einzug = parseDate(mieter.einzug_datum);
        const auszug = parseDate(mieter.auszug_datum);
    
        // 1. Wenn Einzug in der Zukunft -> Noch nicht aktiv
        if (einzug && einzug > heute) return false;
    
        // 2. Wenn Auszug in der Vergangenheit (oder heute) -> Nicht mehr aktiv
        // Wenn Auszug (31.12.2027) > heute (27.02.2026) -> Aktiv bleibt TRUE
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

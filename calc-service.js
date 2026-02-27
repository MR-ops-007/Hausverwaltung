// calc-service.js
const calcService = {
    /**
     * Prüft, ob ein Mieter zum jetzigen Zeitpunkt aktiv ist.
     */
    isMieterAktiv(mieter) {
        if (!mieter) return false;
        
        const heute = new Date();
        heute.setHours(0, 0, 0, 0); // Nur das Datum vergleichen, nicht die Uhrzeit

        const einzug = mieter.einzug_datum ? new Date(mieter.einzug_datum) : null;
        const auszug = mieter.auszug_datum ? new Date(mieter.auszug_datum) : null;

        // Regel: Einzug muss in der Vergangenheit/Gegenwart liegen
        if (einzug && einzug > heute) return false;

        // Regel: Auszug muss leer sein oder in der Zukunft liegen
        if (auszug && auszug <= heute) return false;

        return true;
    },

    /**
     * Ermittelt den Status-Text für eine Einheit
     */
    getUnitStatus(unit, mieter) {
        if (unit.typ === "Allgemein") return "Allgemeinkosten / Haus";
        if (this.isMieterAktiv(mieter)) return mieter.mietername;
        return "Leerstand";
    }
};

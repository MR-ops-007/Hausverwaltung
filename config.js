 /**
 * HAUSVERWALTUNG - FRONTEND CONFIGURATION
 * Version: 3.5 (Backend 4.3.1 Deployment)
 * Stand: 27.06.2026
 */

const CONFIG = {
    // 1. Die zentrale URL (Single Source of Truth)
    API_URL: "https://script.google.com/macros/s/AKfycbxP1AzOxbGQH3aFYEJzSwxbsQkaUQQ4EKXLpMJvdJYc0TD7sTEw6C_9h1SZshG7A9USog/exec",
    
    // 2. Globale Anwendungseinstellungen
    APP_VERSION: "3.5",
    DEBUG_MODE: true,

    // 3. Bestehende Objekt-Einstellungen (DÜRFEN NICHT GELÖSCHT WERDEN!)
    "LOK": {
        name: "🏠 Lokschuppen",
        units: 15,
        gewerbe: 1,
        meterTypes: ["KW", "WW", "Strom"], // WW ist hier für Mieter dabei!
        defaultMeters: ["kaltwasser_m3", "warmwasser_m3", "strom_ht_kwh"],
        customMeters: {
            "LOK_Allgemein": ["kaltwasser_m3", "warmwasser_m3", "strom_ht_kwh", "strom_nt_kwh", "oel_stand_l"],
        },
        hasOil: true
    },
    "Ra-HS-29": {
        name: "🏢 Hauptstraße 29",
        units: 11,
        gewerbe: 2,
        excludeUnits: [9], // Diese Nummern werden übersprungen
        meterTypes: ["KW", "WW", "Strom"],
        generalMeters: ["Strom_HT", "Strom_NT", "KW_Haus"],
        defaultMeters: ["kaltwasser_m3", "warmwasser_m3", "strom_ht_kwh"],
        customMeters: {
            "Ra-HS-29_Allgemein": ["kaltwasser_m3", "warmwasser_m3", "strom_ht_kwh", "strom_nt_kwh", "oel_stand_l"],
            "Ra-HS-29_GE_01": ["kaltwasser_m3", "warmwasser_m3", "strom_ht_kwh", "strom_nt_kwh", "maschinenstunden"],
        },
        hasOil: true
    },
    "TEST": {
        name: "Test für Produktivsystem",
        units: 2,
        meterTypes: ["KW", "WW", "Strom"],
        defaultMeters: ["kaltwasser_m3", "warmwasser_m3", "strom_ht_kwh"],
        hasOil: false
    }
};

/**
 * LOKALER LAUFZEIT-CACHE (STATE MANAGEMENT)
 * Hier landen die Daten aus der neuen Lese-Ansicht (_view_aktive_mieter)
 * und die Zähler-Stammdaten (inkl. Einbauort) beim App-Start.
 */
const APP_STATE = {
    objekte: [],
    einheiten: [],
    zaehler: [],          // Speichert Zählernummern und statische Einbauorte (<1ms Ladezeit)
    aktiveMieter: [],     // Speicher für die blitzschnelle Lese-Ansicht aus dem Backend
    isLoaded: false
};

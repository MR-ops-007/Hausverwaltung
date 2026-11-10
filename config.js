 /**
 * HAUSVERWALTUNG - FRONTEND CONFIGURATION
 * Versionen und Deploy-Status: siehe CHANGELOG.md
 */

const configRuntimeHost = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : {});
const runtimeConfig = configRuntimeHost.HV_RUNTIME_CONFIG
    ? configRuntimeHost.HV_RUNTIME_CONFIG
    : {};
const normalizeEnvironment = value => {
    const normalized = String(value || 'production').trim().toLowerCase();
    return normalized === 'test' ? 'test' : 'production';
};
const runtimeEnvironment = normalizeEnvironment(runtimeConfig.environment);
const runtimeProfiles = runtimeConfig.profiles && typeof runtimeConfig.profiles === 'object'
    ? runtimeConfig.profiles
    : {};
const selectedProfile = runtimeProfiles[runtimeEnvironment] || runtimeConfig;
const runtimeApiUrl = typeof selectedProfile.apiUrl === 'string'
    ? selectedProfile.apiUrl.trim()
    : '';

const CONFIG = {
    ENVIRONMENT: runtimeEnvironment,
    ENVIRONMENT_LABEL: selectedProfile.label || (runtimeEnvironment === 'test' ? 'TEST' : 'PRODUKTION'),
    ENVIRONMENT_PROFILES: runtimeProfiles,
    // Die Backend-URL kommt ausschließlich aus der lokalen Laufzeitkonfiguration.
    // Dadurch landet weder die produktive noch die Test-URL im öffentlichen Quellcode.
    API_URL: runtimeApiUrl,
    API_CONFIGURED: Boolean(runtimeApiUrl),
    
    // 2. Bestehende Objekt-Einstellungen (DÜRFEN NICHT GELÖSCHT WERDEN!)
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

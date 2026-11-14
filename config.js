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
const runtimeSecrets = configRuntimeHost.HV_RUNTIME_SECRETS
    && typeof configRuntimeHost.HV_RUNTIME_SECRETS === 'object'
    ? configRuntimeHost.HV_RUNTIME_SECRETS
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
const runtimeLocation = configRuntimeHost.location && typeof configRuntimeHost.location === 'object'
    ? configRuntimeHost.location
    : null;
const isLocalMock = Boolean(
    runtimeLocation
    && /^(127\.0\.0\.1|localhost)$/.test(String(runtimeLocation.hostname || ''))
    && new URLSearchParams(String(runtimeLocation.search || '')).get('mock') === '1'
);
const runtimeApiUrl = isLocalMock
    ? 'http://127.0.0.1:8787'
    : typeof selectedProfile.apiUrl === 'string'
    ? selectedProfile.apiUrl.trim()
    : '';
const effectiveEnvironment = isLocalMock ? 'test' : runtimeEnvironment;
const effectiveEnvironmentLabel = isLocalMock
    ? 'LOKALER MOCK · Entenhausen'
    : (selectedProfile.label || (runtimeEnvironment === 'test' ? 'TEST' : 'PRODUKTION'));

const CONFIG = {
    ENVIRONMENT: effectiveEnvironment,
    ENVIRONMENT_LABEL: effectiveEnvironmentLabel,
    ENVIRONMENT_PROFILES: runtimeProfiles,
    LOCAL_ACCESS_KEYS: runtimeSecrets,
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

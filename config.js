const CONFIG = {
    // Die zentrale URL (Single Source of Truth)
    scriptUrl: "https://script.google.com/macros/s/AKfycbx30yy-UKg0YgX7p6obJPdHf00fGzIpFvQ4YkosFEFJJW-Cbt_wIOBlfsh0LNU5XkQypg/exec",

    // Die Objekt-Einstellungen
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
    }
};

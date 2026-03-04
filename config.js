const CONFIG = {
    // Die zentrale URL (Single Source of Truth)
    scriptUrl: "https://script.google.com/macros/s/AKfycbxquYhb2nt1Y7XY_DhwUChG-grCtCRP5lzLhVBat5cW_qgrOzDe8NJQcixSyi2IhosUSw/exec",

    // Die Objekt-Einstellungen
    lokschuppen: {
        name: "🏠 Lokschuppen",
        units: 15,
        gewerbe: 1,
        meterTypes: ["KW", "WW", "Strom"], // WW ist hier für Mieter dabei!
        hasOil: true
    },
    hauptstrasse: {
        name: "🏢 Hauptstraße 29",
        units: 11,
        gewerbe: 2,
        excludeUnits: [9], // Diese Nummern werden übersprungen
        meterTypes: ["KW", "WW", "Strom"],
        generalMeters: ["Strom_HT", "Strom_NT", "KW_Haus"],
        hasOil: true
    }
};

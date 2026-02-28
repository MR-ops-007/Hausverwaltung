// js/app.js
import { loadAllDataFromCloud } from './services/cloud-service.js';
import { processCloudData } from './services/data-service.js';
import { renderDashboard } from './ui/ui-service.js';

async function initApp() {
    console.log("Hausverwaltung-App startet...");
    try {
        // 1. Daten laden
        const rawData = await loadAllDataFromCloud();
        
        // 2. Daten im Data-Service verarbeiten/speichern
        processCloudData(rawData);
        
        // 3. UI initial rendern
        renderDashboard();
        
    } catch (error) {
        console.error("Fehler beim App-Start:", error);
    }
}

// Startet die App, sobald das DOM bereit ist
document.addEventListener('DOMContentLoaded', initApp);

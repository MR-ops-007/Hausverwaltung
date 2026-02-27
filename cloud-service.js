// cloud-service.js
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyX4i1tdCrdfo6De1igVKs2f8yk70UBmkcNlg1fibN3ebXyoO9468sw2v_TeQXttZlzbA/exec";

const cloudService = {
    /**
     * Lädt das komplette relationale Datenpaket aus der Cloud
     */
    async loadAllDataFromCloud() {
        if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("DEINE_URL_HIER")) {
            console.warn("Cloud-URL nicht konfiguriert.");
            return;
        }
        
        try {
            console.log("Lade Stammdaten aus der Cloud...");
            const response = await fetch(GOOGLE_SCRIPT_URL);
            
            if (!response.ok) throw new Error("Netzwerk-Antwort war nicht ok");
            
            const cloudData = await response.json();
            
            // Übergabe des gesamten Pakets an den dataService
            if (cloudData) {
                dataService.updateFromCloud(cloudData);
                console.log("Stammdaten erfolgreich synchronisiert.");
            }
        } catch (e) { 
            console.error("Fehler beim Laden der Cloud-Daten:", e);
            console.log("Offline-Modus: Nutze lokale Bestandsdaten."); 
        }
    },

    /**
     * Sendet eine Transaktion (Zählerstand oder Mietzahlung) an das Google Sheet
     */
    async send(payload) {
        if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("DEINE_URL_HIER")) {
            console.error("Cloud-URL nicht konfiguriert!");
            return false;
        }

        try {
            await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (navigator.onLine) {
                console.log("Transaktion erfolgreich gesendet:", payload.type);
                return true;
            }
            throw new Error("Offline");

        } catch (e) {
            console.warn("Sync fehlgeschlagen, Daten in Warteschlange verschoben:", e);
            dataService.state.queue.push(payload);
            dataService.save();
            return false;
        }
    },

    /**
     * Arbeitet die Warteschlange ab, wenn wieder Internet besteht
     */
    async processOfflineQueue() {
        if (!dataService.state.queue || dataService.state.queue.length === 0 || !navigator.onLine) return;
        
        console.log(`Verarbeite ${dataService.state.queue.length} ausstehende Transaktionen...`);
        const remaining = [];
        for (const entry of dataService.state.queue) {
            const success = await this.send(entry);
            if (!success) remaining.push(entry);
        }
        dataService.state.queue = remaining;
        dataService.save();
    }
};

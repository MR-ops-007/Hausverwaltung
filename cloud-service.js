/**
 * Cloud-Service
 * Zuständig für das Laden von Google Sheets und das Senden von Transaktionen
 */
const cloudService = {
    // Falls die URL nicht in der index.html definiert ist, hier als Fallback eintragen
    scriptUrl: window.scriptUrl || "", 

    /**
     * Lädt alle Tabellenblätter beim Start der App
     * Wird in der index.html aufgerufen
     */
    async loadAllDataFromCloud() {
        console.log("Lade Daten von:", this.scriptUrl);
        if (!this.scriptUrl) {
            console.error("Keine Script-URL gefunden! Bitte in index.html oder cloud-service.js eintragen.");
            return null;
        }

        try {
            const response = await fetch(this.scriptUrl);
            const data = await response.json();
            console.log("Cloud-Daten empfangen:", data);
            return data;
        } catch (error) {
            console.error("Fehler beim Laden der Cloud-Daten:", error);
            // Hier könnte man später Logik für Offline-Cache (LocalStorage) einbauen
            return null;
        }
    },

    /**
     * Sendet neue Daten (z.B. Zählerstände) an das Google Script
     */
    async sendTransaction(transaction) {
        console.log("Sende Transaktion...", transaction);

        if (!navigator.onLine) {
            this.saveToOfflineQueue(transaction);
            return false; 
        }

        try {
            // Wir nutzen POST, um Daten an das Apps Script zu schicken
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                mode: 'no-cors', // Notwendig für Google Apps Script WebApps
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transaction)
            });

            // Bei no-cors wissen wir nicht sicher, ob es geklappt hat, 
            // gehen aber bei fehlendem Error davon aus.
            return true;
        } catch (error) {
            console.error("Sende-Fehler:", error);
            this.saveToOfflineQueue(transaction);
            return false;
        }
    },

    /**
     * Speichert Daten lokal, wenn kein Internet da ist
     */
    saveToOfflineQueue(transaction) {
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        queue.push(transaction);
        localStorage.setItem('offline_queue', JSON.stringify(queue));
        console.warn("Daten in Offline-Queue verschoben.");
    }
};

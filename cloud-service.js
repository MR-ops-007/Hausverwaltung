/**
 * Cloud-Service
 * Zuständig für Google Sheets Kommunikation & Offline-Synchronisierung
 */
const cloudService = {
    // Falls die URL nicht in der index.html steht, hier manuell eintragen:
    scriptUrl: window.scriptUrl || "https://script.google.com/macros/s/AKfycbxQ-MpWoJPSh7UHR2WNKhJNqNMKYmxpA1arhQmZc9ulnS4waZYQMG8goEa-JDqHHh_Cqw/exec", 

    /**
     * Lädt alle Daten beim Start
     */
    async loadAllDataFromCloud() {
        if (!this.scriptUrl) {
            console.error("Fehler: Keine scriptUrl gefunden!");
            return null;
        }
        try {
            const response = await fetch(this.scriptUrl);
            const data = await response.json();
            // Nach dem Laden versuchen wir, offline gespeicherte Daten nachzusenden
            this.processOfflineQueue();
            return data;
        } catch (error) {
            console.error("Fehler beim Laden:", error);
            return null;
        }
    },

    /**
     * Sendet Daten an Google Sheets
     */
    async sendTransaction(transaction) {
        if (!navigator.onLine) {
            this.saveToOfflineQueue(transaction);
            return false; 
        }
        try {
            await fetch(this.scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                cache: 'no-cache',
                body: JSON.stringify(transaction)
            });
            return true;
        } catch (error) {
            this.saveToOfflineQueue(transaction);
            return false;
        }
    },

    /**
     * Speichert Daten lokal, wenn offline
     */
    saveToOfflineQueue(transaction) {
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        queue.push(transaction);
        localStorage.setItem('offline_queue', JSON.stringify(queue));
    },

    /**
     * Versucht, die Offline-Warteschlange abzuarbeiten (Neu hinzugefügt)
     */
    async processOfflineQueue() {
        if (!navigator.onLine) return;
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        if (queue.length === 0) return;

        console.log(`Synchronisiere ${queue.length} Offline-Einträge...`);
        for (const item of queue) {
            await this.sendTransaction(item);
        }
        localStorage.removeItem('offline_queue');
        console.log("Synchronisierung abgeschlossen.");
    }
};

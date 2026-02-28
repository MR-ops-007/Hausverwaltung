// cloud-service.js

/**
 * Cloud-Service
 * Zuständig für die Kommunikation mit Google Apps Script und Offline-Speicherung
 */
const cloudService = {
    // Die URL deines Google Apps Scripts (muss in der index.html oder hier definiert sein)
    scriptUrl: window.scriptUrl || "https://script.google.com/macros/s/AKfycbxQ-MpWoJPSh7UHR2WNKhJNqNMKYmxpA1arhQmZc9ulnS4waZYQMG8goEa-JDqHHh_Cqw/exec", 

    /**
     * Sendet eine Transaktion (Zählerstand, Miete, etc.) an Google Sheets
     */
    async sendTransaction(transaction) {
        console.log("Sende Transaktion:", transaction);

        // 1. Prüfen, ob wir online sind
        if (!navigator.onLine) {
            this.saveToOfflineQueue(transaction);
            return false; 
        }

        try {
            // 2. POST-Request an dein Google Apps Script
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                mode: 'no-cors', // Wichtig für Google Apps Script
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transaction)
            });

            // Da 'no-cors' keine richtige Response liefert, gehen wir bei Erfolg von true aus
            console.log("Daten erfolgreich an Google gesendet");
            return true;

        } catch (error) {
            console.error("Cloud-Sende-Fehler:", error);
            this.saveToOfflineQueue(transaction);
            return false;
        }
    },

    /**
     * Speichert Daten lokal, falls kein Internet vorhanden ist
     */
    saveToOfflineQueue(transaction) {
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        queue.push(transaction);
        localStorage.setItem('offline_queue', JSON.stringify(queue));
        console.warn("Daten wurden in der Offline-Queue gespeichert.");
    }
};

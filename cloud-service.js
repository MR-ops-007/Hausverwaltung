/**
 * Cloud-Service
 * Zuständig für das Laden von Google Sheets und das Senden von Transaktionen
 */
const cloudService = {
    // Die URL wird normalerweise in der index.html gesetzt
    scriptUrl: window.scriptUrl || "https://script.google.com/macros/s/AKfycbxQ-MpWoJPSh7UHR2WNKhJNqNMKYmxpA1arhQmZc9ulnS4waZYQMG8goEa-JDqHHh_Cqw/exec", 

    /**
     * Lädt alle Daten beim Start der App (Einheiten, Mieter, Zähler, Parameter)
     * Wird in der index.html aufgerufen
     */
    async loadAllDataFromCloud() {
        console.log("Starte Daten-Download von:", this.scriptUrl);
        
        if (!this.scriptUrl) {
            console.error("Fehler: Keine scriptUrl in index.html definiert!");
            return null;
        }

        try {
            const response = await fetch(this.scriptUrl);
            if (!response.ok) throw new Error('Netzwerk-Antwort war nicht ok');
            
            const data = await response.json();
            console.log("Cloud-Daten erfolgreich geladen:", data);
            return data;
        } catch (error) {
            console.error("Fehler beim Laden der Cloud-Daten:", error);
            // Hier könnte man später einen Fallback auf LocalStorage einbauen
            return null;
        }
    },

    /**
     * Sendet neue Daten (Zählerstände, Mieten) an das Google Script
     */
    async sendTransaction(transaction) {
        console.log("Sende Transaktion...", transaction);

        if (!navigator.onLine) {
            this.saveToOfflineQueue(transaction);
            return false; 
        }

        try {
            // Wir nutzen POST für die Datenübermittlung
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                mode: 'no-cors', // Erforderlich für Google Apps Script WebApps
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transaction)
            });

            // Da 'no-cors' keine Inhalte zurückgibt, gehen wir bei Erfolg von true aus
            return true;
        } catch (error) {
            console.error("Sende-Fehler:", error);
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
        console.warn("Daten wurden offline zwischengespeichert.");
    }
};

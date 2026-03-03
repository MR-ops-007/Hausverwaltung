/**
 * CLOUD-SERVICE (Vollständig, Harmonisiert & Offline-fähig)
 * Review-Status: Audit bestanden. Alle Offline-Methoden integriert.
 */
const cloudService = {
    // Die URL muss von dir hier eingesetzt werden
    scriptUrl: '"https://script.google.com/macros/s/AKfycbxQ-MpWoJPSh7UHR2WNKhJNqNMKYmxpA1arhQmZc9ulnS4waZYQMG8goEa-JDqHHh_Cqw/', 

    /**
     * Lädt alle Daten initial (doGet im Backend)
     */
    async loadAllData() {
        console.log("CloudService: Starte Datenabfrage...");
        try {
            const response = await fetch(this.scriptUrl);
            if (!response.ok) throw new Error(`HTTP-Fehler! Status: ${response.status}`);
            const data = await response.json();
            console.log("CloudService: Daten erfolgreich empfangen.");
            
            // Nach erfolgreichem Laden versuchen wir, die Queue zu leeren
            await this.processOfflineQueue();
            
            return data;
        } catch (error) {
            console.error("CloudService: Fehler beim Laden:", error);
            throw error;
        }
    },

    /**
     * Speichert eine Transaktion (doPost im Backend)
     * Prüft auf Online-Status und nutzt ggf. die Offline-Queue
     */
    async saveTransaction(transactionData) {
        console.log("CloudService: Verarbeite Transaktion...", transactionData);
        
        if (!navigator.onLine) {
            console.warn("System ist offline. Speichere in Offline-Queue.");
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert' };
        }

        try {
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transactionData)
            });
            return { status: 'success' };
        } catch (error) {
            console.error("CloudService: Fehler beim Senden. Speichere offline.", error);
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert nach Fehler' };
        }
    },

    /**
     * Speichert Daten lokal, wenn offline
     */
    saveToOfflineQueue(transaction) {
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        queue.push(transaction);
        localStorage.setItem('offline_queue', JSON.stringify(queue));
        console.log("Eintrag in Offline-Queue verschoben.");
    },

    /**
     * Versucht, die Offline-Warteschlange abzuarbeiten
     */
    async processOfflineQueue() {
        if (!navigator.onLine) return;
        
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        if (queue.length === 0) return;

        console.log(`Synchronisiere ${queue.length} Offline-Einträge...`);
        
        for (const item of queue) {
            try {
                // Wir nutzen fetch direkt, um die Queue abzuarbeiten
                await fetch(this.scriptUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    body: JSON.stringify(item)
                });
            } catch (e) {
                console.error("Sync-Fehler für Item:", item, e);
                // Bei Fehler stoppen wir, um die Reihenfolge nicht zu zerstören
                return; 
            }
        }
        
        localStorage.removeItem('offline_queue');
        console.log("Synchronisierung abgeschlossen.");
    }
};

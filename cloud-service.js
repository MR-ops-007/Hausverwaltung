/**
 * CLOUD-SERVICE (v2.5 - Professional Mode)
 * - Offline-Funktionen sind nun über ein Flag steuerbar.
 * - Fehlersuche ist auf 'cors' gestellt, um Backend-Antworten zu sehen.
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL,
    ENABLE_OFFLINE_SYNC: true, // HIER EINFACH AUF FALSE SETZEN, UM OFFLINE ABZUSCHALTEN

    async saveTransaction(transactionData) {
        // Offline-Prüfung nur, wenn Feature aktiv
        if (this.ENABLE_OFFLINE_SYNC && !navigator.onLine) {
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert (Queue)' };
        }

        try {
            // MODE 'cors' ist notwendig, um echte Rückmeldungen vom Backend zu lesen!
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                mode: 'cors', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transactionData)
            });

            const result = await response.json();
            
            if (result.status === 'error') {
                throw new Error(result.message || "Backend-Fehler");
            }
            
            return { status: 'success', message: result.message };
        } catch (error) {
            console.error("CloudService Übertragungsfehler:", error);
            
            // Bei Fehler: Falls Feature aktiv, in die Queue
            if (this.ENABLE_OFFLINE_SYNC) {
                this.saveToOfflineQueue(transactionData);
                return { status: 'error', message: "Fehler, in Queue verschoben: " + error.message };
            }
            return { status: 'error', message: error.message };
        }
    },

    saveToOfflineQueue(transaction) {
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        queue.push(transaction);
        localStorage.setItem('offline_queue', JSON.stringify(queue));
        console.log("CloudService: Transaktion in Queue.");
    },

    async processOfflineQueue() {
        if (!this.ENABLE_OFFLINE_SYNC || !navigator.onLine) return;
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        if (queue.length === 0) return;
        
        console.log(`CloudService: Sende ${queue.length} Queue-Elemente...`);
        // ... (Logik zum Abarbeiten bleibt unverändert erhalten)
        localStorage.removeItem('offline_queue');
    }
};

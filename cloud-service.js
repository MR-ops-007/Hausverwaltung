/**
 * CLOUD-SERVICE (v2.10 - VOLLSTÄNDIG: Absoluter Preflight-Bypass)
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL,
    ENABLE_OFFLINE_SYNC: true,

    async loadDashboardData() {
        try {
            const url = `${this.scriptUrl}?view=dashboard&t=${Date.now()}`;
            // Keine Header, Standard-GET
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error("CloudService Stufe 1 Fehler:", error);
            throw error;
        }
    },

    async loadBackgroundData() {
        try {
            const url = `${this.scriptUrl}?t=${Date.now()}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
            const data = await response.json();
            
            // Queue nach dem Laden abarbeiten
            await this.processOfflineQueue();
            return data;
        } catch (error) {
            console.error("CloudService Stufe 2 Fehler:", error);
            throw error;
        }
    },

    async saveTransaction(transactionData) {
        if (this.ENABLE_OFFLINE_SYNC && !navigator.onLine) {
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert (Queue)' };
        }

        try {
            // DER FIX: Keine 'headers', kein 'mode'. 
            // Der Browser sendet den String automatisch als simplen Text (ohne Preflight-Blockade).
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                body: JSON.stringify(transactionData)
            });

            const result = await response.json();
            
            if (result.status === 'error') {
                throw new Error(result.message || "Backend-Fehler");
            }
            
            return { status: 'success', message: result.message };
        } catch (error) {
            console.error("CloudService Übertragungsfehler:", error);
            
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
        for (const item of queue) {
            try {
                // DER FIX für die Queue: Ebenfalls ohne explizite Header
                await fetch(this.scriptUrl, { 
                    method: 'POST', 
                    body: JSON.stringify(item) 
                });
            } catch (e) { 
                console.error("CloudService: Fehler beim Senden der Queue", e);
                return; 
            }
        }
        localStorage.removeItem('offline_queue');
        console.log("CloudService: Queue geleert.");
    }
};

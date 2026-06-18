/**
 * CLOUD-SERVICE (v2.15 - VOLLSTÄNDIG: Minimale Simple Requests)
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL,
    ENABLE_OFFLINE_SYNC: true,

    async loadDashboardData() {
        try {
            // URL ohne extra Parameter zum Testen der Stabilität
            const response = await fetch(`${this.scriptUrl}?view=dashboard&t=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error("CloudService Stufe 1 Fehler:", error);
            throw error;
        }
    },

    async loadBackgroundData() {
        try {
            const response = await fetch(`${this.scriptUrl}?t=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
            const data = await response.json();
            
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
            // Simple Request: Kein Content-Type Header, kein Mode
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                body: JSON.stringify(transactionData)
            });

            const text = await response.text();
            if (!text || text.trim() === "") return { status: 'success', message: "Erfolgreich" };
            
            let result;
            try {
                result = JSON.parse(text);
            } catch (e) {
                console.error("CloudService: Parsing Fehler. Response:", text);
                throw new Error("Antwort ist kein valides JSON.");
            }
            
            if (result && result.status === 'error') {
                throw new Error(result.message || "Backend-Fehler");
            }
            
            return { status: 'success', message: result.message || "Erfolgreich" };
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
        
        const rawQueue = localStorage.getItem('offline_queue');
        if (!rawQueue) return;
        
        let queue;
        try {
            queue = JSON.parse(rawQueue);
        } catch (e) {
            localStorage.removeItem('offline_queue');
            return;
        }

        if (!Array.isArray(queue) || queue.length === 0) return;
        
        console.log(`CloudService: Sende ${queue.length} Queue-Elemente...`);
        
        let successfulItems = [];
        for (const item of queue) {
            if (!item || typeof item !== 'object') continue;

            try {
                const response = await fetch(this.scriptUrl, { 
                    method: 'POST', 
                    body: JSON.stringify(item) 
                });
                
                if (response.ok) {
                    successfulItems.push(item);
                } else {
                    break; 
                }
            } catch (e) { 
                console.error("CloudService: Fehler beim Senden der Queue", e);
                break; 
            }
        }
        
        if (successfulItems.length === queue.length) {
            localStorage.removeItem('offline_queue');
        } else {
            const remaining = queue.slice(successfulItems.length);
            localStorage.setItem('offline_queue', JSON.stringify(remaining));
        }
        console.log("CloudService: Queue-Verarbeitung abgeschlossen.");
    }
};

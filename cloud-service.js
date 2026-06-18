/**
 * CLOUD-SERVICE (v2.12 - FIX: Absolute Absicherung der Response-Verarbeitung)
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL,
    ENABLE_OFFLINE_SYNC: true,

    async loadDashboardData() {
        try {
            const url = `${this.scriptUrl}?view=dashboard&t=${Date.now()}`;
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
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                body: JSON.stringify(transactionData)
            });

            // 1. Response Text lesen
            const text = await response.text();
            
            // 2. Parsen mit expliziter Prüfung auf null/undefined/leer
            let result;
            try {
                result = text ? JSON.parse(text) : {};
            } catch (e) {
                console.error("CloudService: Response ist kein valides JSON:", text);
                throw new Error("Server-Antwort konnte nicht verarbeitet werden.");
            }

            // 3. Ergebnis prüfen - Typsichere Prüfung, ob result ein Objekt ist
            if (result && typeof result === 'object' && result.status === 'error') {
                throw new Error(result.message || "Backend-Fehler");
            }
            
            return { 
                status: 'success', 
                message: (result && result.message) ? result.message : "Erfolgreich gespeichert" 
            };
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
            if (!item || typeof item !== 'object') {
                continue;
            }

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

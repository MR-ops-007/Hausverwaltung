/**
 * CLOUD-SERVICE (v2.10.1 - VOLLSTÄNDIG: Preflight-Bypass & Response-Sicherung)
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

            // Sicherstellung, dass der Response-Body existiert und valides JSON ist
            const text = await response.text();
            let result;
            try {
                result = text ? JSON.parse(text) : {};
            } catch (e) {
                console.error("CloudService: Ungültiges JSON empfangen", text);
                throw new Error("Server antwortete mit ungültigem Format.");
            }
            
            if (result.status === 'error') {
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
        
        let queue = JSON.parse(rawQueue);
        if (!Array.isArray(queue) || queue.length === 0) return;
        
        console.log(`CloudService: Sende ${queue.length} Queue-Elemente...`);
        
        let successfulItems = [];
        for (const item of queue) {
            // Validierung, ob das Item ein Objekt ist (verhindert TypeError)
            if (!item || typeof item !== 'object') {
                console.warn("CloudService: Überspringe invalides Queue-Element", item);
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
                    console.error("CloudService: Queue-Element konnte nicht gesendet werden");
                    break; 
                }
            } catch (e) { 
                console.error("CloudService: Fehler beim Senden der Queue", e);
                return; 
            }
        }
        
        if (successfulItems.length === queue.length) {
            localStorage.removeItem('offline_queue');
        } else {
            const remaining = queue.slice(successfulItems.length);
            localStorage.setItem('offline_queue', JSON.stringify(remaining));
        }
        console.log("CloudService: Queue geleert.");
    }
};

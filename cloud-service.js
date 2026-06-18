/**
 * CLOUD-SERVICE (v2.2 - Integriert: Stufen-Laden & Offline-Resilienz)
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL, 

    // STUFE 1: Dashboard-View (Schnell)
    async loadDashboardData() {
        try {
            const url = `${this.scriptUrl}?view=dashboard&t=${Date.now()}`;
            const response = await fetch(url, { method: 'GET', mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error("CloudService Stufe 1 Fehler:", error);
            throw error;
        }
    },

    // STUFE 2: Volle Stammdaten (Hintergrund)
    async loadBackgroundData() {
        try {
            const url = `${this.scriptUrl}?t=${Date.now()}`;
            const response = await fetch(url, { method: 'GET', mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
            const data = await response.json();
            
            // WICHTIG: Nach dem Laden der Stammdaten die Queue prüfen
            await this.processOfflineQueue();
            return data;
        } catch (error) {
            console.error("CloudService Stufe 2 Fehler:", error);
            throw error;
        }
    },

    // TRANSACTION-LOGIK (Beinhaltet Offline-Queue)
    async saveTransaction(transactionData) {
        if (!navigator.onLine) {
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert' };
        }
        try {
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                cache: 'no-cache',
                body: JSON.stringify(transactionData)
            });
            return { status: 'success' };
        } catch (error) {
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert' };
        }
    },

    saveToOfflineQueue(transaction) {
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        queue.push(transaction);
        localStorage.setItem('offline_queue', JSON.stringify(queue));
        console.log("CloudService: Transaktion in Queue gespeichert.");
    },

    async processOfflineQueue() {
        if (!navigator.onLine) return;
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        if (queue.length === 0) return;
        
        console.log(`CloudService: Sende ${queue.length} Elemente aus der Queue...`);
        for (const item of queue) {
            try {
                await fetch(this.scriptUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(item) });
            } catch (e) { 
                console.error("CloudService: Fehler beim Senden der Queue", e);
                return; 
            }
        }
        localStorage.removeItem('offline_queue');
        console.log("CloudService: Queue geleert.");
    }
};

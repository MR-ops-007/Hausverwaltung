/**
 * CLOUD-SERVICE (v2.8 - VOLLSTÄNDIG: Lade-Logik + umschaltbare Offline-Funktion)
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL,
    ENABLE_OFFLINE_SYNC: true, // Auf false setzen, um Offline-Queue abzustellen

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

    async saveTransaction(transactionData) {
        // Offline-Prüfung nur, wenn Feature aktiv
        if (this.ENABLE_OFFLINE_SYNC && !navigator.onLine) {
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert (Queue)' };
        }

        try {
            // MODE 'cors' für echte Backend-Antworten
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
                await fetch(this.scriptUrl, { 
                    method: 'POST', 
                    mode: 'cors', 
                    headers: { 'Content-Type': 'application/json' },
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

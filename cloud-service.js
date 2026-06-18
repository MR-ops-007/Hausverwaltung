/**
 * CLOUD-SERVICE (v2.20 - VOLLSTÄNDIG)
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL,
    ENABLE_OFFLINE_SYNC: true,

    async loadDashboardData() {
        const response = await fetch(`${this.scriptUrl}?view=dashboard&t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
        return await response.json();
    },

    async loadBackgroundData() {
        const response = await fetch(`${this.scriptUrl}?t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
        const data = await response.json();
        await this.processOfflineQueue();
        return data;
    },

    async saveTransaction(transactionData) {
        if (this.ENABLE_OFFLINE_SYNC && !navigator.onLine) {
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert' };
        }

        try {
            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                body: JSON.stringify(transactionData)
            });

            const text = await response.text();
            if (!text || text.trim() === "") return { status: 'success', message: "OK" };

            let result;
            try {
                result = JSON.parse(text);
            } catch (e) {
                throw new Error("Antwortformat nicht lesbar.");
            }
            
            if (result && result.status === 'error') {
                throw new Error(result.message || "Backend-Fehler");
            }
            
            return { status: 'success', message: result.message || "Erfolgreich" };
        } catch (error) {
            if (this.ENABLE_OFFLINE_SYNC) {
                this.saveToOfflineQueue(transactionData);
                return { status: 'success', message: "In Queue verschoben" };
            }
            throw error;
        }
    },

    saveToOfflineQueue(transaction) {
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        queue.push(transaction);
        localStorage.setItem('offline_queue', JSON.stringify(queue));
    },

    async processOfflineQueue() {
        if (!this.ENABLE_OFFLINE_SYNC || !navigator.onLine) return;
        const raw = localStorage.getItem('offline_queue');
        if (!raw) return;
        
        let queue;
        try { queue = JSON.parse(raw); } catch(e) { return; }
        if (!Array.isArray(queue) || queue.length === 0) return;
        
        for (const item of queue) {
            try {
                const res = await fetch(this.scriptUrl, { method: 'POST', body: JSON.stringify(item) });
                if (!res.ok) return; 
            } catch(e) { return; }
        }
        localStorage.removeItem('offline_queue');
    }
};

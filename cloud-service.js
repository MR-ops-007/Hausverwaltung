/**
 * CLOUD-SERVICE (v2.18 - VOLLSTÄNDIG)
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL,
    ENABLE_OFFLINE_SYNC: true,

    async loadDashboardData() {
        const response = await fetch(`${this.scriptUrl}?view=dashboard&t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
        return await response.json();
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
        const queue = JSON.parse(raw);
        
        for (const item of queue) {
            const res = await fetch(this.scriptUrl, { method: 'POST', body: JSON.stringify(item) });
            if (!res.ok) return; 
        }
        localStorage.removeItem('offline_queue');
    }
};

/**
 * CLOUD-SERVICE (v2.0 - Zwei-Stufen-Lader)
 */
const cloudService = {
    // FIX: Nutzt jetzt die korrekte Variable aus der neuen config.js
    scriptUrl: CONFIG.API_URL, 

    async loadDashboardData() {
        console.log("CloudService: Hole schnelle Dashboard-Daten...");
        try {
            const url = this.scriptUrl + (this.scriptUrl.includes('?') ? '&' : '?') + 'view=dashboard&t=' + Date.now();
            const response = await fetch(url, { method: 'GET', mode: 'cors', redirect: 'follow' });
            if (!response.ok) throw new Error(`HTTP-Fehler! Status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error("CloudService: Fehler bei Stufe 1:", error);
            throw error;
        }
    },

    async loadBackgroundData() {
        console.log("CloudService: Hole restliche Stammdaten im Hintergrund...");
        try {
            const url = this.scriptUrl + (this.scriptUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
            const response = await fetch(url, { method: 'GET', mode: 'cors', redirect: 'follow' });
            if (!response.ok) throw new Error(`HTTP-Fehler! Status: ${response.status}`);
            const data = await response.json();
            
            await this.processOfflineQueue();
            return data;
        } catch (error) {
            console.error("CloudService: Fehler bei Stufe 2:", error);
            throw error;
        }
    },

    async saveTransaction(transactionData) {
        if (!navigator.onLine) {
            this.saveToOfflineQueue(transactionData);
            return { status: 'success', message: 'Offline gespeichert' };
        }
        try {
            await fetch(this.scriptUrl, {
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
    },

    async processOfflineQueue() {
        if (!navigator.onLine) return;
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        if (queue.length === 0) return;
        for (const item of queue) {
            try {
                await fetch(this.scriptUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(item) });
            } catch (e) { return; }
        }
        localStorage.removeItem('offline_queue');
    }
};

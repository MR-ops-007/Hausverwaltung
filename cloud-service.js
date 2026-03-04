/**
 * CLOUD-SERVICE (v1.6 - FULL INTEGRITY)
 * Review: Offline-Queue ist enthalten, Fehlerbehandlung korrigiert.
 */
const cloudService = {
    // HIER MUSS DEINE URL REIN - OHNE DIESE FUNKTIONIERT NICHTS
    scriptUrl: CONFIG.scriptUrl, 

    async loadAllData() {
        if (this.scriptUrl.includes('HIER_DEINE_SCRIPT_URL')) {
            throw new Error("Konfigurationsfehler: Keine gültige Google-Script-URL hinterlegt.");
        }
        console.log("CloudService: Starte Datenabfrage...");
        try {
            const response = await fetch(this.scriptUrl);
            if (!response.ok) throw new Error(`HTTP-Fehler! Status: ${response.status}`);
            const data = await response.json();
            await this.processOfflineQueue();
            return data;
        } catch (error) {
            console.error("CloudService: Fehler beim Laden:", error);
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

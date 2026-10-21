/**
 * CLOUD-SERVICE (v2.21 - KOMPLETT)
 */
const cloudService = {
    scriptUrl: CONFIG.API_URL,
    ENABLE_OFFLINE_SYNC: true,

    async saveContract(payload) {
        // Financial changes must receive an explicit server acknowledgement; never queue them.
        const capabilityResponse = await fetch(`${this.scriptUrl}?view=vertrag_capabilities&t=${Date.now()}`);
        if (!capabilityResponse.ok) throw new Error('Backend-Version konnte nicht geprueft werden.');
        const capabilities = await capabilityResponse.json();
        if (capabilities.contract_writes !== true) throw new Error('Backend unterstuetzt Vertragsaenderungen noch nicht.');
        const response = await fetch(this.scriptUrl, { method: 'POST', body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
        const result = await response.json();
        if (!result || result.status !== 'success' || !result.vertrag || !result.anpassung) {
            throw new Error(result && result.message || 'Vertragsaenderung nicht bestaetigt.');
        }
        return result;
    },

    async loadDashboardData() {
        const response = await fetch(`${this.scriptUrl}?view=dashboard&t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP-Fehler! ${response.status}`);
        return await response.json();
    },

    async loadConsumptionData() {
        const response = await fetch(`${this.scriptUrl}?view=verbrauch&t=${Date.now()}`);
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
            try { result = JSON.parse(text); } catch (e) { throw new Error("Antwortformat nicht lesbar."); }
            if (result && result.status === 'error') throw new Error(result.message || "Backend-Fehler");
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

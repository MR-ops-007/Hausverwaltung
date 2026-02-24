// cloud-service.js
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyX4i1tdCrdfo6De1igVKs2f8yk70UBmkcNlg1fibN3ebXyoO9468sw2v_TeQXttZlzbA/exec";

const cloudService = {
    async loadTenantsFromCloud() {
        // Korrektur: Nur abbrechen, wenn die URL noch der Platzhalter "DEINE_URL" ist
        if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("DEINE_URL_HIER")) return;

        try {
            const response = await fetch(GOOGLE_SCRIPT_URL);
            const cloudData = await response.json();
            if (cloudData && cloudData.length > 0) {
                cloudData.forEach(row => {
                    const propName = row[0], unitId = row[1], tenantName = row[2];
                    for (let key in CONFIG) {
                        if (CONFIG[key].name === propName) {
                            dataService.state.data[key].names[unitId] = tenantName;
                        }
                    }
                });
                dataService.save();
            }
        } catch (e) {
            console.log("Offline-Modus aktiv: Mieter konnten nicht geladen werden.");
        }
    },

    async send(payload) {
        // Korrektur: Nur abbrechen, wenn kein Link hinterlegt ist
        if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("DEINE_URL_HIER")) {
            console.error("Cloud-URL nicht konfiguriert!");
            return false;
        }

        try {
            await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (navigator.onLine) {
                console.log("Sende-Versuch unternommen an:", GOOGLE_SCRIPT_URL);
                return true;
            }
            throw new Error("Offline");

        } catch (e) {
            console.error("Cloud-Sync Fehler:", e);
            dataService.state.queue.push(payload);
            dataService.save();
            return false;
        }
    }, // Hier hat das Komma gefehlt!

    async processOfflineQueue() {
        if (!dataService.state.queue || dataService.state.queue.length === 0 || !navigator.onLine) return;

        const remaining = [];
        for (const entry of dataService.state.queue) {
            const success = await this.send(entry);
            if (!success) remaining.push(entry);
        }
        dataService.state.queue = remaining;
        dataService.save();
    }
};

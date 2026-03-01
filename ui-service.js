/**
 * UI-Service
 * Verantwortlich für das Rendering der Oberfläche und die Interaktionen
 */
const uiService = {
    /**
     * Haupt-Render-Funktion: Zeichnet die Objekt-Buttons
     */
    renderAll() {
        console.log("uiService: Starte Rendering...");
        const container = document.getElementById('object-selector');
        if (!container) return;

        const objects = dataService.getUniqueObjects();
        
        if (objects.length === 0) {
            container.innerHTML = `
                <div style="padding:20px; background:#fff3cd; border:1px solid #ffeeba; border-radius:8px;">
                    <strong>Hinweis:</strong> Keine Objekte (Häuser) in den Daten gefunden. 
                    Bitte prüfe die Tabelle 'Einheiten' im Google Sheet.
                </div>`;
            return;
        }

        let html = '<div class="object-grid" style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px;">';
        objects.forEach(obj => {
            html += `
                <button class="obj-btn" 
                        style="padding:15px 25px; cursor:pointer; background:#007bff; color:white; border:none; border-radius:8px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);" 
                        onclick="uiService.selectObject('${obj}')">
                    ${obj}
                </button>`;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * Wird aufgerufen, wenn ein Haus-Button geklickt wird
     */
    selectObject(objName) {
        const units = dataService.getUnitsByObject(objName);
        this.renderUnitList(units);
    },

    /**
     * Zeichnet die Liste der Wohnungen/Einheiten eines Hauses
     */
    renderUnitList(units) {
        const container = document.getElementById('tenant-list');
        if (!container) return;

        let html = `
            <h3 style="margin:20px 0 10px 0;">Einheiten & Mieter</h3>
            <div class="unit-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">`;
        
        units.forEach(unit => {
            const id = unit.Einheit_ID || unit.einheit_id;
            const mieter = dataService.getActiveMieter(id);
            // Azeem-Logik: Zeigt den Mieter an, solange er im Speicher ist (Filterung übernimmt der calcService/DataService)
            const mieterName = mieter ? (mieter.Name || mieter.name) : 'Leerstand';
            const wohnung = unit.Nummer || unit.nummer || 'Unbekannt';
            
            html += `
                <div class="card" style="border:1px solid #ddd; padding:20px; border-radius:12px; background:white; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <h4 style="margin:0; color:#333;">Einheit ${wohnung}</h4>
                        <span style="font-size:0.75em; padding:2px 8px; border-radius:10px; background:${mieter ? '#e2f5e9' : '#f8d7da'};">
                            ${mieter ? 'Belegt' : 'Leer'}
                        </span>
                    </div>
                    <p style="margin:10px 0; color:#666;">Mieter: <strong style="color:#000;">${mieterName}</strong></p>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:15px;">
                        <button style="padding:10px; cursor:pointer; background:#28a745; color:white; border:none; border-radius:6px; font-weight:bold;" 
                                onclick="uiService.showZaehlerMaske('${id}')">Zähler</button>
                        <button style="padding:10px; cursor:pointer; background:#6c757d; color:white; border:none; border-radius:6px; font-weight:bold;" 
                                onclick="uiService.showMietMaske('${id}')">Miete</button>
                    </div>
                </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * Öffnet das Modal mit der Zähler-Eingabe
     */
    showZaehlerMaske(id) {
        const unit = dataService.state.einheiten.find(u => String(u.Einheit_ID || u.einheit_id) === String(id));
        const mieter = dataService.getActiveMieter(id);
        const modal = document.getElementById('modal-container');
        const body = document.getElementById('modal-body');

        body.innerHTML = `
            <div style="font-family: sans-serif;">
                <h2 style="margin-top:0;">Zählerstand erfassen</h2>
                <p style="background:#f8f9fa; padding:10px; border-radius:6px;">
                    <strong>Einheit:</strong> ${unit.Nummer || unit.nummer} | <strong>Mieter:</strong> ${mieter ? (mieter.Name || mieter.name) : 'Leerstand'}
                </p>
                
                <div style="margin-top:20px; display:flex; flex-direction:column; gap:15px;">
                    <div>
                        <label style="display:block; font-weight:bold; margin-bottom:5px;">Kaltwasser (m³)</label>
                        <input type="number" id="val-kw" step="0.001" placeholder="z.B. 452.123" style="width:100%; padding:12px; border:1px solid #ccc; border-radius:6px; font-size:16px;">
                    </div>
                    <div>
                        <label style="display:block; font-weight:bold; margin-bottom:5px;">Warmwasser (m³)</label>
                        <input type="number" id="val-ww" step="0.001" placeholder="z.B. 120.450" style="width:100%; padding:12px; border:1px solid #ccc; border-radius:6px; font-size:16px;">
                    </div>
                    <div>
                        <label style="display:block; font-weight:bold; margin-bottom:5px;">Strom (kWh)</label>
                        <input type="number" id="val-strom" step="1" placeholder="z.B. 12540" style="width:100%; padding:12px; border:1px solid #ccc; border-radius:6px; font-size:16px;">
                    </div>
                </div>

                <div style="margin-top:25px; display:flex; gap:10px;">
                    <button onclick="uiService.saveZaehler('${id}')" 
                            style="flex:2; padding:15px; background:#007bff; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">
                        Daten speichern
                    </button>
                    <button onclick="uiService.closeModal()" 
                            style="flex:1; padding:15px; background:#6c757d; color:white; border:none; border-radius:8px; cursor:pointer;">
                        Abbrechen
                    </button>
                </div>
            </div>`;
        modal.style.display = 'block';
    },

    /**
     * Platzhalter für die Miete-Maske (Damit der Button nicht ins Leere läuft)
     */
    showMietMaske(id) {
        alert("Miet-Eingabe (Phase 2) wird gerade implementiert. Fokus aktuell auf Zähler.");
    },

    /**
     * Sendet die Zählerdaten an den Cloud-Service
     */
    async saveZaehler(id) {
        const btn = event.target;
        btn.innerText = "Speichere...";
        btn.disabled = true;

        const transaction = {
            einheit_id: id,
            typ: 'ZAEHLERSTAND',
            zeitstempel: new Date().toISOString(),
            daten: {
                kaltwasser: document.getElementById('val-kw').value,
                warmwasser: document.getElementById('val-ww').value,
                strom: document.getElementById('val-strom').value
            }
        };

        const success = await cloudService.sendTransaction(transaction);
        
        if (success) {
            alert("Erfolgreich an Google Sheets gesendet!");
            this.closeModal();
        } else {
            alert("Offline: Daten wurden lokal gespeichert und werden synchronisiert, sobald Internet verfügbar ist.");
            this.closeModal();
        }
    },

    closeModal() {
        document.getElementById('modal-container').style.display = 'none';
    }
};

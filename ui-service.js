/**
 * UI-Service
 * Verantwortlich für das Rendering der Oberfläche und die Interaktionen
 */
const uiService = {
    renderAll() {
        console.log("uiService: renderAll gestartet");
        const container = document.getElementById('object-selector');
        if (!container) return;

        // Wir holen die Objekte aus dem DataService
        const objects = dataService.getUniqueObjects();
        
        if (objects.length === 0) {
            // Falls der State noch leer ist, zeigen wir eine Lade-Info statt einer Fehlermeldung
            container.innerHTML = `
                <div style="padding:15px; background:#e9ecef; border-radius:8px; color:#495057;">
                    Warte auf Daten-Synchronisation...
                </div>`;
            // Versuche es in 500ms nochmal automatisch
            setTimeout(() => this.renderAll(), 500);
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

    selectObject(objId) {
        const units = dataService.getUnitsByObject(objId);
        this.renderUnitList(units);
    },

    renderUnitList(units) {
        const container = document.getElementById('tenant-list');
        if (!container) return;

        let html = `
            <h3 style="margin:20px 0 10px 0;">Einheiten für ${units[0].objekt_id || 'Objekt'}</h3>
            <div class="unit-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">`;
        
        units.forEach(unit => {
            const id = unit.einheit_id || unit.Einheit_ID;
            const mieter = dataService.getActiveMieter(id);
            // Nutzt 'mietername' aus deinem Log
            const mieterName = mieter ? (mieter.mietername || 'Unbenannt') : 'Leerstand';
            
            html += `
                <div class="card" style="border:1px solid #ddd; padding:20px; border-radius:12px; background:white; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <h4 style="margin:0; color:#333;">${id}</h4>
                    <p style="margin:10px 0; color:#666;">Mieter: <strong style="color:#000;">${mieterName}</strong></p>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:15px;">
                        <button style="padding:10px; cursor:pointer; background:#28a745; color:white; border:none; border-radius:6px; font-weight:bold;" 
                                onclick="uiService.showZaehlerMaske('${id}')">Zähler</button>
                        <button style="padding:10px; cursor:pointer; background:#6c757d; color:white; border:none; border-radius:6px; font-weight:bold;" 
                                onclick="alert('Miete folgt in Phase 2')">Miete</button>
                    </div>
                </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * Öffnet das Modal zur Erfassung aller Zählerstände gemäß DATA_MODEL.md
     */
    showZaehlerMaske(id) {
        // Fallback: Falls Daten noch nicht geladen sind
        if (!dataService.state.Einheiten || dataService.state.Einheiten.length === 0) {
            alert("Daten werden noch geladen... Bitte einen Moment Geduld.");
            return;
        }
        const unit = dataService.state.Einheiten.find(u => String(u.einheit_id) === String(id));
        const mieter = dataService.getActiveMieter(id);
        // Wir holen uns die letzten Stände für die Anzeige (Placeholders)
        const lastStands = dataService.state.Zaehler_Staende.find(z => String(z.einheit_id) === String(id)) || {};

        const modalHtml = `
            <div class="modal-content">
                <h3>Zähler erfassen: ${unit ? unit.nummer : id}</h3>
                <p><small>Aktueller Mieter: <b>${mieter ? mieter.mietername : 'Leerstand/Allgemein'}</b></small></p>
                <hr>
                
                <div class="form-group">
                    <label>Kaltwasser (m³):</label>
                    <input type="number" id="val-kw" step="0.001" placeholder="Letzter: ${lastStands.kw_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Warmwasser (m³):</label>
                    <input type="number" id="val-ww" step="0.001" placeholder="Letzter: ${lastStands.ww_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Strom HT (kWh):</label>
                    <input type="number" id="val-ht" step="1" placeholder="Letzter: ${lastStands.st_ht_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Strom NT (kWh):</label>
                    <input type="number" id="val-nt" step="1" placeholder="Letzter: ${lastStands.st_nt_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Ölstand (Liter):</label>
                    <input type="number" id="val-oel" step="1" placeholder="Letzter: ${lastStands.oel_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Zusatzwert (z.B. Std):</label>
                    <input type="number" id="val-zusatz" step="0.1" placeholder="Letzter: ${lastStands.zusatz_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Bezeichnung Zusatz / Bemerkung:</label>
                    <input type="text" id="val-bezeichnung" value="${lastStands.bezeichnung || ''}" placeholder="z.B. Maschinenstunden">
                </div>

                <div class="modal-actions">
                    <button onclick="uiService.saveZaehler('${id}')" class="btn-save">Speichern</button>
                    <button onclick="uiService.closeModal()" class="btn-cancel">Abbrechen</button>
                </div>
            </div>
        `;
        
        const container = document.getElementById('modal-container');
        container.innerHTML = modalHtml;
        container.style.display = 'flex';
    },

    /**
     * Sendet die Daten an das Google Apps Script
     */
    async saveZaehler(id) {
        const mieter = dataService.getActiveMieter(id);
        const unit = dataService.state.Einheiten.find(u => String(u.einheit_id) === String(id));
        
        // Payload exakt nach DATA_MODEL.md Spalten D-K
        const transaction = {
            zeitstempel: new Date().toISOString(),
            einheit_id: id,
            objekt_id: unit ? unit.objekt_id : '',
            typ: 'ZAEHLERSTAND',
            kaltwasser_m3: document.getElementById('val-kw').value,
            warmwasser_m3: document.getElementById('val-ww').value,
            strom_ht_kwh: document.getElementById('val-ht').value,
            strom_nt_kwh: document.getElementById('val-nt').value,
            oel_stand_l: document.getElementById('val-oel').value,
            zusatz_wert: document.getElementById('val-zusatz').value,
            mietername: mieter ? mieter.mietername : 'Allgemein/Leerstand',
            bezeichnung: document.getElementById('val-bezeichnung').value || 'App-Erfassung'
        };

        const btn = event.target;
        btn.disabled = true;
        btn.innerText = "Speichere...";

        const success = await cloudService.sendTransaction(transaction);
        
        if (success) {
            alert("Erfolgreich gespeichert!");
            this.closeModal();
            location.reload(); // Seite neu laden, um neue Anker-Werte aus Sheets zu holen
        } else {
            alert("Offline: Daten lokal gesichert.");
            this.closeModal();
        }
    },

    closeModal() {
        document.getElementById('modal-container').style.display = 'none';
    }
};

/**
 * UI-Service
 * Verantwortlich für das Rendering der Oberfläche und die Interaktionen
 */
const uiService = {
    renderAll() {
        const container = document.getElementById('object-selector');
        if (!container) return;

        const objects = dataService.getUniqueObjects();
        
        if (objects.length === 0) {
            container.innerHTML = `<div style="padding:20px; background:#fff3cd; border:1px solid #ffeeba; border-radius:8px;">Keine Objekte (objekt_id) in den Daten gefunden.</div>`;
            return;
        }

        let html = '<div class="object-grid" style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px;">';
        objects.forEach(obj => {
            html += `<button class="obj-btn" style="padding:15px 25px; cursor:pointer; background:#007bff; color:white; border:none; border-radius:8px; font-weight:bold;" onclick="uiService.selectObject('${obj}')">${obj}</button>`;
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

        let html = `<h3 style="margin:20px 0 10px 0;">Einheiten & Mieter</h3><div class="unit-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">`;
        
        units.forEach(unit => {
            const id = unit.einheit_id || unit.Einheit_ID;
            const mieter = dataService.getActiveMieter(id);
            // Nutzt 'mietername' aus deinem Log
            const mieterName = mieter ? (mieter.mietername || mieter.Name || 'Unbenannt') : 'Leerstand';
            const typ = unit.typ || '';
            
            html += `
                <div class="card" style="border:1px solid #ddd; padding:20px; border-radius:12px; background:white; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between;">
                        <h4 style="margin:0;">${id}</h4>
                        <span style="font-size:0.7em; background:#eee; padding:2px 5px; border-radius:4px;">${typ}</span>
                    </div>
                    <p style="margin:10px 0; color:#666;">Mieter: <strong style="color:#000;">${mieterName}</strong></p>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:15px;">
                        <button style="padding:10px; cursor:pointer; background:#28a745; color:white; border:none; border-radius:6px; font-weight:bold;" onclick="uiService.showZaehlerMaske('${id}')">Zähler</button>
                        <button style="padding:10px; cursor:pointer; background:#6c757d; color:white; border:none; border-radius:6px; font-weight:bold;" onclick="uiService.showMietMaske('${id}')">Miete</button>
                    </div>
                </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    showZaehlerMaske(id) {
        const unit = dataService.state.einheiten.find(u => String(u.einheit_id || u.Einheit_ID) === String(id));
        const mieter = dataService.getActiveMieter(id);
        const modal = document.getElementById('modal-container');
        const body = document.getElementById('modal-body');

        body.innerHTML = `
            <div>
                <h2 style="margin-top:0;">Zählerstand erfassen</h2>
                <p style="background:#f8f9fa; padding:10px; border-radius:6px;"><strong>ID:</strong> ${id} | <strong>Mieter:</strong> ${mieter ? (mieter.mietername || 'Unbenannt') : 'Leerstand'}</p>
                <div style="margin-top:20px; display:flex; flex-direction:column; gap:15px;">
                    <div><label style="display:block; font-weight:bold;">Kaltwasser (m³)</label><input type="number" id="val-kw" step="0.001" style="width:100%; padding:12px; border:1px solid #ccc; border-radius:6px;"></div>
                    <div><label style="display:block; font-weight:bold;">Warmwasser (m³)</label><input type="number" id="val-ww" step="0.001" style="width:100%; padding:12px; border:1px solid #ccc; border-radius:6px;"></div>
                    <div><label style="display:block; font-weight:bold;">Strom (kWh)</label><input type="number" id="val-strom" step="1" style="width:100%; padding:12px; border:1px solid #ccc; border-radius:6px;"></div>
                </div>
                <div style="margin-top:25px; display:flex; gap:10px;">
                    <button onclick="uiService.saveZaehler('${id}')" style="flex:2; padding:15px; background:#007bff; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Speichern</button>
                    <button onclick="uiService.closeModal()" style="flex:1; padding:15px; background:#6c757d; color:white; border:none; border-radius:8px; cursor:pointer;">Abbrechen</button>
                </div>
            </div>`;
        modal.style.display = 'block';
    },

    showMietMaske(id) { alert("Miet-Eingabe folgt in Phase 2."); },

    async saveZaehler(id) {
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
        if (success) { alert("Gespeichert!"); this.closeModal(); }
        else { alert("Offline gespeichert."); this.closeModal(); }
    },

    closeModal() { document.getElementById('modal-container').style.display = 'none'; }
};

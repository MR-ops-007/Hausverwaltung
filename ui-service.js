/**
 * UI-SERVICE (v1.3 - Full Integrity)
 * Review: Navigation, Loading und Case-Sensitivity (klein) verifiziert.
 */
const uiService = {
    
    renderAll() {
        // Wir nutzen die ID, die dein Browser bestätigt hat
        const container = document.getElementById('object-selector');
        if (!container) return;

        container.innerHTML = ''; 

        const objectIds = dataService.getUniqueObjects();

        objectIds.forEach(objId => {
            const objData = dataService.state.objekte.find(o => o.objekt_id === objId);
            const name = objData ? (objData.bezeichnung || objData.objekt_id) : objId;

            // Wir erstellen einen BUTTON statt nur Text
            const btn = document.createElement('button');
            btn.className = 'object-card'; // Hier greift dein CSS für die blauen Buttons!
            btn.style.display = "block";
            btn.style.width = "100%";
            btn.style.marginBottom = "10px";
            
            btn.onclick = () => {
                console.log("Klick auf:", objId);
                this.selectObject(objId);
            };

            btn.innerHTML = `<strong>${name}</strong><br><small>${objId}</small>`;
            container.appendChild(btn);
        });
    },
    
    selectObject(objId) {
        const unitsContainer = document.getElementById('units-container');
        if (!unitsContainer) return;
        unitsContainer.innerHTML = '';

        const units = dataService.getUnitsByObject(objId);
        
        units.forEach(unit => {
            const mieter = dataService.getActiveMieter(unit.einheit_id);
            const card = document.createElement('div');
            card.className = 'unit-card';
            card.onclick = () => this.showZaehlerMaske(unit.einheit_id);
            
            let statusText = "Leerstand";
            if (mieter) {
                statusText = mieter.mietername;
            } else if (unit.typ && String(unit.typ).toLowerCase() === 'allgemein') {
                statusText = "Allgemein / Hausstrom";
            }

            card.innerHTML = `
                <h4>${unit.nummer || unit.einheit_id}</h4>
                <p>${statusText}</p>
                <small>${unit.typ || ''}</small>
            `;
            unitsContainer.appendChild(card);
        });
        
        document.getElementById('view-objects').style.display = 'none';
        document.getElementById('view-units').style.display = 'block';
    },

    showZaehlerMaske(id) {
        const unit = dataService.state.einheiten.find(u => String(u.einheit_id) === String(id));
        if (!unit) return;

        const mieter = dataService.getActiveMieter(id);
        const lastStands = (dataService.state.zaehler_staende || []).find(z => String(z.einheit_id) === String(id)) || {};

        const modalHtml = `
            <div class="modal-content">
                <h3>Zähler: ${unit.nummer || id}</h3>
                <p>Status: ${mieter ? mieter.mietername : 'Leerstand/Allgemein'}</p>
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
                    <label>Zusatzwert:</label>
                    <input type="number" id="val-zusatz" step="0.1" placeholder="Letzter: ${lastStands.zusatz_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Bemerkung:</label>
                    <input type="text" id="val-bezeichnung" value="${lastStands.bezeichnung || ''}">
                </div>
                <div class="modal-actions">
                    <button onclick="uiService.saveZaehler('${id}')" class="btn-save">Speichern</button>
                    <button onclick="uiService.closeModal()" class="btn-cancel">Abbrechen</button>
                </div>
            </div>`;

        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = modalHtml;
            container.style.display = 'flex';
        }
    },

    async saveZaehler(id) {
        const unit = dataService.state.einheiten.find(u => String(u.einheit_id) === String(id));
        const data = {
            einheit_id: id,
            objekt_id: unit.objekt_id,
            kw_aktuell: document.getElementById('val-kw').value,
            ww_aktuell: document.getElementById('val-ww').value,
            st_ht_aktuell: document.getElementById('val-ht').value,
            st_nt_aktuell: document.getElementById('val-nt').value,
            oel_aktuell: document.getElementById('val-oel').value,
            zusatz_aktuell: document.getElementById('val-zusatz').value,
            bezeichnung: document.getElementById('val-bezeichnung').value
        };

        this.showLoading(true);
        const result = await cloudService.saveTransaction(data);
        this.showLoading(false);

        if (result.status === 'success') {
            alert("Erfolgreich gespeichert!");
            this.closeModal();
            location.reload();
        }
    },

    closeModal() {
        document.getElementById('modal-container').style.display = 'none';
    },

    showLoading(show) {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = show ? 'block' : 'none';
        console.log("Loading...", show);
    },

    backToObjects() {
        document.getElementById('view-units').style.display = 'none';
        document.getElementById('view-objects').style.display = 'block';
    }
};

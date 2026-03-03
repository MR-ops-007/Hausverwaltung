/**
 * UI-SERVICE (v1.6 - Fixed Mapping)
 * Fokus: Funktionalität auf Basis der vorhandenen IDs im Repo
 */
const uiService = {
    
    renderAll() {
        console.log("UI: Initialisiere Dropdown...");
        const select = document.getElementById('object-selector');
        if (!select) {
            console.error("Fehler: 'object-selector' nicht gefunden!");
            return;
        }

        // Dropdown leeren und Standard-Option setzen
        select.innerHTML = '<option value="">-- Haus auswählen --</option>';

        const objectIds = dataService.getUniqueObjects();
        
        objectIds.forEach(objId => {
            const objData = dataService.state.objekte.find(o => o.objekt_id === objId);
            const name = objData ? (objData.bezeichnung || objData.objekt_id) : objId;

            const option = document.createElement('option');
            option.value = objId;
            option.textContent = name;
            select.appendChild(option);
        });

        // Event-Listener für Auswahl hinzufügen
        select.onchange = (e) => {
            if (e.target.value) this.selectObject(e.target.value);
        };
    },

    selectObject(objId) {
        console.log("UI: Objekt ausgewählt:", objId);
        const tenantList = document.getElementById('tenant-list');
        if (!tenantList) return;

        tenantList.innerHTML = '';
        const units = dataService.getUnitsByObject(objId);
        
        units.forEach(unit => {
            const mieter = dataService.getActiveMieter(unit.einheit_id);
            const card = document.createElement('div');
            card.className = 'unit-card'; // Nutzt dein CSS für die Anzeige
            card.style.border = "1px solid #ccc";
            card.style.padding = "10px";
            card.style.margin = "5px 0";
            card.style.cursor = "pointer";

            card.onclick = () => this.showZaehlerMaske(unit.einheit_id);
            
            card.innerHTML = `
                <strong>Einheit: ${unit.nummer || unit.einheit_id}</strong><br>
                <span>${mieter ? mieter.mietername : 'Leerstand'}</span>
            `;
            tenantList.appendChild(card);
        });

        // Sektionen umschalten
        document.getElementById('object-selector-section').style.display = 'none';
        document.getElementById('unit-list-section').style.display = 'block';
    },

    showZaehlerMaske(id) {
        // Hier nutzen wir die IDs aus deinem Repo für das Modal
        const modal = document.getElementById('modal-container');
        const modalBody = document.getElementById('modal-body');
        if (!modal || !modalBody) return;

        const unit = dataService.state.einheiten.find(u => String(u.einheit_id) === String(id));
        
        modalBody.innerHTML = `
            <h3>Zählerstand erfassen</h3>
            <p>Einheit: ${unit ? unit.nummer : id}</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <input type="number" id="val-kw" placeholder="Kaltwasser">
                <input type="number" id="val-ww" placeholder="Warmwasser">
                <input type="number" id="val-ht" placeholder="Strom HT">
                <input type="number" id="val-nt" placeholder="Strom NT">
            </div>
            <br>
            <button onclick="uiService.saveZaehler('${id}')" style="background: green; color: white; padding: 10px;">Speichern</button>
            <button onclick="uiService.closeModal()" style="padding: 10px;">Abbrechen</button>
        `;
        modal.style.display = 'flex';
    },

    async saveZaehler(id) {
        const data = {
            einheit_id: id,
            kw_aktuell: document.getElementById('val-kw').value,
            ww_aktuell: document.getElementById('val-ww').value,
            st_ht_aktuell: document.getElementById('val-ht').value,
            st_nt_aktuell: document.getElementById('val-nt').value
        };

        console.log("Speichere Daten:", data);
        const res = await cloudService.saveTransaction(data);
        if(res.status === 'success') {
            alert("Gespeichert!");
            this.closeModal();
        }
    },

    closeModal() {
        document.getElementById('modal-container').style.display = 'none';
    },

    backToObjects() {
        document.getElementById('unit-list-section').style.display = 'none';
        document.getElementById('object-selector-section').style.display = 'block';
    }
};

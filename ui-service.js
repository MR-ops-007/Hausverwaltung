const uiService = {
    
    renderAll() {
        console.log("UI: renderAll startet");
        const container = document.getElementById('object-selector');
        if (!container) return;

        container.innerHTML = ''; 
        const objectIds = dataService.getUniqueObjects();

        objectIds.forEach(objId => {
            const objData = dataService.state.objekte.find(o => o.objekt_id === objId);
            const name = objData ? (objData.bezeichnung || objData.objekt_id) : objId;

            const btn = document.createElement('button');
            // Wir nutzen NUR die Klasse für das Styling (keine Inline-Styles mehr!)
            btn.className = 'object-card'; 
            
            // FIX: Wir nutzen explizit uiService statt 'this', um den Context-Fehler zu beheben
            btn.onclick = () => {
                console.log("Klick auf Haus:", objId);
                uiService.selectObject(objId);
            };

            btn.innerHTML = `<strong>${name}</strong><br><small>ID: ${objId}</small>`;
            container.appendChild(btn);
        });
    },

    selectObject(objId) {
        console.log("UI: selectObject ausgeführt für", objId);
        
        const tenantList = document.getElementById('tenant-list');
        const selectorSection = document.getElementById('object-selector-section');
        const unitSection = document.getElementById('unit-list-section');

        if (!tenantList || !unitSection) return;

        tenantList.innerHTML = `
            <button class="btn-back" onclick="uiService.backToObjects()" style="margin-bottom:15px;">← Zurück</button>
        `;

        const units = dataService.getUnitsByObject(objId);

        units.forEach(unit => {
            const mieter = dataService.getActiveMieter(unit.einheit_id);
            const card = document.createElement('div');
            card.className = 'unit-card';
            card.onclick = () => uiService.showZaehlerMaske(unit.einheit_id);
            
            card.innerHTML = `
                <div class="unit-info">
                    <strong>Einheit: ${unit.nummer || unit.einheit_id}</strong><br>
                    <span>Mieter: ${mieter ? mieter.mietername : 'Leerstand'}</span>
                </div>
            `;
            tenantList.appendChild(card);
        });

        // Umschalten
        if (selectorSection) selectorSection.style.display = 'none';
        unitSection.style.display = 'block';
    },

    showZaehlerMaske(id) {
        const modal = document.getElementById('modal-container');
        const modalBody = document.getElementById('modal-body');
        if (!modal || !modalBody) return;

        const unit = dataService.state.einheiten.find(u => String(u.einheit_id) === String(id));
        
        modalBody.innerHTML = `
            <h3>Zählerstand erfassen</h3>
            <p>Einheit: ${unit ? unit.nummer : id}</p>
            <div class="input-group" style="display: flex; flex-direction: column; gap: 10px;">
                <input type="number" id="val-kw" placeholder="Kaltwasser">
                <input type="number" id="val-ww" placeholder="Warmwasser">
                <input type="number" id="val-ht" placeholder="Strom HT">
                <input type="number" id="val-nt" placeholder="Strom NT">
            </div>
            <div style="margin-top: 20px;">
                <button onclick="uiService.saveZaehler('${id}')" class="btn-save" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Speichern</button>
                <button onclick="uiService.closeModal()" class="btn-cancel" style="margin-left: 10px; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Abbrechen</button>
            </div>
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

        const res = await cloudService.saveTransaction(data);
        if(res && res.status === 'success') {
            alert("Gespeichert!");
            this.closeModal();
        } else {
            alert("Fehler beim Speichern!");
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

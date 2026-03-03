const uiService = {
    // Hilfsfunktion für schicke Styles
    applyStyles(el, styles) {
        Object.assign(el.style, styles);
    },

    renderAll() {
        const container = document.getElementById('object-selector');
        if (!container) return;
        container.innerHTML = ''; 

        dataService.getUniqueObjects().forEach(objId => {
            const objData = dataService.state.objekte.find(o => o.objekt_id === objId);
            const name = objData ? (objData.bezeichnung || objData.objekt_id) : objId;

            const btn = document.createElement('button');
            btn.className = 'object-card';
            // Explizites Styling für die "schönen blauen Buttons"
            this.applyStyles(btn, {
                width: '100%',
                padding: '20px',
                margin: '10px 0',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                textAlign: 'left',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                fontSize: '16px'
            });
            
            btn.onclick = () => uiService.selectObject(objId);
            btn.innerHTML = `<strong>${name}</strong><br><small style="opacity:0.8">ID: ${objId}</small>`;
            container.appendChild(btn);
        });
    },

    selectObject(objId) {
        const tenantList = document.getElementById('tenant-list');
        const selectorSection = document.getElementById('object-selector-section');
        const unitSection = document.getElementById('unit-list-section');
        if (!tenantList) return;

        tenantList.innerHTML = `
            <button class="btn-back" onclick="uiService.backToObjects()" 
                style="padding:10px; margin-bottom:20px; cursor:pointer; background:#6c757d; color:white; border:none; border-radius:5px;">
                ← Zurück zur Auswahl
            </button>
            <h3 style="margin-bottom:15px;">Einheiten für ${objId}</h3>
        `;

        dataService.getUnitsByObject(objId).forEach(unit => {
            const mieter = dataService.getActiveMieter(unit.einheit_id);
            const card = document.createElement('div');
            card.className = 'unit-card';
            this.applyStyles(card, {
                padding: '15px',
                margin: '8px 0',
                backgroundColor: 'white',
                border: '1px solid #dee2e6',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            });

            card.onclick = () => uiService.showZaehlerMaske(unit.einheit_id);
            card.innerHTML = `
                <div>
                    <div style="font-weight:bold; color:#333;">${unit.nummer || 'Einheit'}</div>
                    <div style="font-size:0.9em; color:#666;">${mieter ? mieter.mietername : 'Leerstand'}</div>
                </div>
                <div style="color:#007bff; font-weight:bold;">➔</div>
            `;
            tenantList.appendChild(card);
        });

        if (selectorSection) selectorSection.style.display = 'none';
        unitSection.style.display = 'block';
    },

    showZaehlerMaske(id) {
        const modal = document.getElementById('modal-container');
        const modalBody = document.getElementById('modal-body');
        if (!modal || !modalBody) return;

        modalBody.innerHTML = `
            <h3 style="margin-top:0;">Zählerstand erfassen</h3>
            <p style="color:#666;">Einheit: ${id}</p>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:15px;">
                <div><label style="font-size:0.8em;">Kaltwasser</label><input type="number" id="val-kw" style="width:100%; padding:8px;"></div>
                <div><label style="font-size:0.8em;">Warmwasser</label><input type="number" id="val-ww" style="width:100%; padding:8px;"></div>
                <div><label style="font-size:0.8em;">Strom HT</label><input type="number" id="val-ht" style="width:100%; padding:8px;"></div>
                <div><label style="font-size:0.8em;">Strom NT</label><input type="number" id="val-nt" style="width:100%; padding:8px;"></div>
            </div>
            <div style="margin-top:25px; display:flex; gap:10px;">
                <button onclick="uiService.saveZaehler('${id}')" style="flex:1; background:#28a745; color:white; border:none; padding:12px; border-radius:5px; cursor:pointer; font-weight:bold;">Speichern</button>
                <button onclick="uiService.closeModal()" style="flex:1; background:#eee; border:none; padding:12px; border-radius:5px; cursor:pointer;">Abbrechen</button>
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
            alert("Erfolgreich im Sheet gespeichert!");
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

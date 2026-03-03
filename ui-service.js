/**
 * UI-SERVICE (v1.6 - Fixed Mapping)
 * Fokus: Funktionalität auf Basis der vorhandenen IDs im Repo
 */
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
            // Wir nutzen die Klasse für das Styling (deine blauen Buttons kommen zurück)
            btn.className = 'object-card'; 
            btn.style.width = "100%";
            btn.style.margin = "10px 0";
            btn.style.padding = "15px";
            btn.style.textAlign = "left";
            
            // WICHTIG: Hier wird die Funktion beim Klick aufgerufen
            btn.onclick = () => {
                console.log("Klick auf Haus:", objId);
                this.selectObject(objId);
            };

            btn.innerHTML = `<strong>${name}</strong><br><small>ID: ${objId}</small>`;
            container.appendChild(btn);
        });
    },

    selectObject(objId) {
        console.log("UI: selectObject ausgeführt für", objId);
        
        // Die ID aus deinem Test: Hier kommen die Einheiten rein
        const tenantList = document.getElementById('tenant-list');
        // Die Sektionen zum Umschalten (aus deinem Test)
        const selectorSection = document.getElementById('object-selector-section');
        const unitSection = document.getElementById('unit-list-section');

        if (!tenantList || !unitSection) {
            console.error("UI: Einheiten-Container oder Sektion nicht gefunden!");
            return;
        }

        tenantList.innerHTML = '';
        const units = dataService.getUnitsByObject(objId);
        console.log(`UI: ${units.length} Einheiten gefunden.`);

        units.forEach(unit => {
            const card = document.createElement('div');
            card.className = 'unit-card';
            card.style.border = "1px solid #007bff";
            card.style.padding = "15px";
            card.style.margin = "10px 0";
            card.style.borderRadius = "8px";
            card.style.cursor = "pointer";

            card.onclick = () => this.showZaehlerMaske(unit.einheit_id);
            
            card.innerHTML = `
                <div style="font-weight: bold; color: #007bff;">Einheit: ${unit.nummer || unit.einheit_id}</div>
                <div style="font-size: 0.9em;">Mieter: ${dataService.getActiveMieter(unit.einheit_id)?.mietername || 'Leerstand'}</div>
            `;
            tenantList.appendChild(card);
        });

        // UMSCHALTEN DER ANSICHT
        if (selectorSection) selectorSection.style.display = 'none';
        unitSection.style.display = 'block';
        
        console.log("UI: Ansicht auf Einheiten gewechselt.");
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

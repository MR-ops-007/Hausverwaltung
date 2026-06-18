/**
 * UI-SERVICE (v2.8.1 - VOLLSTÄNDIG - KEINE AUSLASSUNGEN)
 */
const uiService = {
    currentSelection: null,
    currentActiveMetersObjects: [],

    applyStyles(el, styles) {
        Object.assign(el.style, styles);
    },

    renderAll() {
        const container = document.getElementById('object-selector');
        if (!container) return;
        container.innerHTML = ''; 

        dataService.getUniqueObjects().forEach(objId => {
            const objData = dataService.state.objekte.find(o => String(o.objekt_id) === String(objId));
            const name = objData ? (objData.bezeichnung || objData.objekt_id) : objId;

            const btn = document.createElement('button');
            btn.className = 'object-card';
            this.applyStyles(btn, {
                width: '100%', padding: '20px', margin: '10px 0', backgroundColor: '#007bff',
                color: 'white', border: 'none', borderRadius: '8px', textAlign: 'left',
                cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontSize: '16px'
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
            <h3 style="margin-bottom:15px;">Objekt: ${objId}</h3>
        `;

        dataService.getUnitsByObject(objId).forEach(unit => {
            const viewData = dataService.state.view_aktive_mieter.find(v => String(v.einheit_id) === String(unit.einheit_id));
            let bewohnerText = viewData && viewData.mieter_name ? viewData.mieter_name : 'Leerstand';
            const card = document.createElement('div');
            card.className = 'unit-card';
            this.applyStyles(card, {
                padding: '15px', margin: '8px 0', backgroundColor: 'white',
                border: '1px solid #dee2e6', borderRadius: '6px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            });

            card.onclick = () => uiService.showZaehlerMaske(unit.einheit_id);
            card.innerHTML = `
                <div>
                    <div style="font-weight:bold; color:#333;">Einheit: ${unit.nummer || unit.einheit_id}</div>
                    <div style="font-size:0.9em; color:#666;">Mieter: ${bewohnerText}</div>
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
        const activeMeters = dataService.state.zaehler.filter(z => String(z.einheit_id) === String(id));

        let inputsHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:15px;">`;
        activeMeters.forEach(z => {
            inputsHtml += `
                <div style="padding:10px; border:1px solid #ccc; border-radius:4px; background:#f9f9f9;">
                    <label style="font-size:0.8rem;">${z.typ}</label>
                    <input type="number" id="input-${z.zaehler_id}" step="0.01" style="width:100%;">
                </div>`;
        });
        inputsHtml += `</div>`;

        modalBody.innerHTML = `
            <h3>Zählererfassung</h3>
            <p>Einheit: ${id}</p>
            ${inputsHtml}
            <div style="margin-top:20px;">
                <button onclick="uiService.saveZaehler()" style="background:#28a745; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer;">Speichern</button>
                <button onclick="uiService.closeModal()" style="background:#6c757d; color:white; padding:10px; border:none; border-radius:5px; cursor:pointer; margin-left:10px;">Abbrechen</button>
            </div>
        `;
        this.currentActiveMetersObjects = activeMeters;
        modal.style.display = 'flex';
    },

    async saveZaehler() {
        const transactions = [];
        const zeitstempel = new Date().toLocaleDateString('de-DE');

        this.currentActiveMetersObjects.forEach(zaehler => {
            const input = document.getElementById(`input-${zaehler.zaehler_id}`);
            if (input && input.value !== "") {
                transactions.push({
                    objekt_id: zaehler.objekt_id,
                    einheit_id: zaehler.einheit_id,
                    zaehler_id: zaehler.zaehler_id,
                    wert: parseFloat(input.value),
                    zeitstempel: zeitstempel,
                    quelle: "UI"
                });
            }
        });

        if (transactions.length === 0) return alert("Keine Werte eingetragen.");
        
        const res = await cloudService.saveTransaction({
            typ: "ZAEHLERSTAND_NEU", 
            data: transactions
        });
        
        if (res && res.status === 'success') {
            alert("Erfolgreich gespeichert!");
            this.closeModal();
        } else {
            alert("Fehler: " + (res ? res.message : "Unbekannter Fehler"));
        }
    },
    
    closeModal() { document.getElementById('modal-container').style.display = 'none'; },
    backToObjects() { 
        document.getElementById('unit-list-section').style.display = 'none'; 
        document.getElementById('object-selector-section').style.display = 'block'; 
    }
};

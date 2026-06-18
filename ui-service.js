/**
 * UI-SERVICE (v2.3 - FIX: Korrekte Payload-Struktur für Backend-Kommunikation)
 */
const uiService = {
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
            <h3 style="margin-bottom:15px;">Objekt: ${objId}</h3>
        `;

        dataService.getUnitsByObject(objId).forEach(unit => {
            const viewData = dataService.state.view_aktive_mieter.find(v => String(v.einheit_id) === String(unit.einheit_id));
            let bewohnerText = viewData && viewData.mieter_name ? viewData.mieter_name : 'Leerstand';
            
            const isGewerbe = String(unit.einheit_id).includes('_GE_');
            const typBezeichnung = isGewerbe ? "🏢 Gewerbe" : "🏠 Einheit";

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
                    <div style="font-weight:bold; color:#333;">${typBezeichnung}: ${unit.nummer || unit.einheit_id}</div>
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
        if (!dataService.state.zaehler || dataService.state.zaehler.length === 0) {
            alert("Die Daten werden noch geladen. Bitte kurz warten...");
            return;
        }

        const modal = document.getElementById('modal-container');
        const modalBody = document.getElementById('modal-body');
        if (!modal || !modalBody) return;

        const unit = dataService.state.einheiten.find(u => String(u.einheit_id) === String(id));
        const objId = unit ? unit.objekt_id : 'Unbekannt'; 
        
        const viewData = dataService.state.view_aktive_mieter.find(v => String(v.einheit_id) === String(id));
        let bewohnerText = viewData && viewData.mieter_name ? viewData.mieter_name : 'Leerstand';
        
        this.currentSelection = { einheit_id: id, objekt_id: objId, mietername: bewohnerText };
        const activeMeters = dataService.state.zaehler.filter(z => String(z.einheit_id) === String(id));

        if (activeMeters.length === 0) {
            modalBody.innerHTML = `<h3>Zählererfassung</h3><p style="color:red;">Keine Zähler gefunden.</p>`;
            modal.style.display = 'flex';
            return;
        }

        const meterStyles = {
            "kaltwasser_m3": { label: "💧 Kaltwasser (m³)", color: "#e3f2fd", border: "#2196f3" },
            "warmwasser_m3": { label: "♨️ Warmwasser (m³)", color: "#ffebee", border: "#f44336" },
            "strom_ht_kwh":  { label: "⚡ Strom HT (kWh)", color: "#fffde7", border: "#fbc02d" },
            "strom_nt_kwh":  { label: "🌙 Strom NT (kWh)", color: "#fffde7", border: "#fbc02d" }
        };

        let inputsHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:15px;">`;
        activeMeters.forEach(zaehler => {
            const style = meterStyles[zaehler.typ] || { label: zaehler.bezeichnung, color: "#ffffff", border: "#ccc" };
            inputsHtml += `
                <div style="background-color: ${style.color}; padding: 10px; border-radius: 8px; border-left: 5px solid ${style.border};">
                    <label style="font-size:0.75rem; font-weight:bold; display:block;">${style.label}</label>
                    <input type="number" id="input-${zaehler.zaehler_id}" step="0.01" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
                </div>`;
        });
        inputsHtml += `</div>`;

        modalBody.innerHTML = `
            <h3>Zählererfassung</h3>
            <p>Einheit: ${id}</p>
            ${inputsHtml}
            <div style="margin-top:25px; display:flex; gap:10px;">
                <button onclick="uiService.saveZaehler()" style="background:#28a745; color:white; padding:15px; border-radius:8px; border:none; cursor:pointer;">💾 Speichern</button>
                <button onclick="uiService.closeModal()" style="background:#6c757d; color:white; padding:15px; border-radius:8px; border:none; cursor:pointer;">Abbrechen</button>
            </div>
        `;
        modal.style.display = 'flex';
        this.currentActiveMetersObjects = activeMeters;
    },

    async saveZaehler() {
        const transactions = [];
        this.currentActiveMetersObjects.forEach(zaehler => {
            const input = document.getElementById(`input-${zaehler.zaehler_id}`);
            if (input && input.value !== "") {
                transactions.push({
                    zaehler_id: zaehler.zaehler_id,
                    wert: parseFloat(input.value),
                    zeitstempel: new Date().toLocaleDateString('de-DE')
                });
            }
        });

        if (transactions.length === 0) return alert("Bitte Werte eintragen.");

        // WICHTIG: Hier fügen wir den TYP hinzu, damit dein Backend die Tabelle findet!
        const payload = {
            typ: "ZAEHLERSTAND_NEU", 
            t_list: transactions
        };

        const res = await cloudService.saveTransaction(payload);
        
        if (res && res.status === 'success') {
            alert("Erfolgreich gespeichert!");
            this.closeModal();
        } else {
            alert("Fehler: " + (res ? res.message : "Unbekannt"));
        }
    },

    closeModal() { document.getElementById('modal-container').style.display = 'none'; },
    backToObjects() {
        document.getElementById('unit-list-section').style.display = 'none';
        document.getElementById('object-selector-section').style.display = 'block';
    }
};

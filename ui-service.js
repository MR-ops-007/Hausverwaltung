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
            <h3 style="margin-bottom:15px;">Objekt: ${objId}</h3>
        `;

        dataService.getUnitsByObject(objId).forEach(unit => {
            const mieter = dataService.getActiveMieter(unit.einheit_id);
            
            // --- KONKRETE ANPASSUNG START ---
            // Prüfen, ob die ID das Kürzel "GE" für Gewerbe enthält
            const isGewerbe = String(unit.einheit_id).includes('_GE_');
            const typBezeichnung = isGewerbe ? "🏢 Gewerbe" : "🏠 Einheit";
            // --- KONKRETE ANPASSUNG ENDE ---

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
                    <div style="font-weight:bold; color:#333;">${typBezeichnung}: ${unit.nummer || unit.einheit_id}</div>
                    <div style="font-size:0.9em; color:#666;">Mieter: ${mieter ? mieter.mietername : 'Leerstand'}</div>
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

        const unit = dataService.state.einheiten.find(u => String(u.einheit_id) === String(id));
        const mieter = dataService.getActiveMieter(id);
        const objId = unit ? unit.objekt_id : id.split('_')[0]; 
        
        this.currentSelection = {
            einheit_id: id,
            objekt_id: objId,
            mietername: mieter ? mieter.mietername : (id.includes('Allgemein') ? 'Haus allgemein' : 'Leerstand')
        };

        const objConfig = CONFIG[objId] || { defaultMeters: ["kaltwasser_m3", "warmwasser_m3", "strom_ht_kwh", "strom_nt_kwh"] };
        const activeMeters = (objConfig.customMeters && objConfig.customMeters[id]) 
                             ? objConfig.customMeters[id] 
                             : objConfig.defaultMeters;

        // Logik für Strom-Label: Gibt es einen NT Zähler?
        const hasNT = activeMeters.includes("strom_nt_kwh");

        const meterStyles = {
            "kaltwasser_m3": { label: "💧 Kaltwasser (m³)", color: "#e3f2fd", border: "#2196f3" },
            "warmwasser_m3": { label: "♨️ Warmwasser (m³)", color: "#ffebee", border: "#f44336" },
            "strom_ht_kwh":  { label: hasNT ? "⚡ Strom HT (kWh)" : "⚡ Strom (kWh)", color: "#fffde7", border: "#fbc02d" },
            "strom_nt_kwh":  { label: "🌙 Strom NT (kWh)", color: "#fffde7", border: "#fbc02d" },
            "oel_stand_l":   { label: "🛢️ Heizöl (Liter)", color: "#f5f5f5", border: "#424242" },
            "maschinenstunden": { label: "⚙️ Betriebsstunden", color: "#f3e5f5", border: "#9c27b0" }
        };

        let inputsHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:15px;">`;
        activeMeters.forEach(mKey => {
            const style = meterStyles[mKey] || { label: mKey, color: "#ffffff", border: "#ccc" };
            inputsHtml += `
                <div style="background-color: ${style.color}; padding: 10px; border-radius: 8px; border-left: 5px solid ${style.border};">
                    <label style="font-size:0.75rem; font-weight:bold; color:#333; display:block; margin-bottom:4px;">${style.label}</label>
                    <input type="number" id="val-${mKey}" step="0.01" placeholder="0,00"
                        style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:16px; box-sizing:border-box;">
                </div>`;
        });
        inputsHtml += `</div>`;

        modalBody.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <h3 style="margin:0; color:#2c3e50;">Zählererfassung</h3>
                    <p style="margin:4px 0; font-size:0.85rem; color:#7f8c8d;">${objId} | ${id}</p>
                </div>
            </div>
            <div style="margin-top:10px; padding:10px; background:#f8f9fa; border-radius:6px; border:1px solid #eee;">
                <span style="font-size:0.8rem; color:#666;">Aktueller Nutzer:</span><br>
                <strong style="font-size:1rem;">${this.currentSelection.mietername}</strong>
            </div>
            
            ${inputsHtml}

            <div style="margin-top:25px; display:flex; gap:10px;">
                <button onclick="uiService.saveZaehler()" style="flex:2; background:#28a745; color:white; border:none; padding:15px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">💾 Speichern</button>
                <button onclick="uiService.closeModal()" style="flex:1; background:#6c757d; color:white; border:none; padding:15px; border-radius:8px; cursor:pointer; font-size:1rem;">Abbrechen</button>
            </div>
        `;
        modal.style.display = 'flex';
        this.currentActiveMeters = activeMeters;
    },

    async saveZaehler() {
        const data = {
            ...this.currentSelection,
            typ: "ZAEHLERSTAND"
        };

        this.currentActiveMeters.forEach(mKey => {
            const input = document.getElementById(`val-${mKey}`);
            if (input) data[mKey] = input.value;
        });

        console.log("Sende dynamische Daten:", data);
        const res = await cloudService.saveTransaction(data);
        if(res && res.status === 'success') {
            alert("Erfolgreich gespeichert!");
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

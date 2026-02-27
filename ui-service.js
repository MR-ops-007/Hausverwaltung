// ui-service.js
const uiService = {
    renderAll() {
        this.renderObjectSelector();
        // Wir rendern erst Details, wenn ein Objekt gewählt wurde
        const activeObjekt = localStorage.getItem('selected_objekt_id');
        if (activeObjekt) {
            this.renderUnitList(activeObjekt);
        }
    },

    // Erstellt ein Dropdown oder eine Liste zur Auswahl des Hauses
    renderObjectSelector() {
        const container = document.getElementById('object-selector'); // Wir brauchen dieses Element in index.html
        if (!container) return;

        const objekte = dataService.state.objekte;
        let html = `<h3>Immobilie auswählen</h3><div class="object-grid">`;
        
        objekte.forEach(obj => {
            html += `
                <button class="btn-objekt" onclick="uiService.selectObjekt('${obj.objekt_id}')">
                    ${obj.name}
                </button>`;
        });
        
        html += `</div>`;
        container.innerHTML = html;
    },

    selectObjekt(id) {
        localStorage.setItem('selected_objekt_id', id);
        this.renderAll();
    },

    // Rendert die Einheiten des gewählten Objekts
    renderUnitList(objektId) {
        const listContainer = document.getElementById('tenant-list');
        if (!listContainer) return;

        const einheiten = dataService.getEinheitenByObjekt(objektId);
        let html = `<h2>Einheiten: ${objektId}</h2>`;

        einheiten.forEach(unit => {
            const mieter = dataService.getActiveMieter(unit.einheit_id);
            const statusText = calcService.getUnitStatus(unit, mieter);
            const zaehler = dataService.getZaehlerStaende(unit.einheit_id);
            
            html += `
                <div class="card">
                    <h4>${unit.nummer} - ${statusText}</h4>
                    <p><small>${unit.qm} qm | ${unit.typ}</small></p>
                    <div class="btn-group">
                        <button onclick="uiService.showZaehlerMaske('${unit.einheit_id}')">Zähler</button>
                        <button onclick="uiService.showMietMaske('${unit.einheit_id}')">Miete</button>
                    </div>
                </div>`;
        });

        listContainer.innerHTML = html;
    },

    showZaehlerMaske(einheitId) {
        const modal = document.getElementById('modal-container');
        const body = document.getElementById('modal-body');
        
        // Letzten Stand holen (aus dataService.state.zaehler_staende)
        const letzterStandObj = dataService.state.zaehler_staende.find(z => z.einheit_id === einheitId);
        const letzterWert = letzterStandObj ? letzterStandObj.wert : 0;
        const einheit = dataService.state.einheiten.find(e => e.einheit_id === einheitId);
    
        body.innerHTML = `
            <h3>Zählerstand erfassen</h3>
            <p><strong>Einheit:</strong> ${einheit.nummer}</p>
            <p>Letzter Stand: <span id="prev-val">${letzterWert}</span></p>
            
            <div class="input-group">
                <label>Neuer Stand:</label>
                <input type="number" id="new-stand" step="0.01" oninput="uiService.updateLiveCalc(${letzterWert})">
            </div>
            
            <div id="calc-preview" style="margin-top: 15px; padding: 10px; background: #f0f0f0;">
                Verbrauch: <strong id="live-diff">0</strong>
            </div>
    
            <button class="btn-save" onclick="uiService.saveZaehler('${einheitId}')" style="margin-top: 20px;">
                Speichern & Senden
            </button>
        `;
        
        modal.style.display = 'block';
    },
    
    updateLiveCalc(alt) {
        const neu = parseFloat(document.getElementById('new-stand').value) || 0;
        const diff = (neu - alt).toFixed(2);
        document.getElementById('live-diff').innerText = diff > 0 ? diff : "0 (Eingabe prüfen)";
    },
    
    closeModal() {
        document.getElementById('modal-container').style.display = 'none';
    },

    showMietMaske(id) {
        alert("Mietmaske für " + id + " folgt im nächsten Schritt!");
    }
};

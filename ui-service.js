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

    // ui-service.js -> showZaehlerMaske aktualisieren
    
    showZaehlerMaske(einheitId) {
        const modal = document.getElementById('modal-container');
        const body = document.getElementById('modal-body');
        
        // Tabelle finden (Fallback auf 'zaehler')
        const tabelle = dataService.state.zaehler_staende || dataService.state.zaehler || [];
        
        // Letzten Stand holen
        const letzterStandObj = tabelle.find(z => String(z.einheit_id).trim() === String(einheitId).trim());
        const letzterWert = letzterStandObj ? (parseFloat(letzterStandObj.wert) || 0) : 0;
        
        const einheit = dataService.state.einheiten.find(e => e.einheit_id === einheitId);
        if (!einheit) return;
    
        body.innerHTML = `
            <h3>Zählerstand erfassen</h3>
            <p style="margin-bottom: 10px;"><strong>Einheit:</strong> ${einheit.nummer}</p>
            
            <div style="background: #e9ecef; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <small>Letzter gespeicherter Stand:</small><br>
                <strong id="prev-val" style="font-size: 1.2em;">${letzterWert}</strong>
            </div>
            
            <div class="input-group" style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Neuer Stand:</label>
                <input type="number" id="new-stand" step="0.01" placeholder="z.B. 123.45"
                       style="width: 100%; padding: 12px; font-size: 1.1em; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box;" 
                       oninput="uiService.updateLiveCalc(${letzterWert})">
            </div>
            
            <div id="calc-preview" style="padding: 15px; background: #fff3cd; border-left: 5px solid #ffc107; border-radius: 5px; margin-bottom: 20px;">
                Verbrauch (aktuelle Eingabe): <strong id="live-diff" style="font-size: 1.1em; color: #856404;">0</strong>
            </div>
    
            <button class="btn-save" onclick="uiService.saveZaehler('${einheitId}')" 
                    style="background: #28a745; color: white; border: none; padding: 15px; width: 100%; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 1.1em;">
                Speichern & Senden
            </button>
        `;
        
        modal.style.display = 'block';
    },

    // ui-service.js -> saveZaehler HINZUFÜGEN
    
    async saveZaehler(einheitId) {
        const newStandEl = document.getElementById('new-stand');
        const newWertRaw = newStandEl.value;
        const oldWertRaw = document.getElementById('prev-val').innerText;
        
        // 1. Validierung
        if (!newWertRaw || newWertRaw.trim() === "") {
            alert("Bitte geben Sie einen neuen Zählerstand ein.");
            newStandEl.focus();
            return;
        }
        
        const newWert = parseFloat(newWertRaw);
        const oldWert = parseFloat(oldWertRaw) || 0;
        
        if (newWert < oldWert) {
            if (!confirm(`Der neue Stand (${newWert}) ist niedriger als der alte (${oldWert}). Speichern?`)) {
                return;
            }
        }
        
        // Button auf "Speichern..." setzen
        const saveBtn = document.querySelector('.btn-save');
        const originalText = saveBtn.innerText;
        saveBtn.innerText = "Sende Daten...";
        saveBtn.disabled = true;
    
        // 2. Transaktions-Paket schnüren (für die Tabelle "Transaktionen")
        const transaction = {
            zeitstempel: new Date().toISOString(),
            art: "ZAELERSTAND",
            einheit_id: einheitId,
            betrag: 0, // Betrag ist bei Zählerstand 0 (wird später berechnet)
            text: `Zaehlerstand ${newWert} (Alt: ${oldWert})`,
            daten_feld: JSON.stringify({ 
                wert_neu: newWert, 
                wert_alt: oldWert, 
                verbrauch: (newWert - oldWert) 
            })
        };
    
        // 3. Senden (über cloudService)
        try {
            const success = await cloudService.sendTransaction(transaction);
            
            if (success) {
                alert("Zählerstand erfolgreich gespeichert!");
                this.closeModal();
                // Optional: UI neu laden, um Transaktionen anzuzeigen
                // location.reload(); 
            } else {
                alert("Fehler beim Senden. Daten wurden in der Offline-Queue gespeichert.");
                this.closeModal();
            }
        } catch (e) {
            console.error("SaveZaehler Fehler:", e);
            alert("Ein unerwarteter Fehler ist aufgetreten.");
        } finally {
            // Button wiederherstellen
            saveBtn.innerText = originalText;
            saveBtn.disabled = false;
        }
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

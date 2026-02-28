/**
 * UI-Service
 * Zuständig für das Rendern der Oberflächen und die Benutzerinteraktionen
 */
const uiService = {
    // Hauptfunktion zum Rendern in der UI
    renderAll() {
        // Sucht den Container in der index.html
        const container = document.getElementById('object-selector');
        if (container) {
            this.renderObjectSelector();
        } else {
            console.error("Container 'object-selector' nicht in der index.html gefunden!");
        }
    },

    // Erstellt die Buttons für die Haus-Auswahl (z.B. Haus A, Haus B, Allgemein)
    renderObjectSelector() {
        const objects = dataService.getUniqueObjects();
        let html = '<div class="object-grid">';
        objects.forEach(obj => {
            html += `<button class="obj-btn" onclick="uiService.selectObject('${obj}')">${obj}</button>`;
        });
        html += '</div>';
        document.getElementById('object-selector').innerHTML = html;
    },

    // Wird aufgerufen, wenn ein Haus angeklickt wird
    selectObject(objName) {
        const units = dataService.getUnitsByObject(objName);
        this.renderUnitList(units);
    },

    // Erstellt die Liste der Wohnungen/Einheiten für das gewählte Haus
    renderUnitList(units) {
        let html = '<h3>Einheiten / Mieter</h3><div class="unit-grid">';
        units.forEach(unit => {
            // Holen des Mieters (Logik prüft jetzt im calcService, ob er aktiv ist)
            const mieter = dataService.getActiveMieter(unit.einheit_id);
            const statusText = calcService.getUnitStatus(unit, mieter);
            
            html += `
                <div class="card">
                    <h4>${unit.nummer}</h4>
                    <p><strong>Status:</strong> ${statusText}</p>
                    <div class="card-actions" style="display: flex; gap: 5px; margin-top: 10px;">
                        <button onclick="uiService.showZaehlerMaske('${unit.einheit_id}')">Zähler</button>
                        <button onclick="uiService.showMietMaske('${unit.einheit_id}')">Miete</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        document.getElementById('tenant-list').innerHTML = html;
    },

    // Öffnet das Modal für die Zählerstand-Eingabe
    showZaehlerMaske(einheitId) {
        const modal = document.getElementById('modal-container');
        const body = document.getElementById('modal-body');
        
        // Letzten Stand aus dem State suchen
        const tabelle = dataService.state.zaehler_staende || dataService.state.zaehler || [];
        const letzterStandObj = tabelle.find(z => String(z.einheit_id).trim() === String(einheitId).trim());
        const letzterWert = letzterStandObj ? (parseFloat(letzterStandObj.wert) || 0) : 0;
        
        const einheit = dataService.state.einheiten.find(e => e.einheit_id === einheitId);

        body.innerHTML = `
            <h3>Zählerstand erfassen</h3>
            <p><strong>Einheit:</strong> ${einheit ? einheit.nummer : einheitId}</p>
            
            <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px; border: 1px solid #dee2e6;">
                <small>Letzter gespeicherter Stand:</small><br>
                <strong id="prev-val" style="font-size: 1.2em;">${letzterWert}</strong>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight: bold;">Neuer Stand:</label>
                <input type="number" id="new-stand" step="0.01" placeholder="0.00"
                       style="width: 100%; padding: 12px; box-sizing: border-box; border: 2px solid #007bff; border-radius: 5px; font-size: 16px;" 
                       oninput="uiService.updateLiveCalc(${letzterWert})">
            </div>
            
            <div id="calc-preview" style="padding: 10px; background: #fff3cd; border-radius: 5px; margin-bottom: 15px; border-left: 5px solid #ffc107;">
                Differenz (Verbrauch): <strong id="live-diff">0</strong>
            </div>

            <button class="btn-save" onclick="uiService.saveZaehler('${einheitId}')" 
                    style="width: 100%; padding: 15px; background: #28a745; color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 1.1em;">
                Speichern & Senden
            </button>
        `;
        modal.style.display = 'block';
    },

    // Berechnet live während der Eingabe den Verbrauch
    updateLiveCalc(alt) {
        const neu = parseFloat(document.getElementById('new-stand').value) || 0;
        const diff = (neu - alt).toFixed(2);
        document.getElementById('live-diff').innerText = diff > 0 ? diff : "0";
    },

    // Sendet den Zählerstand an den Cloud-Service
    async saveZaehler(einheitId) {
        const newStandEl = document.getElementById('new-stand');
        const newWert = parseFloat(newStandEl.value);
        
        if (!newWert && newWert !== 0) {
            alert("Bitte einen gültigen Wert eingeben.");
            return;
        }

        const saveBtn = document.querySelector('.btn-save');
        const originalText = saveBtn.innerText;
        saveBtn.innerText = "Wird gesendet...";
        saveBtn.disabled = true;

        // Struktur für die Transaktions-Tabelle im Google Sheet
        const transaction = {
            zeitstempel: new Date().toISOString(),
            art: "ZAEHLERSTAND",
            einheit_id: einheitId,
            betrag: 0,
            text: `Zählerstand: ${newWert}`,
            daten_feld: JSON.stringify({ wert: newWert })
        };

        try {
            const success = await cloudService.sendTransaction(transaction);
            if (success) {
                alert("Erfolgreich gespeichert!");
                this.closeModal();
            } else {
                alert("Offline gespeichert. Wird später synchronisiert.");
                this.closeModal();
            }
        } catch (e) {
            console.error("Fehler beim Speichern:", e);
            alert("Fehler beim Speichern. Bitte Verbindung prüfen.");
        } finally {
            saveBtn.innerText = originalText;
            saveBtn.disabled = false;
        }
    },

    // Platzhalter für die Mietmaske
    showMietMaske(id) {
        alert("Mietmaske für " + id + " folgt im nächsten Schritt!");
    },

    // Schließt das Modal-Fenster
    closeModal() {
        document.getElementById('modal-container').style.display = 'none';
    }
};

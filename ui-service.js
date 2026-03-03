/**
 * UI-SERVICE (Architektur-Standard v1.0)
 * Stand: 03.03.2026
 * Fokus: Harmonisierung der Schreibweise & Fehlertoleranz
 */
const uiService = {
    
    /**
     * Haupt-Render-Funktion für die Übersicht
     */
    renderAll() {
        const container = document.getElementById('objects-container');
        if (!container) return;
        container.innerHTML = '';

        // Standard: Kleinschreibung
        const objectIds = dataService.getUniqueObjects();
        
        objectIds.forEach(objId => {
            const card = document.createElement('div');
            card.className = 'object-card';
            card.onclick = () => this.selectObject(objId);
            card.innerHTML = `<h3>Objekt: ${objId}</h3>`;
            container.appendChild(card);
        });
    },

    /**
     * Zeigt die Einheiten eines Objekts
     */
    selectObject(objId) {
        const unitsContainer = document.getElementById('units-container');
        if (!unitsContainer) return;
        unitsContainer.innerHTML = '';

        // API-Aufruf (Kleinschreibung im State wird intern im DataService genutzt)
        const units = dataService.getUnitsByObject(objId);
        
        units.forEach(unit => {
            const mieter = dataService.getActiveMieter(unit.einheit_id);
            const card = document.createElement('div');
            card.className = 'unit-card';
            card.onclick = () => this.showZaehlerMaske(unit.einheit_id);
            
            // Logik-Fix für Labeling (Architektur-Vorgabe)
            let statusText = "Leerstand";
            if (mieter) {
                statusText = mieter.mietername;
            } else if (String(unit.typ).toLowerCase() === 'allgemein') {
                statusText = "Allgemein / Hausstrom";
            }

            card.innerHTML = `
                <h4>${unit.nummer || unit.einheit_id}</h4>
                <p>${statusText}</p>
                <small>${unit.typ}</small>
            `;
            unitsContainer.appendChild(card);
        });
        
        document.getElementById('view-objects').style.display = 'none';
        document.getElementById('view-units').style.display = 'block';
    },

    /**
     * Die Zählermaske (Fix für Daten-Blocker & Platzhalter)
     */
    showZaehlerMaske(id) {
        const state = dataService.state;
        
        // Prüfung gegen harmonisierten State (Klein)
        const unit = state.einheiten.find(u => String(u.einheit_id) === String(id));
        if (!unit) return;

        const mieter = dataService.getActiveMieter(id);
        const lastStands = (state.zaehler_staende || []).find(z => String(z.einheit_id) === String(id)) || {};

        let mieterName = "Leerstand";
        if (mieter) {
            mieterName = mieter.mietername;
        } else if (String(unit.typ).toLowerCase() === 'allgemein') {
            mieterName = "Allgemein / Hausstrom";
        }

        const modalHtml = `
            <div class="modal-content">
                <h3>Zähler: ${unit.nummer || unit.einheit_id}</h3>
                <p><small>Status: <b>${mieterName}</b></small></p>
                <hr>
                <div class="form-group">
                    <label>Kaltwasser (m³):</label>
                    <input type="number" id="val-kw" step="0.001" placeholder="Letzter: ${lastStands.kw_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Warmwasser (m³):</label>
                    <input type="number" id="val-ww" step="0.001" placeholder="Letzter: ${lastStands.ww_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Strom HT (kWh):</label>
                    <input type="number" id="val-ht" step="1" placeholder="Letzter: ${lastStands.st_ht_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Strom NT (kWh):</label>
                    <input type="number" id="val-nt" step="1" placeholder="Letzter: ${lastStands.st_nt_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Ölstand (Liter):</label>
                    <input type="number" id="val-oel" step="1" placeholder="Letzter: ${lastStands.oel_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Zusatzwert:</label>
                    <input type="number" id="val-zusatz" step="0.1" placeholder="Letzter: ${lastStands.zusatz_aktuell || '0'}">
                </div>
                <div class="form-group">
                    <label>Bemerkung:</label>
                    <input type="text" id="val-bezeichnung" value="${lastStands.bezeichnung || ''}">
                </div>
                <div class="modal-actions">
                    <button onclick="uiService.saveZaehler('${id}')" class="btn-save">Speichern</button>
                    <button onclick="uiService.closeModal()" class="btn-cancel">Abbrechen</button>
                </div>
            </div>
        `;

        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = modalHtml;
            container.style.display = 'flex';
        }
    },

    /**
     * Speichern-Logik (Bereinigt von Case-Sensitivity Fehlern)
     */
    async saveZaehler(id) {
        // FIX für Zeile 154: Zugriff nun konsequent auf Kleinschreibung
        const unit = dataService.state.einheiten.find(u => String(u.einheit_id) === String(id));
        if (!unit) {
            alert("Fehler: Einheit nicht gefunden.");
            return;
        }

        const data = {
            einheit_id: id,
            objekt_id: unit.objekt_id,
            kw_aktuell: document.getElementById('val-kw').value,
            ww_aktuell: document.getElementById('val-ww').value,
            st_ht_aktuell: document.getElementById('val-ht').value,
            st_nt_aktuell: document.getElementById('val-nt').value,
            oel_aktuell: document.getElementById('val-oel').value,
            zusatz_aktuell: document.getElementById('val-zusatz').value,
            bezeichnung: document.getElementById('val-bezeichnung').value
        };

        try {
            uiService.showLoading(true);
            const result = await cloudService.saveTransaction(data);
            if (result.status === 'success') {
                alert("Daten erfolgreich gespeichert!");
                this.closeModal();
                // Seite neu laden um State zu aktualisieren
                location.reload(); 
            } else {
                alert("Fehler beim Speichern: " + result.message);
            }
        } catch (error) {
            console.error("Save Error:", error);
            alert("Verbindungsfehler zum Server.");
        } finally {
            uiService.showLoading(false);
        }
    },

    closeModal() {
        const container = document.getElementById('modal-container');
        if (container) container.style.display = 'none';
    },

    showLoading(show) {
        // Implementierung je nach CSS/HTML vorhanden
        console.log("Loading...", show);
    },

    backToObjects() {
        document.getElementById('view-units').style.display = 'none';
        document.getElementById('view-objects').style.display = 'block';
    }
};

// ui-service.js
const uiService = {
    renderAll() {
        this.renderRentList();
        this.renderUnitSelector();
        this.renderMeterFields();
        this.renderHistory();
    },

    renderPropertySelector() {
        const sel = document.getElementById('property-selector');
        if (!sel) return;
        sel.innerHTML = '';
        for (const key in CONFIG) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = CONFIG[key].name;
            sel.appendChild(opt);
        }
        sel.value = dataService.state.currentProperty;
    },

    // --- MIETEN TAB ---
    renderRentList() {
        const container = document.getElementById('rent-container');
        if (!container) return;
        container.innerHTML = '';
        const prop = CONFIG[dataService.state.currentProperty];
        const propData = dataService.state.data[dataService.state.currentProperty];

        const addRow = (id, label) => {
            const name = propData.names[id] || '';
            const paid = propData.rent[id] || false;
            container.innerHTML += `
                <div class="p-6 flex items-center justify-between border-b border-slate-100">
                    <div class="flex-1">
                        <span class="unit-title block text-slate-500 text-sm font-bold">${label}</span>
                        <input type="text" oninput="uiService.handleNameChange('${id}', this.value)"
                               placeholder="Name..." class="mieter-input-box" value="${name}">
                    </div>
                    <input type="checkbox" onchange="uiService.handleRentChange('${id}', this.checked)"
                           class="w-10 h-10 rounded-xl border-slate-300 text-blue-600" ${paid ? 'checked' : ''}>
                </div>`;
        };

        for (let i = 1; i <= prop.units; i++) {
            if (prop.excludeUnits && prop.excludeUnits.includes(i)) continue;
            addRow('WE' + i, 'WE ' + i.toString().padStart(2, '0'));
        }
        for (let i = 1; i <= prop.gewerbe; i++) {
            addRow('GE' + i, 'GE ' + i);
        }
    },

    handleNameChange(id, val) {
        dataService.updateLocalTenant(id, val);
        this.renderUnitSelector(); // Dropdown aktualisieren

        // Cloud-Sync mit Verzögerung
        clearTimeout(this.nameTimeout);
        this.nameTimeout = setTimeout(() => {
            cloudService.send({
                type: "NAME_UPDATE",
                prop: CONFIG[dataService.state.currentProperty].name,
                unitId: id,
                val: val
            });
        }, 2000);
    },

    handleRentChange(id, val) {
        dataService.state.data[dataService.state.currentProperty].rent[id] = val;
        dataService.save();
    },

    // --- ZÄHLER TAB ---
    renderUnitSelector() {
        const sel = document.getElementById('unit-select');
        if (!sel) return;
        const prop = CONFIG[dataService.state.currentProperty];
        const names = dataService.state.data[dataService.state.currentProperty].names;

        let options = '<option value="Haus">🏢 Haus / Allgemein</option>';
        for (let i = 1; i <= prop.units; i++) {
            if (prop.excludeUnits && prop.excludeUnits.includes(i)) continue;
            const n = names['WE' + i] ? ' - ' + names['WE' + i] : '';
            options += `<option value="WE ${i}">🏠 WE ${i}${n}</option>`;
        }
        for (let i = 1; i <= prop.gewerbe; i++) {
            const n = names['GE' + i] ? ' - ' + names['GE' + i] : '';
            options += `<option value="GE ${i}">🏭 GE ${i}${n}</option>`;
        }
        sel.innerHTML = options;
    },

    renderMeterFields() {
        const container = document.getElementById('meter-fields');
        if (!container) return;
        const unit = document.getElementById('unit-select').value;
        const prop = CONFIG[dataService.state.currentProperty];

        let html = this.uiField('blue', 'Kaltwasser (m³)', 'val-kw', '0,000', 'Kaltwasser');

        if (unit !== 'Haus' || dataService.state.currentProperty === 'hauptstrasse') {
            html += this.uiField('orange', 'Warmwasser (m³)', 'val-ww', '0,000', 'Warmwasser');
        }

        if (dataService.state.currentProperty === 'hauptstrasse' && unit === 'Haus') {
            html += `
                <div class="p-5 bg-yellow-50 rounded-3xl border-2 border-yellow-100">
                    <label class="block text-sm font-black text-yellow-700 uppercase mb-3 text-center">Allgemeinstrom HT/NT</label>
                    <input id="val-ht" type="number" placeholder="HT" class="w-full p-4 mb-2 rounded-xl text-xl font-bold border-2 border-slate-200">
                    <input id="val-nt" type="number" placeholder="NT" class="w-full p-4 mb-4 rounded-xl text-xl font-bold border-2 border-slate-200">
                    <button onclick="uiService.handleMeterSubmit('Strom HT/NT', 'val-ht', 'val-nt')"
                            class="w-full bg-yellow-600 text-white py-5 rounded-2xl font-black uppercase">Speichern</button>
                </div>`;
        } else {
            html += this.uiField('yellow', 'Strom (kWh)', 'val-strom', '0,0', 'Strom');
        }

        if (prop.hasOil && unit === 'Haus') {
            html += this.uiField('slate', 'Heizöl (L)', 'val-oil', '0000', 'Heizöl');
        }
        container.innerHTML = html;
    },

    uiField(color, label, id, placeholder, typeName) {
        return `
            <div class="p-5 bg-${color}-50 rounded-3xl border-2 border-${color}-100">
                <label class="block text-sm font-black text-${color}-600 uppercase mb-3 text-center">${label}</label>
                <input id="${id}" type="number" step="0.001" placeholder="${placeholder}"
                       class="w-full p-5 rounded-2xl text-2xl font-bold text-center mb-3 border-2 border-slate-200">
                <button onclick="uiService.handleMeterSubmit('${typeName}', '${id}')"
                        class="w-full bg-${color}-600 text-white py-5 rounded-2xl font-black uppercase">Speichern</button>
            </div>`;
    },

    async handleMeterSubmit(type, id1, id2) {
        const unitSelect = document.getElementById('unit-select');
        const unitText = unitSelect.options[unitSelect.selectedIndex].text;
        const val1 = document.getElementById(id1).value;
        const val2 = id2 ? document.getElementById(id2).value : null;

        if (!val1) return alert("Bitte Wert eingeben!");

        const payload = {
            prop: CONFIG[dataService.state.currentProperty].name,
            unit: unitText.split(' - ')[0],
            mieter: unitText.includes(' - ') ? unitText.split(' - ')[1] : "Allgemein",
            type: type,
            val: val2 ? `HT: ${val1} / NT: ${val2}` : val1
        };

        // Lokal speichern für History
        dataService.state.history.unshift({ ...payload, time: new Date().toLocaleTimeString() });
        dataService.save();
        this.renderHistory();

        // Über CloudService senden
        const success = await cloudService.send(payload);
        if (success) {
            alert("✅ Gespeichert!");
        } else {
            alert("⚠️ Offline: Wird später gesendet!");
        }

        // Felder leeren
        document.getElementById(id1).value = '';
        if (id2) document.getElementById(id2).value = '';
    },

    renderHistory() {
        const container = document.getElementById('history-list');
        if (!container) return;
        container.innerHTML = dataService.state.history.slice(0, 5).map(e => `
            <div class="card p-4 border-l-8 border-green-500 flex justify-between items-center mb-2 bg-white rounded-xl shadow-sm">
                <div class="text-sm font-bold">${e.unit}<br><span class="text-xs text-slate-400">${e.type}</span></div>
                <div class="font-black text-xl">${e.val}</div>
            </div>`).join('');
    },

    switchTab(tab) {
        document.getElementById('tab-rent').classList.toggle('hidden', tab !== 'rent');
        document.getElementById('tab-meters').classList.toggle('hidden', tab !== 'meters');
        document.getElementById('btn-rent').className = tab === 'rent' ? 'flex-1 p-5 card font-bold tab-btn-active shadow-lg' : 'flex-1 p-5 card font-bold tab-btn-inactive';
        document.getElementById('btn-meters').className = tab === 'meters' ? 'flex-1 p-5 card font-bold tab-btn-active shadow-lg' : 'flex-1 p-5 card font-bold tab-btn-inactive';
    },

    changeProperty(val) {
        dataService.state.currentProperty = val;
        dataService.save();
        this.renderAll();
    }
};

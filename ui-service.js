/**
 * UI-SERVICE (v2.8.2 - Zähler-Plausibilitätsprüfung integriert)
 */
const uiService = {
  currentSelection: null,
  currentActiveMetersObjects: [],

  applyStyles(el, styles) {
    Object.assign(el.style, styles);
  },

  parseGermanDate(value) {
    if (!value) return 0;

    if (value instanceof Date) {
      return value.getTime();
    }

    const text = String(value).trim();

    const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);

    if (match) {
      const [, day, month, year, hour = '0', minute = '0'] = match;

      return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute)
      ).getTime();
    }

    const fallback = Date.parse(text);
    return Number.isFinite(fallback) ? fallback : 0;
  },

  formatGermanTimestamp(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${day}.${month}.${year} ${hour}:${minute}`;
  },

  getZaehlerLabel(zaehler) {
    return (
      zaehler.bezeichnung ||
      zaehler.medium ||
      zaehler.typ ||
      zaehler.zaehler_id ||
      'Zähler'
    );
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  getUnitDisplayName(unit) {
    if (!unit) return '';

    return unit.nummer || unit.bezeichnung || unit.einheit || unit.einheit_id || '';
  },

  getUnitEntranceLabel(unit) {
    if (!unit || !unit.eingang) return '';

    return String(unit.eingang).toLowerCase() === 'allgemein'
      ? 'Allgemein'
      : `Eingang ${unit.eingang}`;
  },

  formatMieterDisplayName(value) {
    const text = String(value || '').trim();

    if (!text || text === 'Leerstand') {
      return 'Leerstand';
    }

    return text
      .split(' / ')
      .map(part => {
        const pieces = part.split(',').map(piece => piece.trim()).filter(Boolean);

        if (pieces.length === 2) {
          return `${pieces[1]} ${pieces[0]}`;
        }

        return part.trim();
      })
      .join(' / ');
  },

  getUnitViewData(einheitId) {
    const viewRows = Array.isArray(dataService.state.view_aktive_mieter)
      ? dataService.state.view_aktive_mieter
      : [];

    return viewRows.find(v => String(v.einheit_id) === String(einheitId));
  },

  isTrueValue(value) {
    return value === true || value === 'TRUE' || value === 'true' || value === 1 || value === '1';
  },

  isFalseValue(value) {
    return value === false || value === 'FALSE' || value === 'false' || value === 0 || value === '0';
  },

  isZaehlerManuellErfassbar(zaehler) {
    return (
      !this.isFalseValue(zaehler.aktiv) &&
      !this.isFalseValue(zaehler.erfassbar) &&
      !this.isTrueValue(zaehler.berechnet)
    );
  },

  createFallbackValidationService() {
    const VALIDATION_STATUS = {
      OK: 'OK',
      WARNUNG: 'WARNUNG',
      FEHLER: 'FEHLER',
    };
    const toNumber = value => {
      if (value === null || value === undefined || value === '') {
        return null;
      }

      const normalized = typeof value === 'string'
        ? value.replace(',', '.').trim()
        : value;
      const number = Number(normalized);

      return Number.isFinite(number) ? number : null;
    };
    const toBoolean = value => (
      value === true ||
      value === 'TRUE' ||
      value === 'true' ||
      value === 1 ||
      value === '1'
    );
    const normalizeKey = value => String(value || '').trim().toLowerCase();
    const buildResult = (status, code, message, options = {}) => ({
      status,
      code,
      message,
      delta: options.delta ?? null,
      needsConfirmation: options.needsConfirmation ?? false,
    });
    const calculateOverflowDelta = (lastValue, newValue, digits) => {
      const maxValueExclusive = Math.pow(10, digits);
      return maxValueExclusive - lastValue + newValue;
    };
    const isReverseFillLevelMeter = zaehler => {
      const medium = normalizeKey(zaehler.medium);
      const zaehlerId = normalizeKey(zaehler.zaehler_id);

      return medium === 'oel_stand_cm' || zaehlerId.includes('oel_stand_in_cm');
    };

    return {
      VALIDATION_STATUS,
      validateZaehlerstand({ letzterWert, neuerWert, zaehler = {}, context = {} }) {
        const previous = toNumber(letzterWert);
        const current = toNumber(neuerWert);

        if (current === null) {
          return buildResult(VALIDATION_STATUS.FEHLER, 'INVALID_NEW_VALUE', 'Der neue Zählerstand ist keine gültige Zahl.');
        }

        if (current < 0) {
          return buildResult(VALIDATION_STATUS.FEHLER, 'NEGATIVE_NEW_VALUE', 'Der neue Zählerstand darf nicht negativ sein.');
        }

        if (previous === null) {
          return buildResult(VALIDATION_STATUS.OK, 'FIRST_READING', 'Erstablesung ohne vorherigen Vergleichswert.', { delta: null });
        }

        if (previous < 0) {
          return buildResult(VALIDATION_STATUS.FEHLER, 'INVALID_PREVIOUS_VALUE', 'Der vorherige Zählerstand ist ungültig.');
        }

        const maxPlausibleConsumption = toNumber(zaehler.max_plausibler_verbrauch);
        const isMeterChange = toBoolean(context.zaehlerwechsel) || toBoolean(zaehler.zaehlerwechsel);

        if (isReverseFillLevelMeter(zaehler)) {
          if (current <= previous) {
            const delta = previous - current;

            if (maxPlausibleConsumption !== null && delta > maxPlausibleConsumption) {
              return buildResult(
                VALIDATION_STATUS.WARNUNG,
                'HIGH_FILL_LEVEL_CONSUMPTION',
                'Der Füllstand ist stärker gesunken als der definierte plausible Maximalverbrauch.',
                { delta, needsConfirmation: true }
              );
            }

            return buildResult(VALIDATION_STATUS.OK, 'FILL_LEVEL_DECREASE', 'Der niedrigere Füllstand ist als Verbrauch plausibel.', { delta });
          }

          return buildResult(
            VALIDATION_STATUS.WARNUNG,
            'FILL_LEVEL_INCREASE',
            'Der Füllstand ist höher als der vorherige Wert. Bitte Betankung, Korrektur oder Eingabefehler prüfen.',
            { delta: current - previous, needsConfirmation: true }
          );
        }

        if (current >= previous) {
          const delta = current - previous;

          if (maxPlausibleConsumption !== null && delta > maxPlausibleConsumption) {
            return buildResult(
              VALIDATION_STATUS.WARNUNG,
              'HIGH_CONSUMPTION',
              'Der Verbrauch ist höher als der definierte plausible Maximalwert.',
              { delta, needsConfirmation: true }
            );
          }

          return buildResult(VALIDATION_STATUS.OK, 'NORMAL_INCREASE', 'Der neue Zählerstand ist plausibel.', { delta });
        }

        if (isMeterChange) {
          return buildResult(VALIDATION_STATUS.OK, 'METER_CHANGE', 'Der niedrigere Wert ist durch einen Zählerwechsel erklärbar.', { delta: null });
        }

        const overflowAllowed = toBoolean(zaehler.ueberlauf_erlaubt);
        const digits = toNumber(zaehler.stellen);

        if (overflowAllowed && digits !== null && digits > 0) {
          const delta = calculateOverflowDelta(previous, current, digits);

          if (maxPlausibleConsumption !== null && delta > maxPlausibleConsumption) {
            return buildResult(
              VALIDATION_STATUS.WARNUNG,
              'HIGH_OVERFLOW_CONSUMPTION',
              'Der niedrigere Wert kann durch Überlauf erklärbar sein, der berechnete Verbrauch ist aber ungewöhnlich hoch.',
              { delta, needsConfirmation: true }
            );
          }

          return buildResult(VALIDATION_STATUS.OK, 'OVERFLOW', 'Der niedrigere Wert ist durch einen Zählerüberlauf erklärbar.', { delta });
        }

        return buildResult(
          VALIDATION_STATUS.WARNUNG,
          'LOWER_VALUE_WITHOUT_EXPLANATION',
          'Der neue Zählerstand ist niedriger als der vorherige Wert. Bitte Zählerwechsel, Überlauf oder Eingabefehler prüfen.',
          { delta: null, needsConfirmation: true }
        );
      }
    };
  },

  async getValidationService() {
    let validator = window.validationService;

    if (validator && typeof validator.validateZaehlerstand === 'function') {
      return validator;
    }

    try {
      let validationModule;

      try {
        validationModule = await import('./validation-service.js?v=20260628-validation-fallback-v2');
      } catch (versionedError) {
        validationModule = await import('./validation-service.js');
      }

      validator = {
        VALIDATION_STATUS: validationModule.VALIDATION_STATUS,
        validateZaehlerstand: validationModule.validateZaehlerstand
      };
    } catch (error) {
      validator = this.createFallbackValidationService();
    }

    window.validationService = validator;
    return validator;
  },

  getLatestZaehlerstand(zaehlerOrId) {
    const readings = Array.isArray(dataService.state.zaehlerstaende)
      ? dataService.state.zaehlerstaende
      : [];
    const zaehler = typeof zaehlerOrId === 'object' && zaehlerOrId !== null
      ? zaehlerOrId
      : { zaehler_id: zaehlerOrId };

    const matchingReadings = readings
      .filter(row => {
        if (String(row.zaehler_id) !== String(zaehler.zaehler_id)) {
          return false;
        }

        if (zaehler.objekt_id && String(row.objekt_id) !== String(zaehler.objekt_id)) {
          return false;
        }

        if (zaehler.einheit_id && String(row.einheit_id) !== String(zaehler.einheit_id)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => this.parseGermanDate(b.zeitstempel) - this.parseGermanDate(a.zeitstempel));

    return matchingReadings[0] || null;
  },

  formatValidationMessage(zaehler, latestReading, result, neuerWert) {
    const name = this.getZaehlerLabel(zaehler);
    const alterWert = latestReading ? latestReading.wert : 'kein Vorwert';

    return [
      `${name}`,
      `Alt: ${alterWert}`,
      `Neu: ${neuerWert}`,
      result.delta !== null ? `Differenz: ${result.delta}` : null,
      result.message
    ].filter(Boolean).join(' | ');
  },

  getObjectDisplayName(objektId) {
    const objects = Array.isArray(dataService.state.objekte)
      ? dataService.state.objekte
      : [];
    const objData = objects.find(o => String(o.objekt_id) === String(objektId));

    return objData ? (objData.bezeichnung || objData.objekt_id) : objektId;
  },

  getAvailableConsumptionYears() {
    const years = new Set(
      (Array.isArray(dataService.state.zaehlerstaende) ? dataService.state.zaehlerstaende : [])
        .map(reading => {
          const timestamp = this.parseGermanDate(reading.zeitstempel);
          return timestamp ? String(new Date(timestamp).getFullYear()) : '';
        })
        .filter(Boolean)
    );

    if (years.size === 0) {
      years.add(String(new Date().getFullYear()));
    }

    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  },

  formatDashboardNumber(value) {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return '-';
    }

    return number.toLocaleString('de-DE', {
      maximumFractionDigits: 2
    });
  },

  getConsumptionStatusLabel(status) {
    const labels = {
      OK: 'OK',
      UEBERLAUF: 'Überlauf',
      EINZELWERT: 'Einzelwert',
      KEINE_WERTE: 'Keine Werte',
      UNBERECHENBAR: 'Prüfen',
      UNPLAUSIBEL_HOCH: 'Unplausibel',
      TEILWEISE_UNBERECHENBAR: 'Teilweise offen',
      RUECKLAEUFIG_UNGEKLAERT: 'Prüfen',
      FUELLSTAND_GESTIEGEN: 'Prüfen',
      FORTGESCHRIEBEN: 'Fortgeschrieben'
    };

    return labels[status] || status || '';
  },

  getConsumptionStatusColor(status) {
    if (status === 'OK') return '#15803d';
    if (status === 'UEBERLAUF' || status === 'EINZELWERT' || status === 'FORTGESCHRIEBEN') return '#0369a1';
    if (status === 'KEINE_WERTE') return '#64748b';
    return '#b45309';
  },

  setNavigationState(activeView) {
    const meterButton = document.getElementById('nav-meter-entry');
    const dashboardButton = document.getElementById('nav-consumption-dashboard');

    if (meterButton) {
      meterButton.className = activeView === 'meter' ? 'tab-btn-active' : 'tab-btn-inactive';
    }

    if (dashboardButton) {
      dashboardButton.className = activeView === 'consumption' ? 'tab-btn-active' : 'tab-btn-inactive';
    }
  },

  showMeterEntryView() {
    const dashboardSection = document.getElementById('consumption-dashboard-section');
    const selectorSection = document.getElementById('object-selector-section');
    const unitSection = document.getElementById('unit-list-section');

    if (dashboardSection) dashboardSection.style.display = 'none';
    if (selectorSection) selectorSection.style.display = 'block';
    if (unitSection) unitSection.style.display = 'none';

    this.setNavigationState('meter');
  },

  showConsumptionDashboard() {
    const dashboardSection = document.getElementById('consumption-dashboard-section');
    const selectorSection = document.getElementById('object-selector-section');
    const unitSection = document.getElementById('unit-list-section');

    if (selectorSection) selectorSection.style.display = 'none';
    if (unitSection) unitSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';

    this.setNavigationState('consumption');
    this.renderConsumptionDashboardControls();
    this.renderConsumptionDashboard();
  },

  renderConsumptionDashboardControls() {
    const objectSelect = document.getElementById('consumption-object-select');
    const yearSelect = document.getElementById('consumption-year-select');

    if (!objectSelect || !yearSelect) return;

    const currentObject = objectSelect.value;
    const currentYear = yearSelect.value;
    const objectIds = dataService.getUniqueObjects();
    const years = this.getAvailableConsumptionYears();

    objectSelect.innerHTML = objectIds
      .map(objId => `<option value="${this.escapeHtml(objId)}">${this.escapeHtml(this.getObjectDisplayName(objId))}</option>`)
      .join('');
    yearSelect.innerHTML = years
      .map(year => `<option value="${this.escapeHtml(year)}">${this.escapeHtml(year)}</option>`)
      .join('');

    if (currentObject && objectIds.includes(currentObject)) {
      objectSelect.value = currentObject;
    }

    if (currentYear && years.includes(currentYear)) {
      yearSelect.value = currentYear;
    }
  },

  renderConsumptionDashboard() {
    const output = document.getElementById('consumption-dashboard-output');
    const objectSelect = document.getElementById('consumption-object-select');
    const yearSelect = document.getElementById('consumption-year-select');
    const includeCalculatedInput = document.getElementById('consumption-include-calculated');

    if (!output || !objectSelect || !yearSelect) return;

    if (typeof calcService === 'undefined' || !calcService.buildConsumptionDashboard) {
      output.innerHTML = '<div style="padding:12px; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px;">Verbrauchsberechnung ist nicht geladen.</div>';
      return;
    }

    const objectIds = dataService.getUniqueObjects();
    const objektId = objectSelect.value || objectIds[0] || '';
    const year = yearSelect.value || this.getAvailableConsumptionYears()[0] || '';
    const includeCalculated = includeCalculatedInput ? includeCalculatedInput.checked : true;

    if (!objektId) {
      output.innerHTML = '<div style="padding:12px; background:white; border:1px solid #e2e8f0; border-radius:8px;">Keine Objektdaten geladen.</div>';
      return;
    }

    const dashboard = calcService.buildConsumptionDashboard(dataService.state, {
      objekt_id: objektId,
      year,
      includeCalculated
    });
    const sortedRows = dashboard.rows
      .slice()
      .sort((a, b) => (
        String(a.einheit_name).localeCompare(String(b.einheit_name), 'de') ||
        String(a.medium).localeCompare(String(b.medium), 'de') ||
        String(a.bezeichnung).localeCompare(String(b.bezeichnung), 'de')
      ));
    const summaryHtml = dashboard.summary.length > 0
      ? dashboard.summary
        .map(item => `
          <div class="consumption-summary-item">
            <div style="font-size:0.75rem; color:#64748b; font-weight:700;">${this.escapeHtml(item.medium || 'Ohne Medium')}</div>
            <div style="font-size:1.15rem; font-weight:900; color:#0f172a;">${this.formatDashboardNumber(item.verbrauch)} ${this.escapeHtml(item.einheit || '')}</div>
            <div style="font-size:0.75rem; color:#64748b;">${item.zaehler_count} Zähler${item.offene_zaehler ? ` · ${item.offene_zaehler} ohne berechenbaren Verbrauch` : ''}${item.berechnet ? ' · berechnet' : ''}</div>
          </div>
        `)
        .join('')
      : '<div style="color:#64748b;">Keine Summen verfügbar.</div>';
    const rowsHtml = sortedRows.length > 0
      ? sortedRows.map(row => `
          <tr>
            <td>
              <div style="font-weight:800;">${this.escapeHtml(row.einheit_name || row.einheit_id)}</div>
              ${row.mieter_name ? `<div style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(this.formatMieterDisplayName(row.mieter_name))}</div>` : ''}
            </td>
            <td>
              <div style="font-weight:700;">${this.escapeHtml(row.bezeichnung)}</div>
              <div style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(row.einbauort || row.medium || '')}</div>
            </td>
            <td>
              <div><strong>Start:</strong> ${this.formatDashboardNumber(row.start_wert)} <span style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(row.start_zeitstempel)}</span></div>
              <div><strong>Ende:</strong> ${this.formatDashboardNumber(row.end_wert)} <span style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(row.end_zeitstempel)}</span></div>
              ${row.uses_baseline ? '<div style="font-size:0.75rem; color:#0369a1;">Startwert aus Vorperiode</div>' : ''}
            </td>
            <td>
              <div style="font-weight:900;">${this.formatDashboardNumber(row.verbrauch)} ${this.escapeHtml(row.einheit || '')}</div>
              <div style="font-size:0.75rem; color:#64748b;">Ø Monat: ${this.formatDashboardNumber(row.monatsdurchschnitt)} ${this.escapeHtml(row.einheit || '')}</div>
            </td>
            <td>
              <span style="display:inline-block; padding:3px 7px; border-radius:999px; background:#f8fafc; color:${this.getConsumptionStatusColor(row.status)}; font-size:0.75rem; font-weight:800;">
                ${this.escapeHtml(this.getConsumptionStatusLabel(row.status))}
              </span>
              ${row.hinweis ? `<div style="font-size:0.75rem; color:#64748b; margin-top:4px;">${this.escapeHtml(row.hinweis)}</div>` : ''}
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" style="padding:14px; color:#64748b;">Keine Zähler für Auswahl gefunden.</td></tr>';

    output.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:10px; margin-bottom:14px;">
        ${summaryHtml}
      </div>

      <div style="overflow:auto; background:white; border:1px solid #e2e8f0; border-radius:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
          <thead>
            <tr style="background:#f8fafc; color:#334155; text-align:left;">
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Einheit</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Zähler</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Zeitraum</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Verbrauch</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
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
      const viewData = this.getUnitViewData(unit.einheit_id);
      const bewohnerText = this.formatMieterDisplayName(viewData && viewData.mieter_name ? viewData.mieter_name : 'Leerstand');
      const unitName = this.getUnitDisplayName(unit);
      const entranceLabel = this.getUnitEntranceLabel(unit);

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
          <div style="font-weight:bold; color:#333;">${this.escapeHtml(unitName)}</div>
          ${entranceLabel ? `<div style="font-size:0.85em; color:#666;">${this.escapeHtml(entranceLabel)}</div>` : ''}
          <div style="font-size:0.9em; color:#666;">Mieter: ${this.escapeHtml(bewohnerText)}</div>
        </div>

        <div style="color:#007bff; font-weight:bold;">➔</div>
      `;

      tenantList.appendChild(card);
    });

    if (selectorSection) selectorSection.style.display = 'none';
    if (unitSection) unitSection.style.display = 'block';
  },

  showZaehlerMaske(id) {
    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');

    if (!modal || !modalBody) return;

    const activeMeters = dataService.state.zaehler.filter(z =>
      String(z.einheit_id) === String(id) &&
      this.isZaehlerManuellErfassbar(z)
    );
    const units = Array.isArray(dataService.state.einheiten)
      ? dataService.state.einheiten
      : [];
    const unit = units.find(row => String(row.einheit_id) === String(id));
    const viewData = this.getUnitViewData(id);
    const unitName = this.getUnitDisplayName(unit) || id;
    const entranceLabel = this.getUnitEntranceLabel(unit);
    const tenantName = this.formatMieterDisplayName(viewData && viewData.mieter_name ? viewData.mieter_name : 'Leerstand');

    let inputsHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:15px;">`;

    activeMeters.forEach(z => {
      const label = this.getZaehlerLabel(z);
      const locationHtml = z.einbauort
        ? `<div style="font-size:0.75rem; color:#666; margin:4px 0 6px;">Einbauort: ${this.escapeHtml(z.einbauort)}</div>`
        : '';

      inputsHtml += `
        <div style="padding:10px; border:1px solid #ccc; border-radius:4px; background:#f9f9f9;">
          <label for="input-${z.zaehler_id}" style="font-size:0.8rem;">${this.escapeHtml(label)}</label>
          ${locationHtml}
          <input type="number" id="input-${z.zaehler_id}" step="0.01" style="width:100%;">
        </div>`;
    });

    inputsHtml += `</div>`;

    modalBody.innerHTML = `
      <h3>Zählererfassung</h3>

      <p style="margin-bottom:4px;">Einheit: ${this.escapeHtml(unitName)}${entranceLabel ? ` · ${this.escapeHtml(entranceLabel)}` : ''}</p>
      <p style="margin-top:0; color:#666;">Mieter: ${this.escapeHtml(tenantName)}</p>

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
    const warnings = [];
    const errors = [];
    const zeitstempel = this.formatGermanTimestamp(new Date());

    const validator = await this.getValidationService();

    if (!validator || typeof validator.validateZaehlerstand !== 'function') {
      alert('Plausibilitätsprüfung konnte nicht geladen werden. Speicherung wurde aus Sicherheitsgründen abgebrochen.');
      return;
    }

    this.currentActiveMetersObjects.forEach(zaehler => {
      const input = document.getElementById(`input-${zaehler.zaehler_id}`);

      if (!input || input.value === '') {
        return;
      }

      const latestReading = this.getLatestZaehlerstand(zaehler);

      const validationResult = validator.validateZaehlerstand({
        letzterWert: latestReading ? latestReading.wert : null,
        neuerWert: input.value,
        zaehler
      });

      const message = this.formatValidationMessage(
        zaehler,
        latestReading,
        validationResult,
        input.value
      );

      if (validationResult.status === validator.VALIDATION_STATUS.FEHLER) {
        errors.push(message);
        return;
      }

      if (
        validationResult.status === validator.VALIDATION_STATUS.WARNUNG ||
        validationResult.needsConfirmation
      ) {
        warnings.push(message);
      }

      transactions.push({
        objekt_id: zaehler.objekt_id,
        einheit_id: zaehler.einheit_id,
        zaehler_id: zaehler.zaehler_id,
        wert: parseFloat(String(input.value).replace(',', '.')),
        zeitstempel: zeitstempel,
        quelle: 'UI'
      });
    });

    if (errors.length > 0) {
      alert(
        'Folgende Eingaben sind fehlerhaft und wurden nicht gespeichert:\n\n' +
        errors.join('\n\n')
      );
      return;
    }

    if (transactions.length === 0) {
      alert('Keine Werte eingetragen.');
      return;
    }

    if (warnings.length > 0) {
      const confirmed = confirm(
        'Es gibt Plausibilitätswarnungen:\n\n' +
        warnings.join('\n\n') +
        '\n\nTrotzdem speichern?'
      );

      if (!confirmed) {
        return;
      }
    }

    const res = await cloudService.saveTransaction({
      typ: 'ZAEHLERSTAND_NEU',
      data: transactions
    });

    if (res && res.status === 'success') {
      if (!Array.isArray(dataService.state.zaehlerstaende)) {
        dataService.state.zaehlerstaende = [];
      }

      transactions.forEach(transaction => {
        dataService.state.zaehlerstaende.push({ ...transaction });
      });

      alert('Erfolgreich gespeichert!');
      this.closeModal();
    } else {
      alert('Fehler: ' + (res ? res.message : 'Unbekannter Fehler'));
    }
  },

  closeModal() {
    const modal = document.getElementById('modal-container');

    if (modal) {
      modal.style.display = 'none';
    }
  },

  backToObjects() {
    const unitSection = document.getElementById('unit-list-section');
    const selectorSection = document.getElementById('object-selector-section');

    if (unitSection) unitSection.style.display = 'none';
    if (selectorSection) selectorSection.style.display = 'block';
  }
};

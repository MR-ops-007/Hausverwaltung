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
      const bewohnerText = viewData && viewData.mieter_name ? viewData.mieter_name : 'Leerstand';

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
          <div style="font-weight:bold; color:#333;">Einheit: ${unit.nummer || unit.einheit_id}</div>
          <div style="font-size:0.9em; color:#666;">Mieter: ${bewohnerText}</div>
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

    let inputsHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:15px;">`;

    activeMeters.forEach(z => {
      const label = this.getZaehlerLabel(z);

      inputsHtml += `
        <div style="padding:10px; border:1px solid #ccc; border-radius:4px; background:#f9f9f9;">
          <label for="input-${z.zaehler_id}" style="font-size:0.8rem;">${label}</label>
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

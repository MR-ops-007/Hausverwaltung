// calc-service.js
const calcService = {
    toNumber(value) {
        if (value === null || value === undefined || value === "") return null;

        const normalized = typeof value === "string"
            ? value.replace(",", ".").trim()
            : value;
        const number = Number(normalized);

        return Number.isFinite(number) ? number : null;
    },

    isTrueValue(value) {
        return value === true || value === "TRUE" || value === "true" || value === 1 || value === "1";
    },

    normalizeText(value) {
        return String(value || "").trim().toLowerCase();
    },

    parseGermanDate(value) {
        if (!value) return 0;

        if (value instanceof Date) {
            return value.getTime();
        }

        const text = String(value).trim();
        const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);

        if (match) {
            const [, day, month, year, hour = "0", minute = "0"] = match;

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

    getReadingYear(reading) {
        const timestamp = this.parseGermanDate(reading.zeitstempel);

        if (!timestamp) return "";

        return String(new Date(timestamp).getFullYear());
    },

    getZaehlerIdentity(zaehler) {
        return [
            zaehler.objekt_id || "",
            zaehler.einheit_id || "",
            zaehler.zaehler_id || ""
        ].join("||");
    },

    isReverseFillLevelMeter(zaehler) {
        const medium = this.normalizeText(zaehler.medium);
        const zaehlerId = this.normalizeText(zaehler.zaehler_id);

        return medium === "oel_stand_cm" || zaehlerId.includes("oel_stand_in_cm");
    },

    calculateOverflowDelta(firstValue, lastValue, digits) {
        const maxValueExclusive = Math.pow(10, digits);
        return maxValueExclusive - firstValue + lastValue;
    },

    calculateReadingDelta(firstReading, lastReading, zaehler) {
        const firstValue = this.toNumber(firstReading && firstReading.wert);
        const lastValue = this.toNumber(lastReading && lastReading.wert);

        if (firstValue === null || lastValue === null) {
            return {
                value: null,
                status: "UNBERECHENBAR",
                note: "Mindestens ein Zählerwert ist keine gültige Zahl."
            };
        }

        if (firstReading === lastReading) {
            return {
                value: 0,
                status: "EINZELWERT",
                note: "Nur ein Messwert im Zeitraum vorhanden."
            };
        }

        if (this.isReverseFillLevelMeter(zaehler)) {
            return {
                value: firstValue - lastValue,
                status: lastValue <= firstValue ? "OK" : "FUELLSTAND_GESTIEGEN",
                note: lastValue <= firstValue
                    ? ""
                    : "Füllstand ist gestiegen; Betankung, Korrektur oder Messfehler prüfen."
            };
        }

        if (lastValue >= firstValue) {
            return {
                value: lastValue - firstValue,
                status: "OK",
                note: ""
            };
        }

        const digits = this.toNumber(zaehler.stellen);

        if (this.isTrueValue(zaehler.ueberlauf_erlaubt) && digits !== null && digits > 0) {
            return {
                value: this.calculateOverflowDelta(firstValue, lastValue, digits),
                status: "UEBERLAUF",
                note: "Verbrauch wurde mit Zählerüberlauf berechnet."
            };
        }

        return {
            value: null,
            status: "RUECKLAEUFIG_UNGEKLAERT",
            note: "Letzter Wert ist niedriger als erster Wert; Zählerwechsel, Korrektur oder Fehler prüfen."
        };
    },

    getReadingsForMeter(zaehler, zaehlerstaende, options = {}) {
        const year = options.year ? String(options.year) : "";

        return zaehlerstaende
            .filter(reading => {
                if (String(reading.objekt_id) !== String(zaehler.objekt_id)) return false;
                if (String(reading.einheit_id) !== String(zaehler.einheit_id)) return false;
                if (String(reading.zaehler_id) !== String(zaehler.zaehler_id)) return false;
                if (year && this.getReadingYear(reading) !== year) return false;
                return true;
            })
            .sort((a, b) => this.parseGermanDate(a.zeitstempel) - this.parseGermanDate(b.zeitstempel));
    },

    getUnitDisplayName(unit) {
        if (!unit) return "";

        return unit.nummer || unit.bezeichnung || unit.einheit || unit.einheit_id || "";
    },

    getMeterLabel(zaehler) {
        return zaehler.bezeichnung || zaehler.medium || zaehler.zaehler_id || "Zähler";
    },

    isCalculatedMeter(zaehler) {
        return this.isTrueValue(zaehler.berechnet);
    },

    buildConsumptionRows({ zaehler = [], zaehlerstaende = [], einheiten = [] } = {}, options = {}) {
        const objektId = options.objekt_id ? String(options.objekt_id) : "";
        const includeCalculated = options.includeCalculated !== false;
        const unitsById = new Map(einheiten.map(unit => [String(unit.einheit_id), unit]));

        return zaehler
            .filter(meter => !objektId || String(meter.objekt_id) === objektId)
            .filter(meter => includeCalculated || !this.isCalculatedMeter(meter))
            .map(meter => {
                const readings = this.getReadingsForMeter(meter, zaehlerstaende, options);
                const firstReading = readings[0] || null;
                const lastReading = readings[readings.length - 1] || null;
                const delta = readings.length > 0
                    ? this.calculateReadingDelta(firstReading, lastReading, meter)
                    : {
                        value: null,
                        status: "KEINE_WERTE",
                        note: "Keine Messwerte im Zeitraum vorhanden."
                    };
                const unit = unitsById.get(String(meter.einheit_id));

                return {
                    objekt_id: meter.objekt_id || "",
                    einheit_id: meter.einheit_id || "",
                    einheit_name: this.getUnitDisplayName(unit) || meter.einheit_id || "",
                    zaehler_id: meter.zaehler_id || "",
                    medium: meter.medium || "",
                    bezeichnung: this.getMeterLabel(meter),
                    einheit: meter.einheit || "",
                    einbauort: meter.einbauort || "",
                    berechnet: this.isCalculatedMeter(meter),
                    readings_count: readings.length,
                    start_wert: firstReading ? firstReading.wert : null,
                    start_zeitstempel: firstReading ? firstReading.zeitstempel : "",
                    end_wert: lastReading ? lastReading.wert : null,
                    end_zeitstempel: lastReading ? lastReading.zeitstempel : "",
                    verbrauch: delta.value,
                    status: delta.status,
                    hinweis: delta.note
                };
            });
    },

    buildConsumptionSummary(rows = []) {
        const summary = new Map();

        rows.forEach(row => {
            const key = [
                row.objekt_id,
                row.medium,
                row.einheit || "",
                row.berechnet ? "berechnet" : "normal"
            ].join("||");

            if (!summary.has(key)) {
                summary.set(key, {
                    objekt_id: row.objekt_id,
                    medium: row.medium,
                    einheit: row.einheit || "",
                    berechnet: row.berechnet,
                    verbrauch: 0,
                    zaehler_count: 0,
                    offene_zaehler: 0
                });
            }

            const item = summary.get(key);
            const value = this.toNumber(row.verbrauch);

            item.zaehler_count += 1;

            if (value === null) {
                item.offene_zaehler += 1;
            } else {
                item.verbrauch += value;
            }
        });

        return Array.from(summary.values());
    },

    buildConsumptionDashboard(data = {}, options = {}) {
        const rows = this.buildConsumptionRows(data, options);

        return {
            objekt_id: options.objekt_id || "",
            year: options.year || "",
            rows,
            summary: this.buildConsumptionSummary(rows)
        };
    },

    isMieterAktiv(mieter) {
        if (!mieter || !mieter.mietername) return false;

        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        const toDate = (val) => {
            if (!val || String(val).trim() === "") return null;
            const d = new Date(val);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const einzug = toDate(mieter.einzug_datum);
        const auszug = toDate(mieter.auszug_datum);

        // Jetzt greift die Logik:
        if (einzug && einzug > heute) return false; // Noch nicht eingezogen
        if (auszug && auszug <= heute) return false; // Schon ausgezogen

        return true; // Aktiv! (Trifft auf Azeem 2027 zu)
    },

    getUnitStatus(unit, mieter) {
        if (!unit) return "Fehler";
        if (unit.typ === "Allgemein") return "Allgemeinkosten / Haus";
        
        return this.isMieterAktiv(mieter) ? mieter.mietername : "Leerstand";
    }
};

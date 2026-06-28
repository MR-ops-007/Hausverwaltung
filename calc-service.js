// calc-service.js
const calcService = {
    MS_PER_DAY: 24 * 60 * 60 * 1000,

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

    getYearRange(year) {
        if (!year) return null;

        const normalizedYear = Number(year);

        if (!Number.isInteger(normalizedYear)) return null;

        return {
            start: new Date(normalizedYear, 0, 1, 0, 0, 0, 0).getTime(),
            end: new Date(normalizedYear + 1, 0, 1, 0, 0, 0, 0).getTime()
        };
    },

    getMonthRanges(year) {
        const normalizedYear = Number(year);

        if (!Number.isInteger(normalizedYear)) return [];

        return Array.from({ length: 12 }, (_, index) => ({
            key: `${normalizedYear}-${String(index + 1).padStart(2, "0")}`,
            label: new Date(normalizedYear, index, 1).toLocaleDateString("de-DE", {
                month: "short"
            }),
            start: new Date(normalizedYear, index, 1, 0, 0, 0, 0).getTime(),
            end: new Date(normalizedYear, index + 1, 1, 0, 0, 0, 0).getTime(),
            value: 0
        }));
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

    getMaxPlausibleConsumption(zaehler) {
        return this.toNumber(zaehler.max_plausibler_verbrauch);
    },

    isConsumptionPlausible(value, zaehler) {
        const maxPlausible = this.getMaxPlausibleConsumption(zaehler);

        return maxPlausible === null || value <= maxPlausible;
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
            const consumption = Math.max(firstValue - lastValue, 0);

            if (!this.isConsumptionPlausible(consumption, zaehler)) {
                return {
                    value: null,
                    status: "UNPLAUSIBEL_HOCH",
                    note: "Der berechnete Verbrauch überschreitet den plausiblen Maximalwert."
                };
            }

            return {
                value: consumption,
                status: lastValue <= firstValue ? "OK" : "FUELLSTAND_GESTIEGEN",
                note: lastValue <= firstValue
                    ? ""
                    : "Füllstand ist gestiegen; Betankung, Korrektur oder Messfehler prüfen."
            };
        }

        if (lastValue >= firstValue) {
            const consumption = lastValue - firstValue;

            if (!this.isConsumptionPlausible(consumption, zaehler)) {
                return {
                    value: null,
                    status: "UNPLAUSIBEL_HOCH",
                    note: "Der berechnete Verbrauch überschreitet den plausiblen Maximalwert."
                };
            }

            return {
                value: consumption,
                status: "OK",
                note: ""
            };
        }

        const digits = this.toNumber(zaehler.stellen);

        if (this.isTrueValue(zaehler.ueberlauf_erlaubt) && digits !== null && digits > 0) {
            const consumption = this.calculateOverflowDelta(firstValue, lastValue, digits);

            if (!this.isConsumptionPlausible(consumption, zaehler)) {
                return {
                    value: null,
                    status: "UNPLAUSIBEL_HOCH",
                    note: "Der niedrigere Wert könnte ein Überlauf sein, der berechnete Verbrauch überschreitet aber den plausiblen Maximalwert."
                };
            }

            return {
                value: consumption,
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

    getAllReadingsForMeter(zaehler, zaehlerstaende) {
        return zaehlerstaende
            .filter(reading => {
                if (String(reading.objekt_id) !== String(zaehler.objekt_id)) return false;
                if (String(reading.einheit_id) !== String(zaehler.einheit_id)) return false;
                if (String(reading.zaehler_id) !== String(zaehler.zaehler_id)) return false;
                return true;
            })
            .filter(reading => this.parseGermanDate(reading.zeitstempel) > 0)
            .sort((a, b) => this.parseGermanDate(a.zeitstempel) - this.parseGermanDate(b.zeitstempel));
    },

    getReadingsForMeter(zaehler, zaehlerstaende, options = {}) {
        const allReadings = this.getAllReadingsForMeter(zaehler, zaehlerstaende);
        const range = this.getYearRange(options.year);

        if (!range) {
            return {
                calculationReadings: allReadings,
                periodReadings: allReadings,
                baselineReading: null
            };
        }

        const previousReadings = allReadings.filter(reading => this.parseGermanDate(reading.zeitstempel) < range.start);
        const periodReadings = allReadings.filter(reading => {
            const timestamp = this.parseGermanDate(reading.zeitstempel);
            return timestamp >= range.start && timestamp <= range.end;
        });
        const baselineReading = previousReadings[previousReadings.length - 1] || null;

        return {
            calculationReadings: baselineReading
                ? [baselineReading, ...periodReadings]
                : periodReadings,
            periodReadings,
            baselineReading
        };
    },

    calculateConsumptionFromReadings(readings, zaehler) {
        if (!Array.isArray(readings) || readings.length === 0) {
            return {
                value: null,
                status: "KEINE_WERTE",
                note: "Keine Messwerte im Zeitraum vorhanden."
            };
        }

        if (readings.length === 1) {
            return {
                value: 0,
                status: "EINZELWERT",
                note: "Nur ein Messwert im Zeitraum vorhanden."
            };
        }

        let consumption = 0;
        let hasOverflow = false;
        let hasFillLevelIncrease = false;

        for (let index = 1; index < readings.length; index++) {
            const previousValue = this.toNumber(readings[index - 1].wert);
            const currentValue = this.toNumber(readings[index].wert);

            if (previousValue === null || currentValue === null) {
                return {
                    value: null,
                    status: "UNBERECHENBAR",
                    note: "Mindestens ein Zählerwert ist keine gültige Zahl."
                };
            }

            if (this.isReverseFillLevelMeter(zaehler)) {
                const intervalConsumption = previousValue - currentValue;

                if (intervalConsumption >= 0) {
                    if (!this.isConsumptionPlausible(intervalConsumption, zaehler)) {
                        return {
                            value: null,
                            status: "UNPLAUSIBEL_HOCH",
                            note: "Mindestens ein Füllstandsintervall überschreitet den plausiblen Maximalwert."
                        };
                    }

                    consumption += intervalConsumption;
                } else {
                    hasFillLevelIncrease = true;
                }

                continue;
            }

            if (currentValue >= previousValue) {
                const intervalConsumption = currentValue - previousValue;

                if (!this.isConsumptionPlausible(intervalConsumption, zaehler)) {
                    return {
                        value: null,
                        status: "UNPLAUSIBEL_HOCH",
                        note: "Mindestens ein Intervall überschreitet den plausiblen Maximalwert."
                    };
                }

                consumption += intervalConsumption;
                continue;
            }

            const digits = this.toNumber(zaehler.stellen);

            if (this.isTrueValue(zaehler.ueberlauf_erlaubt) && digits !== null && digits > 0) {
                const intervalConsumption = this.calculateOverflowDelta(previousValue, currentValue, digits);

                if (!this.isConsumptionPlausible(intervalConsumption, zaehler)) {
                    return {
                        value: null,
                        status: "UNPLAUSIBEL_HOCH",
                        note: "Ein möglicher Überlauf überschreitet den plausiblen Maximalwert."
                    };
                }

                consumption += intervalConsumption;
                hasOverflow = true;
                continue;
            }

            return {
                value: null,
                status: "RUECKLAEUFIG_UNGEKLAERT",
                note: "Ein Intervall ist rückläufig; Zählerwechsel, Korrektur oder Fehler prüfen."
            };
        }

        if (this.isReverseFillLevelMeter(zaehler) && hasFillLevelIncrease) {
            return {
                value: consumption,
                status: "FUELLSTAND_GESTIEGEN",
                note: "Mindestens ein Füllstandsintervall ist gestiegen; Betankung, Korrektur oder Messfehler prüfen."
            };
        }

        return {
            value: consumption,
            status: hasOverflow ? "UEBERLAUF" : "OK",
            note: hasOverflow ? "Mindestens ein Intervall wurde mit Zählerüberlauf berechnet." : ""
        };
    },

    calculateIntervalConsumption(previousReading, currentReading, zaehler) {
        const delta = this.calculateReadingDelta(previousReading, currentReading, zaehler);

        if (delta.value === null) {
            return delta;
        }

        return {
            value: delta.value,
            status: delta.status,
            note: delta.note
        };
    },

    buildConsumptionIntervals(readings, zaehler) {
        if (!Array.isArray(readings) || readings.length < 2) {
            return [];
        }

        return readings.slice(1).map((currentReading, index) => {
            const previousReading = readings[index];
            const start = this.parseGermanDate(previousReading.zeitstempel);
            const end = this.parseGermanDate(currentReading.zeitstempel);
            const delta = this.calculateIntervalConsumption(previousReading, currentReading, zaehler);

            return {
                previousReading,
                currentReading,
                start,
                end,
                days: end > start ? (end - start) / this.MS_PER_DAY : 0,
                verbrauch: delta.value,
                status: delta.status,
                hinweis: delta.note
            };
        }).filter(interval => interval.start > 0 && interval.end > interval.start);
    },

    buildForecastIntervalFromPreviousAverage(readings, range, zaehler) {
        if (!range || !Array.isArray(readings) || readings.length < 2) {
            return null;
        }

        const previousReadings = readings.filter(reading => this.parseGermanDate(reading.zeitstempel) < range.start);

        if (previousReadings.length < 2) {
            return null;
        }

        const beforeLast = previousReadings[previousReadings.length - 2];
        const last = previousReadings[previousReadings.length - 1];
        const sourceInterval = this.buildConsumptionIntervals([beforeLast, last], zaehler)[0];

        if (!sourceInterval || sourceInterval.verbrauch === null || sourceInterval.days <= 0) {
            return null;
        }

        return {
            previousReading: last,
            currentReading: null,
            start: range.start,
            end: range.end,
            days: (range.end - range.start) / this.MS_PER_DAY,
            verbrauch: sourceInterval.verbrauch * ((range.end - range.start) / (sourceInterval.end - sourceInterval.start)),
            status: "FORTGESCHRIEBEN",
            hinweis: "Keine Messwerte im Jahr; Verbrauch wurde mit dem letzten bekannten Durchschnitt fortgeschrieben."
        };
    },

    getOverlapRatio(interval, range) {
        const overlapStart = Math.max(interval.start, range.start);
        const overlapEnd = Math.min(interval.end, range.end);
        const overlapMs = Math.max(0, overlapEnd - overlapStart);
        const intervalMs = interval.end - interval.start;

        if (overlapMs <= 0 || intervalMs <= 0) {
            return 0;
        }

        return overlapMs / intervalMs;
    },

    allocateIntervalsToPeriod(intervals, range, monthRanges = []) {
        let consumption = 0;
        let openIntervals = 0;
        const statuses = new Set();
        const notes = [];
        const monthly = monthRanges.map(month => Object.assign({}, month, { value: 0 }));

        intervals.forEach(interval => {
            const ratio = this.getOverlapRatio(interval, range);

            if (ratio <= 0) {
                return;
            }

            statuses.add(interval.status);

            if (interval.hinweis) {
                notes.push(interval.hinweis);
            }

            if (interval.verbrauch === null) {
                openIntervals++;
                return;
            }

            consumption += interval.verbrauch * ratio;

            monthly.forEach(month => {
                const monthRatio = this.getOverlapRatio(interval, month);

                if (monthRatio > 0) {
                    month.value += interval.verbrauch * monthRatio;
                }
            });
        });

        return {
            value: openIntervals > 0 && consumption === 0 ? null : consumption,
            openIntervals,
            statuses: Array.from(statuses),
            notes: Array.from(new Set(notes)),
            monthly
        };
    },

    getConsumptionStatusFromIntervals(allocation) {
        if (!allocation || allocation.statuses.length === 0) {
            return "KEINE_WERTE";
        }

        if (allocation.openIntervals > 0) {
            return "TEILWEISE_UNBERECHENBAR";
        }

        if (allocation.statuses.includes("UNPLAUSIBEL_HOCH")) return "UNPLAUSIBEL_HOCH";
        if (allocation.statuses.includes("RUECKLAEUFIG_UNGEKLAERT")) return "RUECKLAEUFIG_UNGEKLAERT";
        if (allocation.statuses.includes("FUELLSTAND_GESTIEGEN")) return "FUELLSTAND_GESTIEGEN";
        if (allocation.statuses.includes("FORTGESCHRIEBEN")) return "FORTGESCHRIEBEN";
        if (allocation.statuses.includes("UEBERLAUF")) return "UEBERLAUF";

        return "OK";
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

    buildConsumptionRows({ zaehler = [], zaehlerstaende = [], einheiten = [], view_aktive_mieter = [] } = {}, options = {}) {
        const objektId = options.objekt_id ? String(options.objekt_id) : "";
        const includeCalculated = options.includeCalculated !== false;
        const unitsById = new Map(einheiten.map(unit => [String(unit.einheit_id), unit]));
        const tenantsByUnitId = new Map(view_aktive_mieter.map(row => [String(row.einheit_id), row.mieter_name || ""]));

        return zaehler
            .filter(meter => !objektId || String(meter.objekt_id) === objektId)
            .filter(meter => includeCalculated || !this.isCalculatedMeter(meter))
            .map(meter => {
                const readingSet = this.getReadingsForMeter(meter, zaehlerstaende, options);
                const readings = readingSet.calculationReadings;
                const allReadings = this.getAllReadingsForMeter(meter, zaehlerstaende);
                const range = this.getYearRange(options.year);
                const monthRanges = this.getMonthRanges(options.year);
                const intervals = this.buildConsumptionIntervals(allReadings, meter);
                const forecastInterval = this.buildForecastIntervalFromPreviousAverage(allReadings, range, meter);
                const periodIntervals = range
                    ? intervals
                        .concat(forecastInterval ? [forecastInterval] : [])
                        .filter(interval => this.getOverlapRatio(interval, range) > 0)
                    : intervals;
                const allocation = range
                    ? this.allocateIntervalsToPeriod(periodIntervals, range, monthRanges)
                    : null;
                const firstReading = readings[0] || null;
                const lastReading = readings[readings.length - 1] || null;
                const delta = allocation && allocation.statuses.length > 0
                    ? {
                        value: allocation.value,
                        status: this.getConsumptionStatusFromIntervals(allocation),
                        note: allocation.notes.join(" ")
                    }
                    : {
                        value: null,
                        status: "KEINE_WERTE",
                        note: readingSet.baselineReading
                            ? "Nur ein Vorperiodenwert vorhanden, aber kein berechenbares Intervall im gewählten Jahr."
                            : "Keine Messwerte im Zeitraum vorhanden."
                    };
                const unit = unitsById.get(String(meter.einheit_id));

                return {
                    objekt_id: meter.objekt_id || "",
                    einheit_id: meter.einheit_id || "",
                    einheit_name: this.getUnitDisplayName(unit) || meter.einheit_id || "",
                    mieter_name: tenantsByUnitId.get(String(meter.einheit_id)) || "",
                    zaehler_id: meter.zaehler_id || "",
                    medium: meter.medium || "",
                    bezeichnung: this.getMeterLabel(meter),
                    einheit: meter.einheit || "",
                    einbauort: meter.einbauort || "",
                    berechnet: this.isCalculatedMeter(meter),
                    readings_count: readings.length,
                    period_readings_count: readingSet.periodReadings.length,
                    uses_baseline: Boolean(readingSet.baselineReading),
                    interval_count: periodIntervals.length,
                    start_wert: firstReading ? firstReading.wert : null,
                    start_zeitstempel: firstReading ? firstReading.zeitstempel : "",
                    end_wert: lastReading ? lastReading.wert : null,
                    end_zeitstempel: lastReading ? lastReading.zeitstempel : "",
                    verbrauch: delta.value,
                    monatsdurchschnitt: delta.value === null ? null : delta.value / 12,
                    monthly: allocation ? allocation.monthly : [],
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

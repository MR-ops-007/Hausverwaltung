/**
 * Heizöl-Fachlogik.
 *
 * Ölstand in cm ist ein rückläufiger Füllstand, kein kumulativer Verbrauchszähler.
 * Verbrauch entsteht aus fallenden Füllständen. Liegen für ein Intervall kumulierte
 * Tankfüllungen vor, wird zusätzlich die Tankbilanz aus getankter Menge und
 * Bestandsänderung verwendet. Ein nicht rekonstruierbarer Anstieg bleibt ein
 * Prüfhinweis und wird nicht als Verbrauch interpretiert.
 */
const heatingOilService = (() => {
  const DEFAULTS = {
    'Ra-HS-29': [
      {
        objekt_id: 'Ra-HS-29',
        tank_id: 'HAUPTTANK',
        bezeichnung: 'Heizung Haupttank',
        volumen_l: 10000,
        max_fuellstand_cm: 140,
        liter_pro_cm: 10000 / 140,
        aktiv: true,
        rauschen_cm: 1,
        in_verbrauch_auswertung: true
      },
      {
        objekt_id: 'Ra-HS-29',
        tank_id: 'ZUSATZTANK',
        bezeichnung: 'Heizung Zusatztank',
        volumen_l: 2000,
        max_fuellstand_cm: 140,
        liter_pro_cm: 2000 / 140,
        aktiv: true,
        rauschen_cm: 1,
        in_verbrauch_auswertung: false
      }
    ]
  };

  // Peilstab-Ungenauigkeit: Anstiege bis zu dieser Höhe gelten als Messrauschen, nicht als Tankfüllung.
  const DEFAULT_NOISE_CM = 1;

  const toNumber = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value).trim().replace(/\s/g, '');
    const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  };

  const parseDate = value => {
    if (value instanceof Date) return value;
    const text = String(value || '').trim();
    const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (german) {
      return new Date(
        Number(german[3]), Number(german[2]) - 1, Number(german[1]),
        Number(german[4] || 0), Number(german[5] || 0)
      );
    }
    return new Date(text);
  };

  const isValidDate = date => date instanceof Date && Number.isFinite(date.getTime());
  const normalize = value => String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  const sameMeter = (left, right) => Boolean(left && right) &&
    String(left.objekt_id || '').trim() === String(right.objekt_id || '').trim() &&
    String(left.einheit_id || '').trim() === String(right.einheit_id || '').trim() &&
    String(left.zaehler_id || '').trim() === String(right.zaehler_id || '').trim();
  const sameLocation = (left, right) => Boolean(left && right) &&
    String(left.objekt_id || '').trim() === String(right.objekt_id || '').trim() &&
    String(left.einheit_id || '').trim() === String(right.einheit_id || '').trim();
  const isOilLevelMeter = meter => {
    const medium = normalize(meter && meter.medium);
    const id = normalize(meter && meter.zaehler_id);
    return medium === 'oel_stand_cm' || id.includes('oel_stand_in_cm') || id.includes('oel_stand_cm');
  };
  const isOilFillMeter = meter => normalize(meter && meter.medium) === 'oel_stand_l';

  function tankIdForMeter(meter) {
    const text = [meter && meter.zaehler_id, meter && meter.bezeichnung, meter && meter.einbauort]
      .map(normalize).join(' ');
    return text.includes('zusatz') || text.includes('reserve') || text.includes('klein')
      ? 'ZUSATZTANK'
      : 'HAUPTTANK';
  }

  const sameTankLocation = (left, right) => sameLocation(left, right) &&
    tankIdForMeter(left) === tankIdForMeter(right);

  function normalizeConfig(row) {
    if (!row) return null;
    if (['false', '0', 'nein', 'falsch'].includes(normalize(row.aktiv))) return null;
    const volume = toNumber(row.volumen_l);
    const maxLevel = toNumber(row.max_fuellstand_cm);
    const configuredRatio = toNumber(row.liter_pro_cm);
    const ratio = configuredRatio !== null
      ? configuredRatio
      : volume !== null && maxLevel > 0 ? volume / maxLevel : null;
    if (!row.objekt_id || !row.tank_id || ratio === null || ratio <= 0) return null;
    const configuredNoise = toNumber(row.rauschen_cm);
    return {
      ...row,
      rauschen_cm: configuredNoise !== null && configuredNoise >= 0 ? configuredNoise : DEFAULT_NOISE_CM,
      volumen_l: volume,
      max_fuellstand_cm: maxLevel,
      liter_pro_cm: ratio,
      in_verbrauch_auswertung: row.in_verbrauch_auswertung === undefined
        ? true
        : !['false', '0', 'nein'].includes(normalize(row.in_verbrauch_auswertung))
    };
  }

  function getTankConfig(meter, technicalRows = []) {
    const objectId = String(meter && meter.objekt_id || '').trim();
    const tankId = tankIdForMeter(meter);
    const configured = (technicalRows || [])
      .map(normalizeConfig)
      .find(row => row && String(row.objekt_id).trim() === objectId &&
        normalize(row.tank_id) === normalize(tankId));
    if (configured) return configured;
    return (DEFAULTS[objectId] || [])
      .map(normalizeConfig)
      .find(row => normalize(row.tank_id) === normalize(tankId)) || null;
  }

  function sameDay(left, right) {
    const a = parseDate(left);
    const b = parseDate(right);
    if (!isValidDate(a) || !isValidDate(b)) return false;
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function monthSegments(startDate, endDate) {
    const result = [];
    const total = endDate.getTime() - startDate.getTime();
    if (total <= 0) return result;
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cursor < endDate) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const overlapStart = Math.max(startDate.getTime(), monthStart.getTime());
      const overlapEnd = Math.min(endDate.getTime(), monthEnd.getTime());
      if (overlapEnd > overlapStart) {
        result.push({
          year: monthStart.getFullYear(),
          month: monthStart.getMonth(),
          factor: (overlapEnd - overlapStart) / total
        });
      }
      cursor = monthEnd;
    }
    return result;
  }

  function sortedReadings(readings = [], meter = null) {
    return readings
      .filter(reading => !meter || sameMeter(reading, meter))
      .map(reading => ({ ...reading, date: parseDate(reading.zeitstempel), value: toNumber(reading.wert) }))
      .filter(reading => isValidDate(reading.date) && reading.value !== null)
      .sort((left, right) => left.date - right.date);
  }

  function sortedLocationReadings(readings = [], meter = null) {
    return readings
      .filter(reading => !meter || sameTankLocation(reading, meter))
      .map(reading => ({ ...reading, date: parseDate(reading.zeitstempel), value: toNumber(reading.wert) }))
      .filter(reading => isValidDate(reading.date) && reading.value !== null)
      .sort((left, right) => left.date - right.date);
  }

  const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

  /**
   * Betankungen aus dem kumulativen Zähler oel_stand_l: jeder Anstieg ist eine Lieferung.
   * Jedes Ereignis wird höchstens einem Füllintervall zugeordnet (`used`).
   */
  function fillEventsFor(fillReadings, meter) {
    const fills = sortedLocationReadings(fillReadings || [], meter);
    const events = [];
    for (let index = 1; index < fills.length; index++) {
      const liters = fills[index].value - fills[index - 1].value;
      if (liters > 0) events.push({ date: fills[index].date, liters, used: false });
    }
    return events;
  }

  function takeFillLiters(events, startDate, endDate) {
    // Tagesgenau: Eine Lieferung gehört zum Intervall, wenn sie zwischen dem Beginn des
    // Starttags und dem Ende des Endtags liegt (Lieferung und Peilung am selben Tag).
    const from = startOfDay(startDate);
    const to = endOfDay(endDate);
    let liters = 0;
    events.forEach(event => {
      if (!event.used && event.date >= from && event.date < to) {
        event.used = true;
        liters += event.liters;
      }
    });
    return liters;
  }

  /**
   * Betankungsdaten (oel_stand_l) zum Tank des Füllstandszählers. Wird von Diagramm und
   * Tabelle gemeinsam genutzt, damit beide dieselbe Tankbilanz rechnen.
   */
  function fillReadingsFor(readings, meters, meter) {
    const candidates = [...(meters || []), ...(readings || [])];
    const fillMeters = candidates.filter(candidate =>
      isOilFillMeter(candidate) && sameTankLocation(candidate, meter));
    return (readings || []).filter(row => fillMeters.some(candidate => sameMeter(row, candidate)));
  }

  function calculate(readings, meter, technicalRows = [], year = null, options = {}) {
    const config = getTankConfig(meter, technicalRows);
    const monthly = Array.from({ length: 12 }, () => ({ cm: 0, liter: 0, hasValue: false }));
    const refills = [];
    const refillMonths = new Set();
    const reconstructedMonths = new Set();
    const warnings = [];
    if (!config) {
      return { config: null, monthly, totalCm: 0, totalLiters: 0, refills, refillMonths, reconstructedMonths, includedInTotals: false, warnings: ['Keine Tankkonfiguration vorhanden.'] };
    }

    const values = sortedReadings(readings, meter);
    const fillEvents = fillEventsFor(options.fillReadings, meter);
    let unreconstructed = 0;
    const inYear = date => year === null || date.getFullYear() === Number(year);
    const book = (start, end, consumptionCm, consumptionLiters) => {
      monthSegments(start.date, end.date).forEach(segment => {
        if (year !== null && Number(segment.year) !== Number(year)) return;
        const target = monthly[segment.month];
        target.cm += consumptionCm * segment.factor;
        target.liter += consumptionLiters * segment.factor;
        target.hasValue = true;
      });
    };

    // `previous` ist der letzte stabile Referenzstand. Wird ein Anstieg als Rauschen
    // verworfen, bleibt der alte Stand Referenz (mit dem Datum der Rauschpeilung),
    // damit das Rauschen nicht in den Folgezeitraum verschoben wird.
    let previous = values[0];
    for (let index = 1; index < values.length; index++) {
      const start = previous;
      const end = values[index];
      if (end.date <= start.date) { previous = end; continue; }

      const change = end.value - start.value;
      // Die Tankbilanz gilt unabhängig davon, ob der Stand steigt oder fällt.
      const filledLiters = takeFillLiters(fillEvents, start.date, end.date);

      if (filledLiters > 0) {
        // Bilanz: Bestand_alt + getankt - Bestand_neu = Verbrauch.
        const consumptionLiters = filledLiters - change * config.liter_pro_cm;
        const tolerance = config.rauschen_cm * config.liter_pro_cm;
        const event = {
          datum: end.zeitstempel,
          von_cm: start.value,
          auf_cm: end.value,
          delta_cm: change,
          getankt_liter: filledLiters,
          status: 'FUELLUNG_REKONSTRUIERT',
          vollgetankt_vorschlag: config.max_fuellstand_cm !== null
        };
        if (consumptionLiters >= -tolerance) {
          const liters = Math.max(0, consumptionLiters);
          event.verbrauch_liter = liters;
          book(start, end, liters / config.liter_pro_cm, liters);
          if (inYear(end.date)) reconstructedMonths.add(end.date.getMonth());
        } else {
          // Gemessener Anstieg übersteigt die getankte Menge: Daten passen nicht zusammen.
          event.status = 'FUELLUNG_UNPLAUSIBEL';
          unreconstructed += 1;
        }
        refills.push(event);
        if (inYear(end.date)) refillMonths.add(end.date.getMonth());
        previous = end;
        continue;
      }

      if (change > config.rauschen_cm) {
        // Anstieg ohne Betankungsdaten: Tankfüllung oder Korrektur, Verbrauch unbekannt.
        refills.push({
          datum: end.zeitstempel,
          von_cm: start.value,
          auf_cm: end.value,
          delta_cm: change,
          getankt_liter: null,
          status: 'FUELLUNG_ODER_KORREKTUR',
          vollgetankt_vorschlag: config.max_fuellstand_cm !== null
        });
        if (inYear(end.date)) refillMonths.add(end.date.getMonth());
        unreconstructed += 1;
        previous = end;
        continue;
      }

      if (change >= 0) {
        // Messrauschen (0 bis Schwelle): kein Verbrauch, alter Stand bleibt Referenz.
        previous = { ...end, value: start.value };
        continue;
      }

      book(start, end, -change, -change * config.liter_pro_cm);
      previous = end;
    }

    const selected = year === null
      ? monthly
      : monthly.map((item, month) => ({ ...item, month, year: Number(year) }));
    const totalCm = selected.reduce((sum, item) => sum + item.cm, 0);
    const totalLiters = selected.reduce((sum, item) => sum + item.liter, 0);
    if (unreconstructed > 0) {
      warnings.push('Mindestens eine Tankfüllung oder Korrektur konnte nicht bilanziert werden. Der Verbrauch in diesen Intervallen fehlt, die Summe ist eine Untergrenze.');
    }
    if (refills.some(refill => refill.status === 'FUELLUNG_REKONSTRUIERT')) {
      warnings.push('Verbrauch in Füllintervallen wurde aus den getankten Litern (oel_stand_l) bilanziert.');
    }

    return {
      config, monthly: selected, totalCm, totalLiters, refills, refillMonths, reconstructedMonths,
      includedInTotals: config.in_verbrauch_auswertung, warnings
    };
  }

  function findMissingLevelAfterFill(levelReadings, fillReadings, meter, technicalRows = []) {
    const config = getTankConfig(meter, technicalRows);
    if (!config) return [];
    const fills = sortedLocationReadings(fillReadings, meter);
    const levels = sortedReadings(levelReadings, meter);
    const events = [];
    for (let index = 1; index < fills.length; index++) {
      if (fills[index].value <= fills[index - 1].value) continue;
      const fill = fills[index];
      if (!levels.some(level => sameDay(level.date, fill.date))) {
        events.push({
          datum: fill.zeitstempel,
          getankt_liter: fill.value - fills[index - 1].value,
          status: 'FUELLSTAND_FEHLT',
          vollgetankt_vorschlag: true,
          vorgeschlagener_fuellstand_cm: config.max_fuellstand_cm
        });
      }
    }
    return events;
  }

  function annualSeries(readings, meter, technicalRows = [], selectedYear, options = {}) {
    const years = new Set([Number(selectedYear)]);
    sortedReadings(readings, meter).forEach(reading => years.add(reading.date.getFullYear()));
    const first = Math.max(Number(selectedYear) - 5, Math.min(...years));
    return Array.from({ length: Number(selectedYear) - first + 1 }, (_, index) => {
      const year = first + index;
      const result = calculate(readings, meter, technicalRows, year, options);
      const hasRefill = result.refills.some(refill => parseDate(refill.datum).getFullYear() === year);
      return { year, value: result.totalLiters || null, flagged: hasRefill };
    });
  }

  /**
   * Hausverbrauch in Litern: nur Tanks mit in_verbrauch_auswertung = true.
   * Der Zusatztank bleibt sichtbar, fließt aber erst nach Freigabe in die Summe ein.
   */
  function totalLiters(readings, meters, technicalRows = [], year = null, options = {}) {
    return (meters || [])
      .filter(isOilLevelMeter)
      .map(meter => {
        const fillReadings = Object.prototype.hasOwnProperty.call(options, 'fillReadings')
          ? options.fillReadings
          : fillReadingsFor(readings, meters, meter);
        return calculate(readings, meter, technicalRows, year, { ...options, fillReadings });
      })
      .filter(result => result.config && result.includedInTotals)
      .reduce((sum, result) => sum + result.totalLiters, 0);
  }

  return {
    toNumber,
    isOilLevelMeter,
    isOilFillMeter,
    tankIdForMeter,
    getTankConfig,
    calculate,
    fillReadingsFor,
    totalLiters,
    annualSeries,
    findMissingLevelAfterFill
  };
})();

/**
 * Heizöl-Fachlogik.
 *
 * Ölstand in cm ist ein rückläufiger Füllstand, kein kumulativer Verbrauchszähler.
 * Verbrauch entsteht deshalb ausschließlich aus fallenden Füllständen. Ein Anstieg
 * wird als Tankfüllung, Korrektur oder Messfehler markiert und nicht als Verbrauch
 * interpretiert.
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
        in_verbrauch_auswertung: false
      }
    ]
  };

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
    return {
      ...row,
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
      .filter(reading => !meter || sameLocation(reading, meter))
      .map(reading => ({ ...reading, date: parseDate(reading.zeitstempel), value: toNumber(reading.wert) }))
      .filter(reading => isValidDate(reading.date) && reading.value !== null)
      .sort((left, right) => left.date - right.date);
  }

  function calculate(readings, meter, technicalRows = [], year = null) {
    const config = getTankConfig(meter, technicalRows);
    const monthly = Array.from({ length: 12 }, () => ({ cm: 0, liter: 0, hasValue: false }));
    const refills = [];
    const refillMonths = new Set();
    const warnings = [];
    if (!config) {
      return { config: null, monthly, totalCm: 0, totalLiters: 0, refills, refillMonths, warnings: ['Keine Tankkonfiguration vorhanden.'] };
    }

    const values = sortedReadings(readings, meter);
    for (let index = 1; index < values.length; index++) {
      const start = values[index - 1];
      const end = values[index];
      if (end.date <= start.date) continue;
      if (end.value >= start.value) {
        if (end.value > start.value) {
          refills.push({
            datum: end.zeitstempel,
            von_cm: start.value,
            auf_cm: end.value,
            delta_cm: end.value - start.value,
            status: 'FUELLUNG_ODER_KORREKTUR',
            vollgetankt_vorschlag: config.max_fuellstand_cm !== null
          });
          if (year === null || end.date.getFullYear() === Number(year)) {
            refillMonths.add(end.date.getMonth());
          }
        }
        continue;
      }

      const consumptionCm = start.value - end.value;
      const consumptionLiters = consumptionCm * config.liter_pro_cm;
      monthSegments(start.date, end.date).forEach(segment => {
        if (year !== null && Number(segment.year) !== Number(year)) return;
        const target = monthly[segment.month];
        target.cm += consumptionCm * segment.factor;
        target.liter += consumptionLiters * segment.factor;
        target.hasValue = true;
      });
    }

    const selected = year === null
      ? monthly
      : monthly.map((item, month) => ({ ...item, month, year: Number(year) }));
    const totalCm = selected.reduce((sum, item) => sum + item.cm, 0);
    const totalLiters = selected.reduce((sum, item) => sum + item.liter, 0);
    if (refills.length > 0) {
      warnings.push('Mindestens eine Tankfüllung oder Korrektur wurde erkannt. Der Verbrauch wird nur aus fallenden Füllständen summiert.');
    }

    return { config, monthly: selected, totalCm, totalLiters, refills, refillMonths, warnings };
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

  function annualSeries(readings, meter, technicalRows = [], selectedYear) {
    const years = new Set([Number(selectedYear)]);
    sortedReadings(readings, meter).forEach(reading => years.add(reading.date.getFullYear()));
    const first = Math.max(Number(selectedYear) - 5, Math.min(...years));
    return Array.from({ length: Number(selectedYear) - first + 1 }, (_, index) => {
      const year = first + index;
      const result = calculate(readings, meter, technicalRows, year);
      const hasRefill = result.refills.some(refill => parseDate(refill.datum).getFullYear() === year);
      return { year, value: result.totalLiters || null, flagged: hasRefill };
    });
  }

  return {
    toNumber,
    isOilLevelMeter,
    isOilFillMeter,
    tankIdForMeter,
    getTankConfig,
    calculate,
    annualSeries,
    findMissingLevelAfterFill
  };
})();

/**
 * Verbrauchsdiagramme auf Basis der bestehenden materialisierten Lese-Views.
 * Darstellung mit transparenten Fallback-Berechnungen für Lücken; keine Schreiboperationen
 * und keine Prognose zukünftiger Monate.
 */
const consumptionChartService = (() => {
  const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const esc = value => String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
    const text = String(value).trim().replace(/\s/g, '');
    const normalized = text.includes(',')
      ? text.replace(/\./g, '').replace(',', '.')
      : text;
    const n = Number(normalized);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const excluded = row => {
    const flag = String(row && row.in_summe_beruecksichtigen).trim().toLowerCase();
    return flag === 'false' || flag === '0' || flag === 'nein';
  };
  const id = row => [row.objekt_id, row.einheit_id, row.zaehler_id]
    .map(value => String(value === null || value === undefined ? '' : value).trim()).join('||');
  const meterIds = row => {
    const ids = [row && row.zaehler_id];
    const sourceKeys = [
      row && row.audit && row.audit.source_keys,
      row && row.source_keys
    ].filter(Boolean).join(' ').split(/[,;\s]+/).filter(Boolean);
    sourceKeys.forEach(sourceKey => ids.push(sourceKey.split('||').pop()));
    return new Set(ids.map(value => String(value || '').trim()).filter(Boolean));
  };
  const sameMeter = (left, right) => {
    if (!left || !right || String(left.objekt_id || '').trim() !== String(right.objekt_id || '').trim()) return false;
    const leftIds = meterIds(left);
    const rightIds = meterIds(right);
    if (![...leftIds].some(value => rightIds.has(value))) return false;
    const leftUnit = String(left.einheit_id || '').trim();
    const rightUnit = String(right.einheit_id || '').trim();
    return !leftUnit || !rightUnit || leftUnit === rightUnit;
  };
  const fmt = value => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);
  const groupOf = row => String(row.verbrauchsgruppe || row.gruppe || '').toUpperCase();
  const mediumOf = row => String(row.medium || '').toLowerCase();
  const daysInMonth = (year, monthIndex) => new Date(Number(year), Number(monthIndex) + 1, 0).getDate();
  const berlinMonthParts = value => {
    const date = new Date(String(value || '').trim());
    if (!Number.isFinite(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: 'numeric'
    }).formatToParts(date);
    const year = Number(parts.find(part => part.type === 'year')?.value);
    const month = Number(parts.find(part => part.type === 'month')?.value);
    return Number.isInteger(year) && month >= 1 && month <= 12
      ? { year, month }
      : null;
  };
  const consumptionMonth = row => {
    const value = String(row && (row.monat || row.monat_id || row.monat_key) || '').trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return berlinMonthParts(value);
    const match = value.match(/^(\d{4})[-/.](1[0-2]|0?[1-9])/);
    return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
  };
  const isPartialMonth = row => {
    const month = consumptionMonth(row);
    const days = num(row && row.tage_im_monat);
    return Boolean(month) && days !== null && days < daysInMonth(month.year, month.month - 1);
  };

  function readingSeries(rows, meter) {
    return (rows || []).filter(row => sameMeter(row, meter) && row.zeitstempel)
      .map(row => ({
        date: parseDate(row.zeitstempel),
        value: num(row.wert),
        raw: row
      }))
      .filter(row => row.value !== null && Number.isFinite(row.date.getTime()))
      .sort((a, b) => a.date - b.date);
  }

  function monthSegments(startDate, endDate) {
    const segments = [];
    const totalDays = (endDate - startDate) / 86400000;
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (cursor < endDate) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const overlapStart = Math.max(startDate.getTime(), monthStart.getTime());
      const overlapEnd = Math.min(endDate.getTime(), monthEnd.getTime());
      const overlapDays = Math.max(0, (overlapEnd - overlapStart) / 86400000);

      if (overlapDays > 0 && totalDays > 0) {
        segments.push({
          year: monthStart.getFullYear(),
          month: monthStart.getMonth(),
          amountFactor: overlapDays / totalDays
        });
      }

      cursor = monthEnd;
    }

    return segments;
  }

  function monthlySeriesFromReadings(rows, meter, year) {
    const totals = Array.from({ length: 12 }, () => ({ amount: 0, count: 0 }));
    const readings = readingSeries(rows, meter);

    for (let index = 1; index < readings.length; index++) {
      const start = readings[index - 1];
      const end = readings[index];
      if (end.date <= start.date || end.value < start.value) continue;

      monthSegments(start.date, end.date).forEach(segment => {
        if (segment.year !== Number(year)) return;
        const entry = totals[segment.month];
        entry.amount += (end.value - start.value) * segment.amountFactor;
        entry.count++;
      });
    }

    return totals.map(entry => entry.count ? entry.amount : null);
  }

  function reverseReadingMonths(rows, meter, year) {
    const months = new Set();
    const readings = readingSeries(rows, meter);
    for (let index = 1; index < readings.length; index++) {
      const start = readings[index - 1];
      const end = readings[index];
      if (end.date <= start.date || end.value >= start.value) continue;
      monthSegments(start.date, end.date).forEach(segment => {
        if (segment.year === Number(year)) months.add(segment.month);
      });
    }
    return months;
  }

  function parseDate(value) {
    if (value instanceof Date) return value;
    const text = String(value || '').trim();
    const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (german) {
      return new Date(Number(german[3]), Number(german[2]) - 1, Number(german[1]), Number(german[4] || 0), Number(german[5] || 0), Number(german[6] || 0));
    }
    return new Date(text);
  }

  function lineChart(series, unit, alt) {
    if (!series.length) return '<p class="consumption-chart-empty">Für diesen Zähler liegen keine erfassten Ablesungen vor.</p>';
    const W = 760, H = 276, left = 60, right = 12, top = 14, bottom = 38;
    const values = series.map(item => item.value);
    const min = Math.min(...values), max = Math.max(...values);
    const range = Math.max(1, max - min);
    const x = item => left + (series.length === 1 ? (W-left-right)/2 : (item.date - series[0].date) / Math.max(1, series[series.length-1].date - series[0].date) * (W-left-right));
    const y = value => top + (max - value) / range * (H-top-bottom);
    const points = series.map(item => `${x(item).toFixed(1)},${y(item.value).toFixed(1)}`).join(' ');
    const dots = series.map(item => `<circle cx="${x(item).toFixed(1)}" cy="${y(item.value).toFixed(1)}" r="4" fill="#2563eb"><title>${esc(item.date.toLocaleString('de-DE'))} · ${fmt(item.value)} ${esc(unit)}</title></circle>`).join('');
    const grid = [0, 1, 2, 3, 4].map(i => {
      const gy = top + (H - top - bottom) - i * (H - top - bottom) / 4;
      const value = min + range * i / 4;
      return `<line x1="${left}" x2="${W-right}" y1="${gy}" y2="${gy}" stroke="#e2e8f0"/><text x="${left-8}" y="${gy+4}" font-size="11" text-anchor="end" fill="#64748b">${esc(fmt(value))}</text>`;
    }).join('');
    const formatDateLabel = date => `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
    const xLabels = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])]
      .map(index => `<text x="${x(series[index]).toFixed(1)}" y="${H-15}" text-anchor="middle" font-size="11" fill="#475569">${esc(formatDateLabel(series[index].date))}</text>`)
      .join('');
    return `<svg class="consumption-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}" xmlns="http://www.w3.org/2000/svg">${grid}<line x1="${left}" x2="${W-right}" y1="${H-bottom}" y2="${H-bottom}" stroke="#cbd5e1"/><polyline points="${points}" fill="none" stroke="#2563eb" stroke-width="3"/>${dots}${xLabels}</svg>`;
  }

  function trendChart({ labels, current, previous = [], currentLabel, previousLabel, unit, alt, mode = 'line', showWarning = false, showValues = false, valuesLabel = 'Verbrauchswerte' }) {
    const rows = [...current, ...previous].filter(item => item && item.value !== null);
    if (!rows.length) return '<p class="consumption-chart-empty">Keine berechenbaren Verbrauchswerte vorhanden.</p>';
    const W = 760, H = 276, left = 60, right = 12, top = 14, bottom = 38;
    const iw = W - left - right, ih = H - top - bottom;
    const maximum = Math.max(1, ...rows.map(item => item.value)) * 1.1;
    const x = index => left + (labels.length === 1 ? iw / 2 : index * iw / (labels.length - 1));
    const y = value => top + ih - value / maximum * ih;
    const grid = [0, 1, 2, 3, 4].map(i => {
      const gy = top + ih - i * ih / 4;
      return `<line x1="${left}" x2="${W-right}" y1="${gy}" y2="${gy}" stroke="#e2e8f0"/><text x="${left-8}" y="${gy+4}" font-size="11" text-anchor="end" fill="#64748b">${esc(fmt(maximum*i/4))}</text>`;
    }).join('');
    const renderSeries = (items, color, label, dash) => {
      const segments = [];
      let segment = [];
      items.forEach((item, index) => {
        if (item && item.value !== null) {
          segment.push(`${x(index).toFixed(1)},${y(item.value).toFixed(1)}`);
        } else if (segment.length) {
          segments.push(segment);
          segment = [];
        }
      });
      if (segment.length) segments.push(segment);
      if (!segments.length) return '';
      const line = segments
        .filter(points => points.length > 1)
        .map(points => `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="3"${dash ? ' stroke-dasharray="7 5"' : ''}/>`)
        .join('');
      const markers = items.map((item, index) => item && item.value !== null
        ? `<circle cx="${x(index).toFixed(1)}" cy="${y(item.value).toFixed(1)}" r="4" fill="${item.derived ? '#f59e0b' : item.fromAnnual ? '#ea580c' : item.reconciled ? '#0f766e' : item.fromReadings ? '#0284c7' : color}"><title>${esc(labels[index])} ${esc(label)}: ${fmt(item.value)} ${esc(unit)}${item.invalidReading ? ' (rückläufiger Zählerstand prüfen)' : ''}${item.derived ? ' (linear fortgeschrieben)' : ''}${item.fromReadings ? ' (aus Rohintervall ergänzt)' : ''}${item.fromAnnual ? ' (aus Jahresrest ergänzt)' : ''}${item.reconciled ? ' (mit Jahreswert abgeglichen)' : ''}${item.flagged ? ' (Prüfhinweis)' : ''}</title></circle>`
        : '').join('');
      return `${line}${markers}`;
    };
    const currentColor = '#2563eb', previousColor = '#94a3b8';
    const currentSvg = renderSeries(current, currentColor, currentLabel, false);
    const previousSvg = previous.length ? renderSeries(previous, previousColor, previousLabel, true) : '';
    const area = mode === 'area' && current.length && current.every(item => item && item.value !== null)
      ? `<polygon points="${left},${top+ih} ${current.map((item,index) => item && item.value !== null ? `${x(index).toFixed(1)},${y(item.value).toFixed(1)}` : '').filter(Boolean).join(' ')} ${W-right},${top+ih}" fill="#2563eb" opacity="0.12"/>`
      : '';
    const barWidth = previous.length ? 16 : 24;
    const bars = mode === 'bar' ? labels.map((label, index) => {
      const columns = [{ row: current[index], x: x(index) - (previous.length ? barWidth + 2 : barWidth / 2), color: currentColor, year: currentLabel }];
      if (previous.length) columns.push({ row: previous[index], x: x(index) + 2, color: previousColor, year: previousLabel });
      return columns.map(column => {
        if (!column.row || column.row.value === null) return '';
        const height = Math.max(column.row.value === 0 ? 2 : 3, column.row.value / maximum * ih);
        const yPosition = top + ih - height;
        const title = `${label} ${column.year}: ${fmt(column.row.value)} ${unit}${column.row.flagged ? ' (Prüfhinweis)' : ''}`;
        return `<rect x="${column.x.toFixed(1)}" y="${yPosition.toFixed(1)}" width="${barWidth}" height="${height.toFixed(1)}" fill="${column.row.flagged ? '#f59e0b' : column.color}" opacity="0.85"><title>${esc(title)}</title></rect>`;
      }).join('');
    }).join('') : '';
    const hasDerived = [...current, ...previous].some(item => item && item.derived);
    const hasFromReadings = [...current, ...previous].some(item => item && item.fromReadings);
    const hasFromAnnual = [...current, ...previous].some(item => item && item.fromAnnual);
    const hasReconciled = [...current, ...previous].some(item => item && item.reconciled);
    const hasInvalidReading = [...current, ...previous].some(item => item && item.invalidReading);
    const legend = `<div class="consumption-chart-key"><span class="consumption-chart-year-current">${esc(currentLabel)}</span>${previous.length ? `<span class="consumption-chart-year-prior">${esc(previousLabel)}</span>` : ''}${hasDerived ? '<span class="consumption-chart-year-derived">linear fortgeschrieben</span>' : ''}${hasFromReadings ? '<span class="consumption-chart-year-from-readings">aus Rohintervall ergänzt</span>' : ''}${hasFromAnnual ? '<span class="consumption-chart-year-from-annual">aus Jahresrest ergänzt</span>' : ''}${hasReconciled ? '<span class="consumption-chart-year-reconciled">Jahreswert abgeglichen</span>' : ''}${hasInvalidReading ? '<span class="consumption-chart-year-warning">Zählerstand prüfen</span>' : ''}${showWarning ? '<span class="consumption-chart-year-warning">Prüfhinweis</span>' : ''}</div>`;
    const values = showValues ? `<div class="consumption-chart-values" aria-label="${esc(valuesLabel)}">${labels.map((label, index) => {
      const formatValue = item => item && item.value !== null
        ? `${fmt(item.value)} ${unit}${item.invalidReading ? ' · Zählerstand prüfen' : ''}${item.derived ? ' · fortgeschrieben' : ''}${item.fromReadings ? ' · aus Rohintervall' : ''}${item.fromAnnual ? ' · aus Jahresrest' : ''}${item.reconciled ? ' · abgeglichen' : ''}${item.flagged ? ' · Prüfhinweis' : ''}`
        : 'Keine Werte';
      const currentValue = formatValue(current[index]);
      const previousValue = previous.length ? formatValue(previous[index]) : 'Keine Werte';
      return `<div class="consumption-chart-value"><strong>${esc(label)}</strong><span>${esc(currentLabel)}: ${esc(currentValue)}</span>${previous.length ? `<span>${esc(previousLabel)}: ${esc(previousValue)}</span>` : ''}</div>`;
    }).join('')}</div>` : '';
    return `${legend}<svg class="consumption-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}" xmlns="http://www.w3.org/2000/svg">${grid}${area}${bars}${mode === 'bar' ? '' : previousSvg}${mode === 'bar' ? '' : currentSvg}${labels.map((label,index) => `<text x="${x(index).toFixed(1)}" y="${H-15}" text-anchor="middle" font-size="11" fill="#475569">${esc(label)}</text>`).join('')}</svg>${values}`;
  }

  function monthlySeries(rows, meter, year, { readingRows = [], annualRow = null, now = new Date() } = {}) {
    const totals = Array.from({ length: 12 }, () => ({ amount: 0, count: 0, hasSegment: false, flagged: false, partial: false, derived: false, fromReadings: false, reconciled: false }));
    (rows || []).forEach(row => {
      if (!sameMeter(row, meter)) return;
      if (String(row.jahr) !== String(year)) return;
      const month = consumptionMonth(row);
      if (!month || month.year !== Number(year)) return;
      const entry = totals[month.month - 1];
      entry.hasSegment = true;
      entry.partial = entry.partial || isPartialMonth(row);
      const amount = num(row.verbrauch_monat);
      const status = String(row.plausibilitaet_status || '').toUpperCase();
      if (amount === null) {
        entry.flagged = true;
        return;
      }
      entry.amount += amount;
      entry.count++;
      if (excluded(row) || (status && status !== 'OK')) entry.flagged = true;
    });

    const historicalYear = Number(year) < now.getFullYear();
    const annualTotal = num(annualRow && annualRow.verbrauch_jahr);
    const expectedMonthCount = Number(annualRow && annualRow.anzahl_monate_mit_verbrauch);
    const readingTotals = monthlySeriesFromReadings(readingRows, meter, year);
    const reverseMonths = reverseReadingMonths(readingRows, meter, year);
    reverseMonths.forEach(index => {
      totals[index].flagged = true;
      totals[index].invalidReading = true;
    });
    if (historicalYear) {
      const missingIndexes = totals
        .map((entry, index) => entry.count ? null : index)
        .filter(index => index !== null);
      const knownTotal = totals.reduce((sum, entry) => sum + (entry.count ? entry.amount : 0), 0);
      const rawMissing = missingIndexes
        .map(index => readingTotals[index])
        .filter(amount => amount !== null);
      const rawTotal = knownTotal + rawMissing.reduce((sum, amount) => sum + amount, 0);
      const rawMatchesAnnual = annualTotal !== null && rawMissing.length === missingIndexes.length &&
        Math.abs(rawTotal - annualTotal) <= 0.2;

      if (rawMatchesAnnual) {
        missingIndexes.forEach(index => {
          totals[index].amount = readingTotals[index];
          totals[index].count = 1;
          totals[index].fromReadings = true;
        });
      }

      const residual = annualTotal === null ? null : annualTotal - knownTotal;
      const activeCount = totals.filter(entry => entry.count).length;
      const expectedMissingCount = Number.isFinite(expectedMonthCount) && expectedMonthCount > 0
        ? Math.max(0, Math.min(12, expectedMonthCount) - activeCount)
        : 0;
      const residualIndexes = missingIndexes.slice(0, expectedMissingCount);

      if (!rawMatchesAnnual && residualIndexes.length && residual !== null && residual > 0.01) {
        const amountPerMonth = residual / residualIndexes.length;
        residualIndexes.forEach(index => {
          totals[index].amount = amountPerMonth;
          totals[index].count = 1;
          totals[index].derived = true;
        });
      }

      if (annualTotal === null && missingIndexes.length) {
        missingIndexes.forEach(index => {
          if (readingTotals[index] === null) return;
          totals[index].amount = readingTotals[index];
          totals[index].count = 1;
          totals[index].fromReadings = true;
        });
      }
    } else {
      totals.forEach((entry, index) => {
        if (entry.count || readingTotals[index] === null) return;
        entry.amount = readingTotals[index];
        entry.count = 1;
        entry.fromReadings = true;
      });

      const activeCount = totals.filter(entry => entry.count).length;
      const missingCoveredIndexes = Number.isFinite(expectedMonthCount) &&
        expectedMonthCount > activeCount
        ? totals
          .map((entry, index) => entry.count || !entry.hasSegment ? null : index)
          .filter(index => index !== null)
          .slice(0, Math.max(0, expectedMonthCount - activeCount))
        : [];

      if (annualTotal !== null && missingCoveredIndexes.length) {
        const currentTotal = totals.reduce((sum, entry) => sum + (entry.count ? entry.amount : 0), 0);
        const residual = annualTotal - currentTotal;
        if (residual > 0.01) {
          const amountPerMonth = residual / missingCoveredIndexes.length;
          missingCoveredIndexes.forEach(index => {
            totals[index].amount = amountPerMonth;
            totals[index].count = 1;
            totals[index].fromAnnual = true;
          });
        }
      }
    }

    const canReconcileCurrentYear = historicalYear || (
      Number.isFinite(expectedMonthCount) && expectedMonthCount > 0 &&
      expectedMonthCount <= totals.filter(entry => entry.count).length
    );
    if (annualTotal !== null) {
      const activeIndexes = totals
        .map((entry, index) => entry.count ? index : null)
        .filter(index => index !== null);
      const currentTotal = activeIndexes.reduce((sum, index) => sum + totals[index].amount, 0);

      // The materialized views can disagree in edge cases. Keep the monthly
      // distribution visible; only small deviations are aligned, larger ones stay flagged.
      // The UI displays two decimals, so a small raw difference can become visibly larger after rounding.
      const difference = Math.abs(currentTotal - annualTotal);
      const reconciliationLimit = Math.max(0.05, Math.abs(annualTotal) * 0.02);
      if (activeIndexes.length && difference > 0.05) {
        if (canReconcileCurrentYear && currentTotal > 0 && difference <= reconciliationLimit) {
          const factor = annualTotal / currentTotal;
          activeIndexes.forEach(index => {
            totals[index].amount *= factor;
            totals[index].reconciled = true;
            totals[index].flagged = true;
          });
        } else {
          activeIndexes.forEach(index => {
            totals[index].flagged = true;
          });
        }
      }
    }

    return totals.map(entry => ({
      value: entry.count ? entry.amount : null,
      flagged: entry.flagged,
      derived: entry.derived,
      ...(entry.partial ? { partial: true } : {}),
      ...(entry.invalidReading ? { invalidReading: true } : {}),
      ...(entry.fromReadings ? { fromReadings: true } : {}),
      ...(entry.fromAnnual ? { fromAnnual: true } : {}),
      ...(entry.reconciled ? { reconciled: true } : {})
    }));
  }

  function annualSeries(rows, meter, selectedYear) {
    const current = Number(selectedYear);
    if (!Number.isInteger(current)) return [];
    const matches = (rows || []).filter(row => sameMeter(row, meter));
    const firstYear = Math.max(current - 5, Math.min(current, ...matches.map(row => Number(row.jahr)).filter(Number.isInteger), current));
    return Array.from({ length: current - firstYear + 1 }, (_, idx) => {
      const year = firstYear + idx;
      const match = matches.find(row => Number(row.jahr) === year);
      return { year, value: match ? num(match.verbrauch_jahr) : null,
        flagged: match ? Number(match.anzahl_warnungen || 0) > 0 : false };
    });
  }

  function annualRowForYear(rows, meter, year) {
    return (rows || []).find(row => sameMeter(row, meter) && Number(row.jahr) === Number(year)) || null;
  }

  function render({ meters = [], selectedKey = '', selectedYear, monthlyRows = [], annualRows = [], readingRows = [], mode = '', now = new Date() }) {
    const unique = [...new Map(meters.filter(row => row && row.zaehler_id).map(row => [id(row), row])).values()];
    if (!unique.length) return '';
    const selectedGroup = typeof uiService !== 'undefined' ? (uiService.consumptionChartGroup || 'ALL') : 'ALL';
    const selectedMedium = typeof uiService !== 'undefined' ? (uiService.consumptionChartMedium || 'ALL') : 'ALL';
    const filtered = unique.filter(row => (selectedGroup === 'ALL' || groupOf(row) === selectedGroup) && (selectedMedium === 'ALL' || mediumOf(row) === selectedMedium));
    const available = filtered.length ? filtered : unique;
    const meter = available.find(row => id(row) === selectedKey) || available[0];
    const year = Number(selectedYear);
    if (!Number.isInteger(year)) return '';
    const priorYear = year - 1;
    const chartMode = mode || (typeof uiService !== 'undefined' ? (uiService.consumptionChartMode || 'area') : 'area');
    const curr = monthlySeries(monthlyRows, meter, year, {
      readingRows,
      annualRow: annualRowForYear(annualRows, meter, year),
      now
    });
    const prior = monthlySeries(monthlyRows, meter, priorYear, {
      readingRows,
      annualRow: annualRowForYear(annualRows, meter, priorYear),
      now
    });
    const history = annualSeries(annualRows, meter, year);
    const yearLabels = history.map(row => String(row.year));
    const hasCurrent = curr.some(row => row.value !== null);
    const hasPrior = prior.some(row => row.value !== null);
    const hasInvalidReading = reverseReadingMonths(readingRows, meter, year).size > 0 ||
      reverseReadingMonths(readingRows, meter, priorYear).size > 0;
    const flagged = [...curr, ...prior].some(row => row.flagged);
    const derived = [...curr, ...prior].some(row => row.derived);
    const fromReadings = [...curr, ...prior].some(row => row.fromReadings);
    const fromAnnual = [...curr, ...prior].some(row => row.fromAnnual);
    const reconciled = [...curr, ...prior].some(row => row.reconciled);
    const unit = /kwh/i.test(String(meter.medium)) ? 'kWh' : /m3/i.test(String(meter.medium)) ? 'm³' : /cm/i.test(String(meter.medium)) ? 'cm' : /liter|_l$/i.test(String(meter.medium)) ? 'l' : (meter.einheit || '');
    const groups = [...new Set(unique.map(groupOf).filter(Boolean))].sort();
    const media = [...new Set(unique.map(mediumOf).filter(Boolean))].sort();
    const chartYears = [...new Set([
      year,
      ...annualRows.map(row => Number(row.jahr)),
      ...monthlyRows.map(row => Number(row.jahr))
    ].filter(Number.isInteger))].sort((a, b) => b - a);
    const yearOptions = chartYears
      .map(chartYear => `<option value="${chartYear}"${chartYear === year ? ' selected' : ''}>${chartYear}</option>`)
      .join('');
    const filterOptions = (values, selected, label) => `<label>${label}<select onchange="uiService.${label === 'Gruppe' ? 'consumptionChartGroup' : 'consumptionChartMedium'}=this.value;uiService.renderConsumptionDashboard()"><option value="ALL">Alle</option>${values.map(value => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
    const options = available.map(row => {
      const label = `${row.einheit_name || row.einheit_id || ''} · ${row.bezeichnung || row.zaehler_id}`;
      return `<option value="${esc(id(row))}"${id(row) === id(meter) ? ' selected' : ''}>${esc(label)}</option>`;
    }).join('');
    const monthChart = hasCurrent || hasPrior
      ? trendChart({ labels: MONTHS, current: curr, previous: prior, currentLabel: String(year), previousLabel: String(priorYear), unit, mode: chartMode, showWarning: flagged, showValues: true, valuesLabel: 'Monatliche Verbrauchswerte',
        alt: `Monatlicher Verbrauch ${year} und ${priorYear} in ${unit}. Fehlende Monate sind nicht als Null dargestellt.` })
      : `<p class="consumption-chart-empty">${hasInvalidReading ? 'Rückläufiger Zählerstand erkannt; Verbrauchsberechnung für dieses Intervall bitte prüfen.' : 'Für diesen Zähler liegen im gewählten Jahr und Vorjahr keine berechenbaren Monatswerte vor.'}</p>`;
    const annualChart = history.some(row => row.value !== null)
      ? trendChart({ labels: yearLabels, current: history, currentLabel: 'Jahresverbrauch', unit, mode: chartMode,
        alt: `Jahresverbrauch der letzten bis zu sechs Jahre in ${unit}. Fehlende Jahre sind nicht als Null dargestellt.` })
      : '<p class="consumption-chart-empty">Keine Jahreswerte vorhanden.</p>';
    return `<section class="consumption-charts" aria-label="Verbrauchsdiagramme">
      <div class="consumption-charts-heading"><div><h3>Verbrauchsstatistik</h3><p>Zählerstand und Verbrauch werden getrennt dargestellt. Die Verbrauchswerte stammen aus den bestehenden Verbrauchsviews.</p></div>
      ${filterOptions(groups, selectedGroup, 'Gruppe')}${filterOptions(media, selectedMedium, 'Medium')}<label>Jahr
        <select id="consumption-chart-year-select" onchange="const yearSelect=document.getElementById('consumption-year-select');if(yearSelect){yearSelect.value=this.value;yearSelect.dataset.userSelected='true';}uiService.renderConsumptionDashboard()">${yearOptions}</select>
      </label><label>Einheit und Zähler
        <select id="consumption-chart-meter-select" onchange="uiService.consumptionChartSelection=this.value;uiService.renderConsumptionDashboard()">${options}</select>
      </label><label>Darstellung<select onchange="uiService.consumptionChartMode=this.value;uiService.renderConsumptionDashboard()"><option value="line"${chartMode === 'line' ? ' selected' : ''}>Linie</option><option value="bar"${chartMode === 'bar' ? ' selected' : ''}>Balken</option><option value="area"${chartMode === 'area' ? ' selected' : ''}>Fläche</option></select></label></div>
      <div class="consumption-charts-grid">
        <div class="consumption-chart-panel"><h4>Zählerstandsverlauf</h4>${lineChart(readingSeries(readingRows, meter), unit, `Zählerstandsverlauf für ${meter.bezeichnung || meter.zaehler_id} in ${unit}`)}</div>
        <div class="consumption-chart-panel"><h4>Monatsverbrauch ${esc(year)} / ${esc(priorYear)}</h4>${monthChart}</div>
        <div class="consumption-chart-panel"><h4>Jahresentwicklung</h4>${annualChart}</div>
      </div>
      <p class="consumption-chart-note">Die Monatswerte verteilen Ableseintervalle zeitanteilig. Monate ohne berechenbaren Wert bleiben leer, nicht null. Das laufende Jahr kann unvollständig sein.${derived ? ' Orange markierte Monatswerte wurden für ein abgeschlossenes historisches Jahr linear aus dem Jahresrest fortgeschrieben.' : ''}${fromReadings ? ' Blau markierte Monatswerte wurden aus vorhandenen Rohintervallen ergänzt.' : ''}${fromAnnual ? ' Dunkelorange markierte Monatswerte wurden innerhalb des bereits belegten Messzeitraums aus dem verbleibenden Jahreswert ergänzt; spätere Monate werden nicht prognostiziert.' : ''}${reconciled ? ' Türkis markierte Monatswerte wurden wegen einer kleinen Abweichung proportional mit dem Jahreswert aus der Jahresview abgeglichen.' : ''}${hasInvalidReading ? ' Rückläufige Zählerstände werden nicht automatisch als Verbrauch interpretiert und müssen als Zählerwechsel, Reset oder Eingabefehler geprüft werden.' : ''}${flagged ? ' Einzelne Monatssegmente besitzen Prüfhinweise; Details stehen in der Verbrauchstabelle und Datenqualität.' : ''}</p>
    </section>`;
  }
  return { getMeterKey: id, sameMeter, toNumber: num, consumptionMonth, monthlySeries, annualSeries, render };
})();

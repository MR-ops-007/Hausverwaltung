/**
 * Verbrauchsdiagramme auf Basis der bestehenden materialisierten Lese-Views.
 * Ausschließlich Darstellung; keine Berechnung von Prognosen und keine Schreiboperationen.
 */
const consumptionChartService = (() => {
  const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const esc = value => String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(typeof value === 'string' ? value.trim().replace(',', '.') : value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const excluded = row => {
    const flag = String(row && row.in_summe_beruecksichtigen).trim().toLowerCase();
    return flag === 'false' || flag === '0' || flag === 'nein';
  };
  const id = row => [row.objekt_id, row.einheit_id, row.zaehler_id]
    .map(value => String(value === null || value === undefined ? '' : value).trim()).join('||');
  const fmt = value => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);
  const groupOf = row => String(row.verbrauchsgruppe || row.gruppe || '').toUpperCase();
  const mediumOf = row => String(row.medium || '').toLowerCase();

  function readingSeries(rows, meter) {
    return (rows || []).filter(row => id(row) === id(meter) && row.zeitstempel)
      .map(row => ({
        date: new Date(String(row.zeitstempel).split('.').reverse().join('-')),
        value: num(row.wert),
        raw: row
      }))
      .filter(row => row.value !== null && Number.isFinite(row.date.getTime()))
      .sort((a, b) => a.date - b.date);
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
    const dots = series.map(item => `<circle cx="${x(item).toFixed(1)}" cy="${y(item.value).toFixed(1)}" r="4" fill="#2563eb"><title>${esc(item.date.toLocaleString('de-DE'))} · ${fmt(item.value)} ${unit}</title></circle>`).join('');
    return `<svg class="consumption-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}" xmlns="http://www.w3.org/2000/svg"><line x1="${left}" x2="${W-right}" y1="${H-bottom}" y2="${H-bottom}" stroke="#cbd5e1"/><polyline points="${points}" fill="none" stroke="#2563eb" stroke-width="3"/>${dots}</svg>`;
  }

  function monthlySeries(rows, meter, year) {
    const totals = Array.from({ length: 12 }, () => ({ amount: 0, count: 0, flagged: false }));
    (rows || []).forEach(row => {
      if (id(row) !== id(meter) || String(row.jahr) !== String(year)) return;
      const match = String(row.monat || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
      if (!match || Number(match[1]) !== Number(year)) return;
      const entry = totals[Number(match[2]) - 1];
      const amount = num(row.verbrauch_monat);
      const status = String(row.plausibilitaet_status || '').toUpperCase();
      if (excluded(row) || amount === null) {
        entry.flagged = true;
        return;
      }
      entry.amount += amount;
      entry.count++;
      if (status && status !== 'OK') entry.flagged = true;
    });
    return totals.map(entry => ({
      value: entry.count ? entry.amount : null,
      flagged: entry.flagged
    }));
  }

  function annualSeries(rows, meter, selectedYear) {
    const current = Number(selectedYear);
    if (!Number.isInteger(current)) return [];
    const matches = (rows || []).filter(row => id(row) === id(meter));
    const firstYear = Math.max(current - 5, Math.min(current, ...matches.map(row => Number(row.jahr)).filter(Number.isInteger), current));
    return Array.from({ length: current - firstYear + 1 }, (_, idx) => {
      const year = firstYear + idx;
      const match = matches.find(row => Number(row.jahr) === year && !excluded(row));
      return { year, value: match ? num(match.verbrauch_jahr) : null,
        flagged: match ? Number(match.anzahl_warnungen || 0) > 0 : false };
    });
  }

  function barChart({ labels, current, previous, currentLabel, previousLabel, unit, alt }) {
    const W = 760, H = 276, left = 60, right = 12, top = 14, bottom = 38;
    const iw = W - left - right, ih = H - top - bottom;
    const vals = [...current, ...(previous || [])].map(item => item && item.value)
      .filter(value => typeof value === 'number' && Number.isFinite(value));
    const maximum = Math.max(1, ...vals) * 1.1;
    const grid = [0, 1, 2, 3, 4].map(i => {
      const y = top + ih - i * ih / 4;
      return `<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" stroke="#e2e8f0" />
        <text x="${left-8}" y="${y+4}" font-size="11" text-anchor="end" fill="#64748b">${esc(fmt(maximum*i/4))}</text>`;
    }).join('');
    const group = iw / labels.length;
    const barWidth = Math.min(23, group * (previous ? 0.30 : 0.58));
    const bars = labels.map((label, i) => {
      const x = left + (i + 0.5) * group;
      const columns = [{ row: current[i], x: previous ? x-barWidth-2 : x-barWidth/2, color: '#2563eb', year: currentLabel }];
      if (previous) columns.push({ row: previous[i], x: x+2, color: '#94a3b8', year: previousLabel });
      const rects = columns.map(item => {
        if (!item.row || item.row.value === null) return '';
        const height = Math.max(item.row.value === 0 ? 2 : 3, item.row.value / maximum * ih);
        const y = top + ih - height;
        const title = `${label} ${item.year}: ${fmt(item.row.value)} ${unit}${item.row.flagged ? ' (Prüfhinweis)' : ''}`;
        return `<rect x="${item.x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="2" fill="${item.row.flagged ? '#f59e0b' : item.color}"><title>${esc(title)}</title></rect>`;
      }).join('');
      return `${rects}<text x="${x.toFixed(1)}" y="${H-15}" text-anchor="middle" font-size="11" fill="#475569">${esc(label)}</text>`;
    }).join('');
    return `<svg class="consumption-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}" xmlns="http://www.w3.org/2000/svg">${grid}${bars}</svg>`;
  }

  function render({ meters = [], selectedKey = '', selectedYear, monthlyRows = [], annualRows = [], readingRows = [] }) {
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
    const curr = monthlySeries(monthlyRows, meter, year);
    const prior = monthlySeries(monthlyRows, meter, priorYear);
    const history = annualSeries(annualRows, meter, year);
    const yearLabels = history.map(row => String(row.year));
    const hasCurrent = curr.some(row => row.value !== null);
    const hasPrior = prior.some(row => row.value !== null);
    const flagged = [...curr, ...prior].some(row => row.flagged);
    const unit = /kwh/i.test(String(meter.medium)) ? 'kWh' : /m3/i.test(String(meter.medium)) ? 'm³' : /cm/i.test(String(meter.medium)) ? 'cm' : /liter|_l$/i.test(String(meter.medium)) ? 'l' : (meter.einheit || '');
    const groups = [...new Set(unique.map(groupOf).filter(Boolean))].sort();
    const media = [...new Set(unique.map(mediumOf).filter(Boolean))].sort();
    const filterOptions = (values, selected, label) => `<label>${label}<select onchange="uiService.${label === 'Gruppe' ? 'consumptionChartGroup' : 'consumptionChartMedium'}=this.value;uiService.renderConsumptionDashboard()"><option value="ALL">Alle</option>${values.map(value => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
    const options = available.map(row => {
      const label = `${row.einheit_name || row.einheit_id || ''} · ${row.bezeichnung || row.zaehler_id}`;
      return `<option value="${esc(id(row))}"${id(row) === id(meter) ? ' selected' : ''}>${esc(label)}</option>`;
    }).join('');
    const monthChart = hasCurrent || hasPrior
      ? barChart({ labels: MONTHS, current: curr, previous: prior, currentLabel: String(year), previousLabel: String(priorYear), unit,
        alt: `Monatlicher Verbrauch ${year} und ${priorYear} in ${unit}. Fehlende Monate sind nicht als Null dargestellt.` })
      : '<p class="consumption-chart-empty">Für diesen Zähler liegen im gewählten Jahr und Vorjahr keine berechenbaren Monatswerte vor.</p>';
    const annualChart = history.some(row => row.value !== null)
      ? barChart({ labels: yearLabels, current: history, currentLabel: 'Jahresverbrauch', unit,
        alt: `Jahresverbrauch der letzten bis zu sechs Jahre in ${unit}. Fehlende Jahre sind nicht als Null dargestellt.` })
      : '<p class="consumption-chart-empty">Keine Jahreswerte vorhanden.</p>';
    return `<section class="consumption-charts" aria-label="Verbrauchsdiagramme">
      <div class="consumption-charts-heading"><div><h3>Verbrauchsstatistik</h3><p>Zählerstand und Verbrauch werden getrennt dargestellt. Die Verbrauchswerte stammen aus den bestehenden Verbrauchsviews.</p></div>
      ${filterOptions(groups, selectedGroup, 'Gruppe')}${filterOptions(media, selectedMedium, 'Medium')}<label>Einheit und Zähler
        <select id="consumption-chart-meter-select" onchange="uiService.consumptionChartSelection=this.value;uiService.renderConsumptionDashboard()">${options}</select>
      </label></div>
      <div class="consumption-charts-grid">
        <div class="consumption-chart-panel"><h4>Zählerstandsverlauf</h4>${lineChart(readingSeries(readingRows, meter), unit, `Zählerstandsverlauf für ${meter.bezeichnung || meter.zaehler_id} in ${unit}`)}</div>
        <div class="consumption-chart-panel"><h4>Monatsverbrauch ${esc(year)} / ${esc(priorYear)}</h4>
          <div class="consumption-chart-key"><span class="consumption-chart-year-current">${esc(year)}</span><span class="consumption-chart-year-prior">${esc(priorYear)}</span><span class="consumption-chart-year-warning">Prüfhinweis</span></div>
          ${monthChart}</div>
        <div class="consumption-chart-panel"><h4>Jahresentwicklung</h4>${annualChart}</div>
      </div>
      <p class="consumption-chart-note">Die Monatswerte verteilen Ableseintervalle zeitanteilig. Monate ohne berechenbaren Wert bleiben leer, nicht null. Das laufende Jahr kann unvollständig sein.${flagged ? ' Einzelne Monatssegmente besitzen Prüfhinweise; Details stehen in der Verbrauchstabelle und Datenqualität.' : ''}</p>
    </section>`;
  }
  return { getMeterKey: id, monthlySeries, annualSeries, render };
})();

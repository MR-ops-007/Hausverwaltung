/** Official monthly German CPI, unadjusted overall index, base 2020=100. */
const vpiService = {
  seriesLabel: 'VPI Deutschland 2020=100',
  seriesKey: 'BBDP1.M.DE.N.VPI.C.A00000.I20.L',
  cache: new Map(),

  url(month) {
    contractService.month(month);
    return 'https://api.statistiken.bundesbank.de/rest/data/BBDP1/M.DE.N.VPI.C.A00000.I20.L' +
      '?format=sdmx_json&startPeriod=' + encodeURIComponent(month) + '&endPeriod=' + encodeURIComponent(month);
  },

  parse(data, month) {
    const structure = data && data.data && data.data.structure;
    const datasets = data && data.data && data.data.dataSets;
    const dimensions = structure && structure.dimensions;
    if (!dimensions || !Array.isArray(dimensions.series) || !Array.isArray(datasets) || datasets.length !== 1) {
      throw new Error('Unerwartetes Format der Indexdaten.');
    }
    const expected = { BBK_STD_FREQ: 'M', BBK_STD_AREA: 'DE', BBK_STD_ADJUSTMENT: 'N',
      BBK_DOPR_CONCEPT: 'VPI', BBK_DOPR_CLASSIFICATION: 'C', BBK_DOPR_CLASSIFICATION_DETAIL: 'A00000',
      BBK_DO_BASIS: 'I20', BBK_DO_SUFFIX: 'L' };
    const series = datasets[0].series || {};
    const keys = Object.keys(series);
    if (keys.length !== 1) throw new Error('Indexreihe ist nicht eindeutig.');
    const positions = keys[0].split(':').map(Number);
    if (positions.length !== dimensions.series.length || dimensions.series.length !== Object.keys(expected).length) {
      throw new Error('Indexreihe passt nicht zur vereinbarten Reihe.');
    }
    const seen = new Set();
    dimensions.series.forEach((dimension, index) => {
      if (seen.has(dimension.id) || !Object.prototype.hasOwnProperty.call(expected, dimension.id)) {
        throw new Error('Unvollständige oder doppelte Indexdimensionen.');
      }
      seen.add(dimension.id);
      const actual = dimension.values && dimension.values[positions[index]];
      if (!actual || actual.id !== expected[dimension.id]) throw new Error('Falsche Indexreihe oder falsches Basisjahr.');
    });
    const observationDimensions = dimensions.observation || [];
    if (observationDimensions.length !== 1 || observationDimensions[0].id !== 'TIME_PERIOD') {
      throw new Error('Indexmonat konnte nicht gelesen werden.');
    }
    const index = observationDimensions[0].values.findIndex(item => item.id === month);
    const observation = index < 0 ? null : (series[keys[0]].observations || {})[String(index)];
    const raw = observation && observation[0];
    const value = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Für diesen Monat liegt kein veröffentlichter Indexwert vor.');
    return { month, value, series: this.seriesLabel, source: this.url(month), prepared: data.meta && data.meta.prepared || '' };
  },

  async load(month) {
    contractService.month(month);
    if (month > contractService.iso(contractService.date(new Date())).slice(0, 7)) {
      throw new Error('Der Index des zukünftigen Monats ist noch nicht veröffentlicht.');
    }
    if (this.cache.has(month)) return this.cache.get(month);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(this.url(month), { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Indexwert nicht verfügbar (HTTP ' + response.status + ').');
      const result = this.parse(await response.json(), month);
      this.cache.set(month, result);
      return result;
    } finally { clearTimeout(timeout); }
  }
};

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const shared = readFileSync(new URL('../apps-script/ContractService.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../vpi-service.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../contract-ui.js', import.meta.url), 'utf8');
function load(fetch = vi.fn()) {
  return new Function('fetch', `${shared};${source};return vpiService;`)(fetch);
}
function fixture(value = '100.5', month = '2023-02') {
  const ids = { BBK_STD_FREQ: 'M', BBK_STD_AREA: 'DE', BBK_STD_ADJUSTMENT: 'N',
    BBK_DOPR_CONCEPT: 'VPI', BBK_DOPR_CLASSIFICATION: 'C', BBK_DOPR_CLASSIFICATION_DETAIL: 'A00000', BBK_DO_BASIS: 'I20', BBK_DO_SUFFIX: 'L' };
  return { meta: { prepared: '2026-01-01' }, data: {
    structure: { dimensions: { series: Object.entries(ids).map(([id, value]) => ({ id, values: [{ id: value }] })),
      observation: [{ id: 'TIME_PERIOD', values: [{ id: month }] }] } },
    dataSets: [{ series: { '0:0:0:0:0:0:0:0': { observations: { '0': [value] } } } }]
  } };
}
describe('official CPI lookup', () => {
  it('reads the requested month, checks the series and retains its source', () => {
    const service = load();
    const result = service.parse(fixture(), '2023-02');
    expect(result).toMatchObject({ value: 100.5, month: '2023-02', series: 'VPI Deutschland 2020=100' });
    expect(result.source).toContain('api.statistiken.bundesbank.de');
    expect(result.source).toContain('startPeriod=2023-02&endPeriod=2023-02');
  });
  it('rejects other basis years and adjusted series', () => {
    const otherBase = fixture();
    otherBase.data.structure.dimensions.series[6].values[0].id = 'I15';
    expect(() => load().parse(otherBase, '2023-02')).toThrow(/Basisjahr/);
    const adjusted = fixture();
    adjusted.data.structure.dimensions.series[2].values[0].id = 'Y';
    expect(() => load().parse(adjusted, '2023-02')).toThrow();
  });
  it.each([null, '', 'not a number', '-2', '0'])('does not invent a value for %j', value => {
    expect(() => load().parse(fixture(value), '2023-02')).toThrow(/kein veröffentlichter/);
  });
  it('rejects an answer for a different month', () => {
    expect(() => load().parse(fixture(), '2023-03')).toThrow(/kein veröffentlichter/);
  });
  it('does not request future months or silently return zero on HTTP errors', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const service = load(fetch);
    await expect(service.load('2099-01')).rejects.toThrow(/zukünftigen/);
    expect(fetch).not.toHaveBeenCalled();
    await expect(service.load('2023-02')).rejects.toThrow(/503/);
  });
  it('reuses a successful lookup without including tenant data in requests', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fixture() });
    const service = load(fetch);
    await service.load('2023-02');
    await service.load('2023-02');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].credentials).toBe('omit');
  });
  it('ignores a late response after switching contracts', async () => {
    let resolve;
    const vpiService = { seriesLabel: 'VPI Deutschland 2020=100', load: () => new Promise(done => { resolve = done; }) };
    const elements = {
      'contract-index_basis_monat': { value: '2023-02' }, 'contract-index_basis_wert': { value: '' },
      'contract-index_reihe': { value: vpiService.seriesLabel }, 'contract-index-basis-source': { textContent: '', innerHTML: '' }
    };
    const ui = new Function('vpiService', 'document', uiSource + ';return contractUiService;')(vpiService, { getElementById: id => elements[id] });
    ui.current = () => ({ index_basis_wert: '' });
    const pending = ui.loadIndexValue('basis');
    ui.renderVersion++;
    resolve({ value: 100.5, month: '2023-02', source: 'https://example.test' });
    await pending;
    expect(elements['contract-index_basis_wert'].value).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const staticScripts = [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map((match) => match[1].split(/[?#]/, 1)[0])
  .filter((source) => source && !['runtime-config.js', 'runtime-secrets.js'].includes(source));

describe('GitHub-Pages-Build', () => {
  it('baut und veröffentlicht nur aus main', () => {
    expect(workflow).toContain('branches: [ main ]');
    expect(workflow).toContain('actions/upload-pages-artifact@v3');
    expect(workflow).toContain('actions/deploy-pages@v4');
  });

  it('kopiert alle synchron geladenen Frontend-Skripte ins Pages-Artefakt', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const requiredScripts = [...html.matchAll(/<script src="([^"]+\.js)(?:\?[^" ]+)?"><\/script>/g)]
      .map(match => match[1])
      .filter(src => !['runtime-config.js', 'runtime-secrets.js', 'apps-script/ContractService.js'].includes(src));
    for (const script of requiredScripts) expect(workflow).toContain(script);
  });

  it('verlangt beide Umgebungsprofile und schreibt keine Zugangsschlüssel', () => {
    for (const variable of [
      'HV_TEST_API_URL', 'HV_TEST_SCRIPT_ID', 'HV_TEST_DEPLOYMENT_ID',
      'HV_PROD_API_URL', 'HV_PROD_SCRIPT_ID', 'HV_PROD_DEPLOYMENT_ID'
    ]) expect(workflow).toContain(variable);
    expect(workflow).not.toContain('APP_ACCESS_KEY');
    expect(workflow).not.toContain('CONTRACT_WRITE_TOKEN');
  });

  it('kopiert jedes statische Script aus index.html in das Pages-Artefakt', () => {
    for (const source of staticScripts) {
      expect(workflow, `Pages-Workflow kopiert ${source} nicht`).toContain(source);
    }
    expect(workflow).toContain('node tools/check-frontend-assets.mjs --root=dist-site');
  });
});

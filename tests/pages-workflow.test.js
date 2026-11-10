import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

describe('GitHub-Pages-Build', () => {
  it('baut und veröffentlicht nur aus main', () => {
    expect(workflow).toContain('branches: [ main ]');
    expect(workflow).toContain('actions/upload-pages-artifact@v3');
    expect(workflow).toContain('actions/deploy-pages@v4');
  });

  it('verlangt beide Umgebungsprofile und schreibt keine Zugangsschlüssel', () => {
    for (const variable of [
      'HV_TEST_API_URL', 'HV_TEST_SCRIPT_ID', 'HV_TEST_DEPLOYMENT_ID',
      'HV_PROD_API_URL', 'HV_PROD_SCRIPT_ID', 'HV_PROD_DEPLOYMENT_ID'
    ]) expect(workflow).toContain(variable);
    expect(workflow).not.toContain('APP_ACCESS_KEY');
    expect(workflow).not.toContain('CONTRACT_WRITE_TOKEN');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const documentation = readFileSync(new URL('../docs/p6-6-mieterhoehungs-erinnerungen.md', import.meta.url), 'utf8');

describe('Responsive Vertragsübersicht', () => {
  it('erlaubt keine starren Mindestbreiten, die Eingabefelder aus der Karte drücken', () => {
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(css).toContain('.rent-increase-item > * { min-width: 0; }');
    expect(css).toContain('align-self: start;');
    expect(css).toContain('display: flex;\n    flex-direction: column;');
    expect(css).toContain('max-width: 100%;');
    expect(css).not.toContain('minmax(180px, 0.7fr) minmax(220px, 1.3fr)');
  });

  it('schaltet die Eingabefelder bei schmalen Karten untereinander', () => {
    expect(css).toContain('container-type: inline-size;');
    expect(css).toContain('@container (max-width: 560px)');
    expect(css).toContain('.rent-increase-review-fields { grid-template-columns: 1fr; }');
  });

  it('führt die Browser-Abnahmekriterien und den CSS-Cache-Buster mit', () => {
    expect(documentation).toContain('UI-Abnahmekriterien');
    expect(documentation).toContain('390 px breit');
    expect(documentation).toContain('Kante innerhalb der rechten Kante seiner Karte');
    expect(html).toContain('style.css?v=20261120-p6-6b-review-ux-v3');
  });
});

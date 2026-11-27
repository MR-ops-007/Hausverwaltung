import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    scriptKey, parseDeployments, readBackendVersion, diffFileSets, findMatchingCommit,
    anonymousCheck, latestSuccessfulPages, formatReport
} from '../tools/release-status.mjs';

describe('release-status: Dateinamen', () => {
    it('ordnet gepullte (.js) und Repository-Dateien (.gs/.js) demselben Schlüssel zu', () => {
        expect(scriptKey('Code.gs')).toBe('Code');
        expect(scriptKey('Code.js')).toBe('Code');
        expect(scriptKey('Migration.gs.gs')).toBe('Migration.gs');
        expect(scriptKey('Migration.gs.js')).toBe('Migration.gs');
        expect(scriptKey('appsscript.json')).toBe('appsscript.json');
        expect(scriptKey('Readme.md')).toBeNull();
        expect(scriptKey('.clasp.json')).toBeNull();
    });
});

describe('release-status: clasp-Ausgabe', () => {
    it('liest Bereitstellungen mit und ohne Beschreibung', () => {
        const output = [
            'Found 3 deployments.',
            '- AKfyHEAD @HEAD ',
            '- AKfyTEST @15 ',
            '- AKfyPROD @47 - Backend 4.8.18'
        ].join('\n');
        expect(parseDeployments(output)).toEqual([
            { id: 'AKfyHEAD', version: 'HEAD', description: '' },
            { id: 'AKfyTEST', version: '15', description: '' },
            { id: 'AKfyPROD', version: '47', description: 'Backend 4.8.18' }
        ]);
    });

    it('findet die Backend-Version im gepullten Code', () => {
        expect(readBackendVersion('x;\nconst BACKEND_VERSION = "4.8.18";\n')).toBe('4.8.18');
        expect(readBackendVersion("const BACKEND_VERSION = '4.9.0';")).toBe('4.9.0');
        expect(readBackendVersion('nichts')).toBeNull();
    });

    it('die Version im Repository wird erkannt', () => {
        const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
        expect(readBackendVersion(code)).toMatch(/^\d+\.\d+\.\d+$/);
    });
});

describe('release-status: Abgleich mit Commits', () => {
    const history = [
        { sha: 'c3', files: { Code: 'b3', appsscript: 'm' } },
        { sha: 'c2', files: { Code: 'b2', appsscript: 'm' } },
        { sha: 'c1', files: { Code: 'b1', appsscript: 'm' } }
    ];

    it('nennt abweichende, fehlende und zusätzliche Dateien', () => {
        expect(diffFileSets({ A: '1', B: '2' }, { A: '1', B: '3', C: '4' })).toEqual(['B', 'C']);
        expect(diffFileSets({ A: '1', X: '9' }, { A: '1' })).toEqual(['X']);
        expect(diffFileSets({ A: '1' }, { A: '1' })).toEqual([]);
    });

    it('findet den neuesten Commit mit exakt gleichem Stand', () => {
        expect(findMatchingCommit({ Code: 'b2', appsscript: 'm' }, history).sha).toBe('c2');
        expect(findMatchingCommit({ Code: 'b3', appsscript: 'm' }, history).sha).toBe('c3');
    });

    it('meldet keinen Treffer bei fremdem oder unvollständigem Stand', () => {
        expect(findMatchingCommit({ Code: 'bX', appsscript: 'm' }, history)).toBeNull();
        expect(findMatchingCommit({ Code: 'b2' }, history)).toBeNull();
    });
});

describe('release-status: anonymer Abruf und Pages', () => {
    it('akzeptiert nur UNAUTHORIZED als geschützte Antwort', () => {
        expect(anonymousCheck('{"status":"error","code":"UNAUTHORIZED"}')).toBe('UNAUTHORIZED');
        expect(anonymousCheck('{"status":"ok","data":[]}')).toMatch(/^unerwartet/);
        expect(anonymousCheck('<html>Login</html>')).toMatch(/^keine JSON-Antwort/);
    });

    it('nimmt die neueste erfolgreiche Pages-Bereitstellung, nicht eine laufende', () => {
        const list = [
            { sha: 'neu', state: 'in_progress' },
            { sha: 'fehl', state: 'failure' },
            { sha: 'ok', state: 'success' },
            { sha: 'alt', state: 'success' }
        ];
        expect(latestSuccessfulPages(list).sha).toBe('ok');
        expect(latestSuccessfulPages([{ sha: 'x', state: 'failure' }])).toBeNull();
    });
});

describe('npm-Skripte für clasp und Status', () => {
    const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;

    it('reichen Argumente durch (z. B. --versionNumber für einen Rollback, --description)', () => {
        const names = Object.keys(scripts).filter(name => /^clasp:(test|prod):/.test(name)).concat('status');
        expect(names.length).toBeGreaterThan(6);
        for (const name of names) expect(scripts[name], name).toMatch(/ "\$@"' [\w-]+$/);
    });

    it('PROD-Push und -Deploy behalten die ausdrückliche Bestätigung', () => {
        expect(scripts['clasp:prod:push']).toContain('production push --confirm-prod');
        expect(scripts['clasp:prod:deploy']).toContain('production deploy --confirm-prod');
        expect(scripts['clasp:prod:status']).not.toContain('--confirm-prod');
    });
});

describe('release-status: Ausgabe', () => {
    const base = {
        generatedAt: '2026-11-26T13:00:00Z',
        main: { sha: 'aaaaaaa1111' },
        pages: { sha: 'aaaaaaa1111', createdAt: '2026-11-26T12:00:00Z', indexMatches: true }
    };

    it('zeigt Gleichstand, Tag und Schutz', () => {
        const text = formatReport({
            ...base,
            backends: [{
                label: 'PROD', deploymentVersion: '47', deploymentDescription: '', backendVersion: '4.8.18',
                matchesMain: true, diffToMain: [],
                matchingCommit: { sha: 'bbbbbbb2222', subject: 'Merge #65', tags: ['v4.8.18'] },
                anonymous: 'UNAUTHORIZED'
            }]
        });
        expect(text).toContain('@47');
        expect(text).toContain('= main');
        expect(text).toContain('bbbbbbb Merge #65 · Tag v4.8.18');
        expect(text).toContain('UNAUTHORIZED');
        expect(text).toContain('aaaaaaa vom 2026-11-26T12:00:00Z (= main)');
    });

    it('zeigt Abweichung, fehlenden Commit und Fehler', () => {
        const text = formatReport({
            ...base,
            pages: { error: 'keine erfolgreiche Pages-Bereitstellung gefunden' },
            backends: [
                {
                    label: 'TEST', deploymentVersion: '16', deploymentDescription: '', backendVersion: '4.9.0',
                    matchesMain: false, diffToMain: ['Code', 'Payments'], matchingCommit: null, anonymous: 'UNAUTHORIZED'
                },
                { label: 'PROD', error: 'konfigurierte deploymentId nicht in der Deployment-Liste' }
            ]
        });
        expect(text).toContain('≠ main (Code, Payments)');
        expect(text).toContain('keinem Commit auf main');
        expect(text).toContain('Fehler: konfigurierte deploymentId');
        expect(text).toContain('Fehler: keine erfolgreiche Pages-Bereitstellung');
    });
});

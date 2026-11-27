// Release-Status (nur lesend): zeigt für TEST, PROD und GitHub Pages, welcher Stand
// tatsächlich bereitgestellt ist und zu welchem Commit er gehört.
//
//   npm run status            Tabelle
//   npm run status -- --json  maschinenlesbar
//   npm run status -- --env=test   nur eine Umgebung (test|production|pages)
//
// Schreibt nichts in Apps Script, Sheets oder GitHub. Für Apps Script wird der Code in
// einen temporären Hilfsordner gepullt (Release-Regel 5 in docs/betrieb.md); die
// .clasp.json des Repositorys bleibt unverändert.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalRuntimeConfig, selectProfile } from './clasp-target.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_FILE = /\.(gs|js)$/;
const MANIFEST = 'appsscript.json';

// ---------------------------------------------------------------- reine Funktionen

/** `Code.gs`, `Code.js` → `Code`; `Migration.gs.gs` → `Migration.gs`; Manifest bleibt. */
export function scriptKey(fileName) {
    if (fileName === MANIFEST) return MANIFEST;
    return SCRIPT_FILE.test(fileName) ? fileName.replace(SCRIPT_FILE, '') : null;
}

/** Liest `- <id> @<n|HEAD> [Beschreibung]` aus `clasp list-deployments`. */
export function parseDeployments(output) {
    const rows = [];
    for (const line of String(output || '').split('\n')) {
        const match = line.match(/^-\s+(\S+)\s+@(\d+|HEAD)\b\s*-?\s*(.*)$/);
        if (match) rows.push({ id: match[1], version: match[2], description: match[3].trim() });
    }
    return rows;
}

export function readBackendVersion(code) {
    const match = String(code || '').match(/const\s+BACKEND_VERSION\s*=\s*["']([^"']+)["']/);
    return match ? match[1] : null;
}

/** Vergleicht zwei Abbildungen Schlüssel → Blob-Hash; liefert die abweichenden Schlüssel. */
export function diffFileSets(actual, expected) {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    return [...keys].sort().filter(key => actual[key] !== expected[key]);
}

/**
 * Sucht den neuesten Commit, dessen Apps-Script-Dateien exakt dem gepullten Stand
 * entsprechen. `commits` ist neueste zuerst: [{ sha, files: {key: blob} }].
 */
export function findMatchingCommit(pulled, commits) {
    return commits.find(commit => diffFileSets(pulled, commit.files).length === 0) || null;
}

export function anonymousCheck(body) {
    try {
        const parsed = JSON.parse(body);
        return parsed && parsed.code === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : `unerwartet: ${String(body).slice(0, 60)}`;
    } catch (error) {
        return `keine JSON-Antwort: ${String(body).slice(0, 60)}`;
    }
}

/** Erste erfolgreiche Pages-Bereitstellung aus [{sha, created_at, state}], neueste zuerst. */
export function latestSuccessfulPages(deployments) {
    return deployments.find(item => item.state === 'success') || null;
}

const short = sha => (sha ? sha.slice(0, 7) : '–');

export function formatReport(report) {
    const lines = [`Release-Status · main ${short(report.main.sha)} · ${report.generatedAt}`, ''];
    for (const env of report.backends) {
        lines.push(`${env.label}`);
        if (env.error) { lines.push(`  Fehler: ${env.error}`, ''); continue; }
        lines.push(`  Bereitstellung   @${env.deploymentVersion}${env.deploymentDescription ? ` (${env.deploymentDescription})` : ''}`);
        lines.push(`  Backend-Version  ${env.backendVersion || 'unbekannt'}`);
        if (env.matchesMain) lines.push('  Code             = main');
        else lines.push(`  Code             ≠ main (${env.diffToMain.join(', ')})`);
        if (env.matchingCommit) {
            const tags = env.matchingCommit.tags.length ? ` · Tag ${env.matchingCommit.tags.join(', ')}` : ' · ohne Tag';
            lines.push(`  entspricht       ${short(env.matchingCommit.sha)} ${env.matchingCommit.subject}${tags}`);
        } else {
            lines.push('  entspricht       keinem Commit auf main');
        }
        lines.push(`  anonym           ${env.anonymous}`);
        lines.push('');
    }
    if (report.pages) {
        lines.push('GitHub Pages');
        if (report.pages.error) lines.push(`  Fehler: ${report.pages.error}`);
        else {
            lines.push(`  Bereitstellung   ${short(report.pages.sha)} vom ${report.pages.createdAt}${report.pages.sha === report.main.sha ? ' (= main)' : ' (≠ main)'}`);
            lines.push(`  index.html       ${report.pages.indexMatches ? 'ausgeliefert = Commit' : 'weicht vom Commit ab'}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------- Zugriffe

function sh(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')}: ${(result.stderr || result.stdout || '').trim().split('\n').pop()}`);
    }
    return result.stdout;
}

const git = (...args) => sh('git', args);

function gitBlobFiles(ref) {
    const files = {};
    for (const line of git('ls-tree', ref, 'apps-script/').split('\n')) {
        const match = line.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/);
        if (!match) continue;
        const key = scriptKey(path.basename(match[2]));
        if (key) files[key] = match[1];
    }
    return files;
}

function hashFile(file) {
    return git('hash-object', '--no-filters', file).trim();
}

function tagsByCommit() {
    const map = new Map();
    for (const line of git('tag', '--format=%(refname:short) %(*objectname) %(objectname)').split('\n')) {
        const [tag, peeled, object] = line.trim().split(' ');
        if (!tag) continue;
        const sha = peeled || object;
        map.set(sha, [...(map.get(sha) || []), tag]);
    }
    return map;
}

function appsScriptHistory(mainRef) {
    const tags = tagsByCommit();
    // Nur die erste Elternlinie von main und nur Script-Dateien: So ist der Treffer der
    // Merge-Commit, mit dem dieser Code-Stand nach main kam (Ziel eines Release-Tags).
    return git('log', '--first-parent', '--format=%H%x09%s', mainRef, '--',
        'apps-script/*.gs', 'apps-script/*.js', `apps-script/${MANIFEST}`)
        .split('\n').filter(Boolean)
        .map(line => {
            const [sha, subject] = line.split('\t');
            return { sha, subject, files: gitBlobFiles(sha), tags: tags.get(sha) || [] };
        });
}

function clasp(args, cwd) {
    const bin = path.join(root, 'node_modules', '.bin', 'clasp');
    const env = { ...process.env, NODE_OPTIONS: '--dns-result-order=ipv4first' };
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            return sh(bin, ['--auth', path.join(root, '.clasprc.json'), ...args], { cwd, env });
        } catch (error) {
            lastError = error; // Netzwerkabbrüche („Premature close“) treten gelegentlich auf.
        }
    }
    throw lastError;
}

async function backendStatus(environment, mainFiles, history) {
    const profile = selectProfile(loadLocalRuntimeConfig(), environment);
    const label = environment === 'production' ? 'PROD' : 'TEST';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hv-status-${environment}-`));
    try {
        fs.writeFileSync(path.join(dir, '.clasp.json'), JSON.stringify({ scriptId: profile.scriptId, rootDir: '.' }));
        const deployments = parseDeployments(clasp(['list-deployments'], dir));
        const deployment = deployments.find(item => item.id === profile.deploymentId);
        if (!deployment) throw new Error('konfigurierte deploymentId nicht in der Deployment-Liste');

        clasp(['pull'], dir);
        const pulled = {};
        let code = '';
        for (const name of fs.readdirSync(dir)) {
            const key = scriptKey(name);
            if (!key) continue;
            pulled[key] = hashFile(path.join(dir, name));
            if (key === 'Code') code = fs.readFileSync(path.join(dir, name), 'utf8');
        }

        let anonymous;
        try {
            const response = await fetch(profile.apiUrl, { redirect: 'follow' });
            anonymous = anonymousCheck(await response.text());
        } catch (error) {
            anonymous = `nicht erreichbar: ${error.message}`;
        }

        const diffToMain = diffFileSets(pulled, mainFiles);
        const match = findMatchingCommit(pulled, history);
        return {
            environment, label,
            deploymentVersion: deployment.version, deploymentDescription: deployment.description,
            backendVersion: readBackendVersion(code),
            matchesMain: diffToMain.length === 0, diffToMain,
            matchingCommit: match ? { sha: match.sha, subject: match.subject, tags: match.tags } : null,
            anonymous
        };
    } catch (error) {
        return { environment, label, error: error.message };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function githubRepo() {
    const url = git('remote', 'get-url', 'origin').trim();
    const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (!match) throw new Error(`origin ist kein GitHub-Repository: ${url}`);
    return match[1];
}

async function pagesStatus() {
    try {
        const repo = githubRepo();
        const list = JSON.parse(sh('gh', ['api', `repos/${repo}/deployments?environment=github-pages&per_page=10`]));
        const withState = list.map(item => {
            const statuses = JSON.parse(sh('gh', ['api', `repos/${repo}/deployments/${item.id}/statuses?per_page=1`]));
            return {
                sha: item.sha, createdAt: item.created_at,
                state: statuses[0] ? statuses[0].state : 'unbekannt',
                url: statuses[0] ? statuses[0].environment_url : ''
            };
        });
        const latest = latestSuccessfulPages(withState);
        if (!latest) throw new Error('keine erfolgreiche Pages-Bereitstellung gefunden');
        const served = await (await fetch(`${latest.url.replace(/\/?$/, '/')}index.html?status=${Date.now()}`)).text();
        let committed = '';
        try { committed = git('show', `${latest.sha}:index.html`); } catch (error) { committed = null; }
        return { sha: latest.sha, createdAt: latest.createdAt, url: latest.url, indexMatches: committed !== null && served === committed };
    } catch (error) {
        return { error: error.message };
    }
}

export async function collect({ envs = ['test', 'production', 'pages'] } = {}) {
    try { git('fetch', '--quiet', '--tags', 'origin', 'main'); } catch (error) { /* offline: lokaler Stand */ }
    const mainRef = 'origin/main';
    const mainFiles = gitBlobFiles(mainRef);
    const history = appsScriptHistory(mainRef);
    const backends = [];
    for (const environment of ['test', 'production']) {
        if (envs.includes(environment)) backends.push(await backendStatus(environment, mainFiles, history));
    }
    return {
        generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        main: { sha: git('rev-parse', mainRef).trim() },
        backends,
        pages: envs.includes('pages') ? await pagesStatus() : null
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const envArg = args.find(arg => arg.startsWith('--env='));
    const envs = envArg ? envArg.slice(6).split(',') : undefined;
    collect({ envs }).then(report => {
        console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
        const failed = report.backends.some(env => env.error) || (report.pages && report.pages.error);
        if (failed) process.exitCode = 1;
    }).catch(error => {
        console.error(`Fehler: ${error.message}`);
        process.exitCode = 1;
    });
}

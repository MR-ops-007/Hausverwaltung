import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localConfigPath = path.join(root, 'config.local.js');
const claspConfigPath = path.join(root, '.clasp.json');

export function loadLocalRuntimeConfig() {
    if (!fs.existsSync(localConfigPath)) {
        throw new Error('config.local.js fehlt. Bitte die lokale Laufzeitkonfiguration anlegen.');
    }
    const context = {
        globalThis: {},
        localStorage: { getItem: () => null }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(localConfigPath, 'utf8'), context, { filename: localConfigPath });
    return context.globalThis.HV_RUNTIME_CONFIG || {};
}

export function selectProfile(runtimeConfig, environment) {
    const name = String(environment || '').trim().toLowerCase();
    const profile = runtimeConfig.profiles && runtimeConfig.profiles[name];
    if (!profile || !profile.scriptId) {
        throw new Error(`Kein vollständiges Profil für ${name || 'die gewünschte Umgebung'} konfiguriert.`);
    }
    return { name, ...profile };
}

function writeClaspConfig(profile) {
    fs.writeFileSync(claspConfigPath, `${JSON.stringify({
        scriptId: profile.scriptId,
        rootDir: 'apps-script',
        fileExtension: 'gs'
    }, null, 2)}\n`);
}

export function run(args = process.argv.slice(2)) {
    const [environment, command, ...rest] = args;
    if (!['test', 'production'].includes(environment) || !['status', 'pull', 'push', 'deploy'].includes(command)) {
        throw new Error('Verwendung: node tools/clasp-target.mjs <test|production> <status|pull|push|deploy> [--confirm-prod]');
    }

    const profile = selectProfile(loadLocalRuntimeConfig(), environment);
    if (environment === 'production' && ['push', 'deploy'].includes(command) && !rest.includes('--confirm-prod')) {
        throw new Error('PROD-Schreibzugriff blockiert. Für einen bewussten PROD-Push zusätzlich --confirm-prod angeben.');
    }
    if (command === 'deploy' && !profile.deploymentId) {
        throw new Error(`Für ${environment} fehlt die bestehende deploymentId.`);
    }

    writeClaspConfig(profile);
    const claspArgs = ['exec', '--', 'clasp', '--auth', '.clasprc.json', command];
    if (command === 'deploy') {
        claspArgs.push('--deploymentId', profile.deploymentId);
    }
    claspArgs.push(...rest.filter(arg => arg !== '--confirm-prod'));

    console.log(`clasp-Ziel: ${profile.label || environment} (${profile.scriptId})`);
    const result = spawnSync('npm', claspArgs, { cwd: root, stdio: 'inherit', env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status || 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        run();
    } catch (error) {
        console.error(`Fehler: ${error.message}`);
        process.exitCode = 1;
    }
}

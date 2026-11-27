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

function writeClaspConfig(target) {
    fs.writeFileSync(claspConfigPath, `${JSON.stringify({
        scriptId: target.scriptId,
        rootDir: target.rootDir,
        scriptExtensions: ['gs', 'js']
    }, null, 2)}\n`);
}

/**
 * Ziel eines clasp-Aufrufs. `--backup` wählt das eigene Backup-Projekt der Umgebung
 * (`backupScriptId`, Ordner `apps-script-backup`); es hat keine Web-App und daher kein deploy.
 */
export function resolveTarget(profile, environment, command, rest = []) {
    const backup = rest.includes('--backup');
    if (environment === 'production' && ['push', 'deploy'].includes(command) && !rest.includes('--confirm-prod')) {
        throw new Error('PROD-Schreibzugriff blockiert. Für einen bewussten PROD-Push zusätzlich --confirm-prod angeben.');
    }
    if (backup) {
        if (command === 'deploy') throw new Error('Das Backup-Projekt hat keine Web-App; nur status, pull und push.');
        if (!profile.backupScriptId) throw new Error(`Für ${environment} fehlt backupScriptId in config.local.js.`);
        return {
            label: `${profile.label || environment} · Backup`,
            scriptId: profile.backupScriptId,
            rootDir: 'apps-script-backup',
            args: rest.filter(arg => arg !== '--confirm-prod' && arg !== '--backup')
        };
    }
    if (command === 'deploy' && !profile.deploymentId) {
        throw new Error(`Für ${environment} fehlt die bestehende deploymentId.`);
    }
    return {
        label: profile.label || environment,
        scriptId: profile.scriptId,
        rootDir: 'apps-script',
        deploymentId: command === 'deploy' ? profile.deploymentId : undefined,
        args: rest.filter(arg => arg !== '--confirm-prod')
    };
}

export function run(args = process.argv.slice(2)) {
    const [environment, command, ...rest] = args;
    if (!['test', 'production'].includes(environment) || !['status', 'pull', 'push', 'deploy'].includes(command)) {
        throw new Error('Verwendung: node tools/clasp-target.mjs <test|production> <status|pull|push|deploy> [--backup] [--confirm-prod]');
    }

    const profile = selectProfile(loadLocalRuntimeConfig(), environment);
    const target = resolveTarget(profile, environment, command, rest);

    writeClaspConfig(target);
    const claspArgs = ['exec', '--', 'clasp', '--auth', '.clasprc.json', command];
    if (target.deploymentId) {
        claspArgs.push('--deploymentId', target.deploymentId);
    }
    claspArgs.push(...target.args);

    console.log(`clasp-Ziel: ${target.label} (${target.scriptId})`);
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

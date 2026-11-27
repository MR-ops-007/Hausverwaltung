import { describe, it, expect } from 'vitest';
import { resolveTarget } from '../tools/clasp-target.mjs';

const profile = { label: 'PRODUKTION', scriptId: 'web', deploymentId: 'dep', backupScriptId: 'bak' };

describe('clasp-Ziel', () => {
  it('Web-App: Ordner apps-script, deploy mit bestehender Bereitstellung', () => {
    expect(resolveTarget(profile, 'test', 'deploy', ['--description', 'x'])).toEqual({
      label: 'PRODUKTION', scriptId: 'web', rootDir: 'apps-script', deploymentId: 'dep', args: ['--description', 'x']
    });
    expect(resolveTarget(profile, 'test', 'push').deploymentId).toBeUndefined();
  });

  it('Backup-Projekt: eigene Script-ID und eigener Ordner, kein deploy', () => {
    expect(resolveTarget(profile, 'test', 'push', ['--backup'])).toEqual({
      label: 'PRODUKTION · Backup', scriptId: 'bak', rootDir: 'apps-script-backup', args: []
    });
    expect(() => resolveTarget(profile, 'test', 'deploy', ['--backup'])).toThrow(/keine Web-App/);
    expect(() => resolveTarget({ scriptId: 'web' }, 'test', 'push', ['--backup'])).toThrow(/backupScriptId/);
  });

  it('PROD-Push verlangt auch für das Backup-Projekt die Bestätigung', () => {
    expect(() => resolveTarget(profile, 'production', 'push', ['--backup'])).toThrow(/PROD-Schreibzugriff blockiert/);
    expect(resolveTarget(profile, 'production', 'push', ['--backup', '--confirm-prod']).args).toEqual([]);
    expect(resolveTarget(profile, 'production', 'status', ['--backup']).scriptId).toBe('bak');
  });
});

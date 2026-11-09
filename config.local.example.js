/*
 * Lokale Laufzeitkonfiguration.
 *
 * Diese Datei nach `config.local.js` kopieren und nur lokal verwenden.
 * `config.local.js` ist in .gitignore und darf keine echten Schlüssel enthalten.
 */
globalThis.HV_RUNTIME_CONFIG = {
    environment: 'test',
    apiUrl: 'https://<TEST-GAS-DEPLOYMENT-ID>.exec'
};

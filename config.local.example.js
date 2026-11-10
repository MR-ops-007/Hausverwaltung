/*
 * Lokale Laufzeitkonfiguration.
 *
 * Diese Datei nach `runtime-config.js` kopieren und nur lokal verwenden.
 * `runtime-config.js` ist in .gitignore und darf keine Schlüssel enthalten.
 * Die lokale App kann zwischen den Profilen TEST und PRODUKTION wechseln.
 */
(function configureHausverwaltungRuntime(host) {
    const profiles = {
        test: {
            label: 'TEST · Entenhausen',
            apiUrl: 'https://<TEST-GAS-DEPLOYMENT-ID>.exec',
            scriptId: '<TEST-SCRIPT-ID>',
            deploymentId: '<TEST-DEPLOYMENT-ID>'
        },
        production: {
            label: 'PRODUKTION',
            apiUrl: 'https://<PROD-GAS-DEPLOYMENT-ID>.exec',
            scriptId: '<PROD-SCRIPT-ID>',
            deploymentId: '<PROD-DEPLOYMENT-ID>'
        }
    };
    let storedEnvironment = '';
    try {
        storedEnvironment = host.localStorage?.getItem('hv_environment') || '';
    } catch (error) {
        storedEnvironment = '';
    }
    const environment = profiles[storedEnvironment] ? storedEnvironment : 'test';
    host.HV_RUNTIME_CONFIG = { environment, profiles, ...profiles[environment] };
})(typeof window !== 'undefined' ? window : globalThis);

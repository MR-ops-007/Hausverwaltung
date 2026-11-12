/*
 * Lokale Geheimnisse für den TEST-Betrieb.
 *
 * Diese Datei nach `runtime-secrets.js` kopieren und den TEST-Schlüssel eintragen.
 * Die echte Datei ist ignoriert und darf niemals committed oder veröffentlicht werden.
 * Für PROD bleibt der Wert leer.
 */
(function configureHausverwaltungLocalSecrets(host) {
    host.HV_RUNTIME_SECRETS = {
        test: '<TEST-APP-ACCESS-KEY>',
        production: ''
    };
})(typeof window !== 'undefined' ? window : globalThis);

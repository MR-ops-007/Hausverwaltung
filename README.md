# Hausverwaltung

Private Web-App zur Verwaltung von Immobilien, Einheiten, Mietverhältnissen, Zählerständen und perspektivisch Mieteingängen und Auswertungen.

## Ziel des Projekts

Das Projekt soll eine einfache Hausverwaltungs-App bereitstellen, insbesondere für:

- Erfassung von Zählerständen
- Verwaltung von Objekten und Einheiten
- Verwaltung von Personen, Verträgen und Vertragsparteien
- Mieteingangskontrolle
- spätere Plausibilitätsprüfungen und Auswertungen

## Technischer Aufbau

Aktueller Stand:

- Frontend: Vanilla JavaScript, HTML, CSS
- Backend: Google Apps Script
- Datenhaltung: Google Sheets
- Tests: Vitest
- Versionierung: GitHub

Das Google Sheet dient aktuell als Datenbank.

Das Google Apps Script Backend wird im Repository unter `apps-script/Code.gs` versioniert. `clasp` ist für synchronisierte Pull-/Push-Deployments vorbereitet.

## Wichtige Dateien

| Datei / Ordner | Zweck |
| :--- | :--- |
| `index.html` | Einstiegspunkt der App |
| `config.js` | Nicht-sensitive Objektkonfiguration und Laufzeitprüfung |
| `config.local.example.js` | Vorlage für eine lokale Test-/Produktionsauswahl; `config.local.js` wird nicht committed |
| `cloud-service.js` | Kommunikation mit dem Google Apps Script Backend |
| `data-service.js` | Lokaler Datenzustand und Datenzugriff im Frontend |
| `ui-service.js` | Rendering und UI-Logik |
| `calc-service.js` | Berechnungslogik / ältere Hilfsfunktionen |
| `validation-service.js` | Isolierte Plausibilitätsprüfung für Zählerstände |
| `contract-ui.js` | Vertragsansicht, Dokumentlinks und Indexvorschau |
| `vpi-service.js` | Offizieller Monatsindex-Abruf mit Prüfung von Reihe und Basisjahr |
| `apps-script/ContractService.js` | Gemeinsame Vertrags-/Indexregeln für Browser und Backend |
| `apps-script/Contracts.gs` | Vertragsupdates, Änderungshistorie und explizite Schema-Vorbereitung |
| `docs/contracts-index-plan.md` | Analyse, Datenmodell-Diff und freizugebende Migration |
| `docs/offline-sync-und-korrekturen.md` | Offline-Queue, Konflikte, Überschreiben mit Grund, Protokoll |
| `DATA_MODEL.md` | Fachliches Datenmodell des Google Sheets |
| `PROJECT_STATE.md` | Aktueller Projektstand, nächste Schritte und Historie |
| `AGENT_AUDIT.md` | Bestandsaufnahme und Regeln für KI-/Agentenarbeit |
| `apps-script/` | Versionierte Kopie des Google Apps Script Backends inklusive Manifest |
| `tests/` | Automatisierte Tests |

## Apps Script Sync

`clasp` ist als lokale Dev-Dependency eingerichtet.
Die `clasp:*` npm-Skripte verwenden die Node-Version aus `.nvmrc`.

Einmalige Einrichtung:

1. `.clasp.example.json` nach `.clasp.json` kopieren.
2. `scriptId` aus den Google-Apps-Script-Projekteinstellungen eintragen.
3. Bei Bedarf `nvm install` ausführen.
4. `npm run clasp:login` ausführen.
5. `npm run clasp:pull` ausführen und den Diff prüfen.

Die Dateien `.clasp.json` und `.clasprc.json` enthalten lokale Projekt- bzw. OAuth-Daten und werden nicht committed.

### Laufzeitumgebung

Die Apps-Script-URL steht absichtlich nicht in `config.js` und wird nicht im
Repository versioniert. Für einen lokalen Lauf muss die gewünschte Umgebung
explizit ausgewählt werden:

```bash
cp config.local.example.js config.local.js
# Danach environment und apiUrl in config.local.js setzen.
```

`config.local.js` ist ignoriert und darf weder Schlüssel noch produktive URLs in
einen Commit bringen. Ohne diese Datei zeigt die App bewusst einen
Konfigurationshinweis statt stillschweigend ein Backend anzusprechen.

Für Verbrauchs-Snapshots wird die URL ebenfalls explizit übergeben:

```bash
APP_ACCESS_KEY="..." HV_API_URL="https://.../exec" \
  npm run qa:consumption-snapshot -- --output=/private/tmp/verbrauch-snapshot.json
```

Die URL wird dabei absichtlich nicht aus `config.js` gelesen.

Regel: Vor jedem `npm run clasp:push` muss der Pull-Diff geprüft sein, damit das bestehende GAS-Projekt nicht versehentlich mit einem unvollständigen lokalen Stand überschrieben wird.

## Entwicklung

Änderungen erfolgen über Branches.

Empfohlener Ablauf:

1. `main` aktualisieren
2. neuen Branch erstellen
3. Änderungen in VS Code durchführen
4. Diff prüfen
5. lokal testen
6. Commit erstellen
7. Branch nach GitHub pushen
8. Pull Request nach `main`
9. GitHub Actions prüfen
10. nach erfolgreicher Prüfung mergen
11. Branch löschen
12. lokal `main` aktualisieren

## Tests

Tests werden mit Vitest ausgeführt:

```bash
npm test
```

Der Vertragsausbau ist produktiv (Stand siehe `CHANGELOG.md`). Die Vertragsansicht
liest auch Bestandsdaten ohne neue Spalten. Schreiben erfordert Backend ab 4.7.0,
die einmalige Schema-Vorbereitung (`prepareContractSchema()`) und die Script
Property `CONTRACT_WRITE_TOKEN`. Es wurden keine Produktivdaten migriert.
Siehe `docs/contracts-index-plan.md`.

Offline-Queue und Korrekturen (Backend ab 4.8.4): Nicht gespeicherte Werte werden oben angezeigt und lassen sich erneut senden; Überschreiben nur mit Grund. Siehe `docs/offline-sync-und-korrekturen.md`.

Zugriffsschutz (Backend ab 4.8.0): Lesen und Schreiben erfordern einen Zugangsschlüssel.
Backend 4.8.5 ergänzt fail-closed Zugriff und getrennte Geräteschlüssel für die Rollen
`admin` und `erfassen`. Einspielen, Rollback und Schlüsselwechsel stehen in
`docs/access-control.md`.

Betrieb, getrennte Test-/Produktionsdaten, Backup, Restore und lokale API-Auswahl sind in
`docs/betrieb.md` dokumentiert.

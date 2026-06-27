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
| `config.js` | Konfiguration, aktuell inklusive Apps-Script-Web-App-URL |
| `cloud-service.js` | Kommunikation mit dem Google Apps Script Backend |
| `data-service.js` | Lokaler Datenzustand und Datenzugriff im Frontend |
| `ui-service.js` | Rendering und UI-Logik |
| `calc-service.js` | Berechnungslogik / ältere Hilfsfunktionen |
| `validation-service.js` | Isolierte Plausibilitätsprüfung für Zählerstände |
| `DATA_MODEL.md` | Fachliches Datenmodell des Google Sheets |
| `PROJECT_STATE.md` | Aktueller Projektstand, nächste Schritte und Historie |
| `AGENT_AUDIT.md` | Bestandsaufnahme und Regeln für KI-/Agentenarbeit |
| `apps-script/` | Versionierte Kopie des Google Apps Script Backends inklusive Manifest |
| `tests/` | Automatisierte Tests |

## Apps Script Sync

`clasp` ist als lokale Dev-Dependency eingerichtet.

Einmalige Einrichtung:

1. `.clasp.example.json` nach `.clasp.json` kopieren.
2. `scriptId` aus den Google-Apps-Script-Projekteinstellungen eintragen.
3. `npm run clasp:login` ausführen.
4. `npm run clasp:pull` ausführen und den Diff prüfen.

Regel: Vor dem ersten `npm run clasp:push` muss der Pull-Diff geprüft sein, damit das bestehende GAS-Projekt nicht versehentlich mit einem unvollständigen lokalen Manifest überschrieben wird.

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

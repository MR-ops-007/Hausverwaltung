# Hausverwaltung

Private Web-App zur Verwaltung von Immobilien, Einheiten, Mietverhältnissen, Zählerständen und Mieteingängen.

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

Das Google Sheet dient aktuell als Datenbank. Das Google Apps Script Backend wird zunächst manuell im Repository unter `apps-script/Code.gs` versioniert. `clasp` wird später optional geprüft.

## Wichtige Dateien

| Datei / Ordner | Zweck |
| :--- | :--- |
| `index.html` | Einstiegspunkt der App |
| `config.js` | Konfiguration, aktuell inklusive Apps-Script-Web-App-URL |
| `cloud-service.js` | Kommunikation mit dem Google Apps Script Backend |
| `data-service.js` | Lokaler Datenzustand und Datenzugriff im Frontend |
| `ui-service.js` | Rendering und UI-Logik |
| `calc-service.js` | Berechnungslogik / ältere Hilfsfunktionen |
| `DATA_MODEL.md` | Fachliches Datenmodell des Google Sheets |
| `PROJECT_STATE.md` | Aktueller Projektstand und nächste Schritte |
| `AGENT_AUDIT.md` | Bestandsaufnahme für KI-/Agentenarbeit |
| `apps-script/` | Manuell versionierte Kopie des Google Apps Script Backends |
| `tests/` | Automatisierte Tests |

## Entwicklung

Änderungen erfolgen ab sofort über Branches.

Empfohlener Ablauf:

1. Neuen Branch erstellen
2. Änderungen in VS Code durchführen
3. Diff prüfen
4. Lokal testen
5. Commit erstellen
6. Branch nach GitHub pushen
7. Pull Request nach `main`
8. Nach erfolgreicher Prüfung mergen

## Tests

Tests werden mit Vitest ausgeführt:

```bash
npm test
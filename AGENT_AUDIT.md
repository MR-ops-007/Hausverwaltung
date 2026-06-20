# AGENT_AUDIT - Hausverwaltung

## Zweck dieses Dokuments

Dieses Dokument dient als Bestandsaufnahme für die Arbeit mit KI-Assistenten, Coding Agents und Code Reviews.

Ziel ist, dass Änderungen nachvollziehbar, klein und prüfbar bleiben. Bereits funktionierende Funktionen sollen nicht durch unkontrollierte Refactorings oder automatische Änderungen verloren gehen.

## Grundregeln für KI-/Agentenarbeit

- Keine direkten Änderungen auf `main`.
- Jede Änderung erfolgt in einem eigenen Branch.
- Änderungen müssen per Git-Diff geprüft werden.
- Bestehende Funktionalität darf nicht ohne ausdrücklichen Grund entfernt werden.
- Keine großen Refactorings zusammen mit Feature-Änderungen.
- Keine Umbenennungen von Dateien, Funktionen oder Datenfeldern ohne dokumentierten Grund.
- Datenmodelländerungen müssen in `DATA_MODEL.md` dokumentiert werden.
- Relevante Projektentscheidungen müssen in `PROJECT_STATE.md` dokumentiert werden.
- Tests sollen vor Feature-Erweiterungen aufgebaut und erweitert werden.

## Aktueller technischer Stand

Frontend:

- Vanilla JavaScript
- HTML
- CSS

Backend:

- Google Apps Script
- Google Sheets als Datenbank
- Apps Script wird zunächst manuell unter `apps-script/Code.gs` versioniert
- `clasp` wird später optional geprüft

Tests:

- Vitest ist eingerichtet
- GitHub Actions führt `npm test` bei Pull Requests und Pushes auf `main` aus
- Eine erste Smoke-Test-Datei stellt sicher, dass die Testumgebung grün läuft

## Wichtige Projektdateien

| Datei / Ordner | Bedeutung |
| :--- | :--- |
| `DATA_MODEL.md` | Referenz für das Datenmodell |
| `PROJECT_STATE.md` | Aktueller Projektstand und nächste Schritte |
| `README.md` | Überblick für Menschen |
| `AGENT_AUDIT.md` | Leitplanken für KI-/Agentenarbeit |
| `apps-script/Code.gs` | Manuell versionierter Stand des Google Apps Script Backends |
| `tests/` | Automatisierte Tests |
| `config.js` | Konfiguration, aktuell inklusive Apps-Script-URL |

## Bekannte Risiken

### Google Apps Script nicht automatisch synchronisiert

Der produktive Apps-Script-Code liegt weiterhin im Google Apps Script Editor. Das Repository enthält nur eine manuell gepflegte Kopie.

Regel:

1. Geplante Änderungen lokal in `apps-script/Code.gs` nachvollziehbar machen.
2. Diff prüfen.
3. Änderung im Apps Script Editor testen.
4. Erst nach erfolgreichem Test committen.

### Apps-Script-Web-App-URL ist öffentlich sichtbar

Die Web-App-URL steht aktuell in `config.js`. Für den Entwicklungsstand ist das akzeptiert.

Zu beachten:

- Das Backend muss serverseitig robust gegen unerwünschte Schreibzugriffe sein.
- Langfristig sollte geprüft werden, ob Zugriffsschutz, Token oder Deployment-Konzept verbessert werden.
- Neue Apps-Script-Deployments sollten möglichst vermieden werden; stattdessen sollte ein bestehendes Deployment aktualisiert werden, damit die URL stabil bleibt.

### Datenmodell ist eng mit Google Sheets gekoppelt

Das Google Sheet ist aktuell die Datenbank. Deshalb müssen Spaltennamen, Tabellenstruktur und Codeänderungen eng abgestimmt werden.

Regel:

- Keine Änderung an Sheet-Strukturen ohne Anpassung von `DATA_MODEL.md`.
- Keine Codeänderung an Feldnamen ohne Prüfung gegen das Datenmodell.

### Zählerstände benötigen Sonderlogik

Ein niedrigerer neuer Zählerstand ist nicht automatisch falsch.

Mögliche legitime Fälle:

- Erstablesung
- Zählerwechsel
- 4-stelliger oder 5-stelliger Zählerüberlauf
- historischer / ersetzter Zähler

Deshalb soll die spätere Plausibilitätsprüfung zwischen `OK`, `Warnung` und `Fehler` unterscheiden.

## Nächste sinnvolle Arbeitspakete

### 1. Testbasis stabilisieren

- `tests/test-runner.html` entfernen, solange es nicht aktiv genutzt wird
- `tests/smoke.test.js` anlegen
- GitHub Actions grün bekommen

### 2. Apps-Script-Basisstand versionieren

- aktuellen produktiven Apps-Script-Code nach `apps-script/Code.gs` kopieren
- Diff prüfen
- committen

### 3. Plausibilitätsprüfung vorbereiten

- `validation-service.js` anlegen
- Tests für Zählerstände schreiben
- Logik zunächst unabhängig von UI und Backend testen

Geplante Testfälle:

- Erstablesung
- normal steigender Zählerstand
- niedrigerer Wert ohne Sonderfall
- 4-stelliger Überlauf
- 5-stelliger Überlauf
- Zählerwechsel
- unrealistisch hoher Verbrauch

## Review-Checkliste vor Pull Request

- Läuft `npm test` lokal?
- Sind alle Änderungen im Diff nachvollziehbar?
- Wurde keine bestehende Funktion ohne Grund entfernt?
- Wurde `DATA_MODEL.md` angepasst, falls Datenstrukturen geändert wurden?
- Wurde `PROJECT_STATE.md` angepasst, falls sich Projektstand oder Entscheidungen geändert haben?
- Sind echte personenbezogene Daten aus dem Repository herausgehalten?
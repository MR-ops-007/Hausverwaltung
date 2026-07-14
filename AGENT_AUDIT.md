# AGENT_AUDIT - Hausverwaltung

## Zweck dieses Dokuments

Dieses Dokument dient als Bestandsaufnahme und Regelwerk für die Arbeit mit KI-Assistenten, Coding Agents und Code Reviews.

Ziel ist, dass Änderungen nachvollziehbar, klein und prüfbar bleiben. Bereits funktionierende Funktionen sollen nicht durch unkontrollierte Refactorings oder automatische Änderungen verloren gehen.

---

## Grundregeln für KI-/Agentenarbeit

- Keine direkten Änderungen auf `main`.
- Jede Änderung erfolgt in einem eigenen Branch.
- Änderungen müssen per Git-Diff geprüft werden.
- Vor Pull Requests soll lokal `npm test` ausgeführt werden.
- Bestehende Funktionalität darf nicht ohne ausdrücklichen Grund entfernt werden.
- Keine großen Refactorings zusammen mit Feature-Änderungen.
- Keine Umbenennungen von Dateien, Funktionen oder Datenfeldern ohne dokumentierten Grund.
- Datenmodelländerungen müssen in `DATA_MODEL.md` dokumentiert werden.
- Relevante Projektentscheidungen müssen in `PROJECT_STATE.md` dokumentiert werden.
- Tests sollen vor oder zusammen mit Feature-Erweiterungen ergänzt werden.
- Doku-Dateien sollen am Ende jedes Branches auf Aktualität geprüft werden.
- Bei Codeänderungen sollen vollständige Dateien als Kopiervorlage bevorzugt werden, nicht einzelne verstreute Schnipsel.

---

## Aktueller technischer Stand

### Frontend

- Vanilla JavaScript
- HTML
- CSS

### Backend

- Google Apps Script
- Google Sheets als Datenbank
- Apps Script wird zunächst manuell unter `apps-script/Code.gs` versioniert
- `clasp` wird später optional geprüft

### Tests

- Vitest ist eingerichtet.
- GitHub Actions führt `npm test` bei Pull Requests und Pushes auf `main` aus.
- `tests/smoke.test.js` stellt sicher, dass die Testumgebung grundsätzlich läuft.
- `tests/validation-service.test.js` testet die isolierte Zähler-Plausibilitätslogik.
- `validation-service.js` enthält die Prüf-Logik für Zählerstände.

---

## Wichtige Projektdateien

| Datei / Ordner | Bedeutung |
| :--- | :--- |
| `README.md` | Überblick für Menschen |
| `PROJECT_STATE.md` | Aktueller Projektstand, nächste Schritte und Historie |
| `DATA_MODEL.md` | Referenz für das fachliche Datenmodell |
| `AGENT_AUDIT.md` | Leitplanken für KI-/Agentenarbeit |
| `apps-script/Code.gs` | Geplante manuell versionierte Kopie des Google Apps Script Backends |
| `validation-service.js` | Isolierte Plausibilitätsprüfung für Zählerstände |
| `tests/` | Automatisierte Tests |
| `config.js` | Konfiguration, aktuell inklusive Apps-Script-URL |
| `ui-service.js` | UI-Logik inklusive Zählererfassung |

---

## Bekannte Risiken

### Google Apps Script ist noch nicht automatisch synchronisiert

Der produktive Apps-Script-Code liegt weiterhin im Google Apps Script Editor. Das Repository soll zunächst eine manuell gepflegte Kopie enthalten.

Regel:

1. Geplante Änderungen lokal in `apps-script/Code.gs` nachvollziehbar machen.
2. Diff prüfen.
3. Änderung im Apps Script Editor testen.
4. Erst nach erfolgreichem Test committen.

### Apps-Script-Web-App-URL ist öffentlich sichtbar

Die Web-App-URL steht aktuell in `config.js`. Für den Entwicklungsstand ist das akzeptiert.

Zu beachten:

- Das Backend muss serverseitig robust gegen unerwünschte Schreibzugriffe sein.
- Langfristig sollte Zugriffsschutz, Token oder Deployment-Konzept geprüft werden.
- Neue Apps-Script-Deployments sollten möglichst vermieden werden.
- Stattdessen sollte ein bestehendes Deployment aktualisiert werden, damit die URL stabil bleibt.

### Datenmodell ist eng mit Google Sheets gekoppelt

Das Google Sheet ist aktuell die Datenbank. Deshalb müssen Spaltennamen, Tabellenstruktur und Codeänderungen eng abgestimmt werden.

Regel:

- Keine Änderung an Sheet-Strukturen ohne Anpassung von `DATA_MODEL.md`.
- Keine Codeänderung an Feldnamen ohne Prüfung gegen das Datenmodell.
- Testdaten im Repository dürfen keine echten personenbezogenen Daten enthalten.

### Zählerstände benötigen Sonderlogik

Ein niedrigerer neuer Zählerstand ist nicht automatisch falsch.

Mögliche legitime Fälle:

- Erstablesung
- Zählerwechsel
- 4-stelliger oder 5-stelliger Zählerüberlauf
- historischer oder ersetzter Zähler

Deshalb unterscheidet die Plausibilitätsprüfung zwischen `OK`, `Warnung` und `Fehler`.

### UI-Prüfung ersetzt keine Backend-Prüfung

Die aktuelle Plausibilitätsprüfung läuft im Frontend.

Das verbessert die Bedienung, ersetzt aber keine spätere Backend-Validierung.

Zu beachten:

- Das Frontend kann manipuliert werden.
- Kritische Schreiblogik sollte langfristig auch im Apps Script abgesichert werden.
- Warnungen werden aktuell nicht zusätzlich im Backend gespeichert.

---

## Erledigte Arbeitspakete

### Testbasis stabilisiert

- `tests/test-runner.html` entfernt
- `tests/smoke.test.js` angelegt
- GitHub Actions grün bekommen
- `package-lock.json` ergänzt
- `.gitignore` ergänzt

### Plausibilitätsprüfung vorbereitet

- `validation-service.js` angelegt
- `tests/validation-service.test.js` angelegt
- Tests für zentrale Zählerstand-Sonderfälle erstellt

Getestete Fälle:

- Erstablesung
- normal steigender Zählerstand
- niedrigerer Wert ohne Sonderfall
- 4-stelliger Überlauf
- 5-stelliger Überlauf
- Zählerwechsel
- unrealistisch hoher Verbrauch
- ungültige Eingabe
- negativer neuer Wert
- deutsche Komma-Dezimalwerte

### Plausibilitätsprüfung in UI integriert

- `validation-service.js` wird im Browser über `window.validationService` bereitgestellt.
- `saveZaehler()` prüft Eingaben vor dem Speichern.
- Fehler blockieren die Speicherung.
- Warnungen können bewusst bestätigt werden.
- Zeitstempel werden als `DD.MM.YYYY HH:mm` gespeichert.
- Backend-Schreibstruktur bleibt unverändert.

### Verbrauchsdashboard erweitert

- Dashboard-Übersicht für Verbrauchszeilen, fehlende/offene Werte, Warnungen und berechnete Werte ergänzt.
- Datenqualitätsbereich nutzt die bestehenden Verbrauchs- und Audit-Views.
- Berechnete Werte und Bilanzwerte werden in der UI erkennbar markiert.
- Keine Backend-Änderung in diesem Arbeitspaket.

---

## Nächste sinnvolle Arbeitspakete

### 1. Apps-Script-Basisstand versionieren

Ziel:

- aktuellen produktiven Apps-Script-Code nach `apps-script/Code.gs` kopieren
- keine funktionale Änderung
- Diff prüfen
- committen und per Pull Request nach `main`

Vorgeschlagener Branch:

```text
chore/apps-script-baseline

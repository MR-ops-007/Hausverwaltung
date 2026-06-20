# PROJECT_STATE - Hausverwaltung

## Stand: 2026-06-20

`main` enthält aktuell eine stabile Basis mit:

- dokumentiertem Datenmodell
- eingerichteter Vitest-Testbasis
- isolierter Zähler-Plausibilitätsprüfung
- UI-Integration der Zähler-Plausibilitätsprüfung
- branchbasiertem Entwicklungsworkflow über Pull Requests

Dieses Dokument beschreibt den aktuellen Stand, die nächsten sinnvollen Arbeitspakete und die Historie wichtiger Entscheidungen.

---

## Aktueller Projektstand

Die App dient der Verwaltung von Immobilien, Einheiten, Mietverhältnissen, Zählerständen und perspektivisch Mieteingängen sowie Auswertungen.

Aktueller technischer Aufbau:

- Frontend: Vanilla JavaScript, HTML, CSS
- Backend: Google Apps Script
- Datenhaltung: Google Sheets
- Tests: Vitest
- Versionierung: GitHub
- Entwicklung: Branch-basiert über Pull Requests nach `main`

---

## Erreichte Meilensteine

### Projektstruktur und Dokumentation

Vorhandene zentrale Dateien:

- `README.md`
- `DATA_MODEL.md`
- `PROJECT_STATE.md`
- `AGENT_AUDIT.md`
- `.gitignore`
- `package.json`
- `package-lock.json`

Das Projekt ist damit für eine nachvollziehbare Weiterentwicklung in VS Code und GitHub vorbereitet.

### Testbasis

Die Testbasis ist eingerichtet.

Vorhanden:

- `tests/smoke.test.js`
- `tests/validation-service.test.js`

`npm test` führt `vitest run` aus.

GitHub Actions führt die Tests bei Pull Requests und Pushes auf `main` automatisch aus.

Der frühere leere `tests/test-runner.html` wurde entfernt.

### Zähler-Plausibilitätslogik

`validation-service.js` enthält eine isolierte Plausibilitätsprüfung für neue Zählerstände.

Getestete Fälle:

- Erstablesung
- normal steigender Zählerstand
- niedrigerer Wert ohne Erklärung
- 4-stelliger Überlauf
- 5-stelliger Überlauf
- Zählerwechsel
- unrealistisch hoher Verbrauch
- ungültige Eingaben
- negative Eingaben
- deutsche Komma-Dezimalwerte

### UI-Integration der Zähler-Plausibilität

Die Plausibilitätsprüfung ist in die Zählererfassung integriert.

Aktueller Stand:

- `validation-service.js` wird im Browser über `window.validationService` bereitgestellt.
- `ui-service.js` prüft neue Zählerstände vor dem Speichern.
- Fehlerhafte Eingaben blockieren die Speicherung.
- Plausibilitätswarnungen müssen bewusst bestätigt werden.
- Die UI nutzt robuste Zählerlabels über `bezeichnung`, `medium`, `typ` oder `zaehler_id`.
- Zeitstempel werden als `DD.MM.YYYY HH:mm` gespeichert.
- Es werden aktuell keine zusätzlichen Plausibilitätsfelder an das Backend gesendet.

---

## Datenmodell: Zähler-Plausibilität

Die Tabelle `Zaehler` enthält technische Stammdaten für die Plausibilitätsprüfung:

- `stellen`
- `ueberlauf_erlaubt`
- `max_plausibler_verbrauch`
- `aktiv`
- `ersetzt_durch_zaehler_id`
- `hinweis`

Wichtig: Ein niedrigerer neuer Zählerstand ist nicht automatisch falsch.

Mögliche legitime Fälle:

- Erstablesung
- Zählerwechsel
- 4-stelliger oder 5-stelliger Überlauf
- historischer oder ersetzter Zähler

Die UI soll daher zwischen `OK`, `Warnung` und `Fehler` unterscheiden.

---

## Google Apps Script Versionierung

Google Apps Script wird zunächst ohne `clasp` manuell versioniert.

Geplante Struktur:

```text
apps-script/
  Code.gs
  README.md
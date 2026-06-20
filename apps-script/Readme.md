# Apps Script Backend

Dieses Verzeichnis enthält die manuell versionierte Kopie des Google Apps Script Backends.

## Zweck

Das produktive Backend liegt weiterhin im Google Apps Script Editor.

Dieses Verzeichnis dient dazu, den Apps-Script-Code im GitHub-Repository nachvollziehbar versionieren und per Git-Diff prüfen zu können.

## Aktuelle Dateien

| Datei | Zweck |
| :--- | :--- |
| `Code.gs` | Manuell gepflegte Kopie des produktiven Google Apps Script Backends |
| `Readme.md` | Beschreibung des manuellen Versionierungsprozesses |

## Aktuelle Arbeitsregel

Vor Änderungen am produktiven Apps Script gilt:

1. Aktuellen Stand aus dem Google Apps Script Editor nach `apps-script/Code.gs` kopieren.
2. Änderung lokal in VS Code durchführen oder dort nachvollziehbar einfügen.
3. Git-Diff prüfen.
4. Änderung im Google Apps Script Editor testen.
5. Erst nach erfolgreichem Test committen.

## Wichtig

- `apps-script/Code.gs` ist die Review- und Versionsquelle.
- Das laufende Deployment liegt weiterhin im Google Apps Script Projekt.
- Änderungen im Google Apps Script Editor gelten erst dann als sauber dokumentiert, wenn sie auch in `apps-script/Code.gs` stehen.
- `clasp` wird später optional eingeführt.
- `appsscript.json` wird aktuell nicht manuell versioniert, solange keine bewussten Änderungen an Manifest, Scopes, Runtime oder Libraries erforderlich sind.

## Plausibilitätswarnungen

Die UI prüft Zählerstände bereits vor dem Speichern.

Aktuelle Entscheidung:

- Plausibilitätswarnungen werden nicht zusätzlich im Google Sheet gespeichert.
- `Zaehlerstaende` erhält aktuell keine zusätzlichen Warn- oder Bestätigungsfelder.
- Es gibt aktuell kein separates Log für bestätigte Warnungen.
- Eine Warnbestätigung wird aktuell nicht revisionssicher gespeichert.
- Ein Zählerwechsel wird fachlich über einen neuen Zähler dokumentiert, der den bisherigen Zähler ersetzt.

## Zählerwechsel

Ein Zählerwechsel wird über die Tabelle `Zaehler` abgebildet.

Vorgehen:

1. Alter Zähler wird auf `aktiv = FALSE` gesetzt.
2. Neuer Zähler wird als eigener Datensatz angelegt.
3. Beim alten Zähler kann `ersetzt_durch_zaehler_id` auf den neuen Zähler verweisen.
4. Besonderheiten werden im Feld `hinweis` dokumentiert.

Die eigentlichen Messwerte bleiben weiterhin in `Zaehlerstaende`.
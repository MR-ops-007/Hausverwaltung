# Apps Script Backend

Dieses Verzeichnis enthält die manuell versionierte Kopie des Google Apps Script Backends.

## Aktuelle Arbeitsregel

Vor dem ersten Änderungszyklus wird der aktuell produktive Stand aus dem Google Apps Script Editor vollständig nach `apps-script/Code.gs` kopiert und als Basisstand versioniert.

Danach gilt für Änderungen:

1. Der vollständige geplante Code-Stand wird nach `apps-script/Code.gs` kopiert bzw. dort bearbeitet.
2. Änderungen werden lokal per Git-Diff geprüft.
3. Änderungen werden anschließend im Google Apps Script Editor getestet.
4. Erst nach erfolgreichem Test wird committed.

## Wichtig

- `apps-script/Code.gs` ist die Review- und Versionsquelle.
- Das laufende Deployment liegt weiterhin im Google Apps Script Projekt.
- Änderungen im Google Apps Script Editor gelten erst dann als sauber dokumentiert, wenn sie auch in `apps-script/Code.gs` stehen.
- `clasp` wird später optional eingeführt.
- `appsscript.json` wird aktuell nicht manuell versioniert, solange keine bewussten Änderungen an Manifest, Scopes, Runtime oder Libraries erforderlich sind.
C
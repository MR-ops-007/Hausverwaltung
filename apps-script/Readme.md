# Apps Script Backend

Dieses Verzeichnis enthält die manuell versionierte Kopie des Google Apps Script Backends.

Aktuelle Arbeitsregel:
1. Der vollständige Code wird anschließend nach `apps-script/Code.gs` kopiert.
2. Änderungen werden per Git-Diff geprüft.
3. Änderungen werden im Google Apps Script Editor getestet.
4. Erst danach wird committed.

Wichtig:
- `apps-script/Code.gs` ist die Review- und Versionsquelle.
- Das laufende Deployment liegt weiterhin im Google Apps Script Projekt.
- clasp wird später optional eingeführt.
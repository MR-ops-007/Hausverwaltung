# Apps Script Backend

Dieses Verzeichnis enthält die versionierte Kopie des Google Apps Script Backends.

## Versionierung

Die aktuelle Backend-Version steht im Kopf von `Code.gs` und zusätzlich in der Konstante `BACKEND_VERSION`.

Aktueller Stand:

```text
4.4.4
```

Regel:

- Jede fachliche oder technische Änderung am Apps-Script-Backend erhöht die Version.
- Patch-Version (`x.y.Z`) für kleine Korrekturen ohne neues Verhalten.
- Minor-Version (`x.Y.0`) für neues Verhalten, Datenmodelländerungen oder neue Hilfsfunktionen.
- Die Tests prüfen die erwartete `BACKEND_VERSION`, damit vergessene Versionsupdates auffallen.
- Version `4.3.1` repariert das zeitzonenstabile Parsing von JavaScript-Date-Strings für generierte `stand_id`-Zeitstempel.
- Version `4.4.0` ergänzt eine Preview-/Apply-Migration für Bestands-Zählerstände.
- Version `4.4.1` ergänzt ein Report-Sheet für die Migrationsanalyse.
- Version `4.4.2` lernt eindeutige `zaehler_id`/`einheit_id`-Mappings aus bereits vorbereiteten Bestandsdaten.
- Version `4.4.3` löst bekannte fehlerhafte Bestands-Mappings per Override auf.
- Version `4.4.4` ergänzt den virtuellen Warmwasser-Gesamtzähler für historische Werte.

## Zweck

Das produktive Backend liegt weiterhin im Google Apps Script Projekt. Die Synchronisierung über `clasp` ist vorbereitet.

Dieses Verzeichnis dient dazu, den Apps-Script-Code im GitHub-Repository nachvollziehbar versionieren, per Git-Diff prüfen und künftig per `clasp` synchronisieren zu können.

## Aktuelle Dateien

| Datei | Zweck |
| :--- | :--- |
| `Code.gs` | Versionierte Kopie des produktiven Google Apps Script Backends |
| `Migration.gs.gs` | Bestehende historische GAS-Migrationsfunktion aus dem produktiven Projekt |
| `StandIdMigration.gs` | Preview-/Apply-Migration für `objekt_id`, `einheit_id` und neue `stand_id` in Bestandsdaten |
| `appsscript.json` | Versioniertes Apps-Script-Manifest |
| `Readme.md` | Beschreibung des Versionierungs- und Sync-Prozesses |

## `clasp` Setup

`@google/clasp` ist als Dev-Dependency eingerichtet.
Die `clasp:*` npm-Skripte verwenden die Node-Version aus `.nvmrc`.

Einmalig pro lokaler Arbeitskopie:

1. `.clasp.example.json` im Repository-Root nach `.clasp.json` kopieren.
2. In `.clasp.json` die echte `scriptId` aus den Google-Apps-Script-Projekteinstellungen eintragen.
3. Bei Bedarf `nvm install` ausführen.
4. `npm run clasp:login` ausführen.
5. `npm run clasp:pull` ausführen.
6. Den Git-Diff prüfen, besonders `apps-script/appsscript.json`.

Wichtig: Vor dem ersten `npm run clasp:push` muss der Pull-Diff geprüft sein. Das verhindert, dass ein lokal angenommenes Manifest den produktiven GAS-Stand überschreibt.

Die echten `.clasp.json`- und `.clasprc.json`-Dateien werden nicht committed.

Hinweis: `Migration.gs.gs` wirkt doppelt benannt, weil die Datei im bestehenden GAS-Projekt bereits `Migration.gs` heißt und `clasp` für Script-Dateien lokal erneut `.gs` verwendet. Der Name bleibt so erhalten, damit ein späterer Push die produktive Datei nicht umbenennt oder löscht.

## Aktuelle Arbeitsregel

Vor Änderungen am produktiven Apps Script gilt:

1. Aktuellen Stand per `npm run clasp:pull` holen, sobald `.clasp.json` eingerichtet ist.
2. Änderung lokal in VS Code durchführen.
3. `npm test` ausführen.
4. Git-Diff prüfen.
5. Änderung per `npm run clasp:push` ins Apps-Script-Projekt übertragen.
6. Änderung im Google Apps Script Editor oder über das Web-App-Deployment testen.
7. Erst nach erfolgreichem Test committen.

## Wichtig

- `apps-script/Code.gs` ist die Review- und Versionsquelle.
- Das laufende Deployment liegt weiterhin im Google Apps Script Projekt.
- Änderungen im Google Apps Script Editor gelten erst dann als sauber dokumentiert, wenn sie auch per `clasp:pull` oder manuell in `apps-script/Code.gs` nachvollzogen sind.
- `appsscript.json` wird bewusst versioniert, weil Runtime, Zeitzone, Scopes und Libraries Teil des Backend-Verhaltens sind.

## Bestandsmigration `stand_id`

Die aktuelle Bestandsmigration liegt in `StandIdMigration.gs`.

Ziel:

```text
ST_{objekt_id}_{einheit_id}_{zaehler_id}_{YYYY-MM-DD HH:mm}
```

Die bestehenden 1.910 Produktivzeilen haben bereits alte `stand_id`-Werte im einheitlichen historischen Format. Für die neue Logik wird zuerst `einheit_id` aus bereits vorbereiteten Bestandszeilen gelernt. Falls es dafür kein eindeutiges Mapping gibt, wird deterministisch aus der vorhandenen `zaehler_id` abgeleitet. Dadurch hängt die Migration nicht von später veränderbaren Stammdaten ab.

Ablauf im Apps Script Editor:

1. `writeStandIdMigrationReport` ausführen.
2. Sheet `_migration_stand_id_report` prüfen.
3. Offene `Unresolved Rows`, `Mapping Conflicts` und `Duplicate New stand_id Rows` klären.
4. Optional `previewStandIdMigration` erneut ausführen.
5. Bei Bedarf `ensureHistoricalCalculatedMeters` ausführen, um den virtuellen Warmwasser-Gesamtzähler in `Zaehler` anzulegen.
6. Erst danach `applyStandIdMigration` ausführen.

`applyStandIdMigration` bricht automatisch ab, wenn unklare oder doppelte neue IDs gefunden werden.

Der virtuelle Zähler `Z_WARMWASSER_WW_GESAMT_BERECHNET` ist als `berechnet = TRUE` und `erfassbar = FALSE` definiert. Als `einbauort` wird `berechneter Wert, kein Zaehler` verwendet.

## Plausibilitätswarnungen

Die UI prüft Zählerstände bereits vor dem Speichern.

Aktuelle Entscheidung:

- Plausibilitätswarnungen werden nicht zusätzlich im Google Sheet gespeichert.
- `Zaehlerstaende` erhält aktuell keine zusätzlichen Warn- oder Bestätigungsfelder.
- Es gibt aktuell kein separates Log für bestätigte Warnungen.
- Eine Warnbestätigung wird aktuell nicht revisionssicher gespeichert.
- Ein Zählerwechsel wird fachlich über einen neuen Zähler dokumentiert, der den bisherigen Zähler ersetzt.

## `stand_id` für Zählerstände

Das Backend ergänzt bei Schreibzugriffen auf `Zaehlerstaende` automatisch eine fehlende oder leere `stand_id`.

Format:

```text
ST_{objekt_id}_{einheit_id}_{zaehler_id}_{YYYY-MM-DD HH:mm}
```

Beispiel:

```text
ST_Ra-HS-29_Ra-HS-29_WE_01_Z_STROM_KWH_WOHNUNG_1_2026-06-19 00:00
```

Vorhandene `stand_id`-Werte bleiben unverändert. Das verhindert, dass UI-Eingaben ohne ID in der Tabelle landen.

Wichtig: `zaehler_id` ist nicht global eindeutig. Die eindeutige fachliche Zähleridentität ist `objekt_id + einheit_id + zaehler_id`.

## Produktiver Testbereich

Für Tests im produktiven System gibt es einen dauerhaft getrennten Testbereich.

Die Stammdaten sind bereits in der Live-DB angelegt:

```text
objekt_id: TEST
bezeichnung: Test für Produktivsystem
einheit_id: TEST_WE_01
einheit_id: TEST_WE_02
einheit_id: TEST_Allgemein
zaehler_id: Z_STROM_KWH_WOHNUNG_1
zaehler_id: Z_KALTWASSER_KW_WOHNUNG_1
zaehler_id: Z_WARMWASSER_WW_WOHNUNG_1
zaehler_id: Z_STROM_KWH_WOHNUNG_2
zaehler_id: Z_KALTWASSER_KW_WOHNUNG_2
zaehler_id: Z_WARMWASSER_WW_WOHNUNG_2
zaehler_id: Z_STROM_KWH_ALLGEMEIN
zaehler_id: Z_KALTWASSER_KW_HAUPTZAEHLER
zaehler_id: Z_WARMWASSER_WW_ZULAUF
zaehler_id: Z_OEL_STAND_IN_CM
zaehler_id: Z_OEL_GETANKT_LITER
```

Der Testbereich dient dazu, UI- und Backend-Schreibvorgänge in der produktiven Umgebung zu prüfen, ohne echte Objekt-, Einheiten- oder Zählerwerte zu verfälschen.

Der Testbereich enthält:

- eine belegte Testwohnung: `TEST_WE_01`
- einen Leerstand: `TEST_WE_02`
- einen Allgemeinbereich: `TEST_Allgemein`

Wichtig: Der Testbereich verwendet teilweise dieselben Zähler-IDs wie echte Wohnungen, aber mit `objekt_id = TEST` und eigenen `einheit_id`s. Die UI muss letzte Vorwerte daher immer nach Zähler, Objekt und Einheit eingrenzen.

Falls die Test-Stammdaten in einer neuen Umgebung fehlen, können sie über Apps Script angelegt werden:

1. Aktuellen Backend-Stand per `npm run clasp:push` ins Apps-Script-Projekt übertragen.
2. Im Apps Script Editor die Funktion `ensureProdTestData` auswählen.
3. Funktion ausführen.
4. Danach in der App das Objekt `Test für Produktivsystem` auswählen und Testwerte dort erfassen.

Die Funktion legt die Stammdaten nur an, wenn sie noch nicht vorhanden sind. Bereits bestehende Test-Stammdaten werden nicht doppelt angelegt. Für Zähler prüft sie die zusammengesetzte Identität aus `objekt_id`, `einheit_id` und `zaehler_id`.

## Zählerwechsel

Ein Zählerwechsel wird über die Tabelle `Zaehler` abgebildet.

Vorgehen:

1. Alter Zähler wird auf `aktiv = FALSE` gesetzt.
2. Neuer Zähler wird als eigener Datensatz angelegt.
3. Beim alten Zähler kann `ersetzt_durch_zaehler_id` auf den neuen Zähler verweisen.
4. Besonderheiten werden im Feld `hinweis` dokumentiert.

Die eigentlichen Messwerte bleiben weiterhin in `Zaehlerstaende`.

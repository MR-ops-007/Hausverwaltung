# Apps Script Backend

Dieses Verzeichnis enthält die versionierte Kopie des Google Apps Script Backends.

## Versionierung

Die aktuelle Backend-Version steht im Kopf von `Code.gs` und zusätzlich in der Konstante `BACKEND_VERSION`.

Aktueller Stand:

```text
4.6.1
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
- Version `4.4.5` ergänzt einen separaten Duplikat-Report für die `stand_id`-Migration.
- Version `4.4.6` löst historische Doppelwerte als Zählerstand plus berechneten Verbrauch auf.
- Version `4.5.0` ergänzt die LOK-Zählerstruktur und Eingang-Stammdaten.
- Version `4.5.1` teilt LOK Wohnung 10 in `LOK_WE_10_A`, `LOK_WE_10_B` und `LOK_WE_10_S` und legt fehlende LOK-Einheiten an.
- Version `4.5.2` stellt LOK auf einheitgebundene `zaehler_id`s nach `Z_{einheit_id}_{medium}` um und deaktiviert alte Kurz-IDs.
- Version `4.6.0` ergänzt materialisierte Verbrauchsviews für Monats- und Jahreswerte.
- Version `4.6.1` ergänzt kanonische Zuordnung historischer Zählerstand-IDs und einen Audit-View für Verbrauchsdaten.

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
4. Bei vorhandenen Duplikaten `writeStandIdDuplicateReport` ausführen.
5. Sheet `_migration_duplicate_report` prüfen und Duplikate bewusst bereinigen oder behalten.
6. Optional `previewStandIdMigration` erneut ausführen.
7. Bei Bedarf `ensureHistoricalCalculatedMeters` ausführen, um den virtuellen Warmwasser-Gesamtzähler in `Zaehler` anzulegen.
8. Erst danach `applyStandIdMigration` ausführen.

`applyStandIdMigration` bricht automatisch ab, wenn unklare oder doppelte neue IDs gefunden werden.

Der Duplikat-Report arbeitet konservativ: Exakte Doppelungen werden als `CANDIDATE_DELETE_EXACT_DUPLICATE` markiert. Historische Doppelwerte mit genau zwei unterschiedlichen numerischen Werten werden als Zählerstand plus berechneter Verbrauch interpretiert: Der höhere Wert bleibt beim ursprünglichen Zähler, der niedrigere Wert erhält eine virtuelle `zaehler_id` mit Suffix `_VERBRAUCH_BERECHNET` und wird als `CONVERT_LOWER_VALUE_TO_CALCULATED_CONSUMPTION` markiert. Alle anderen abweichenden Werte erhalten `REVIEW_VALUE_DIFFERS`.

Der virtuelle Zähler `Z_WARMWASSER_WW_GESAMT_BERECHNET` ist als `berechnet = TRUE` und `erfassbar = FALSE` definiert. Als `einbauort` wird `berechneter Wert, kein Zaehler` verwendet.

## Verbrauchsviews

Version `4.6.0` ergänzt die Backend-Funktion `updateVerbrauchViews`.

Die Funktion berechnet aus `Zaehler`, `Zaehlerstaende`, `Einheiten` und `_view_aktive_mieter` zwei materialisierte Lesetabellen:

- `_view_verbrauch_monat`
- `_view_verbrauch_jahr`
- `_view_verbrauch_audit`

Die Monatsview ist die Detailbasis. Zwei aufeinanderfolgende Zählerstände bilden ein Verbrauchsintervall. Der Intervallverbrauch wird tagesgenau auf die überlappten Monate verteilt. Die Jahresview aggregiert anschließend aus der Monatsview.

Wichtige Fachregeln:

- Verbrauchswerte mit Warnstatus bleiben sichtbar und werden nicht ausgeblendet.
- Rückläufige Ölstände in `oel_stand_cm` werden als Verbrauch behandelt.
- Steigende Ölstände in `oel_stand_cm` werden als prüfpflichtiger Hinweis markiert.
- Rückläufige normale Zähler ohne zulässigen Überlauf werden als nicht berechenbar markiert.
- Überlaufwerte werden als Warnung markiert, bleiben aber für die fachliche Prüfung sichtbar.

Die Web-App kann die Views schlank über `?view=verbrauch` abrufen. Dadurch muss die UI die historische Intervalllogik nicht selbst nachbauen.

Der Audit-View prüft pro Zähler:

- Anzahl gefundener Zählerstände
- Anzahl berechenbarer Intervalle
- erwartete Monatssegmente
- tatsächlich erzeugte Monats- und Jahreszeilen
- historische Quell-Keys, falls Werte kanonisch zugeordnet wurden
- ungelöste Messwertgruppen, falls keine eindeutige Zuordnung möglich ist

Historische Schreibweisen wie `Z_STROM_HT_KWH_PRIVAT_HT` werden nur dann auf `Z_STROM_KWH_PRIVAT_HT` gemappt, wenn die Zuordnung im Objekt eindeutig ist. Gleiches gilt für alte oder fehlerhafte `einheit_id`s, wenn die `zaehler_id` im Objekt eindeutig zu einem Stammdaten-Zähler gehört.

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

Wichtig: Für neue Zähler ist `zaehler_id` eine einheitgebundene fachliche ID. Standard ist `Z_{einheit_id}_{medium}`. Bei mehreren Zählern mit gleichem `medium` in derselben Einheit wird ein Messpunkt ergänzt: `Z_{einheit_id}_{medium}_{messpunkt}`.

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

## LOK-Zählerstruktur

Für den Lokschuppen (`LOK`) gibt es die Wartungsfunktion `ensureLokStructureData`.

Sie ergänzt:

- `Objekte.eingange = A,B,C`
- `Einheiten.eingang` für `LOK_WE_01` bis `LOK_WE_09`, `LOK_WE_10_A`, `LOK_WE_10_B`, `LOK_WE_10_S`, `LOK_WE_11` bis `LOK_WE_15`, `LOK_GE_01` und `LOK_Allgemein`
- fehlende LOK-Einheiten, z. B. die aufgeteilten Einheiten `LOK_WE_10_A`, `LOK_WE_10_B` und `LOK_WE_10_S`
- fehlende Zähler mit einheitgebundenen IDs wie `Z_LOK_WE_10_A_strom_ht_kwh`, `Z_LOK_WE_10_A_kaltwasser_m3`, `Z_LOK_Allgemein_kaltwasser_m3_hauptzaehler` und `Z_LOK_Allgemein_oel_stand_cm`
- alte LOK-Kurz-IDs wie `STROM`, `KW`, `WW`, `STROM_ALLGEMEIN`, `KW_HAUPTZAEHLER`, `WW_ZULAUF`, `OEL_STAND_CM` und `OEL_GETANKT_L` werden deaktiviert und erhalten einen Verweis in `ersetzt_durch_zaehler_id`

Die Funktion ist idempotent. Bestehende Eingangswerte werden nicht überschrieben, fehlende Einheiten werden anhand von `einheit_id` ergänzt, fehlende Zähler anhand von `objekt_id + einheit_id + zaehler_id`.

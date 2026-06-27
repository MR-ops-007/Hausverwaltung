# Apps Script Backend

Dieses Verzeichnis enthält die manuell versionierte Kopie des Google Apps Script Backends.

## Versionierung

Die aktuelle Backend-Version steht im Kopf von `Code.gs` und zusätzlich in der Konstante `BACKEND_VERSION`.

Aktueller Stand:

```text
4.3.0
```

Regel:

- Jede fachliche oder technische Änderung am Apps-Script-Backend erhöht die Version.
- Patch-Version (`x.y.Z`) für kleine Korrekturen ohne neues Verhalten.
- Minor-Version (`x.Y.0`) für neues Verhalten, Datenmodelländerungen oder neue Hilfsfunktionen.
- Die Tests prüfen die erwartete `BACKEND_VERSION`, damit vergessene Versionsupdates auffallen.

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

1. Aktualisierten Inhalt aus `apps-script/Code.gs` in den Apps Script Editor übernehmen.
2. Speichern und bereitstellen.
3. Im Apps Script Editor die Funktion `ensureProdTestData` auswählen.
4. Funktion ausführen.
5. Danach in der App das Objekt `Test für Produktivsystem` auswählen und Testwerte dort erfassen.

Die Funktion legt die Stammdaten nur an, wenn sie noch nicht vorhanden sind. Bereits bestehende Test-Stammdaten werden nicht doppelt angelegt. Für Zähler prüft sie die zusammengesetzte Identität aus `objekt_id`, `einheit_id` und `zaehler_id`.

## Zählerwechsel

Ein Zählerwechsel wird über die Tabelle `Zaehler` abgebildet.

Vorgehen:

1. Alter Zähler wird auf `aktiv = FALSE` gesetzt.
2. Neuer Zähler wird als eigener Datensatz angelegt.
3. Beim alten Zähler kann `ersetzt_durch_zaehler_id` auf den neuen Zähler verweisen.
4. Besonderheiten werden im Feld `hinweis` dokumentiert.

Die eigentlichen Messwerte bleiben weiterhin in `Zaehlerstaende`.

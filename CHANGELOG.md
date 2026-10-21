# Changelog – Apps-Script-Backend

Einzige Stelle für **Versionen und Deploy-Status**. Die Version im Code steht in
`BACKEND_VERSION` (`apps-script/Code.gs`). Andere Dokumente verweisen hierher und
wiederholen keine Versionsnummern (Ausnahme: Mindestversionen wie „ab 4.7.0“).

## Regeln

- Jede fachliche oder technische Änderung am Backend erhöht die Version.
  Patch (`x.y.Z`): Korrekturen ohne neues Verhalten. Minor (`x.Y.0`): neues
  Verhalten, Datenmodelländerungen oder neue Hilfsfunktionen.
- Neueste Version steht oben. Überschrift: `## <Version> · <Datum> · <Status>`.
- Status:
  - `lokal` – nur in einem Branch, nicht gemergt/deployt
  - `main` – gemergt, Deploy noch nicht bestätigt
  - `produktiv` – im Apps-Script-Projekt deployt (genau eine Version)
  - `ersetzt` – war produktiv oder gemergt, inzwischen überholt
- **Beim Deploy:** neue Version auf `produktiv` setzen, die bisherige auf `ersetzt`.
  Der Test `apps-script.test.js` prüft das Format, die Reihenfolge und dass genau
  eine Version `produktiv` ist.
- Datumsangaben bis 4.6.4 stammen aus der Git-Historie (Commit, der die Version
  eingeführt hat), nicht aus dem Deployment.

## 4.7.0 · 2026-10-21 · lokal

Branch `codex/rental-contract-index`, noch nicht deployt.

- Vertragsfelder (Dokumentlinks, NK-Teilbeträge, Indexbasis) und Tabelle `Mietanpassungen`.
- Geschützter Vertrags-Schreibweg (`Contracts.gs`, `ContractService.js`) mit
  Standvergleich und Historie; `?view=vertrag_capabilities`.
- Vor der Nutzung nötig: `prepareContractSchema()` manuell ausführen und Script
  Property `CONTRACT_WRITE_TOKEN` setzen. Siehe `docs/contracts-index-plan.md`.

## 4.6.4 · 2026-07-15 · main

- `stand_id` für neue UI-Eingaben im kurzen Format `ST_{zaehler_id}_{YYYY-MM-DD HH:mm}`.
- Deploy-Status bitte bestätigen. Bei Deploy: 4.6.4 auf `produktiv`, 4.6.3 auf `ersetzt`.

## 4.6.3 · 2026-07-04 · produktiv

- Bilanzview `_view_verbrauch_bilanz_jahr` für fachlich berechnete Jahreskennzahlen.
- Status laut Angabe des Nutzers zum Editorstand.

## 4.6.2 · 2026-07-02 · ersetzt

- Preview-/Report-/Apply-Migration für kanonische Zählerstand-Identitäten.

## 4.6.1 · 2026-06-29 · ersetzt

- Verbrauchsviews ordnen eindeutige historische Zählerstand-IDs kanonischen Zähler-Stammdaten zu.
- Audit-View für fehlende, abweichende oder nicht auflösbare Verbrauchsdaten.

## 4.6.0 · 2026-06-29 · ersetzt

- Materialisierte Verbrauchsviews für Monats- und Jahreswerte (`updateVerbrauchViews`).

## 4.5.2 · 2026-06-28 · ersetzt

- LOK-`zaehler_id` einheitgebunden (`Z_{einheit_id}_{medium}`), alte Kurz-IDs deaktiviert.

## 4.5.1 · 2026-06-28 · ersetzt

- LOK Wohnung 10 in `LOK_WE_10_A`, `LOK_WE_10_B`, `LOK_WE_10_S` aufgeteilt;
  `ensureLokStructureData` legt fehlende LOK-Einheiten an.

## 4.5.0 · 2026-06-28 · ersetzt

- LOK-Zählerstruktur und Eingangs-Stammdaten.

## 4.4.6 · 2026-06-28 · ersetzt

- Historische Doppelwerte als Zählerstand plus berechneter Verbrauch aufgelöst.

## 4.4.5 · 2026-06-28 · ersetzt

- Duplikat-Report für die `stand_id`-Migration.

## 4.4.4 · 2026-06-27 · ersetzt

- Virtueller Warmwasser-Gesamtzähler für historische Werte.

## 4.4.3 · 2026-06-27 · ersetzt

- Bekannte fehlerhafte Bestands-Mappings per Override aufgelöst.

## 4.4.2 · 2026-06-27 · ersetzt

- Migration lernt eindeutige `zaehler_id`/`einheit_id`-Mappings aus `Zaehlerstaende`.

## 4.4.1 · 2026-06-27 · ersetzt

- Report-Sheet für die `stand_id`-Migrationsanalyse.

## 4.4.0 · 2026-06-27 · ersetzt

- Preview-/Apply-Migration für Bestands-Zählerstände.

## 4.3.1 · 2026-06-27 · ersetzt

- Zeitzonenstabiles Parsing von JavaScript-Date-Strings für `stand_id`.

## 4.3.0 · 2026-06-27 · ersetzt

Zusammengefasst mit 4.2 (wurden gemeinsam eingecheckt, nicht einzeln versioniert):

- `stand_id` nutzt zusammengesetzte Zähleridentität.
- Testbereich für Produktivtests erweitert; produktive Testzähler auf Wasser,
  Allgemein und Öl erweitert.
- `_view_aktive_mieter` nutzt `hauptperson_id` als Fallback.

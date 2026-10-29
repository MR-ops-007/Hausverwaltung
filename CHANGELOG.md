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
  Danach einen Git-Tag auf den Merge-Commit setzen:
  `git tag -a vX.Y.Z <commit> -m "Backend X.Y.Z: ..."` und `git push origin vX.Y.Z`.
  Der Test `apps-script.test.js` prüft das Format, die Reihenfolge und dass genau
  eine Version `produktiv` ist.
- Datumsangaben bis 4.6.4 stammen aus der Git-Historie (Commit, der die Version
  eingeführt hat), nicht aus dem Deployment.

## 4.8.2 · 2026-10-29 · lokal

Zeitstempel der Verbrauchsdaten korrigiert.

- `berechnet_am` enthält jetzt Datum und Uhrzeit im Format `YYYY-MM-DD HH:mm`.
- Die Web-App kann damit den tatsächlichen Berechnungszeitpunkt eindeutig anzeigen.

## 4.8.1 · 2026-10-29 · ersetzt

Geschützte Nutzeraktion zum Aktualisieren der materialisierten Verbrauchsviews vorbereitet.

- Neue Backend-Aktion `VERBRAUCH_VIEWS_AKTUALISIEREN`; sie läuft nur nach erfolgreicher
  `APP_ACCESS_KEY`-Prüfung und ruft `updateVerbrauchViews()` auf.
- Das Frontend bietet im Tab `Verbrauch` einen expliziten Aktualisieren-Button und lädt die
  Views nach erfolgreicher Neuberechnung neu.
- Die erfolgreiche Backend-Antwort enthält den Berechnungszeitpunkt; dieser wird neben dem
  Button als „Verbrauchsviews zuletzt aktualisiert“ angezeigt.
- Vor dem produktiven Apps-Script-Deploy bleibt 4.8.0 die produktive Version.

## 4.8.0 · 2026-10-29 · produktiv

Zugriffsschutz produktiv bereitgestellt. Ablauf und Rollback: `docs/access-control.md`.

- Script Property `APP_ACCESS_KEY` schützt Lesen und Schreiben (Zähler, Zahlungen, Verträge).
- Lesen per POST (`typ: LESEN`); GET liefert mit gesetztem Schlüssel keine Daten mehr.
- Schreibtypen per Erlaubnisliste; unbekannte Typen schreiben nichts mehr (vorher landete jede
  unbekannte Anfrage als Zeile in `Zaehlerstaende`).
- Ohne gesetzten Schlüssel gilt der Übergangsmodus (Verhalten wie 4.7.0); das Frontend warnt dann.
- Passend dazu im Frontend (eigener PR, erst nach dem Backend einspielen): Eingabedialog für den
  Schlüssel, Lesen per POST, Offline-Queue verliert keine abgelehnten Einträge mehr.
- Produktiv geprüft: alter GET-Lesezugriff liefert `UNAUTHORIZED`; Lesen und Schreiben über die
  geschützte Web-App funktionieren mit `APP_ACCESS_KEY`.

## 4.7.0 · 2026-10-21 · ersetzt

Deployt am 2026-10-22 (PR #16), zusammen mit 4.6.4. Git-Tag `v4.7.0` (Commit `c670676`). Schema vorbereitet,
`CONTRACT_WRITE_TOKEN` gesetzt, Speichern und Überschreiben von Vertragsdaten
im Produktivsystem geprüft.

- Vertragsfelder (Dokumentlinks, NK-Teilbeträge, Indexbasis) und Tabelle `Mietanpassungen`.
- Geschützter Vertrags-Schreibweg (`Contracts.gs`, `ContractService.js`) mit
  Standvergleich und Historie; `?view=vertrag_capabilities`.
- Vor der Nutzung nötig: `prepareContractSchema()` manuell ausführen und Script
  Property `CONTRACT_WRITE_TOKEN` setzen. Siehe `docs/contracts-index-plan.md`.

## 4.6.4 · 2026-07-15 · ersetzt

- `stand_id` für neue UI-Eingaben im kurzen Format `ST_{zaehler_id}_{YYYY-MM-DD HH:mm}`.
- Wurde nicht einzeln deployt, sondern ging am 2026-10-22 zusammen mit 4.7.0 live.
  Ältere `stand_id`s behalten das lange Format.

## 4.6.3 · 2026-07-04 · ersetzt

- Bilanzview `_view_verbrauch_bilanz_jahr` für fachlich berechnete Jahreskennzahlen.
- Produktiv bis 2026-10-22.

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

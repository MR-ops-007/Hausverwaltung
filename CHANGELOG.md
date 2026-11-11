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

## Frontend- und Betriebsmeilensteine ohne Backend-Versionserhöhung

- PR #35 (2026-11-10): GitHub-Pages-Auslieferung, getrennte TEST-/PROD-Profile,
  sichtbarer Umgebungsschalter und PWA-/Home-Screen-Grundlage.
- PR #36 (2026-11-10): Fehlende `environment-service.js` in das Pages-Artefakt aufgenommen.
- PR #37 (2026-11-11): Pages-Asset-Prüfung, JavaScript-Syntaxprüfung und `git diff --check`
  in CI ergänzt.

Diese Einträge ändern die Apps-Script-Version nicht. Die Backend-Version bleibt 4.8.5;
neue Backend-Logik benötigt weiterhin einen eigenen Versionseintrag nach den Regeln oben.

## 4.8.5 · 2026-11-10 · produktiv

Fail-closed-Zugriffsschutz und Geräteschlüssel mit Rollen. Details: `docs/access-control.md`.

- Ohne konfigurierte Schlüssel werden weder GET noch POST-Datenzugriffe zugelassen.
- `APP_ACCESS_KEYS_JSON` unterstützt mehrere benannte Geräte mit den Rollen `admin` und `erfassen`.
- `admin` darf Vertrags- und Indexänderungen ausführen; `erfassen` darf Zählerstände und Zahlungen erfassen.
- `APP_ACCESS_KEY` bleibt als einzelner Admin-Fallback für den kontrollierten Übergang kompatibel.
- PROD wurde als neue Version der bestehenden Bereitstellung aktualisiert (Deployment-Version 41); die URL blieb unverändert.
- TEST wurde als getrennte Bereitstellung aktualisiert (Deployment-Version 5) und verwendet eigene Script Properties und synthetische Daten.
- Anonyme GET-Aufrufe gegen TEST und PROD wurden nach dem Deploy mit `UNAUTHORIZED` geprüft.

## 4.8.4 · 2026-10-30 · ersetzt

Offline-Queue verlustfrei, Konflikte sichtbar, Korrekturen protokolliert. Details: `docs/offline-sync-und-korrekturen.md`.

- Zählerstände sind idempotent: gleiche `stand_id` mit gleichem Wert zählt als bereits gespeichert (Wiederholung aus der Offline-Queue erzeugt keine Dopplung).
- Gleiche `stand_id` mit anderem Wert ergibt `CONFLICT` (alter und neuer Wert in der Antwort), es wird nichts geschrieben.
- Korrekturfenster: Ein abweichender Wert bis 15 Minuten nach dem letzten Wert desselben Zählers ergibt ebenfalls `CONFLICT` (`art: NAHE_ABLESUNG`, mit Abstand in Minuten), damit ein Minutenwechsel beim Tippfehler die Korrektur nicht verhindert. `neueAblesung: true` speichert den Wert ausdrücklich als zusätzliche Ablesung.
- Überschreiben nur mit `ueberschreiben.grund` (mind. 3 Zeichen). Jede Überschreibung steht mit altem Wert, neuem Wert, Grund, Art und Zeitpunkt im Blatt `Zaehlerstand_Korrekturen`; das Blatt wird beim ersten Überschreiben automatisch angelegt (keine Schema-Vorbereitung nötig).
- Lock-Timeout wird als `LOCK_TIMEOUT` mit `transient: true` gemeldet, damit der Client den Eintrag erneut versucht statt ihn als abgelehnt zu markieren.
- Überschreiben protokolliert zuerst und ändert danach (keine Änderung ohne Protokoll).
- Neue Leseansicht `zaehlerstaende` für gezieltes Nachladen der Zählerstände.
- Frontend: Offline-Speicherung gilt nur als erfolgreich, wenn der Eintrag nachweislich im `localStorage` liegt (sonst Fehler `QUEUE_WRITE_FAILED`). Nur `status: success` gilt als gespeichert; leere oder unklare Antworten führen zum sicheren Wiederholen statt zu einer Erfolgsmeldung.
- Frontend: Zeitlimit für Abrufe, begrenzte automatische Wiederholung, zusätzliche Auslöser (Zurückkehren zur App, Button auch bei „offline“). Die Queue wird beim Laden vor dem Lesen gesendet.
- Frontend: Nur bestätigte Werte stehen im Datenbestand; nach dem Speichern und Synchronisieren werden die Zählerstände aus der Datenbank nachgeladen. Abgelehnte Einträge werden nie von selbst erneut gesendet.
- Frontend: Zeitgesteuerte Wiederholungen und die Rückkehr zur App senden unabhängig von `navigator.onLine` (weiterhin begrenzt, kein Dauer-Polling).
- Frontend: Bei Eingaben mit mehreren Zählerständen markiert die Anzeige die Konflikte, und die Dialoge zum Überschreiben, Speichern als neue Ablesung und Verwerfen nennen die betroffenen Zählerstände und deren Anzahl.
- Frontend: Eine beschädigte Offline-Queue wird nicht als leer behandelt und nicht überschrieben. Sie wird dauerhaft angezeigt; „Sichern und zurücksetzen“ legt eine geprüfte Sicherung an (zuerst alle sichern, dann alle Originale entfernen; Teilfehler werden genau gemeldet). Speichern meldet `QUEUE_CORRUPT`.
- Reihenfolge beim Einspielen: zuerst Backend 4.8.4, dann das Frontend. Ein älteres Frontend läuft mit 4.8.4 weiter (Konflikte erscheinen dort als Fehlermeldung).

## 4.8.3 · 2026-10-29 · ersetzt

Zeitzone der Verbrauchszeitpunkte korrigiert.

- `berechnet_am` wird explizit in `Europe/Berlin` formatiert.
- Sommer- und Winterzeit werden automatisch korrekt berücksichtigt.
- Die Anzeige bleibt für Nutzer bei `DD.MM.YYYY HH:MM` ohne Serverzeit- oder UTC-Verschiebung.

## 4.8.2 · 2026-10-29 · ersetzt

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

## 4.8.0 · 2026-10-29 · ersetzt

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

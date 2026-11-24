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
  - `test` – in der TEST-Bereitstellung veröffentlicht, PROD bleibt unverändert
  - `produktiv` – im Apps-Script-Projekt deployt (genau eine Version)
  - `ersetzt` – war produktiv oder gemergt, inzwischen überholt
- **Beim Deploy:** neue Version auf `produktiv` setzen, die bisherige auf `ersetzt`.
  Danach einen Git-Tag auf den Merge-Commit setzen:
  `git tag -a vX.Y.Z <commit> -m "Backend X.Y.Z: ..."` und `git push origin vX.Y.Z`.
  Der Test `apps-script.test.js` prüft das Format, die Reihenfolge und dass genau
  eine Version `produktiv` ist.
- Datumsangaben bis 4.6.4 stammen aus der Git-Historie (Commit, der die Version
  eingeführt hat), nicht aus dem Deployment.
- Verbindlich ist die Release-Regel in `docs/betrieb.md` (Deployment-Checkliste).
- Ablauf bis zur Neuordnung des Release-Ablaufs (Roadmap-Paket 2): Ein TEST-Deploy zur
  Abnahme darf aus dem PR-Stand vor dem Merge erfolgen und wird im selben PR in der
  Deployment-Historie protokolliert. PROD wird ausschließlich aus `main` nach dem Merge und
  nach ausdrücklicher Freigabe bereitgestellt; dieser Eintrag folgt im nächsten ohnehin
  anstehenden PR, ein eigener Doku-PR ist nicht nötig. Bis dahin ist
  `npm run clasp:prod:status` bzw. die Deployment-Liste in Apps Script die Prüfquelle.

## Deployment-Historie

Neueste zuerst. Die Tabelle gibt wieder, was in den Versionseinträgen dokumentiert ist;
sie wurde bei der Doku-Bereinigung am 2026-11-23 **nicht** per `clasp` gegen Apps Script
verifiziert. Ausnahme: Zeilen mit dem Vermerk „per `clasp` verifiziert“. Zwischenversionen wurden teils nicht einzeln bereitgestellt (siehe jeweiliger
Eintrag).
Alle Deployments aktualisieren die bestehenden Bereitstellungen; die URLs bleiben gleich.

| Datum | Version | Umgebung | Deployment-Version | Hinweis |
| --- | --- | --- | --- | --- |
| zwischen 2026-11-20 und 2026-11-24 | 4.8.16 | TEST | `@10` | **am 2026-11-24 per `clasp` verifiziert:** Code bytegleich mit `main` (`b338bd8`); Deploy war nicht protokolliert; ob `prepareContractSchema()` lief, ist vor der Abnahme zu prüfen |
| 2026-11-18 | 4.8.14 | PROD | `@44` | **am 2026-11-24 per `clasp` verifiziert:** aktueller PROD-Stand, Code bytegleich mit `main` nach PR #48 (`f41bcd4`); Rollback-Stand 4.8.13 (`@43` laut Eintrag, nicht geprüft) |
| 2026-11-18 | 4.8.14 | TEST | `@9` | letzter dokumentierter TEST-Deploy; TEST-Abnahme mit 25 Checks |
| 2026-11-17 | 4.8.13 | PROD | `@43` | Schema und Tagestrigger eingerichtet |
| 2026-11-17 | 4.8.13 | TEST | `@8` | Schema und Tagestrigger eingerichtet |
| 2026-11-14 | 4.8.12 | PROD | `@42` | nach PR #39; Schreibtest nur im Objekt `TEST` |
| 2026-11-13 | 4.8.12 | TEST | nicht dokumentiert | fachliche TEST-Abnahme |
| 2026-11-12 | 4.8.11 | TEST | nicht dokumentiert | nur TEST |
| 2026-11-10 | 4.8.5 | PROD | `@41` | fail-closed Zugriff, Geräteschlüssel |
| 2026-11-10 | 4.8.5 | TEST | `@5` | getrennte TEST-Bereitstellung |
| 2026-10-29 | 4.8.0 | PROD | nicht dokumentiert | Zugriffsschutz |
| 2026-10-22 | 4.7.0 | PROD | nicht dokumentiert | zusammen mit 4.6.4; Tag `v4.7.0` |

Verifikation am 2026-11-24 (nur lesend per `clasp`): Beide Projekte haben je eine
Web-App-Bereitstellung neben `@HEAD`; PROD steht auf Version 44 (4.8.14), TEST auf Version 10
(4.8.16). Release-Tags für 4.8.13 und 4.8.14 werden in Roadmap-Paket 1c gesetzt.

## 4.8.16 · 2026-11-20 · main

P6.6d erweitert die zentrale Mieterhöhungsprüfung um drei getrennte Termine:
interne Wiedervorlage, frühestes Erhöhungsverlangen und früheste angenommene
Wirksamkeit. Für Wohnraum werden Kappungsgrenze und Vergleichsmiete getrennt
angezeigt; Objekte können zeitbezogene Kappungsgrenzen konfigurieren, wobei
20 % nur als ausdrücklich gekennzeichneter Standardwert verwendet werden.
Für normale Mieterhöhungen wird die früheste Wirksamkeit ab dem dritten
Kalendermonat nach dem Verlangen dargestellt; die Indexmiete bleibt beim
übernächsten Monat.
Gewerbeverträge erhalten eine eigene, standardmäßig fünfjährige Prüfregel.
Erhöhungstypen und fehlende Stammdaten werden nicht mehr stillschweigend
vereinheitlicht. Der Prüfabschluss unterstützt eine optionale Notiz und eine
individuelle Wiedervorlage, die in die Signatur der Prüfung einfließt.
Gemergt mit PR #54. Für 4.8.16 müssen `prepareContractSchema()` und danach eine neue
Backend-Version bereitgestellt werden; die zusätzlichen Regelspalten werden im Blatt
`Objekte` angelegt. TEST- und PROD-Bereitstellung stehen aus.

## 4.8.15 · 2026-11-20 · main

P6.6c: Prüfabschlüsse für Mieterhöhungen werden im eigenen Backend-Blatt
`MieterhöhungsPrüfungen` statt nur im Browser gespeichert. Der Status enthält die
aktuelle Erinnerungs-Signatur, den erfassenden Geräte-Akteur, Abschlussdatum und eine
Wiedervorlage zwölf Monate später. Gemergt mit PR #53; für 4.8.15 muss
`prepareContractSchema()` erneut ausgeführt und das neue Blatt angelegt werden. Nicht
einzeln bereitgestellt; wird mit 4.8.16 ausgerollt.

## Frontend- und Betriebsmeilensteine ohne Backend-Versionserhöhung

- PR #35 (2026-11-10): GitHub-Pages-Auslieferung, getrennte TEST-/PROD-Profile,
  sichtbarer Umgebungsschalter und PWA-/Home-Screen-Grundlage.
- PR #36 (2026-11-10): Fehlende `environment-service.js` in das Pages-Artefakt aufgenommen.
- PR #37 (2026-11-11): Pages-Asset-Prüfung, JavaScript-Syntaxprüfung und `git diff --check`
  in CI ergänzt.
- P6.1 (2026-11-14, PR #41, in `main`): weiche Dublettenwarnung vor manueller
  und CSV-Zahlungsübernahme. Keine Backend- oder Schemaänderung; der PROD-Test
  beschränkte Schreibvorgänge auf das isolierte Objekt `TEST`.
- P6.3 (2026-11-15, PR #43, in `main`): historische
  monatliche Sollbeträge werden aus den dokumentierten `Mietanpassungen`-Snapshots
  abgeleitet und in Monatsstatus, Zahlungseingangsdialog und Überzahlungsverteilung
  verwendet. Keine Backend- oder Schemaänderung; ein Apps-Script-Deployment ist nicht
  erforderlich.
- PR #48 (2026-11-19): Frontend-Teil von P6.2 (gemeinsame Zahlungsregeln) und
  PROD-Zahlungsbaseline; das zugehörige Backend 4.8.14 war bereits bereitgestellt.
- PR #49 (2026-11-19): QA-Härtung der P6.2-Abnahme und der Baseline-Prüfung.
- PR #50 (2026-11-19): P6.6 interne Mieterhöhungs-Prüfübersicht (siehe Eintrag
  „Frontend P6.6“).
- PR #52 (2026-11-20): nur Doku-Nachtrag; P6.6c (synchronisierter Prüfstatus mit
  Wiedervorlage) als Folgepaket vorgemerkt, keine Funktionsänderung.
- P6.6b (2026-11-20, PR #51): Die Mieterhöhungsübersicht bündelt offene Prüfungen
  objektübergreifend, zeigt Informationsfälle eingeklappt und springt beim Öffnen
  eines Vertrags sichtbar zum Editor. Die zunächst lokale Arbeitsmarkierung wird
  mit P6.6c durch den geräteübergreifenden Backend-Status ersetzt.

Diese Einträge ändern die Apps-Script-Version nicht. Welche Version bereitgestellt ist,
steht in der Deployment-Historie oben.

## Frontend P6.6 · 2026-11-19 · main

Interne Prüfübersicht für mögliche Mieterhöhungen. Die Berechnung liegt zentral in
`contractService.rentIncreaseReminder()` und zeigt je Vertrag die letzte dokumentierte
Anpassung, den frühesten internen Prüfungstermin, die Anpassungsart und einen Status.
Fehlende Indexbasis, fehlende Staffeltermine und unvollständige Historien werden als
`Prüfung erforderlich` sichtbar. Die Funktion schreibt keine Vertragsdaten und versendet
keine Benachrichtigungen. Ein Apps-Script-Deployment ist für dieses Paket nicht nötig;
der Stand benötigt kein Apps-Script-Deployment.

## 4.8.14 · 2026-11-18 · produktiv

P6.2: Gemeinsame Zahlungsregeln für Browser, Apps Script und den synthetischen Mock.

- `apps-script/PaymentRules.js` normalisiert Zahlungsarten, Beträge, fachliche Monate,
  Legacy-Zahlungen, explizites Guthaben und Storno-Metadaten an einer Stelle.
- Leere oder ungültige Beträge werden im echten Apps-Script-Schreibweg abgewiesen;
  deutsche Tausenderpunkte wie `1.250` werden als 1.250 EUR interpretiert. Beträge mit
  mehr als zwei relevanten Nachkommastellen werden nicht still gerundet. Ein bei einer
  Kaution mitgesendeter Mietmonat wird verworfen.
- Die Monatsstatusberechnung verwendet dieselbe Cent-Toleranz und dieselben Regeln für
  Kaution, Erstattung, Storno und Verspätung.
- `payment-ui.js`, `Code.gs` und `tools/mock-backend-server.mjs` verwenden die gemeinsame
  Quelle; der Apps-Script-Schreibweg bleibt idempotent und lock-/schema-geschützt.
- Lokal geprüft: 550 Tests in 21 Testdateien sowie Asset-Prüfung, Syntaxprüfung und
  `git diff --check` erfolgreich. Der Mock-Server wurde zusätzlich per HTTP mit Retry,
  ID-Konflikt und Storno-Metadaten geprüft.
- Die echte TEST-Abnahme lief am 2026-11-18 mit 25 grünen Checks auf TEST-Vertrag 35;
  Persistenz nach Reload, Retry, Teil-/Überzahlung, Kaution, Erstattung, Storno und
  deutsche Betragsgrenzen sind geprüft. Die Testbuchungen wurden per Storno neutralisiert.
- Die bestehende PROD-Bereitstellung wurde am 2026-11-18 auf 4.8.14 aktualisiert;
  URL und Deployment-ID bleiben unverändert. Dieser Eintrag beschreibt das Backend;
  der Frontend-Teil von P6.2 wird erst mit dem Merge von PR #48 und dem anschließenden
  GitHub-Pages-Deploy produktiv. 4.8.13 ist der dokumentierte Rollback-Stand.
- PR #48 wurde am 2026-11-19 gemergt; der Frontend-Teil ist seitdem über GitHub Pages
  veröffentlicht.

## 4.8.13 · 2026-11-17 · ersetzt

P6.7b: Serverseitige Grundlage für einen sicheren Mieterwechsel.

- Ein Mieterwechsel schließt den bisherigen aktiven Vertrag am Tag vor dem neuen
  Mietbeginn, legt einen neuen Vertrag mit eigener `vertrag_id` an und verknüpft die
  neuen Vertragsparteien.
- Der Vorgang läuft als Admin-only-Schreibtyp `MIETERWECHSEL_ANLEGEN` im bestehenden
  Apps-Script-Lock, prüft den erwarteten Vertragsstand und validiert die Zeiträume vor
  dem ersten Schreiben.
- Wiederholungen mit derselben neuen Vertrags-ID werden idempotent bestätigt; abweichende
  Daten, Überschneidungen, unbekannte Personen oder fehlende Stammdaten werden abgewiesen.
- `aktiv` wird aus Start- und Enddatum abgeleitet, `kaution_ist` wird nicht aus dem Client
  übernommen und doppelte Vertragsparteien werden abgewiesen. Eine Neuvermietung ohne aktiven
  Vorgänger bleibt als eigenes Folgepaket abgegrenzt.
- Die aktive Mieter-View kann über `installDailyViewTrigger()` täglich aktualisiert werden.
  Der installierte Handler `refreshAktiveMieterViewDaily()` verwirft das Trigger-Ereignisobjekt
  und serialisiert den vollständigen Refresh mit dem Script-Lock.
  Ein append-only `MieterwechselProtokoll` hält den Fingerabdruck der normalisierten
  Anlageanfrage für belastbare Retries fest.
- Der Schreibweg enthält einen Rollback für Fehler beim Anhängen der neuen Vertrags- oder
  Parteienzeilen. Eine UI-Maske für das Anlegen des Wechsels ist bewusst ein Folgepaket.
- TEST läuft auf Deployment `@8`, PROD auf Deployment `@43`; die bestehenden URLs bleiben
  unverändert. `prepareContractSchema()` und `installDailyViewTrigger()` wurden in beiden
  Umgebungen ausgeführt und geprüft. Der Status wurde nach der PROD-Bereitstellung auf
  `produktiv` gesetzt.

## 4.8.12 · 2026-11-13 · ersetzt

Korrektur der fachlichen Mietmonate im Zahlungs-Schreibweg.

- Neue `mietmonat`-Werte werden im Apps Script nach dem Anhängen nochmals als Text
  im Format `YYYY-MM` geschrieben.
- Die UI interpretiert aus Google Sheets gelieferte ISO-Datumswerte in der Zeitzone
  `Europe/Berlin`, damit ein Monatswechsel um Mitternacht nicht falsch zugeordnet wird.
- Die bestehende TEST-Bereitstellung wurde aktualisiert; `vertrag_capabilities` liefert
  `payment_schema_ready: true`.
- Nach PR #39 wurde die bestehende PROD-Bereitstellung mit Apps Script 4.8.12 aktualisiert
  (Deployment-Version `@42`, unveränderte URL). Der PROD-Endpunkt wurde anschließend
  lesend geprüft; es wurde kein produktiver Zahlungseingang geschrieben.

## 4.8.11 · 2026-11-12 · ersetzt

P6-Hardening-Follow-up für historische Stornos und vorübergehende Netzfehler.

- Ein Storno einer historischen Zahlung ohne `mietmonat` und ohne Zahlungsgruppe erhält
  den fachlichen Monat aus dem ursprünglichen Eingangsdatum. Kautionen und bewusstes Guthaben
  bleiben ohne Mietmonat.
- Storno-Metadaten werden vor der Idempotenzprüfung normalisiert; derselbe Retry wird auch bei
  abweichenden Client-Metadaten als bereits vorhanden erkannt.
- Ein transienter Fehler beim Capability-Preflight blockiert den bestehenden Queue-fähigen
  Schreibweg nicht mehr.
- Die lokale UI-Anzeige ordnet ein Storno einer historischen Zahlung ohne `mietmonat` sofort
  dem effektiven Originalmonat zu; ein Reload ist dafür nicht mehr erforderlich.
- Für lokale TEST-Abnahmen kann ein ignoriertes `runtime-secrets.js` den TEST-Schlüssel
  bereitstellen; GitHub Pages übernimmt diese Datei nicht und PROD bleibt ohne lokalen Schlüssel.
- Die Version war in der bestehenden TEST-Bereitstellung veröffentlicht und wurde durch
  4.8.12 ersetzt.

## 4.8.10 · 2026-11-12 · ersetzt

P6-Hardening-Follow-up für wiederholbare Zahlungsaktionen.

- Storno-Metadaten werden im Backend aus der Originalzahlung übernommen, damit Mietmonat,
  Zahlungsgruppe und Gegenart nicht durch einen fehlerhaften Client abweichen.
- `mietmonat` wird auch im Frontend bei Google-Sheets-Datumswerten zu `YYYY-MM` normalisiert.
- Die Schema-Vorbereitung formatiert die gesamte vorhandene Spalte als Text, auch wenn das
  Blatt noch keine Datenzeile enthält.
- Zahlungsabsichten behalten ihre IDs bei einem fehlgeschlagenen Retry; Aufteilungen bleiben
  nach einem Fehler im Dialog erhalten.
- Capability-Abfragen werden kurzzeitig gecacht, damit ein vorübergehender Netzfehler nicht
  vorzeitig den Offline-Schreibweg verhindert.
- Die Version ist noch nicht in Apps Script bereitgestellt.

## 4.8.9 · 2026-11-12 · ersetzt

P6-Hardening für den Zahlungsweg.

- Historische Zahlungen mit leerem `mietmonat` bleiben dem Eingangsmonat zugeordnet;
  bewusstes Guthaben wird nur über eine vorhandene `zahlungsgruppe_id` erkannt.
- Stornos benötigen eine vorhandene Originalzahlung, denselben Vertrag und den exakt
  umgekehrten Betrag. Eine Originalzahlung kann nur einmal storniert werden.
- Zahlungsarten und Mietmonate werden serverseitig validiert und Mietmonate als
  `YYYY-MM` normalisiert.
- `vertrag_capabilities` meldet `payment_schema_ready` und fehlende Spalten, bevor die
  UI einen Zahlungs-Schreibvorgang startet.
- Die UI verwendet pro Nutzeraktion neue Zahlungs- und Gruppen-IDs; ein Storno bleibt
  über `Storno_<zahlung_id>` idempotent.
- Der lokale CSV-Import übernimmt den fachlichen Mietmonat aus `YYYY-MM` im
  Verwendungszweck oder schlägt den Eingangsmonat vor; vor der Übernahme bleibt er editierbar.
- Die Fristprüfung vergleicht Kalendertage statt Uhrzeiten; am Fälligkeitstag bleibt ein
  offener Monat bis zum Tageswechsel offen.
- Die Version ist noch nicht in Apps Script bereitgestellt.

## 4.8.8 · 2026-11-11 · ersetzt

Aufteilung von Überzahlungen auf Mietmonate.

- Der Zahlungsweg akzeptiert `zahlungsgruppe_id` als gemeinsame Kennung für mehrere
  append-only Teilbuchungen eines tatsächlichen Eingangs.
- Ein nicht zugeordneter Rest kann als Guthaben ohne `mietmonat` gespeichert werden.
- Die Version ist noch nicht in Apps Script bereitgestellt; die Spalte muss im Blatt
  `Zahlungen` vorhanden sein.

## 4.8.7 · 2026-11-11 · ersetzt

Vertragsspezifische Zahlungsfristen für die Mieteingangsansicht.

- `Vertraege` kann `zahlungsziel_typ` (`WERKTAG` oder `KALENDERTAG`) und
  `zahlungsziel_wert` speichern.
- Die bestehende Mieteingangslogik kann damit den 3. Werktag oder einen individuell
  vereinbarten Kalendertag auswerten; Wochenenden und bundesweite Feiertage werden bei
  Werktagen übersprungen.
- Die Version ist noch nicht in Apps Script bereitgestellt. Die beiden neuen Spalten
  werden ausschließlich über die explizite Schema-Vorbereitung ergänzt.

## 4.8.6 · 2026-11-11 · ersetzt

Manuelle Mieteingänge und der erste CSV-Import werden vorbereitet.

- Der Schreibweg `ZAHLUNG` ist über `zahlung_id` idempotent: dieselbe Buchung wird
  bestätigt, aber nicht doppelt angelegt; eine abweichende Wiederverwendung der ID
  wird als Konflikt abgewiesen.
- Stornos werden als negative append-only Gegenbuchungen mit eigener ID gespeichert.
- Der Frontend-Paketstand enthält die Monatsmatrix, Teilzahlungen, Überfälligkeit,
  Rückgängigmachen, fachliche Mietmonate und lokale CSV-Zuordnungsvorschläge.
- Kautionen werden separat gegen `kaution_soll` ausgewertet; Erstattungen sind negative
  Buchungen. Der keyfreie Mock enthält mehrere Entenhausen-Personas für die Abnahme.
- Diese Version ist noch nicht in Apps Script bereitgestellt. Vor dem Merge und Deploy
  laufen Backend- und UI-Regressionstests gegen Mock-Daten.

## 4.8.5 · 2026-11-10 · ersetzt

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

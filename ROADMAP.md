# Roadmap Hausverwaltung

Diese Liste ist die verbindliche Arbeitsübersicht für die nächsten Entwicklungspakete.
`PROJECT_STATE.md` beschreibt den aktuellen Systemstand, `CHANGELOG.md` die Releases.

**Stand: 2026-11-14**

## Arbeitsregeln

- Jedes Paket erhält einen eigenen Branch und einen eigenen Pull Request.
- Ein Paket ist erst abgeschlossen, wenn Code, automatisierte Tests, relevante Doku
  und bei UI-Arbeiten eine lokale visuelle Prüfung erledigt sind.
- Apps-Script-Deployments werden zusätzlich mit Backend-Version, Deployment-Stand,
  Rollback und manueller Verifikation dokumentiert.
- Ein neues Paket startet erst, wenn das vorherige Paket gemergt oder ausdrücklich
  als blockiert dokumentiert ist.
- Jedes Paket nennt Ziel, Scope, Abnahmekriterien und bewusste Nicht-Ziele.
- Schätzwerte wie Fortschreibungen, Jahresrest, Tankbilanz oder Restreichweite werden
  in der UI als Schätzung gekennzeichnet und nicht mit Messwerten vermischt.

## Erledigt auf `main`

Remote `origin/main` enthält aktuell PR #39 und den produktiven Backend-Stand 4.8.12.

| PR | Inhalt |
| --- | --- |
| #21 | Verbrauchsstatistik V2 mit Monats-/Jahresdiagrammen, Herleitungskennzeichnung und QA-Matrix |
| #22 | Monatszuordnung nach `Europe/Berlin` und zeitzonenfester Testlauf |
| #23 | Verbrauchsstatistik-Follow-ups: Jahresauswahl, Standard `Fläche`, Alias-Regressionen |
| #24 | Apps Script 4.8.4: Offline-Queue, idempotente `stand_id`, Konflikt-/Korrekturpfad |
| #25 | Historische Zählerstände mit gleichem Wert, zum Beispiel Leerstand `0`, werden gespeichert |
| #26 | Zentrale Überlaufklassifikation für Zählerstandsverlauf und Verbrauchsdiagramme |
| #27 | Sichtbarer Fehlerzustand bei fehlender zentraler Verbrauchsberechnung; Cleanup von `intervalDetails` |
| #28 | Heizölverbrauch mit Tankbilanz, Haupt-/Zusatztank und Literdarstellung |
| #29 | Speicherrückmeldung mit Busy-Zustand, Hausmeister-Stempel und idempotenter Erfolgsmeldung |
| #31 | Getrennte Laufzeitkonfiguration und dokumentierte TEST-Umgebung |
| #32 | Fail-closed-Zugriffsschutz, Geräteschlüssel und getrennte Rechte für TEST und PROD |
| #35 | GitHub-Pages-Bereitstellung, Umgebungsprofile und PWA/Home-Screen-Grundlage |
| #36 | Pages-Laufzeitdatei `environment-service.js` in das veröffentlichte Artefakt aufnehmen |
| #37 | Pages-Build- und CI-Prüfungen gegen fehlende Frontend-Assets härten |
| #38 | Dashboard-Datenqualität: fehlende, veraltete und dauerhafte Null-Ablesungen sichtbar machen |
| #39 | P6/P7 Mieteingänge, CSV-MVP, Backend-Hardening und fachliche TEST-Abnahme |

Der lokale Branch `main` muss nach einem Merge weiterhin mit `origin/main` synchronisiert
werden, bevor ein neues Feature darauf aufgebaut wird.

## Abgeschlossen in `main`

### Z0 Zählerüberlauf und Prüfhinweise

- Status: abgeschlossen in PR #26 und PR #27.
- Ziel: Intervallklassifikation ausschließlich über `calc-service.js`
  (`classifyReadingInterval`); zulässige Überläufe anhand von `stellen` und
  `ueberlauf_erlaubt` als Überlauf statt als rückläufigen Fehler darstellen.
- Darstellung: zulässiger Überlauf violett als einmaliges Ereignis, ungeklärter
  Rücklauf rot, zusätzlicher Backend-Prüfhinweis orange.
- QA-Snapshot `Ra-HS-29` (49 Zähler, 1.912 Rohwerte): 1.708 normale Intervalle, 2 zulässige
  Überläufe, 33 ungeklärte Rückläufe, 14 unplausibel hohe Rückgänge, 14 steigende
  Ölfüllstände. Die 33 ungeklärten und 14 unplausiblen Intervalle sind ein
  Datenbereinigungs-Kandidat.
- `intervalDetails` wurde entfernt. Fehlt `calcService`, zeigt die Diagrammansicht einen
  sichtbaren Fehlerzustand statt still leer zu bleiben.

### Z1 Zähler-Speichern-Feedback

- Status: abgeschlossen in PR #29. Die gemeinsame Prüfung mit dem Heizöl-Speicherablauf
  und die Regressionstests sind in `main` enthalten; aktuell 403 Tests grün.

### Z2 Heizöl-Verbrauch

- Status: abgeschlossen in PR #28; kein Apps-Script-Deployment erforderlich.
- Haupttank: 10.000 Liter; Zusatztank: 2.000 Liter, zunächst getrennt.
- Verbrauch aus sinkendem Füllstand in cm und Liter; bei vorhandenen kumulierten
  Tankfüllungen aus `oel_stand_l` gilt je Intervall:
  `Verbrauch = getankte Liter - (Stand_neu - Stand_alt) × Liter pro cm`.
- Unplausible Bilanzen und nicht rekonstruierbare Tankfüllungen werden als Prüfhinweis
  geführt und nicht still als Verbrauch verbucht.
- Messrauschen bis standardmäßig 1 cm ist konfigurierbar und verschiebt den Referenzstand
  nicht.
- Diagramm und Tabelle verwenden dieselbe Tankfüllungszuordnung; Haupt- und Zusatztank
  werden über Objekt, Einheit und Tankkennung getrennt.
- `totalLiters` summiert nur Tanks mit `in_verbrauch_auswertung = true`; die sichtbare
  Haus-Gesamtsumme ist ein separates Folgepaket.
- Keine kWh-Umrechnung, solange Heizmedium, Heizwert und beheizte Fläche nicht festgelegt
  sind.
- Validierung: Heizöl- und Diagrammlogik sind mit den aktuellen UI- und Backend-Regressionstests
  abgesichert. Die fachlichen Grenzen und die Arbeitshypothese `l/cm` stehen in
  `docs/heizoel-verbrauch.md`.
- Nicht-Ziel: keine geeichte Brennstoffabrechnung und keine automatische Rückschreibung
  in die Google-Sheets-Views.

Die Pakete Z0 bis Z2 sind damit abgeschlossen. Neue Arbeit startet wieder auf dem
aktuellen `main` und erhält einen eigenen Branch und PR.

## Priorisierte nächste Pakete

### P1 Sicherheit und Betrieb

Ziel: reale Daten schützen und Wiederherstellung beherrschbar machen.

- Repository privat stellen oder den verbleibenden öffentlichen Daten-/URL-Zugriff
  entfernen; produktive Backend-URL nicht im öffentlichen Frontend-Repository halten.
- `APP_ACCESS_KEY` produktiv prüfen, alte Apps-Script-Bereitstellungen archivieren bzw.
  deaktivieren und die alte URL nach einer Rotation testen.
- Backup des Google Sheets mit definierter Aufbewahrung und mindestens einen dokumentierten
  Restore-Test einrichten.
- Eine bereinigte Testdatei oder Testvorlage mit separatem Apps-Script-Projekt,
  Deployment und eigenen Script Properties einrichten; keine Vollkopie mit echten
  Personendaten als tägliche Testbasis verwenden.
- Apps-Script-Version, Deployment-Stand und manuellen Test gegen das echte Sheet in
  `CHANGELOG.md` dokumentieren.
- Korrekturprotokoll um Benutzer/Rolle erweitern, sobald mehr als ein Bediener vorgesehen
  ist. Für den aktuellen Einzelnutzer ist das kein Merge-Blocker.
- CI prüfen: `npm ci` und `npm test` müssen bei jedem Pull Request laufen; Node-Version
  kommt aus `.nvmrc`.
- Abnahme in `docs/betrieb.md` mit Datum, Ergebnis und Rollback-Hinweis festhalten.

### P1.1 Abgeschlossen: Zugriff, Laufzeitkonfiguration und Release-Betrieb

**PR:** #32

**Ziel:** Die produktive Arbeitsweise mit zwei Geräten ermöglichen, ohne Geheimnisse im
Repository zu hinterlegen oder bei fehlender Konfiguration versehentlich Daten zu öffnen.

**Scope:**

- öffentliche Repository-/Backend-Exposition prüfen und eine konkrete Zielentscheidung
  dokumentieren (Repository privat oder URL-/Konfigurationsbereinigung),
- `APP_ACCESS_KEY` durch fail-closed Zugriff und `APP_ACCESS_KEYS_JSON` mit den Rollen
  `admin` und `erfassen` ergänzen,
- Vertrags- und Indexänderungen auf `admin` beschränken; Zählerstände und Zahlungen für
  `erfassen` zulassen,
- alte Apps-Script-Bereitstellungen und URL-Rotation prüfen,
- `CHANGELOG.md` und eine neue oder bestehende Betriebsdokumentation mit Deployment-,
  Rollback- und Abnahmeschritten aktualisieren.

**Nicht-Ziele:** keine Mieteingangsmaske, kein Kontoauszug-Import, keine Änderung der
Verbrauchsberechnung, keine Migration von Mietern oder Zählerständen.

**Abnahmekriterien:**

- kein ungeschützter produktiver Lese-/Schreibweg bleibt unbeabsichtigt offen,
- ein Admin-Gerät kann Vertragsänderungen ausführen,
- ein Erfassungs-Gerät kann Zählerstände und Zahlungen schreiben, aber keine Verträge ändern,
- produktive GAS-Version und Bereitstellung sind eindeutig nachvollziehbar,
- `npm test`, CI und `git diff --check` bleiben grün,
- alle verbleibenden Risiken sind in `PROJECT_STATE.md` festgehalten.
- Test- und Produktionsumgebung lassen sich lokal über die ignorierte `runtime-config.js`
  eindeutig auswählen; die Vorlage liegt in `config.local.example.js`.

**Ergebnis:** Backend 4.8.5 ist in PROD und TEST als neue Version der bestehenden
Bereitstellungen veröffentlicht. PROD steht auf Deployment-Version 41, TEST auf
Deployment-Version 5; die URLs blieben unverändert. Anonyme GET-Aufrufe liefern
`UNAUTHORIZED`. Der Backup-/Restore-Test der Produktivdatei bleibt als eigener manueller
Betriebsschritt in P1.3 und wurde nicht automatisch ausgeführt.

### P1.2 Geräte-Einrichtung und produktiver Rollout

**Ziel:** Die App auf iPhone und iPad ohne wiederkehrende Anmeldung nutzbar machen.

#### P1.2a Umgebungsprofile und sichtbarer TEST/PROD-Switch

Dieses Teilpaket wird vor der Geräte-Einrichtung umgesetzt. Es beseitigt die bisherige
manuelle Umschaltung über eine einzelne `runtime-config.js`-Datei.

- Profile für TEST und PROD mit eindeutigem Apps-Script-Projekt, Deployment und API-Ziel.
- Sichtbare Leiste in der UI, zum Beispiel `TEST · Entenhausen` mit roter Kennzeichnung
  und `PRODUKTION` mit neutraler Kennzeichnung.
- Klickbarer Umschalter mit vollständigem Reload und Bestätigung vor dem Wechsel zu PROD.
- Getrennte lokale Schlüsselablage je Umgebung, damit ein TEST-Schlüssel nicht an PROD
  gesendet werden kann und umgekehrt.
- Anzeige der aktiven Umgebung und Backend-Version im laufenden System.
- Explizite Zielprüfung vor `clasp push`; ein PROD-Push benötigt eine zusätzliche
  Bestätigung.

**Abnahme P1.2a:** Die aktive Umgebung ist jederzeit sichtbar, ein Wechsel ist ohne
manuelles Editieren von URLs möglich, und automatisierte Tests verhindern eine
Verwechslung von TEST- und PROD-Ziel.

#### P1.2b Geräte-Einrichtung und produktiver Rollout

**Status:** Home-Screen-Grundlage umgesetzt; Geräte-Einrichtung und mobile Abnahme folgen.

- Einrichtungscode-Dialog für Backend-URL, Geräteschlüssel und Gerätebezeichnung ergänzen.
- Werte lokal speichern; keine Schlüssel in Repository, Pages-Build oder Logs.
- Admin- und Erfassungs-Gerät mit dem echten Backend testen.
- Auf iPhone und iPad den Workflow **„Zum Home-Bildschirm hinzufügen“** unterstützen.
- Web-App-Manifest, iOS-Metadaten und App-Icons ergänzen; der Start über das
  Home-Bildschirm-Icon öffnet die Anwendung als eigenständige Web-App mit sichtbarer
  TEST-/PROD-Kennzeichnung.
- Erst danach neue produktive Bereitstellung veröffentlichen und alte URL archivieren.

**Nicht-Ziele:** kein Google-Login, kein vollständiges Benutzerkonto, kein Service Worker.

**Abnahme:** Beide Geräte laden Daten, der Vater kann Zählerstände und Zahlungen erfassen,
Vertragsänderungen sind nur auf dem Admin-Gerät möglich; die App lässt sich über „Zum
Home-Bildschirm hinzufügen“ starten, zeigt die aktive Umgebung sichtbar an und benötigt
beim erneuten Öffnen keine Anmeldung.

### P1.3 Backup und Restore

**Ziel:** Wenige, brauchbare Sicherungen mit einem tatsächlich getesteten Restore.

- Wöchentlicher Trigger, nur bei geändertem Datenbestand.
- Höchstens drei automatische Kopien mit unterschiedlichem Alter; manuelle Release-/Migrations-
  kopien bleiben außerhalb der Rotation.
- Eigener, nur für den Product Owner freigegebener Drive-Ordner.
- Restore zunächst in eine separate Testdatei, mit Datum, Quelle, Ziel und Ergebnis dokumentieren.

**Nicht-Ziel:** tägliche Kopierflut oder automatische Wiederherstellung der Produktion.

### P1.4 Housekeeping und Qualitätssicherung

**Status:** abgeschlossen in PR #37.

- Der Pages-Build kopiert `environment-service.js`, das von `index.html` benötigt wird.
- `tools/check-frontend-assets.mjs` prüft im Quellbaum und im erzeugten Pages-Artefakt,
  dass alle lokalen Script- und Link-Assets aus `index.html` vorhanden sind.
- CI führt die Frontend-Asset-Prüfung und `git diff --check` zusätzlich zu `npm test` aus.
- Ein Regressionstest prüft, dass jedes statische Script aus `index.html` im Pages-Workflow
  berücksichtigt wird.
- Die offenen Folgepunkte `constantTimeEquals`, unescapte UI-Ausgaben, `Migration.gs.gs`
  und Dependabot bleiben separat und sind nicht Teil von PR #37.

- Doku-Drift, Versionsstände und alte Branches bereinigen.
- `constantTimeEquals` für Vertrags-Token verwenden und unescapte UI-Ausgaben entfernen.
- `Migration.gs.gs` und die Einmal-Migration erst anfassen, wenn der Deployment-Rollback geklärt ist.
- Dependabot separat aktivieren, ohne den Produktionsrollout daran zu koppeln.

### P2 Datenqualität bei der Erfassung

**Status:** abgeschlossen in PR #38.

- Auffällige Sprünge je Medium konfigurierbar warnen, aber niemals das Speichern blockieren.
- Zwei Werte am selben Tag oder innerhalb des Korrekturfensters als mögliche Korrektur
  behandeln und nicht fälschlich als Verbrauchssprung bewerten.
- Dashboard-Hinweis für Zähler ohne Ablesung seit X Tagen und für Dauernullreihen ergänzen.
- Im aktuellen Paket werden fehlende bestätigte Ablesungen, Ablesungen älter als 365 Tage
  und dauerhafte Nullwerte im Dashboard getrennt ausgewiesen. Leerstände werden bei der
  Dauernullprüfung nicht als Fehler markiert.
- Die Regressionen für Klassifikation und Dashboard-Darstellung liefen im Branch mit
  406 Tests; das Paket änderte weder Apps Script noch Google-Sheet-Daten.
- Leerstand und Defekt als unterschiedliche fachliche Zustände vorbereiten.
- LOK-/TEST-Smoke-Tests erst mit echten, gepflegten Live-Daten ergänzen; bis dahin bleibt
  die Objekttrennung automatisiert getestet.

### P3 Heizöl-Kostenkontrolle nach Abschluss von Z2

- Preis je Betankung erfassen und Jahreskosten sowie Preis je Liter berechnen.
- Sichtbare Haus-Gesamtsumme in Litern über `totalLiters` anzeigen; nur freigegebene Tanks
  einbeziehen.
- Restreichweite als gekennzeichnete Schätzung ergänzen: ungefähr verbleibende Wochen und
  Nachbestellgrenze in cm.
- Später kWh-Umrechnung nach Klärung von Heizmedium, Heizwert und beheizter Fläche.
- Objekt- und tankspezifische Parameter aus dem Code in `Haustechnik` pflegen, sobald ein
  zweites Objekt mit Heizöltank hinzukommt.

### P4 Soll-Ist-Vergleich je Einheit

Ziel ist Kostenkontrolle bei Pauschalen, ausdrücklich kein Nebenkostenabrechnungsmodul.

- Verbrauchsentwicklung je Einheit gegen Vorjahr und Vorauszahlung/Pauschale.
- Bestehende Verbrauchsstatistik und Vertragsdaten wiederverwenden.
- Vor Beginn fachlich entscheiden, ob fortgeschriebene, aus Jahresrest ergänzte oder aus
  Tankfüllungen bilanzierte Werte in diesen Vergleich einfließen dürfen.

### P5 Technische Verbesserungen mit konkretem Nutzen

- Rechenlogik nur dann aus `consumption-charts.js` auslagern, wenn dadurch Tests,
  Fehleranalyse oder Backend-Verantwortung tatsächlich besser werden.
- Sheets-Spalte `monat` dauerhaft als Text `YYYY-MM` führen; Berlin-Normalisierung als
  Schutz beibehalten.
- Zeitbasis der Rohintervalle ausdrücklich auf `Europe/Berlin` festlegen und testen.
- Matrix-Skript um `--explain` erweitern: Monatswerte, Jahreswert und Abweichungsgrund je
  auffälliger Kombination.
- Alias-Zuordnung für Zähler derselben Einheit mit historischer ID ergänzen und im
  Heizöl-Service nur ändern, wenn ein konkreter Datenfall das erfordert.
- Balkenmodus und Legende vollständig auf dieselben Herleitungsfarben bringen.
- Manuelles Cache-Busting später durch zentrale Asset-Version oder Build-Hash ersetzen.
- Node-/Toolchain-Upgrade getrennt prüfen; unter Node 24 den stabilen Vitest-Pool und
  unter Windows `cross-env` für `TZ` dokumentieren.

### P6 Mieteingänge manuell

**Status:** abgeschlossen in PR #39; Backend 4.8.12 ist in TEST und PROD veröffentlicht und der
fachliche TEST-Durchlauf ist dokumentiert. Ein ergänzender PROD-Smoke-Test im dauerhaft getrennten
Objekt `TEST` wurde am 2026-11-14 durchgeführt; Details stehen im P6.1-Testprotokoll.
Die aktuelle Einzelprüfung von Matrix, Mietmonat, Status, Kaution und Objektverknüpfung ist in
[`docs/p6-testprotokoll-20261113.md`](docs/p6-testprotokoll-20261113.md) dokumentiert.

**Ziel:** Zahlungseingänge im Alltag schnell und nachvollziehbar erfassen. Das ist ein
Erfassungsmodul, kein Mahnwesen und keine Nebenkostenabrechnung.

- Matrix Mieter × Monat mit Sollbetrag aus dem aktiven Vertrag.
- Schnelle Aktion `voll bezahlt`, vorbelegtes Eingangsdatum und Rückgängig-Funktion.
- Status `bezahlt`, `teilbezahlt`, `offen` und `überfällig` mit vertragsspezifischer Frist.
- Zahlungen append-only speichern; Korrekturen als Storno oder Gegenbuchung statt Überschreiben.
- Offline-Queue und idempotente Zahlungs-ID wiederverwenden.
- Umsetzung im aktuellen Branch: Monatsmatrix für aktive Verträge, Status je Monat,
  Teilzahlungen, fachlicher `mietmonat` unabhängig vom Eingangsdatum, Gesamtstatus,
  Kautionsstatus, Storno als negative Gegenbuchung und keine doppelte Speicherung bei
  gleicher `zahlung_id`. Der Dialog übernimmt den angeklickten Mietmonat unveränderbar,
  zeigt den Kautionsstatus einklappbar und markiert verspätete Teil- oder Vollzahlungen
  zusätzlich zum eigentlichen Zahlungsstatus. Erstattungen werden separat geführt und
  ändern den Mietstatus nicht. Zahlungsfristen können als 3. Werktag oder individueller
  Kalendertag hinterlegt werden; der lokale Mock enthält Verbrauchsviews für die
  fachliche Gesamtprüfung. Überzahlungen werden vor dem Speichern ausdrücklich auf den
  angeklickten und weitere offene Mietmonate verteilt oder als Guthaben belassen. Die
  Teilbuchungen tragen eine gemeinsame `zahlungsgruppe_id`.
- Historische Zahlungen mit leerem `mietmonat` bleiben dem Eingangsmonat zugeordnet;
  bewusstes Guthaben wird nur über eine Zahlungsgruppe erkannt. Neue Nutzeraktionen
  erhalten eigene Zahlungs- und Gruppen-IDs; ein Storno ist über `Storno_<zahlung_id>`
  idempotent und wird serverseitig gegen Originalzahlung, Vertrag und Betrag geprüft.
- `vertrag_capabilities` meldet, ob das Zahlungsschema vollständig vorbereitet ist;
  die UI schreibt nicht, wenn `payment_schema_ready` fehlt. Mock und Apps-Script prüfen
  die gleichen Zahlungsarten, Mietmonate, Konflikte und Storno-Regeln.
- Der Backend-Schreibweg läuft auf 4.8.12. Die frühere produktive 4.8.5 bleibt als
  Rollback-Stand erhalten.

**Voraussetzung:** P1.1/P1.2 Rollen und Geräteeinrichtung sind produktiv geprüft.

### P7 Kontoauszug-Import

**Status:** CSV-MVP im selben Arbeitsstand vorbereitet; CAMT.053/MT940 bleiben Folgeausbau.

**Ziel:** Manuelle Zahlungserfassung durch Vorschläge aus strukturierten Bankexporten reduzieren.

- CSV, CAMT.053 oder MT940 bevorzugen; PDF/OCR ist kein Startpunkt.
- Vorschläge über IBAN, Namen, Verwendungszweck, Vertragsnummer und Betrag erzeugen.
- Unklare Buchungen bleiben offen und werden manuell bestätigt.
- Keine direkte Bankanbindung und keine automatische externe KI-Verarbeitung in der ersten Version.
- Der CSV-MVP liest die Datei lokal im Browser, schlägt Verträge anhand von Namen,
  Vertrags-ID und Sollbetrag vor und speichert erst nach manueller Bestätigung. Der
  fachliche Mietmonat wird aus `YYYY-MM` im Verwendungszweck vorgeschlagen oder fällt
  auf den Eingangsmonat zurück und bleibt vor der Übernahme editierbar.
- Unklare oder negative CSV-Buchungen werden nicht automatisch übernommen.

Für die fachliche Abnahme stehen im keyfreien lokalen Mock mehrere synthetische Personas
bereit: Teilzahlung und späte Nachzahlung, pünktliche Zahlung mit vollständiger Kaution,
Leerstand ohne Zahlung, wiederholte Verspätungen, Nachzahlung/Erstattung, Überzahlung und
zwei Hauptmieter in einer Einheit. Der Mock schreibt ausschließlich in seinen Prozessspeicher.

**Voraussetzung:** P6 läuft im Alltag und das Zahlungsdatenmodell ist erprobt. Die konkrete
Bank und das verfügbare Exportformat werden erst vor Beginn von P7 geprüft.

### Folgepakete für P6/P7

Die folgenden Punkte sind bewusst als kleine, voneinander trennbare Pakete vorgemerkt. Sie
werden nach der TEST-Abnahme des Hardening-Stands in dieser Reihenfolge bearbeitet. Ziel bleibt ein pragmatischer
Arbeitsablauf; keine automatische Nebenkostenabrechnung, kein Mahnwesen und keine direkte
Bankanbindung werden daraus abgeleitet.

**Reihenfolge:**

1. **P6.1 Dublettenwarnung:** **Im Branch `codex/p6-1-payment-duplicate-warning` umgesetzt,
   Review-Nachbesserungen ergänzt, Abnahme in Mock, TEST und PROD-Testobjekt am 2026-11-14
   durchgeführt.** Weiche Warnung bei gleicher Vertrags-ID, gleichem Eingangsdatum,
   Betrag, fachlichem Mietmonat und Zahlungsart. Die Buchung bleibt nach Bestätigung möglich;
   bestehende idempotente IDs und Storno-Regeln werden nicht verändert. Für CSV und manuelle
   Erfassung gelten dieselben Vergleichsregeln. Historische Zeilen ohne `mietmonat` werden
   für die Prüfung ihrem Eingangsmonat zugeordnet. Stornierte Vorgänger und ein Retry mit
   identischer `zahlung_id` werden nicht als neue Dublette gewertet. Der PROD-Test schrieb
   ausschließlich in `objekt_id = TEST`, bestätigte die persistierte Mietmonatszuordnung
   und zeigte die Warnung bei einer identischen Wiederholung. Kautions-, Überzahlungs-,
   Erstattungs- und Storno-Fälle bleiben für PROD offen, weil der aktuelle PROD-Testbereich
   dafür keine passenden Verträge enthält; sie sind im TEST-Backend abgenommen.
2. **P6.2 Gemeinsame Zahlungsregeln:** Die fachlichen Pure Functions für Mietmonat, Guthaben,
   Erstattung, Storno und Statusberechnung zwischen Backend und Mock vereinheitlichen oder
   aus einer gemeinsamen testbaren Quelle ableiten. Ziel ist, Copy-Paste-Abweichungen zu
   vermeiden, ohne die Apps-Script-Architektur unnötig umzubauen.
3. **P7.1 CSV-Monatsparser:** Verwendungszwecke wie `Miete Februar 2026` und `02/2026`
   erkennen, Datumsangaben nicht fälschlich als Mietmonat interpretieren und die Quelle des
   Vorschlags anzeigen. Unklare Fälle bleiben bestätigungspflichtig.
4. **P6.3 Zahlungsfachlichkeit:** Soll-Historie bei Mieterhöhungen ergänzen und die offenen
   Fachregeln für Nachforderungen, Guthabenumbuchungen sowie Erstattungen im Saldo festlegen.
   Erst danach werden diese Fälle in die Status- und Übersichtsberechnung aufgenommen.
5. **P6.4 Zahlungsfristen:** Werktagsregeln belastbar machen. Samstag und Sonntag bleiben
   ausgeschlossen; gesetzliche Feiertage werden nur für das relevante Bundesland und Objekt
   berücksichtigt. Individuelle Vertragsvereinbarungen bleiben vorrangig.
6. **P6.5 Kautionslebenszyklus:** Kaution nach Auszug, Rückzahlung und teilweise einbehaltene
   Beträge separat abbilden. Die bestehende Kautionsübersicht bleibt von Mietstatus und
   Mietmonaten getrennt.

## Zurückgestellt

- LOK-/TEST-Smoke-Test mit Live-Daten, bis für diese Objekte echte Verbrauchsdaten vorliegen.
- Weitere Objekte außerhalb von Ra-HS-29, LOK und TEST als Testbasis.
- Weitere Indexreihen für Indexmieten.
- Service Worker für vollständigen Offline-Start; aktuell existiert eine Offline-Queue,
  aber kein Offline-Start der App.

## Entscheidungen

| Datum | Entscheidung |
| --- | --- |
| 2026-11-05 | Teilmonate aus Rohintervallen werden nicht als eigene UI-Kategorie gezeigt. |
| 2026-11-05 | Zahlenformat bleibt deutsch: Tausenderpunkt und Dezimalkomma. |
| 2026-11-10 | Lineare Umrechnung `l/cm` bleibt eine bewusste interne Näherung für Kostenkontrolle, nicht geeicht. |
| 2026-11-05 | LOK-Smoke-Test wird bis zu echten Live-Daten zurückgestellt. |
| 2026-11-06 | Heizölfüllungen werden bei vorhandenen Literdaten über Tankbilanz rekonstruiert. |
| 2026-11-06 | Security, Backup und Release-Nachvollziehbarkeit gehen vor neuen Auswertungsfeatures. |
| 2026-11-10 | Zwei Geräteschlüssel: Admin für Verträge, Erfassen für Zählerstände und Zahlungen. |
| 2026-11-10 | Mieteingänge zuerst manuell, strukturierter Kontoauszug-Import erst danach; OCR/PSD2 sind kein Startpunkt. |
| 2026-11-11 | P6/P7 bleiben pragmatisch: CSV lokal importieren, Vorschläge bestätigen, keine direkte Bankanbindung. |
| 2026-11-14 | PR #39 gemergt; P6/P7 und Apps Script 4.8.12 sind nach TEST-Abnahme produktiv dokumentiert. |
| 2026-11-14 | P6.1 als reine Frontend-/Mock-Erweiterung begonnen: weiche Dublettenwarnung, keine Backend- oder Schemaänderung. |

## Definition of Done

- Eigener Branch und PR je Paket; PR-Review abgeschlossen.
- `npm test`, Syntaxprüfung und `git diff --check` grün.
- `PROJECT_STATE.md`, `CHANGELOG.md` und themenbezogene Doku aktualisiert.
- Bei UI-Änderungen: lokale visuelle Prüfung auf Desktop und Mobil mit einem frisch
  gestarteten Testserver; URL und Cache-Busting dokumentiert.
- Bei Backend-Änderungen: Version, Deployment-Stand, Rollback und manueller Test gegen
  das echte Apps Script dokumentiert.
- Bei Schätzwerten: Kennzeichnung in der UI und Herleitung im Datenmodell dokumentiert.

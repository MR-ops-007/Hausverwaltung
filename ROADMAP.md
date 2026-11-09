# Roadmap Hausverwaltung

Diese Liste ist die verbindliche Arbeitsübersicht für die nächsten Entwicklungspakete.
`PROJECT_STATE.md` beschreibt den aktuellen Systemstand, `CHANGELOG.md` die Releases.
Diese Datei beschreibt offene und geplante Arbeit.

## Arbeitsregeln

- Jedes Paket erhält einen eigenen Branch und einen eigenen Pull Request.
- Ein Paket ist erst abgeschlossen, wenn Code, automatisierte Tests, relevante Doku
  und bei UI-Arbeiten eine lokale visuelle Prüfung erledigt sind.
- Apps-Script-Deployments werden zusätzlich mit Backend-Version, Deployment-Stand
  und manueller Verifikation dokumentiert.
- Ein neues Paket startet erst, wenn das vorherige Paket gemergt oder ausdrücklich
  als blockiert dokumentiert ist.

## Priorisierte Pakete

### P0 Verbrauchsstatistik V2 abschließen

- Branch: `feature/verbrauchsstatistik-v2`
- Status: Folgefix in Arbeit, technische Prüfung grün
- Scope: Prüfhinweise im laufenden Jahr, keine künstlichen Nullmonate, Matrixklassifikation
  und QA-Dokumentation.
- Review bestätigt in Commit `8ecdf73`: 229 Tests grün; beide Berechnungsfixes und die
  Klassifikation wurden geprüft.
- Folgefix-Branch: `fix/consumption-timestamp-normalization`.
- Der Folgefix normalisiert UTC-Monatsgrenzen nach `Europe/Berlin`. Der Rohdatenlauf
  weist danach 356/356 angezeigte Treffer und keine unerklärten Abweichungen aus.
- `ui-service.js` verwendet für Datumsbereiche dieselbe gemeinsame Normalisierung wie
  `consumption-charts.js`; damit zeigen Tabelle und Diagramm denselben Zeitraum.
- Der reguläre Testlauf setzt `TZ=Europe/Berlin`. Zusatzläufe unter UTC und Tokio
  bleiben möglich; unter Node 24 benötigt Tokio den stabilen Vitest-Pool
  (`--pool=forks` oder `--no-file-parallelism`).
- Vor Merge: `npm test`, `git diff --check` und fachliche Sichtung des Ölfüllstands.

### P1 Apps Script 4.8.4

- Branch: `chore/apps-script-4.8.4`
- Status: Implementiert und lokal verifiziert; PR/Deployment offen
- Scope: Backend-Änderung aus dem vorliegenden 4.8.4-Stand, Versionskopf,
  Changelog, Backend-Tests und Deployment-Dokumentation.
- Abhängigkeit: genaue Änderung gegenüber 4.8.3 und manueller GAS-Deploy durch den
  Betreiber.
- Der Senior-Developer-Patch ist integriert: Offline-Queue, idempotente
  `stand_id`-Verarbeitung, Konflikt-/Korrekturpfad, gezieltes Nachladen und
  beschädigungssichere Queue-Wiederherstellung.
- Lokale Prüfung: 341 Tests in 12 Testdateien grün; `git diff --check` sauber.
- Nächster Schritt: Branch pushen, CI abwarten, danach Backend 4.8.4 deployen und
  die dokumentierten Testfälle gegen das echte Apps Script/Sheet durchführen.

### P2 Verbrauchsstatistik-Follow-ups

- Branch: `feature/verbrauchsstatistik-followups`
- Status: Teilpaket `codex/zaehler-ueberlauf-klassifikation` in Arbeit
- Darstellung: Balkenfarben vereinheitlichen und Teilmonat-Anzeige fachlich klarer
  gestalten oder aus der sichtbaren UI entfernen.
- Datenqualität: Alias-Konflikte gezielt prüfen und LOK-/TEST-Smoke-Tests ergänzen.
- Diagnose: optionalen Matrix-Schalter `--explain` ergänzen, damit Monatswerte,
  Jahreswert und Abweichungsgrund je auffälliger Kombination kompakt ausgegeben werden.
- Datenquelle: prüfen, ob die Sheets-Spalte `monat` als Datum oder Text geführt wird;
  bei Bedarf die Backend-Ausgabe dauerhaft als `YYYY-MM` stabilisieren.
- Zeitbasis: entscheiden, ob die Rohintervall-Aufteilung (`monthSegments`) dauerhaft
  fest mit `Europe/Berlin` oder bewusst mit der Browser-Zeitzone arbeiten soll.
- Betrieb: manuelles Cache-Busting durch eine zentrale, nachvollziehbare
  Asset-Version oder später einen Build-Hash ersetzen.
- In diesem Paket werden die Jahresauswahl innerhalb der Statistik mit dem
  Dashboard-Jahr verknüpft, `Fläche` als Standarddarstellung gesetzt, die
  sichtbare Teilmonat-Kategorie entfernt und Alias-/LOK-/TEST-Regressionen
  automatisiert abgesichert. Cache-Busting bleibt als separates Folgepaket.

#### Teilpaket: Zählerüberlauf und Prüfhinweise

- Branch: `codex/zaehler-ueberlauf-klassifikation`
- Ziel: Intervallklassifikation ausschließlich über `calc-service.js`; zulässige
  Überläufe anhand von `stellen` und `ueberlauf_erlaubt` als Überlauf statt als
  rückläufigen Fehler darstellen.
- Darstellung: Ein zulässiger Überlauf wird violett als einmaliges Ereignis
  erklärt. Ein ungeklärter Rücklauf bleibt rot. Ein zusätzlicher Backend-
  Prüfhinweis bleibt orange und wird nicht durch ein Überlaufereignis verdeckt.
- QA: Rohdaten-Snapshot `Ra-HS-29` mit 49 Zählern und 1.912 Rohwerten; 1.708
  normale Intervalle, 2 zulässige Überläufe, 33 ungeklärte Rückläufe, 14
  unplausibel hohe Rückgänge und 14 steigende Ölfüllstände.
- Offener nächster Schritt: automatisierte Tests und Dokumentation abschließen,
  Branch pushen und PR erstellen.

### P3 Heizöl-Verbrauch

- Branch: `feature/heizoel-verbrauch`
- Status: Implementiert und gepusht (`93bbd09`), PR/Review offen
- Haupttank: 10.000 Liter; Zusatztank: 2.000 Liter, zunächst separat.
- Verbrauch zunächst in cm und Litern darstellen; die Arbeitshypothese für den
  Haupttank ist circa 12.000 Liter bei 140 cm.
- Liter-pro-cm und Tankparameter objektbezogen konfigurierbar machen.
- Tankfüllungen als Ereignisse erfassen und bei fehlendem neuen Füllstand einen
  Prüfhinweis mit Vorschlag `Vollgetankt: Ja` anzeigen.
- Keine kWh-Umrechnung, bevor Heizmedium, Heizwert und beheizte Fläche festgelegt
  sind.

### P4 Spätere technische Themen

- Repository privat stellen beziehungsweise Zugriffsschutz weiter härten.
- Backend-URL aus der öffentlichen Frontend-Konfiguration entfernen.
- Node-/Toolchain-Aktualisierung prüfen.
- Weitere Indexreihen ergänzen.
- Weitere Objekte außerhalb von Ra-HS-29, LOK und TEST als Smoke-Test-Basis aufnehmen.

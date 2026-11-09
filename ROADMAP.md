# Roadmap Hausverwaltung

Diese Liste ist die verbindliche Arbeitsübersicht für die nächsten Entwicklungspakete.
`PROJECT_STATE.md` beschreibt den aktuellen Systemstand, `CHANGELOG.md` die Releases.

**Stand: 2026-11-06**

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

Remote `origin/main` steht aktuell auf `70adcbd`.

| PR | Inhalt |
| --- | --- |
| #21 | Verbrauchsstatistik V2 mit Monats-/Jahresdiagrammen, Herleitungskennzeichnung und QA-Matrix |
| #22 | Monatszuordnung nach `Europe/Berlin` und zeitzonenfester Testlauf |
| #23 | Verbrauchsstatistik-Follow-ups: Jahresauswahl, Standard `Fläche`, Alias-Regressionen |
| #24 | Apps Script 4.8.4: Offline-Queue, idempotente `stand_id`, Konflikt-/Korrekturpfad |
| #25 | Historische Zählerstände mit gleichem Wert, zum Beispiel Leerstand `0`, werden gespeichert |

Der lokale Branch `main` muss nach einem Merge weiterhin mit `origin/main` synchronisiert
werden, bevor ein neues Feature darauf aufgebaut wird.

## In Arbeit

### Z0 Zählerüberlauf und Prüfhinweise

- Branch: `codex/zaehler-ueberlauf-klassifikation`
- Status: implementiert und getestet; vor `feature/heizoel-verbrauch` zu mergen, weil
  der Heizöl-Branch darauf aufbaut.
- Ziel: Intervallklassifikation ausschließlich über `calc-service.js`
  (`classifyReadingInterval`); zulässige Überläufe anhand von `stellen` und
  `ueberlauf_erlaubt` als Überlauf statt als rückläufigen Fehler darstellen.
- Darstellung: zulässiger Überlauf violett als einmaliges Ereignis, ungeklärter
  Rücklauf rot, zusätzlicher Backend-Prüfhinweis orange.
- QA-Snapshot `Ra-HS-29` (49 Zähler, 1.912 Rohwerte): 1.708 normale Intervalle, 2 zulässige
  Überläufe, 33 ungeklärte Rückläufe, 14 unplausibel hohe Rückgänge, 14 steigende
  Ölfüllstände. Die 33 ungeklärten und 14 unplausiblen Intervalle sind ein
  Datenbereinigungs-Kandidat.
- Offen: `intervalDetails` verwenden oder entfernen; Schutz gegen falsche Skriptreihenfolge
  (`calcService` fehlt) sichtbar machen.

### Z1 Zähler-Speichern-Feedback

- Branch: `feature/zaehler-speichern-feedback`
- Status: Review abgeschlossen, Rebase auf den aktuellen `main` offen.
- Vor dem Merge:
  - die Variante aus `main` von `formatZaehlerSaveSuccess` behalten und nur Busy-Zustand
    und Stempel-Animation übernehmen;
  - Fehler beim Nachladen getrennt melden: „Gespeichert, Anzeige konnte nicht aktualisiert
    werden“ statt „Fehler beim Speichern“;
  - Erfolg nicht doppelt über Stempel und `alert` anzeigen;
  - Erfolgs-SVG vorladen und die 900-ms-Verzögerung bei `prefers-reduced-motion` vermeiden;
  - Einrückung am Ende von `saveZaehler` bereinigen.
- Abhängigkeit: Z1 und Z2 ändern beide den Speicher-/Erfassungsablauf. Vor dem Merge
  müssen Busy-Zustand und Heizöl-Rückfrage gemeinsam geprüft werden.

### Z2 Heizöl-Verbrauch

- Branch: `feature/heizoel-verbrauch`
- Status: Fachlogik, UI, Review-Fixes und automatisierte Tests lokal vorhanden;
  Commit, Push, PR und Deployment stehen noch aus.
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
- Validierung: aktuell 371 Tests in 13 Testdateien grün, Syntaxprüfung und
  `git diff --check` sauber. Vor dem Merge zusätzlich echte Ölwerte prüfen und die
  fachliche Plausibilität von Betankung plus Bestandsänderung dokumentieren.
- Nicht-Ziel: keine geeichte Brennstoffabrechnung und keine automatische Rückschreibung
  in die Google-Sheets-Views.

## Priorisierte nächste Pakete

### P1 Sicherheit und Betrieb

Ziel: reale Daten schützen und Wiederherstellung beherrschbar machen.

- Repository privat stellen oder den verbleibenden öffentlichen Daten-/URL-Zugriff
  entfernen; produktive Backend-URL nicht im öffentlichen Frontend-Repository halten.
- `APP_ACCESS_KEY` produktiv prüfen, alte Apps-Script-Bereitstellungen archivieren bzw.
  deaktivieren und die alte URL nach einer Rotation testen.
- Backup des Google Sheets mit definierter Aufbewahrung und mindestens einen dokumentierten
  Restore-Test einrichten.
- Apps-Script-Version, Deployment-Stand und manuellen Test gegen das echte Sheet in
  `CHANGELOG.md` dokumentieren.
- Korrekturprotokoll um Benutzer/Rolle erweitern, sobald mehr als ein Bediener vorgesehen
  ist. Für den aktuellen Einzelnutzer ist das kein Merge-Blocker.
- CI prüfen: `npm ci` und `npm test` müssen bei jedem Pull Request laufen; Node-Version
  kommt aus `.nvmrc`.
- Abnahme in `docs/betrieb.md` mit Datum, Ergebnis und Rollback-Hinweis festhalten.

### P2 Datenqualität bei der Erfassung

- Auffällige Sprünge je Medium konfigurierbar warnen, aber niemals das Speichern blockieren.
- Zwei Werte am selben Tag oder innerhalb des Korrekturfensters als mögliche Korrektur
  behandeln und nicht fälschlich als Verbrauchssprung bewerten.
- Dashboard-Hinweis für Zähler ohne Ablesung seit X Tagen und für Dauernullreihen ergänzen.
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
| 2026-11-05 | Lineare Umrechnung `l/cm` bleibt eine Arbeitshypothese für Kostenkontrolle. |
| 2026-11-05 | LOK-Smoke-Test wird bis zu echten Live-Daten zurückgestellt. |
| 2026-11-06 | Heizölfüllungen werden bei vorhandenen Literdaten über Tankbilanz rekonstruiert. |
| 2026-11-06 | Security, Backup und Release-Nachvollziehbarkeit gehen vor neuen Auswertungsfeatures. |

## Definition of Done

- Eigener Branch und PR je Paket; PR-Review abgeschlossen.
- `npm test`, Syntaxprüfung und `git diff --check` grün.
- `PROJECT_STATE.md`, `CHANGELOG.md` und themenbezogene Doku aktualisiert.
- Bei UI-Änderungen: lokale visuelle Prüfung auf Desktop und Mobil mit einem frisch
  gestarteten Testserver; URL und Cache-Busting dokumentiert.
- Bei Backend-Änderungen: Version, Deployment-Stand, Rollback und manueller Test gegen
  das echte Apps Script dokumentiert.
- Bei Schätzwerten: Kennzeichnung in der UI und Herleitung im Datenmodell dokumentiert.

### UI-Paket: Speicherrückmeldung Zählerstände

- Branch: `codex/zaehler-speichern-feedback-aktuell`
- Status: In Arbeit auf aktuellem `main`; PR/CI offen
- Der Speichervorgang zeigt einen Ladezustand mit deaktivierten Aktionen und einer kleinen, reduzierten Haus-/Zähleranimation.
- Idempotente Wiederholungen werden als „bereits gespeichert“ erklärt; bei Korrekturen wird der unveränderte ursprüngliche Zeitstempel transparent ausgewiesen.
- Validierung vor dem aktuellen Rebase: 348 Tests; nach Integration in den aktuellen Heizölstand erneut vollständig auszuführen. Kein Apps-Script- oder Backend-Change.

### Weitere technische Aufgaben

- Repository privat stellen beziehungsweise Zugriffsschutz weiter härten.
- Backend-URL aus der öffentlichen Frontend-Konfiguration entfernen.
- Node-/Toolchain-Aktualisierung prüfen.
- Weitere Indexreihen ergänzen.
- Weitere Objekte außerhalb von Ra-HS-29, LOK und TEST als Smoke-Test-Basis aufnehmen.

# Roadmap Hausverwaltung

Verbindliche Übersicht über Prioritäten, offene Pakete und getroffene Entscheidungen.
Was bereits gilt, steht in [`PROJECT_STATE.md`](PROJECT_STATE.md); Backend-Änderungen und
Deployments stehen im [`CHANGELOG.md`](CHANGELOG.md). Die frühere, ausführliche Fassung mit
allen erledigten Paketen steht unverändert in
[`docs/archiv/roadmap-bis-2026-11-20.md`](docs/archiv/roadmap-bis-2026-11-20.md).

## Arbeitsregeln

- Jedes Paket erhält einen eigenen Branch und Pull Request. Große Pakete werden in kleine,
  einzeln prüfbare und rückgängig machbare PRs geschnitten.
- Jedes Paket nennt Ziel, Scope, Nicht-Ziele und Abnahmekriterien.
- Doku-Änderungen gehören in denselben PR wie die Änderung, die sie betreffen.
- Erledigte Punkte werden aus dieser Liste entfernt, sobald ohnehin der nächste PR ansteht;
  dafür wird kein eigener Doku-PR angelegt. Die Historie steht im CHANGELOG und in `docs/`.
- Schätzwerte (Fortschreibungen, Jahresrest, Tankbilanz, Restreichweite) werden in der UI als
  Schätzung gekennzeichnet und nicht mit Messwerten vermischt.

## Priorisierte nächste Pakete

### 1. Release-Ablauf neu ordnen

**Ziel:** Frontend und Backend werden nachvollziehbar und passend zueinander veröffentlicht.
Eigenes Paket mit eigener Entscheidung; die bestehende Veröffentlichung läuft unverändert
weiter, bis der neue Ablauf vollständig erprobt ist.

- Erledigt: `npm run status` zeigt nur lesend den tatsächlichen Stand von TEST, PROD und
  GitHub Pages samt zugehörigem Commit; alle `clasp:*`-Skripte reichen Argumente durch
  (Voraussetzung für Rollback und Beschreibung).
- **Offen, Entscheidung des Product Owners:** Entwurf E1–E6 in `docs/betrieb.md`
  (Abschnitt „Release-Ablauf: Entwurf zur Entscheidung“): Tag-Konvention, reine
  Frontend-Releases, Rollback, Auslöser für GitHub Pages, fehlgeschlagene Deployments.
- Danach die belegten Tags `v4.8.13` bis `v4.8.18` setzen und pushen (Liste in E6) und die
  Entscheidungen in die Tabelle unten übernehmen.

### 2. P1.3 Backup und Restore

**Ziel:** Wenige, brauchbare Sicherungen mit einem tatsächlich getesteten Restore.

- Wöchentlicher Trigger, nur bei geändertem Datenbestand; höchstens drei automatische Kopien,
  manuelle Release-/Migrationskopien außerhalb der Rotation.
- Eigener, nur für den Product Owner freigegebener Drive-Ordner.
- Restore zuerst in eine separate Testdatei, protokolliert nach `docs/backup-restore.md`.
- Im selben Zug klein mitnehmen: Vertrags-Token mit `constantTimeEquals` vergleichen und die
  Entscheidung dokumentieren, ob das Repository privat gestellt und die produktive
  Bereitstellung rotiert wird (die frühere PROD-URL ist in der Git-Historie sichtbar).

**Nicht-Ziel:** tägliche Kopierflut oder automatische Wiederherstellung der Produktion.

### 3. P6.7c Vertragsanlage in der Oberfläche

**Ziel:** Neue Verträge ohne direkten API-Aufruf anlegen.

- Eingabemaske für den vorhandenen Schreibweg `MIETERWECHSEL_ANLEGEN`.
- Eigener, idempotenter Schreibweg für die Neuvermietung einer leerstehenden Einheit
  (kein aktiver Vorgänger) mit Zeitraumprüfung.
- Abnahme mit den Entenhausen-Fixtures in TEST und im PROD-Testobjekt `TEST`.

## Weitere offene Pakete

Noch nicht priorisiert; Reihenfolge wird vor Beginn mit dem Product Owner festgelegt.

- **P1.2b Restabnahme Geräte:** Persistenz des Zugangsschlüssels über URL-Änderungen auf dem
  iPhone; Erfassungsgerät mit Rolle `erfassen` im Alltag abnehmen.
- **Rollenmodell überarbeiten:** Rechte von `admin` und `erfassen` fachlich neu festlegen,
  spätestens bevor eine zweite Person mit eigenem Gerät erfasst (Entscheidung 2026-11-24).
- **P7.1 CSV-Monatsparser:** Verwendungszwecke wie `Miete Februar 2026` und `02/2026`
  erkennen, Datumsangaben nicht als Mietmonat deuten, Quelle des Vorschlags anzeigen.
- **P6.4 Zahlungsfristen:** gesetzliche Feiertage je Bundesland und Objekt; individuelle
  Vereinbarungen bleiben vorrangig.
- **P6.5 Kautionslebenszyklus:** Rückzahlung nach Auszug und teilweise Einbehalte.
- **Offene Zahlungs-Fachregeln:** Nachforderungen, Guthabenumbuchungen, Erstattungen im Saldo.
- **Staffelmiete:** Terminmodell für Staffeln, damit die Mieterhöhungsprüfung sie nicht
  pauschal als prüfpflichtig markiert.
- **Verbrauch je Vertrag:** Verbrauchsaufteilung bei Mieterwechseln.
- **P3 Heizöl-Kostenkontrolle:** Preis je Betankung, Jahreskosten, Haus-Gesamtsumme in Litern,
  Restreichweite als gekennzeichnete Schätzung; kWh erst nach Klärung von Heizmedium,
  Heizwert und Fläche.
- **P4 Soll-Ist je Einheit:** Verbrauchsentwicklung gegen Vorjahr und Pauschale; vorher
  festlegen, welche geschätzten Werte einfließen dürfen. Kein Nebenkostenabrechnungsmodul.
- **Datenbereinigung Ra-HS-29:** ungeklärte Rückläufe und unplausibel hohe Rückgänge aus der
  Überlaufklassifikation prüfen.
- **Datenqualität:** Leerstand und Defekt als getrennte Zustände; Korrekturprotokoll um
  Benutzer/Rolle erweitern, sobald mehrere Personen erfassen.
- **Technische Pflege (P5):** Sheets-Spalte `monat` dauerhaft als Text `YYYY-MM`;
  Matrix-Skript `--explain`; Cache-Busting über zentrale Asset-Version; verbleibende
  `innerHTML`-Ausgaben auf Escaping prüfen; ungenutzte Dateien `js/app.js` und
  `js/ui/navigation.js` entfernen; Dependabot; Node-/Toolchain-Upgrade getrennt prüfen.
- **Manueller QA-Rest:** expliziter Abbruchpfad der Dublettenwarnung (native `confirm()`-Dialoge
  sind in der Browser-Automation nicht prüfbar).

## Zurückgestellt

- LOK-/TEST-Smoke-Test mit Live-Daten, bis für diese Objekte echte Verbrauchsdaten vorliegen.
- Weitere Objekte außerhalb von Ra-HS-29, LOK und TEST als Testbasis.
- Weitere Indexreihen für Indexmieten (erst bei neuem VPI-Basisjahr und passendem Vertrag).
- Service Worker für vollständigen Offline-Start.
- `Migration.gs.gs` und Einmal-Migrationen erst anfassen, wenn der Deployment-Rollback geklärt ist.

## Entscheidungen

| Datum | Entscheidung |
| --- | --- |
| 2026-11-05 | Teilmonate aus Rohintervallen werden nicht als eigene UI-Kategorie gezeigt. |
| 2026-11-05 | Zahlenformat bleibt deutsch: Tausenderpunkt und Dezimalkomma. |
| 2026-11-05 | LOK-Smoke-Test wird bis zu echten Live-Daten zurückgestellt. |
| 2026-11-06 | Heizölfüllungen werden bei vorhandenen Literdaten über Tankbilanz rekonstruiert. |
| 2026-11-06 | Security, Backup und Release-Nachvollziehbarkeit gehen vor neuen Auswertungsfeatures. |
| 2026-11-10 | Lineare Umrechnung `l/cm` bleibt eine bewusste interne Näherung für Kostenkontrolle, nicht geeicht. |
| 2026-11-10 | Zwei Geräteschlüssel: Admin für Verträge, Erfassen für Zählerstände und Zahlungen. |
| 2026-11-10 | Mieteingänge zuerst manuell, strukturierter Kontoauszug-Import erst danach; OCR/PSD2 sind kein Startpunkt. |
| 2026-11-11 | P6/P7 bleiben pragmatisch: CSV lokal importieren, Vorschläge bestätigen, keine direkte Bankanbindung. |
| 2026-11-14 | Dublettenwarnung bleibt eine weiche Frontend-Warnung; Backend-Idempotenz über `zahlung_id` bleibt die technische Schutzschicht. |
| 2026-11-23 | Jeder Fakt hat genau eine Quelle (Tabelle in `PROJECT_STATE.md`); Übersichten enthalten keine Testzahlen, PR-Stände oder Deployment-Details. |
| 2026-11-23 | Paket 1 wird in getrennte PRs geschnitten (Doku, Drift-Prüfungen); der Release-Umbau ist ein eigenes Paket. |
| 2026-11-24 | Kappungsgrenze wird je Objekt im Blatt `Objekte` gepflegt (`kappungsgrenze_prozent` mit Gültigkeit und Quelle), weil sie sich ändern kann. Für die bestehenden Objekte gelten 20 %; für Gießen (nach der Pilotphase) voraussichtlich 15 %, bei der Aufnahme mit Quelle zu prüfen. |
| 2026-11-24 | Die Rolle `erfassen` darf Mieterhöhungsprüfungen vorerst abschließen (abweichend von der Rollenentscheidung vom 2026-11-10). Aktuell gibt es nur einen Nutzer; eine zweite Person wird voraussichtlich nur Mieteingänge und Zähler kontrollieren. Das Rollenmodell wird gesondert überarbeitet. |
| 2026-11-24 | Lesender Zugriff mit Schlüssel für Messungen durch den Assistenten nur auf TEST, nicht auf PROD; Ladezeiten werden in der App selbst gemessen. |

## Definition of Done

- Eigener Branch und PR; Review abgeschlossen; Merge nach Freigabe durch den Product Owner.
- `npm test`, Asset-Prüfung, Syntaxprüfung und `git diff --check` grün (CI).
- Betroffene Doku im selben PR aktualisiert: `DATA_MODEL.md` bei Schemaänderungen,
  `CHANGELOG.md` bei Backend-Änderungen, `PROJECT_STATE.md` nur, wenn sich ändert, was gilt.
- Bei UI-Änderungen: visuelle Prüfung auf Desktop und Mobil gegen Mock oder TEST.
- Bei Backend-Änderungen: Version erhöht, Deployment und Rollback-Stand in der
  Deployment-Historie des CHANGELOG, manueller Test gegen das echte Apps Script.
- Bei Schätzwerten: Kennzeichnung in der UI und Herleitung im Datenmodell.

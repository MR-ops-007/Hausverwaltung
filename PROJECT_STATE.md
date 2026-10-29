# PROJECT_STATE - Hausverwaltung

## Stand: 2026-10-23

`main` enthält robuste UI-Regressionstests, eine saubere Zähleridentität, versionierte Apps-Script-Logik, einen produktiven Testbereich und den Vertragsausbau. Der Zugriffsschutz 4.8.0 ist produktiv aktiviert.

Dieses Dokument beschreibt den aktuellen Stand, wichtige Entscheidungen und die nächsten sinnvollen Arbeitspakete.

### Vertragsausbau 2026-10-21/22: Mietverträge / Indexmieten (produktiv)

- Umgesetzt in PR #16 und #17; Backend-Version und Status siehe `CHANGELOG.md`.
- Vertragsansicht für vorhandene Verträge, Dokumentlinks, NK-Teilbeträge und Indexvorschau.
- Indexvereinbarung und Indexanpassung sind nur bei ausgewähltem Erhöhungstyp `Index` sichtbar.
- Vertragsauswahl über Objekt, Wohnung/Einheit und Mieter mit Mietbeginn statt technischer Vertragsnummer.
- Alte Vertragsverweise auf gelöschte Einheiten (z. B. LOK Wohnung 10 vor Aufteilung)
  werden als ungeklärt markiert und nicht automatisch umgebucht.
- Nutzer hat LOK-Verträge auf Wohnung 10 A/B/S ergänzt; geprüfte Zuordnung:
  `10 -> LOK_WE_10_A`, `30 -> LOK_WE_10_B`, `31 -> LOK_WE_10_S`.
  IDs bleiben unabhängig von Sheet-Zeilen. Keine produktiven Daten durch diesen Check geändert.
- Optionaler automatischer VPI-Abruf in `vpi-service.js` über die offizielle
  Bundesbank-Schnittstelle (Destatis-Daten). Bei leerer Basis wird der Mietbeginn
  als Bezugsmonat vorgeschlagen; nur veröffentlichte, passende Werte werden geladen.
- Indexreihe ist eine Vorauswahl statt eines unklaren Freitextfelds. Checkboxen
  bestätigen Dokumentation/Übernahme, lösen allein aber keine Änderung aus.
- Statusmeldungen beim Speichern erscheinen als farbiges Hinweisfeld am unteren Bildschirmrand
  (grün/blau blenden nach 6 s aus, Fehler bleiben bis zum Klick).
- Zugangsschlüssel liegt im Administratorbereich. Deaktiviertes Speichern erklärt
  die noch fehlende produktive Einrichtung. Vertragsbuttons verwenden blaue CTAs.
- Die Indexreihe wird aktuell als feste Bezugsbasis `VPI Deutschland 2020=100`
  geführt; das Stylesheet verwendet eine neue Versionskennung für zuverlässige
  Browser-Aktualisierung. `!important` wird für die Vertragsbuttons nicht benötigt.
- `soll_nebenkosten` bleibt Pflicht-Rechengröße. Kein NK-Abrechnungsmodul.
- Bestätigte Indexanpassungen benötigen dokumentierte Textform, Zugang, Wirksamkeit
  und Historie. Keine automatische Mieterhöhung oder zukünftige Sollmietänderung.
- Neue Schreibaktionen sind gesondert freigeschaltet, mit Standvergleich gegen
  parallele Änderungen und ohne Offline-Queue.
- Produktiv freigegeben am 2026-10-22 (Backend 4.7.0, siehe `CHANGELOG.md`): Schema
  vorbereitet, Schreibfreigabe gesetzt, Speichern und Überschreiben geprüft. Es wurden
  keine Produktivdaten migriert. Das Favicon aus dem vorherigen Auftrag wird im
  Arbeitsstand erhalten.
- Analyse, Datenmodell-Diff, Rollback und Freigabeschritte stehen in
  `docs/contracts-index-plan.md`. Frühere Versionsangaben unten sind historisch.
- Validierung: 143 automatisierte Tests; Vertragsansicht mit synthetischen Daten
  auf Desktop (1440 px) und Mobil (390 px) geprüft, ohne JS-Fehler/Horizontalüberlauf.
- Ein vorhandener zeitabhängiger Dashboard-Test wurde auf einen festen Stichtag
  gesetzt; ISO-Ablesedaten werden explizit in Europe/Berlin angezeigt.

---

## Aktueller Projektstand

Die App dient der Verwaltung von Immobilien, Einheiten, Mietverhältnissen, Zählerständen und perspektivisch Mieteingängen sowie Auswertungen.

Aktueller technischer Aufbau:

- Frontend: Vanilla JavaScript, HTML, CSS
- Backend: Google Apps Script
- Datenhaltung: Google Sheets
- Tests: Vitest
- Versionierung: GitHub
- Entwicklung: Branch-basiert über Pull Requests nach `main`

---

## Erreichte Meilensteine

### Projektstruktur und Dokumentation

Vorhandene zentrale Dateien:

- `README.md`
- `DATA_MODEL.md`
- `PROJECT_STATE.md`
- `AGENT_AUDIT.md`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `apps-script/Readme.md`

Das Projekt ist damit für nachvollziehbare Weiterentwicklung in VS Code, GitHub und Google Apps Script vorbereitet.

### Testbasis

Die Testbasis ist eingerichtet und erweitert.

Vorhanden:

- `tests/smoke.test.js`
- `tests/validation-service.test.js`
- `tests/ui-service.test.js`
- `tests/apps-script.test.js`

`npm test` führt `vitest run` aus.

Aktuell werden unter anderem geprüft:

- Zähler-Plausibilitätslogik
- UI-Speicherlogik für Zählerstände
- Zählerfilter in der Eingabemaske
- Vorwertsuche über `objekt_id + einheit_id + zaehler_id`
- Apps-Script-Hilfslogik für `stand_id`
- Apps-Script-Backend-Version
- produktive Test-Stammdaten
- Fallback von `_view_aktive_mieter` auf `hauptperson_id`

### Zähler-Plausibilitätslogik

`validation-service.js` enthält eine isolierte Plausibilitätsprüfung für neue Zählerstände.

Getestete Fälle:

- Erstablesung
- normal steigender Zählerstand
- niedrigerer Wert ohne Erklärung
- 4-stelliger Überlauf
- 5-stelliger Überlauf
- Zählerwechsel
- unrealistisch hoher Verbrauch
- ungültige Eingaben
- negative Eingaben
- deutsche Komma-Dezimalwerte
- rückläufiger Ölstand in cm
- steigender Ölstand als Betankungs-/Korrekturwarnung
- Ölstand wird nicht als Überlauf behandelt

### UI-Integration der Zähler-Plausibilität

Die Plausibilitätsprüfung ist in die Zählererfassung integriert.

Aktueller Stand:

- `validation-service.js` wird im Browser über `window.validationService` bereitgestellt.
- `ui-service.js` prüft neue Zählerstände vor dem Speichern.
- Fehlerhafte Eingaben blockieren die Speicherung.
- Plausibilitätswarnungen müssen bewusst bestätigt werden.
- Die UI nutzt robuste Zählerlabels über `bezeichnung`, `medium`, `typ` oder `zaehler_id`.
- Zeitstempel werden als `DD.MM.YYYY HH:mm` gespeichert.
- Berechnete, inaktive oder nicht erfassbare Zähler werden nicht in der manuellen Eingabemaske angezeigt. Sie bleiben im Datenmodell erhalten und können später in Verbrauchsviews, Dashboards und Auswertungen genutzt werden.
- Letzte Vorwerte werden über `objekt_id + einheit_id + zaehler_id` gesucht.
- Erfolgreich gespeicherte Zählerstände werden direkt in den lokalen UI-State übernommen, damit Folgeeingaben im Testbereich ohne Neuladen plausibilisiert werden.
- Falls der Browser die modulare Plausibilitätsprüfung nicht initialisiert, nutzt die UI eine eingebaute Fallback-Validierung statt die Speicherung pauschal abzubrechen.

---

## Datenmodell: Zähleridentität

Neue `zaehler_id`s sind einheitgebundene fachliche IDs.

Standardformat:

```text
Z_{einheit_id}_{medium}
```

Wenn innerhalb derselben Einheit mehrere Zähler dasselbe `medium` verwenden, wird ein Messpunkt ergänzt:

```text
Z_{einheit_id}_{medium}_{messpunkt}
```

Beispiele:

```text
Z_LOK_WE_10_A_strom_ht_kwh
Z_LOK_WE_10_A_kaltwasser_m3
Z_LOK_Allgemein_kaltwasser_m3_hauptzaehler
```

Historische `zaehler_id`s bleiben gültig. Migrationen auf das neue Format sollen bewusst und datengetrieben erfolgen.

---

## `stand_id`

Neue Zählerstände erhalten im Backend automatisch eine `stand_id`, falls keine gesetzt ist.

Aktuelles Format:

```text
ST_{objekt_id}_{einheit_id}_{zaehler_id}_{YYYY-MM-DD HH:mm}
```

Das verhindert Kollisionen, wenn dieselbe `zaehler_id` in mehreren Objekten oder Einheiten verwendet wird.

Vorhandene `stand_id`-Werte bleiben aktuell unverändert.

---

## Produktiver Testbereich

In der Live-DB gibt es einen dauerhaft getrennten Testbereich:

```text
objekt_id: TEST
bezeichnung: Test für Produktivsystem
```

Test-Einheiten:

- `TEST_WE_01` - belegte Testwohnung
- `TEST_WE_02` - Leerstand
- `TEST_Allgemein` - Allgemeinbereich

Test-Zähler:

- `Z_STROM_KWH_WOHNUNG_1`
- `Z_KALTWASSER_KW_WOHNUNG_1`
- `Z_WARMWASSER_WW_WOHNUNG_1`
- `Z_STROM_KWH_WOHNUNG_2`
- `Z_KALTWASSER_KW_WOHNUNG_2`
- `Z_WARMWASSER_WW_WOHNUNG_2`
- `Z_STROM_KWH_ALLGEMEIN`
- `Z_KALTWASSER_KW_HAUPTZAEHLER`
- `Z_WARMWASSER_WW_ZULAUF`
- `Z_OEL_STAND_IN_CM`
- `Z_OEL_GETANKT_LITER`

Dieser Bereich erlaubt produktive Schreibtests, ohne reale Objekt-, Einheiten- oder Zählerwerte zu verfälschen.

---

## Google Apps Script

Das Backend wird derzeit **manuell per Copy-Paste im Apps-Script-Editor** aktualisiert
(zuletzt 4.7.0 am 2026-10-22: `Code.gs` ersetzt, `Contracts` und `ContractService`
neu angelegt, dann neue Version der bestehenden Bereitstellung veröffentlicht; die
Web-App-URL bleibt dabei gleich). `clasp` ist vorbereitet und für den Abgleich nutzbar,
aber noch nicht der Standardweg.

Versionen und Deploy-Status stehen ausschließlich in [CHANGELOG.md](CHANGELOG.md).
Im Code steht die Version in `BACKEND_VERSION` (`apps-script/Code.gs`).

Wichtige Regeln:

- Jede fachliche oder technische Apps-Script-Änderung erhöht die Backend-Version
  und bekommt einen Eintrag im Changelog.
- Beim Deploy wird der Status im Changelog umgestellt (`produktiv` / `ersetzt`).
- Tests prüfen Format der Version, Übereinstimmung mit dem Kopfkommentar und
  den Changelog-Eintrag.
- Nach dem Deploy wird ein Git-Tag `vX.Y.Z` auf den Merge-Commit gesetzt.
- `clasp` ist lokal mit dem bestehenden GAS-Projekt verbunden; `npm run clasp:pull` funktioniert unter Node 22.
- Beim Anlegen einer **neuen Bereitstellung** ändert sich die Web-App-URL; dann muss `API_URL` in `config.js` angepasst werden. Neue Versionen einer bestehenden Bereitstellung ändern sie nicht.

---

## Nächste Schritte (Stand 2026-10-23)

1. **Technisches Aufräumen** (Paket 1): tote Konfiguration entfernt, CI nutzt Node aus `.nvmrc` und `npm ci`, Doku an die Realität angepasst.
2. **Backend-Zugriff absichern** (4.8.0, produktiv umgesetzt, Einspielen siehe `docs/access-control.md`): Lesen und Schreiben laufen mit `APP_ACCESS_KEY`; alte Bereitstellungen wurden archiviert. Der direkte GET-Test liefert `UNAUTHORIZED`.
3. **Verbrauch je Mieter/Vertrag:** Mieterwechsel erzeugen noch keine eigenen Verbrauchszeilen je Vertrag. Grundlage für eine spätere Nebenkostenabrechnung.
4. **Verbrauchsviews aktualisieren:** Die Web-App bietet jetzt eine geschützte Nutzeraktion
   `Verbrauchsdaten aktualisieren`. Sie stößt `updateVerbrauchViews()` im Backend an und lädt
   anschließend die vier materialisierten Views neu. Bis Backend 4.8.2 deployt ist, bleibt
   die manuelle Apps-Script-Funktion als Fallback erforderlich.
5. **Weitere Indexreihen:** erst nötig, wenn das Statistische Bundesamt auf ein neues VPI-Basisjahr umstellt und ein passender Vertrag existiert.

---

## Offene Arbeitspakete

### 1. `clasp` final verbinden

Ziel:

- Apps Script direkt aus dem Repository pushen
- Copy-Paste-Fehler vermeiden
- `appsscript.json` bewusst versionieren
- Deployments nachvollziehbarer machen

Aktueller Stand:

- `@google/clasp` ist als Dev-Dependency installiert.
- npm-Skripte für Login, Pull, Push und Status verwenden Node 22 aus `.nvmrc` und die lokale `.clasprc.json`.
- `.clasp.example.json`, `.claspignore` und `.gitignore` sind vorbereitet.
- Die echte Script-ID ist lokal in `.clasp.json` hinterlegt und wird nicht committed.
- Der produktive GAS-Stand wurde per Apps-Script-API abgerufen und lokal nachvollzogen.
- `apps-script/appsscript.json` entspricht dem produktiven Manifest.
- `apps-script/Migration.gs.gs` bildet die bestehende produktive Migrationsdatei ab (heißt im GAS-Projekt tatsächlich so; bewusst unverändert).
- `apps-script/StandIdMigration.gs` ergänzt die neue Bestandsdatenmigration.

Noch erforderlich:

1. Vor jedem `npm run clasp:push` erst `npm run clasp:pull` ausführen.
2. Pull-Diff prüfen.
3. Erst danach `npm run clasp:push` nutzen.

### 2. LOK-Zählerstruktur

Der Lokschuppen (`LOK`) wird analog zur neuen Zähleridentität über einheitgebundene `zaehler_id`s aufgebaut.

Aktuelle Modellannahme:

- `LOK_WE_01` bis `LOK_WE_05`: Eingang `A`
- `LOK_WE_06` bis `LOK_WE_09`: Eingang `B`
- `LOK_WE_10_A`, `LOK_WE_10_B`, `LOK_WE_10_S`: Eingang `B` vorläufig
- `LOK_WE_11` bis `LOK_WE_15`: Eingang `C`
- `LOK_GE_01`: Eingang `A`
- `LOK_Allgemein`: `Allgemein`

Apps Script `ensureLokStructureData` ergänzt:

- Spalte `eingange` in `Objekte`, falls sie fehlt
- Spalte `eingang` in `Einheiten`, falls sie fehlt
- fehlende LOK-Einheiten, z. B. `LOK_WE_10_A`, `LOK_WE_10_B` und `LOK_WE_10_S`
- fehlende LOK-Zähler in `Zaehler`
- alte LOK-Kurz-IDs wie `STROM`, `KW`, `WW`, `STROM_ALLGEMEIN` oder `KW_HAUPTZAEHLER` werden deaktiviert und erhalten `ersetzt_durch_zaehler_id`

Die Funktion überschreibt bestehende Eingangswerte nicht, sondern ergänzt nur leere Felder. Falls `LOK_WE_10` bereits durch einen früheren Lauf angelegt wurde, bleibt diese Einheit zunächst unverändert und kann in einem separaten Bereinigungsschritt deaktiviert oder historisch dokumentiert werden.

### 3. Dashboard/Auswertungen

Die erste Dashboard-Version hatte die Verbrauchsberechnung testbar im Frontend vorbereitet. Wegen der historischen Datenqualität und der notwendigen Nachvollziehbarkeit wird die fachliche Verbrauchsberechnung jetzt ins Apps-Script-Backend verschoben.

Umgesetzt mit Backend-Version `4.6.1`:

- `updateVerbrauchViews` baut materialisierte Verbrauchsviews aus `Zaehler`, `Zaehlerstaende`, `Einheiten` und `_view_aktive_mieter`.
- `_view_verbrauch_monat` enthält die prüfbaren Monatssegmente je Zählerintervall.
- `_view_verbrauch_jahr` aggregiert daraus Jahreswerte je Objekt, Einheit und Zähler.
- `_view_verbrauch_audit` prüft pro Zähler, ob Rohwerte, Intervalle und erzeugte View-Zeilen zusammenpassen.
- Zwei aufeinanderfolgende Ablesepunkte bilden ein Intervall.
- Intervallverbrauch wird tagesgenau auf Monate verteilt.
- Warnwerte bleiben sichtbar und werden nicht aus der View entfernt.
- Rückläufiger Ölstand in cm wird als Verbrauch behandelt.
- Steigender Ölstand in cm wird als prüfpflichtiger Hinweis markiert.
- Historische eindeutige Abweichungen wie `Z_STROM_HT_KWH_PRIVAT_HT` werden kanonisch den aktuellen Zähler-Stammdaten zugeordnet.
- Die Web-App kann die Verbrauchsviews schlank über `?view=verbrauch` abrufen.
- Die Funktion `updateVerbrauchViews()` ist in `apps-script/Code.gs` ab Backend-Version `4.6.0` enthalten; sie bleibt im Vertragsausbau erhalten.
- Neue Zählerstände werden in `Zaehlerstaende` gespeichert. Die materialisierten Verbrauchsviews
  werden bewusst nicht bei jedem einzelnen Eintrag neu berechnet. Nach mehreren Ablesungen wird
  die Aktualisierung gesammelt über den Button im Verbrauchs-Tab ausgelöst; bis zum Deploy von
  Backend 4.8.2 bleibt `updateVerbrauchViews()` im Apps-Script-Editor der Fallback.
- Wenn `updateVerbrauchViews()` im Apps-Script-Editor nicht auffindbar ist, läuft dort nicht der aktuelle Stand aus `apps-script/Code.gs` und das Script muss zuerst aktualisiert bzw. neu bereitgestellt werden.

Lokale Gegenprüfung mit den Live-Daten vom 2026-06-29:

- 1.910 Zählerstände
- 4.585 erzeugte Monatszeilen
- 357 erzeugte Jahreszeilen
- 180 Audit-Zeilen
- 0 ungelöste Messwertgruppen
- `Z_STROM_KWH_PRIVAT_HT`: 51 Rohwerte, 50 Intervalle, 116 Monatssegmente, 9 Jahreszeilen

Kanonische Zählerstand-Migration vorbereitet mit Backend-Version `4.6.2`:

- `previewCanonicalZaehlerstandMigration`
- `writeCanonicalZaehlerstandMigrationReport`
- `applyCanonicalZaehlerstandMigration`
- eindeutige historische Abweichungen werden in `objekt_id`, `einheit_id`, `zaehler_id` und `stand_id` korrigiert
- Fälle mit leerer Ziel-`einheit_id` im Zählerstamm werden blockiert und als `ZIEL_EINHEIT_FEHLT` gemeldet

Lokale Preview mit Live-Daten vom 2026-07-02:

```json
{"totalRows":1910,"changedRows":110,"unchangedRows":1738,"unresolvedRows":62,"duplicateRows":0,"missingHeaders":[]}
```

Nächster sinnvoller Schritt:

- Frontend-Verbrauchsdashboard ist auf `_view_verbrauch_jahr`, `_view_verbrauch_monat` und `_view_verbrauch_audit` umgestellt.
- Backend erzeugt zusätzlich `_view_verbrauch_bilanz_jahr` für fachlich berechnete Jahreskennzahlen.
- Die UI lädt die Verbrauchsviews lazy über `?view=verbrauch`.
- Initial wird ein Objekt mit vorhandenen Jahreswerten ausgewählt, damit der erste Dashboard-Stand nicht leer startet.
- Dashboard-Kacheln aggregieren fachlich normalisiert: `Strom HT`/`Strom NT` werden als Medium `Strom` angezeigt, die Unterscheidung bleibt über `Privat HT`/`Privat NT` sichtbar. Wohnungen werden als `Wohnungen` zusammengezogen, Gewerbe wird je Einheit getrennt, und Allgemein/Hauptzähler laufen im Block `Allgemein`.
- Kachelformel: Für das gewählte Objekt und Jahr werden alle Jahresview-Zeilen mit `in_summe_beruecksichtigen != FALSE` gruppiert nach fachlichem Bereich, Medium-Familie, Qualifier und Einheit summiert. `untergruppe` wird bei Wohnungen bewusst ignoriert, damit historische Zwischenwerte wie `HEIZUNG` nicht als eigene Wohnungs-Kachel erscheinen.
- Gewerbliche Hauptzähler werden über `einheit_id` (`*_GE_01`, `*_GE_02`) der jeweiligen Gewerbeeinheit zugeordnet. Dadurch werden z.B. `Strom · Black Inn · Privat HT` und `Strom · Kochdippe · Privat HT` getrennt ausgewiesen und nicht zu einer falschen Privat-HT-Summe addiert.
- Bilanzkennzahl `Strom · Black Inn`: `Strom · Black Inn · Privat HT + Strom · Black Inn · Privat NT - Strom · Flur - Strom · Heizung - Strom · Black Inn · Büro - Z_STROM_KWH_WOHNUNG_3 - Z_STROM_KWH_WOHNUNG_4`. Wohnung 2 wird explizit nicht abgezogen. Wohnung 1, 5, 10 und 11 werden nach aktuellem Stand nicht abgezogen, da als OVAG-Zähler geführt. Kodi HT/NT bleibt separat, da OVAG und kein Zwischenzähler.
- Die Detailtabelle zeigt pro Objekt eine feste Zählerliste aus allen bekannten Jahresview-Zählern. Fehlt für das gewählte Jahr ein Jahreswert, bleibt der Zähler sichtbar und wird mit `Keine Werte` markiert; der Vorjahresverbrauch wird weiterhin angezeigt, sofern vorhanden. Damit wird sichtbar, welche Zähler im aktuellen Jahr noch nicht abgelesen oder noch nicht berechnet wurden.
- Die Kachelübersicht zeigt die fachliche Bilanz `Strom · Black Inn` aggregiert. Die Quellzähler `Strom · Black Inn · Privat HT`, `Strom · Black Inn · Privat NT` und `Strom · Black Inn · Büro` bleiben in der Detailtabelle sichtbar, werden aber in der Kachelübersicht ausgeblendet, sobald die Black-Inn-Bilanz verfügbar ist. Bis die Backend-Bilanzview geladen ist, bildet die UI dieselbe Formel als Fallback nach.
- Dashboard-Kacheln sind nach Blöcken sortiert: Allgemein, Gewerbe, Wohnungen, Öl. Bilanzkacheln zeigen ihre Formel und Quellzähler aufklappbar an.
- Die Detailtabelle hat einen Statusfilter mit `Alle Zähler`, `Nur fehlende Werte` und `Nur Warnungen`.
- Das Verbrauchsdashboard enthält eine kompakte Übersicht für Verbrauchszeilen, fehlende/offene Werte, Warnungen und berechnete Werte/Bilanzen.
- Datenqualität wird aus den bereits vorhandenen Verbrauchs- und Audit-Views angezeigt; für diese Dashboard-Erweiterung wurde keine Backend-Logik geändert.
- Nächster UI-Ausbau: spätere visuelle Auswertung und fachliche Detailansichten pro Einheit/Medium.

Spätere Auswertungen sollen den Testbereich `TEST` sichtbar als Testdaten markieren oder aus produktiven Kennzahlen ausschließen.

Offener Sicherheits-/Konfigurationspunkt: Die produktive Apps-Script-Web-App-URL steht aktuell noch in der Frontend-Konfiguration. Vor einer breiteren Veröffentlichung muss die Backend-URL aus dem öffentlichen Quellcode herausgezogen oder über eine nicht committete lokale Konfiguration/Deployment-Umgebung bereitgestellt werden. Bereits veröffentlichte sensible Links sollten dann rotiert werden.

### Fortschritt 2026-09-30

Heute wurde die Zählererfassung und Verbrauchsansicht gezielt für bessere Bedienbarkeit und fachliche Nachvollziehbarkeit ausgebaut:

- Die manuelle Zählererfassung zeigt je Zähler den letzten gespeicherten Stand mit Datum im Format `DD.MM.YYYY HH:MM`.
- Das Zählererfassungs-Modal passt sich besser an Inhalt und Viewport an und scrollt intern, damit Speichern-/Abbrechen-Buttons nicht aus dem Rahmen laufen.
- Zählerboxen sind nach Medium dezent eingefärbt: Strom grün, Kaltwasser blau, Warmwasser rot, Öl hellbraun und sonstige Zusatzwerte neutral.
- Die Verbrauchstabelle unterscheidet klarer zwischen `Jahresverbrauch`, `Abrechnung bis heute`, `Vorjahr gesamt` und `Berechneter Zeitraum`.
- `Abrechnung bis heute` wird nicht mehr irreführend als `unterjährig` markiert, wenn der Zeitraum am `01.01.` beginnt.
- Der Hinweis zur Verbrauchstabelle steht direkt über der Tabelle.
- Die Detailtabelle zeigt Monatssegmente und Monate mit berechenbarem Verbrauch getrennt, damit Abweichungen wie `12 Segmente, 11 mit Verbrauch` sichtbar werden.
- Die Verbrauchstabelle ist optisch gruppiert nach Einheit/Block, z. B. `Haus`, `Black Inn`, `Kochdippe` oder Wohnung.
- Medium-Farben werden in der Verbrauchstabelle als dezente Farbstreifen und Badges wiederverwendet.
- Dokumentiert wurde, dass `_view_verbrauch_*` nach neuen Zählerständen aktuell manuell über `updateVerbrauchViews()` aktualisiert werden muss.
- Dokumentiert wurde außerdem die aktuelle Einschränkung, dass Mieterwechsel noch keine eigenen Verbrauchszeilen je Vertrag/Mieter erzeugen.

Validierung:

- `npm test` läuft lokal grün mit `88 passed`.

---

## Abgeschlossene Arbeitspakete

### Bestandsdatenmigration (abgeschlossen 2026-06-28)

Die Migration der 1.910 bestehenden `Zaehlerstaende` auf die neue `stand_id`-Logik wurde am 2026-06-28 erfolgreich ausgeführt.

Finaler Prüfstand:

```json
{"totalRows":1910,"migratableRows":1910,"changedRows":0,"unchangedRows":1910,"unresolvedRows":0,"duplicateRows":0,"mappingConflictRows":0,"missingHeaders":[]}
```

Historische Doppelwerte mit niedrigerem Verbrauchswert und höherem Zählerstand wurden automatisch in getrennte virtuelle Verbrauchszähler umgeschlüsselt.

Optionaler Folgeschritt: Historische `zaehler_id`s von Ra-HS-29 erst in einem separaten, kontrollierten Schritt auf das neue einheitgebundene Format migrieren.

### Ölstand-Plausibilität (abgeschlossen)

Der Zähler `oel_stand_cm` ist rückläufig: Ein sinkender Stand bedeutet Verbrauch und ist grundsätzlich plausibel. Ein steigender Stand bedeutet Betankung, Korrektur oder Messfehler und braucht eigene Regeln.

Umgesetzt:

1. Testfälle in `tests/validation-service.test.js` für `oel_stand_cm` ergänzt.
2. Plausibilitätslogik in `validation-service.js` um rückläufige Füllstandszähler erweitert.
3. Sinkender Ölstand wird als Verbrauch akzeptiert.
4. Steigender Ölstand erzeugt eine Warnung für Betankung, Korrektur oder Messfehler.
5. Überlauf wird für Ölstand in cm nicht angewendet.

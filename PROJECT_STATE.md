# PROJECT_STATE - Hausverwaltung

## Stand: 2026-06-27

Der aktuelle Branch erweitert die stabile Basis um robustere UI-Regressionstests, eine sauberere Zähleridentität, versionierte Apps-Script-Logik und einen produktiven Testbereich.

Dieses Dokument beschreibt den aktuellen Stand, wichtige Entscheidungen und die nächsten sinnvollen Arbeitspakete.

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
- Berechnete, inaktive oder nicht erfassbare Zähler werden nicht in der Eingabemaske angezeigt.
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

Google Apps Script wird weiterhin manuell versioniert.

Aktuelle Backend-Version:

```text
4.6.2
```

Die Version steht im Kopf von `apps-script/Code.gs` und in `BACKEND_VERSION`.

Wichtige Regel:

- Jede fachliche oder technische Apps-Script-Änderung erhöht die Backend-Version.
- Tests prüfen die erwartete `BACKEND_VERSION`.
- `4.3.1` repariert das zeitzonenstabile Parsing von JavaScript-Date-Strings für `stand_id`.
- `4.4.0` ergänzt eine Preview-/Apply-Migration für Bestands-Zählerstände.
- `4.4.1` ergänzt ein Report-Sheet für die Migrationsanalyse.
- `4.4.2` lernt eindeutige `zaehler_id`/`einheit_id`-Mappings aus bereits vorbereiteten Bestandsdaten.
- `4.4.3` löst bekannte fehlerhafte Bestands-Mappings per Override auf.
- `4.4.4` ergänzt den virtuellen Warmwasser-Gesamtzähler für historische Werte.
- `4.4.5` ergänzt einen separaten Duplikat-Report für die `stand_id`-Migration.
- `4.4.6` löst historische Doppelwerte als Zählerstand plus berechneten Verbrauch auf.
- `4.5.0` ergänzt die LOK-Zählerstruktur und Eingang-Stammdaten.
- `4.5.1` teilt LOK Wohnung 10 in A/B/S und lässt `ensureLokStructureData` fehlende LOK-Einheiten anlegen.
- `4.5.2` stellt LOK auf einheitgebundene `zaehler_id`s nach `Z_{einheit_id}_{medium}` um und deaktiviert alte Kurz-IDs.
- `4.6.0` ergänzt materialisierte Verbrauchsviews für Monats- und Jahreswerte.
- `4.6.1` ergänzt kanonische Zuordnung historischer Zählerstand-IDs und einen Audit-View für Verbrauchsdaten.
- `4.6.2` ergänzt eine Preview-/Report-/Apply-Migration für kanonische Zählerstand-Identitäten.
- `clasp` ist lokal mit dem bestehenden GAS-Projekt verbunden; `npm run clasp:pull` funktioniert unter Node 22.

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
- `apps-script/Migration.gs.gs` bildet die bestehende produktive Migrationsdatei ab.
- `apps-script/StandIdMigration.gs` ergänzt die neue Bestandsdatenmigration.

Noch erforderlich:

1. Vor jedem `npm run clasp:push` erst `npm run clasp:pull` ausführen.
2. Pull-Diff prüfen.
3. Erst danach `npm run clasp:push` nutzen.

### 2. Bestandsdatenmigration abgeschlossen

Die Migration der 1.910 bestehenden `Zaehlerstaende` auf die neue `stand_id`-Logik wurde am 2026-06-28 erfolgreich ausgeführt.

Finaler Prüfstand:

```json
{"totalRows":1910,"migratableRows":1910,"changedRows":0,"unchangedRows":1910,"unresolvedRows":0,"duplicateRows":0,"mappingConflictRows":0,"missingHeaders":[]}
```

Historische Doppelwerte mit niedrigerem Verbrauchswert und höherem Zählerstand wurden automatisch in getrennte virtuelle Verbrauchszähler umgeschlüsselt.

Optionaler Folgeschritt: Historische `zaehler_id`s von Ra-HS-29 erst in einem separaten, kontrollierten Schritt auf das neue einheitgebundene Format migrieren.

### 3. Ölstand-Plausibilität abgeschlossen

Der Zähler `oel_stand_cm` ist rückläufig: Ein sinkender Stand bedeutet Verbrauch und ist grundsätzlich plausibel. Ein steigender Stand bedeutet Betankung, Korrektur oder Messfehler und braucht eigene Regeln.

Umgesetzt:

1. Testfälle in `tests/validation-service.test.js` für `oel_stand_cm` ergänzt.
2. Plausibilitätslogik in `validation-service.js` um rückläufige Füllstandszähler erweitert.
3. Sinkender Ölstand wird als Verbrauch akzeptiert.
4. Steigender Ölstand erzeugt eine Warnung für Betankung, Korrektur oder Messfehler.
5. Überlauf wird für Ölstand in cm nicht angewendet.

### 4. LOK-Zählerstruktur

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

### 5. Dashboard/Auswertungen

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
- Die UI lädt die Verbrauchsviews lazy über `?view=verbrauch`.
- Initial wird ein Objekt mit vorhandenen Jahreswerten ausgewählt, damit der erste Dashboard-Stand nicht leer startet.
- Dashboard-Kacheln aggregieren fachlich normalisiert: `Strom HT`/`Strom NT` werden als Medium `Strom` angezeigt, die Unterscheidung bleibt über `Privat HT`/`Privat NT` sichtbar. Wohnungen werden als `Wohnungen` zusammengezogen, Gewerbe wird je Einheit getrennt, und Allgemein/Hauptzähler laufen im Block `Allgemein`.
- Kachelformel: Für das gewählte Objekt und Jahr werden alle Jahresview-Zeilen mit `in_summe_beruecksichtigen != FALSE` gruppiert nach fachlichem Bereich, Medium-Familie, Qualifier und Einheit summiert. `untergruppe` wird bei Wohnungen bewusst ignoriert, damit historische Zwischenwerte wie `HEIZUNG` nicht als eigene Wohnungs-Kachel erscheinen.
- Gewerbliche Hauptzähler werden über `einheit_id` (`*_GE_01`, `*_GE_02`) der jeweiligen Gewerbeeinheit zugeordnet. Dadurch werden z.B. `Strom · Black Inn · Privat HT` und `Strom · Kochdippe · Privat HT` getrennt ausgewiesen und nicht zu einer falschen Privat-HT-Summe addiert.
- Nächster UI-Ausbau: bessere Gruppierung nach Einheit/Medium, Filter für Statusfälle und später visuelle Auswertung.

Spätere Auswertungen sollen den Testbereich `TEST` sichtbar als Testdaten markieren oder aus produktiven Kennzahlen ausschließen.

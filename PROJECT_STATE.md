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

---

## Datenmodell: Zähleridentität

`zaehler_id` wird nicht mehr als global eindeutig betrachtet.

Die fachliche Identität eines Zählers entsteht aus:

```text
objekt_id + einheit_id + zaehler_id
```

Damit können neue Objekte dieselben kurzen Zählercodes verwenden, ohne lange globale IDs bilden zu müssen.

Für neue Daten wird perspektivisch empfohlen:

```text
objekt_id: Ra-HS-29
einheit_id: Ra-HS-29_WE_01
zaehler_id: STROM

objekt_id: TEST
einheit_id: TEST_WE_01
zaehler_id: STROM
```

Historische längere `zaehler_id`s bleiben gültig. Die Migration auf kürzere Codes soll später bewusst und datengetrieben erfolgen.

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
4.3.1
```

Die Version steht im Kopf von `apps-script/Code.gs` und in `BACKEND_VERSION`.

Wichtige Regel:

- Jede fachliche oder technische Apps-Script-Änderung erhöht die Backend-Version.
- Tests prüfen die erwartete `BACKEND_VERSION`.
- `4.3.1` repariert das zeitzonenstabile Parsing von JavaScript-Date-Strings für `stand_id`.
- `clasp` ist noch nicht eingerichtet und bleibt ein nächstes Arbeitspaket.

---

## Offene Arbeitspakete

### 1. Aktuellen Stand committen

Der aktuelle Branch enthält zusammenhängende Änderungen an:

- UI-Regressionstests
- Zähleridentität
- `stand_id`-Erzeugung
- Apps-Script-Versionierung
- produktivem Testbereich
- Dokumentation

Vor dem nächsten größeren Arbeitspaket sollte dieser Stand committed werden.

### 2. `clasp` einrichten

Ziel:

- Apps Script direkt aus dem Repository pushen
- Copy-Paste-Fehler vermeiden
- `appsscript.json` bewusst versionieren
- Deployments nachvollziehbarer machen

### 3. Bestandsdatenmigration vorbereiten

Bestehende `Zaehlerstaende` enthalten teilweise alte `stand_id`-Formate und fehlende `einheit_id`s.

Geplanter Migrationsablauf:

1. Fehlende `objekt_id` und `einheit_id` ergänzen.
2. Neue `stand_id` aus `objekt_id + einheit_id + zaehler_id + zeitstempel` erzeugen.
3. Doppelte IDs prüfen.
4. Erst danach optional kürzere `zaehler_id`s wie `STROM`, `KW`, `WW` einführen.

### 4. Dashboard/Auswertungen

Spätere Auswertungen sollen den Testbereich `TEST` sichtbar als Testdaten markieren oder aus produktiven Kennzahlen ausschließen.

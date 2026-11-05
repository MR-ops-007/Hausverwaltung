# QA-Bericht Verbrauchsstatistik V2

Stand: 2026-11-05
Branch: `fix/consumption-timestamp-normalization`
Objekt: `Ra-HS-29` / Hauptstraße 29
Testserver: lokaler Vite-Server auf Port 5182; bei belegtem Port alternativ 5183
Diagramm-Asset: `consumption-charts.js?v=20261104-verbrauchsstatistik-v29`
Review-Nachlauf: 2026-11-05 auf demselben Rohdaten-Snapshot vom 2026-11-04

## Auftrag und Prüfumfang

Geprüft wurden alle 42 im Dashboard angebotenen Zähler mit allen neun auswählbaren Jahren von 2018 bis 2026. Das entspricht 378 Zähler-/Jahr-Kombinationen.

Für jede Kombination wurden automatisiert geprüft:

- Auswahl von Jahr und Zähler im Browser
- Zählerstandsverlauf mit Rohwertpunkten, X-Achse und Y-Achse oder begründetem Leerzustand
- Monatsverbrauch des ausgewählten Jahres
- Jahresentwicklung
- Summe der sichtbaren Monatswerte gegen den Jahreswert der Tabelle
- Vorhandensein oder Fehlen von Werten ohne Umdeutung von „keine Daten“ in Null

Die Browserprüfung wurde nach einem zwischenzeitlichen Vite-Verbindungsabbruch wiederholt. Die erste Auswertung enthielt außerdem zwei Fehler im Prüfskript selbst: einmal wurde das fehlende Jahres-`aria-label` angenommen, danach wurden aktuelle und Vorjahreswerte aus derselben Monatskarte gemeinsam gelesen. Beide Prüfskriptfehler wurden korrigiert. Nach der Korrektur der nicht-zirkulären Abgleichslogik wurde die Matrix erneut bewertet; die folgenden Zahlen trennen echte Abweichungen von kleinen, transparent gekennzeichneten Abgleichen. Die fachliche Matrix stammt vom 2026-11-03; die technische Nachprüfung und Dokumentationsaktualisierung erfolgten am 2026-11-04.

## Historischer Browserlauf vom 2026-11-03 (nicht aktueller Datenstand)

| Jahre | Kombinationen | Mit Jahres- und Monatswert verglichen | Abweichung > 0,2 | Maximale Abweichung | Jahreswert ohne Monatswerte | Monatswert ohne Jahreswert | Leerer Zählerstandsverlauf trotz Monatswerten | Kombinationen mit Jahresrest | mit Rohintervall ergänzt | klein abgeglichen |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2018–2020 | 126 | 47 | 0 | 0,02 | 0 | 72 | 6 | 88 | 22 | 2 |
| 2021–2023 | 126 | 44 | 0 | 0,02 | 1 | 72 | 6 | 85 | 21 | 6 |
| 2024–2026 | 126 | 43 | 11 | 660,86 | 0 | 69 | 6 | 59 | 46 | 2 |
| **Gesamt** | **378** | **134** | **11** | **660,86** | **1** | **213** | **18** | **232** | **89** | **10** |

Dieser Lauf ist als historische Referenz erhalten. Die Zahlen sind nicht die aktuelle Abnahmebasis. Von 134 damals vergleichbaren Kombinationen stimmten 113 ohne Anpassung mit dem Jahreswert überein. Zehn weitere Kombinationen lagen innerhalb des kleinen Abgleichsfensters und wurden proportional abgeglichen sowie gekennzeichnet. Die damals gezählten 11 großen Abweichungen und 213 Monatswerte ohne Jahreswert konnten im anschließenden Live- und Rohdaten-Snapshot nicht reproduziert werden.

Die damaligen 213 Fälle „Monatswert ohne Jahreswert“ waren damit ein Befund dieses Browserlaufs, aber keine belastbare Aussage über die aktuelle View. Die aktuelle Matrix weist Schlüsselbefunde getrennt aus (`annualMatchType`) und wird für neue Aussagen mit einem aktuellen Snapshot erneut ausgeführt.

Die 18 leeren Zählerstandsverläufe trotz Monatswerten gehören zu berechneten oder anderweitig nicht manuell erfassbaren Zählern. Für diese existieren keine passenden Rohablesungen in `Zaehlerstaende`; ein Linienverlauf kann deshalb nicht seriös erfunden werden. Der Monats- und Jahresverbrauch kann trotzdem aus den materialisierten Verbrauchsviews dargestellt werden.

## Review-Status vom 2026-11-05

Commit `8ecdf73` wurde technisch geprüft. Die beiden Regressionen für das laufende
Jahr sind bestätigt: ausgeschöpfte Jahresreste erzeugen keine künstlichen Nullmonate,
und große Abweichungen werden auch ohne `anzahl_monate_mit_verbrauch` als Prüfhinweis
markiert. Der Folgefix dieses Branches ergänzt die UTC-/Europe-Berlin-Normalisierung.

### Folgefix: UTC-Monatsgrenzen

View-Zeilen tragen teilweise `jahr = 2026`, aber als Monatswert einen UTC-Zeitstempel
wie `2025-12-31T23:00:00.000Z`. Dieser Zeitpunkt ist in `Europe/Berlin` bereits der
01.01.2026. Die UI hatte zuvor das Jahr und den Monat aus dem rohen UTC-Text gelesen
und die Zeile dadurch aus dem Verbrauchsjahr entfernt.

Der Folgefix ordnet ISO-Zeitstempel über das Berliner Lokaldatum zu und verwendet
dieselbe Normalisierung für die Teilmonatsprüfung. Dadurch werden auch mehrere
Segmente am lokalen Jahresanfang nicht verworfen.

Auch `ui-service.js` verwendet jetzt dieselbe gemeinsame Normalisierung. Der
Fallback für Zeitraumdarstellungen behandelt ISO-UTC-Monatswerte dadurch nicht mehr
als unbekannte Jahreszeiträume. Der reguläre Testlauf setzt `TZ=Europe/Berlin`, damit
lokale Datumsberechnungen reproduzierbar sind.

Der erneute Lauf auf demselben Rohdaten-Snapshot ergibt:

| Kennzahl | Ergebnis |
| :--- | ---: |
| Vergleichbare Kombinationen | 356 |
| Angezeigte Summen im direkten Treffer | 356 |
| `explained_by_readings` | 0 |
| `unexpected_with_marker` | 0 |
| `unexplained` | 0 |
| Maximale Restabweichung | Rundungsrauschen (`1,8e-12`) |

Die Öl-Fachlogik ist damit nicht abschließend gelöst. Der numerische Monats-/Jahres-
Abgleich ist korrigiert; die Interpretation von `oel_stand_cm` als Füllstand mit
Nachfüllungen bleibt Bestandteil des separaten Heizöl-Pakets.

Zusatzläufe unter `TZ=UTC` und `TZ=Asia/Tokyo` liefen mit 232 grünen Tests. Unter
Node 24 beendet der standardmäßige Vitest-Thread-Pool den Tokio-Lauf anschließend
mit einem nativen V8-Fehler (Exit 134); mit `--pool=forks` beziehungsweise
`--no-file-parallelism` endet derselbe Lauf sauber. Das ist ein Test-Runner-Thema,
kein fachlicher Testfehler.

Eine kompakte `--explain`-Ausgabe für die Matrixprüfung bleibt als Folgeaufgabe in
`ROADMAP.md` vermerkt.

Die View-Monatszeilen sind damit gegen ISO-/UTC-Datumswerte abgesichert. Die
Aufteilung physischer Rohintervalle verwendet weiterhin die lokale Browser-Zeitzone;
für den aktuellen Berliner Einzelbetrieb ist das konsistent. Eine feste globale
Zeitbasis für alle Nutzer ist ein separates Architekturthema. Ebenfalls offen bleibt
die Prüfung, ob die Sheets-Spalte `monat` als Datum oder als Text gespeichert wird und
ob die Backend-Ausgabe dauerhaft als `YYYY-MM` stabilisiert werden sollte.

## Live-Snapshot-Prüfung vom 2026-11-04

Der geschützte Snapshot wurde am 2026-11-04 erfolgreich über den POST-Endpunkt abgerufen. Die Antwort enthielt:

- `_view_verbrauch_monat`: 4.599 Zeilen
- `_view_verbrauch_jahr`: 359 Zeilen
- `_view_verbrauch_audit`: 180 Zeilen
- `_view_verbrauch_bilanz_jahr`: 9 Zeilen

Die Matrixprüfung über 42 Zähler und neun Jahre umfasst weiterhin 378 Kombinationen. Im aktuellen Snapshot ergibt sich:

| Kennzahl | Ergebnis |
| :--- | ---: |
| Mit Monats- und Jahreswert verglichen | 356 |
| Treffer ohne Anpassung | 356 |
| Kleiner Abgleich | 0 |
| Große Abweichung | 0 |
| Monatswert ohne Jahreswert | 0 |
| Jahreszeile ohne nutzbaren Monatsverbrauch | 1 |
| Kombinationen ohne Jahreszeile und ohne nutzbaren Monatsverbrauch | 21 |
| Jahreszeilen über Alias-Schlüssel gefunden | 0 |
| Jahreszeilen über exakten Schlüssel gefunden | 357 |

Die zuvor berichteten 213 Fälle „Monatswert ohne Jahreswert“ sind im aktuellen Live-Snapshot nicht reproduzierbar. Die 21 Kombinationen ohne Jahreszeile sind derzeit fehlende Datenkombinationen, keine nachgewiesenen Alias-Konflikte:

Die 356 exakten Treffer belegen die interne Konsistenz von `_view_verbrauch_monat` und `_view_verbrauch_jahr`; sie sind keine unabhängige fachliche Plausibilitätsprüfung, weil die Jahresview aus der Monatsview aufgebaut wird. Dafür ist der Rohdaten-Snapshot mit `Zaehlerstaende` erforderlich.

- `Z_STROM_KWH_BUERO`: 2018–2023
- `Z_STROM_KWH_WOHNUNG_1`: 2026
- `Z_STROM_KWH_WOHNUNG_2`: 2026
- `Z_STROM_KWH_KODI_NT`: 2026
- `Z_STROM_KWH_KODI_HT`: 2026
- `Z_KALTWASSER_KW_WOHNUNG_6`: 2026
- `Z_KALTWASSER_KW_WOHNUNG_10`: 2025–2026
- `Z_OEL_GETANKT_LITER`: 2026
- `Z_OEL_STAND_IN_CM_ZUSATZTANK`: 2020–2026

Zusätzlich gibt es für `Z_OEL_GETANKT_LITER` im Jahr 2023 eine Jahreszeile mit `0` Verbrauch, aber 14 Monatssegmenten ohne berechenbaren Verbrauch. Die Rohwerte sind dort rückläufig und als `WARNUNG_RUECKLAEUFIG` sowie `NICHT_BERECHENBAR` markiert. Das ist ein fachlicher Öl-Datenfall und kein fehlender Jahresview-Schlüssel.

Der Snapshot aus `view=verbrauch` enthält bewusst nur die vier materialisierten Verbrauchsviews, nicht `Zaehlerstaende`. Deshalb ist der Zählerstandsverlauf in dieser Snapshot-Prüfung nicht bewertbar. Die Matrix zählt diese Fälle ausdrücklich als `lineCheckUnavailable` und nicht als leeren Verlauf. Für eine vollständige Linienprüfung ist zusätzlich ein separater, lokal gespeicherter Rohdaten-Snapshot erforderlich.

Für diese vollständige Prüfung stellt das Abruftool den Modus `--include-raw` bereit. Dabei wird der Backend-Leseweg `alle` verwendet, die lokale Snapshot-Datei enthält danach aber ausschließlich die vier Verbrauchsviews sowie `Zaehler` und `Zaehlerstaende`; Personen-, Vertrags- und Zahlungsdaten werden nicht gespeichert:

```sh
APP_ACCESS_KEY="$APP_ACCESS_KEY" npm run qa:consumption-snapshot -- --include-raw --output=/private/tmp/verbrauch-snapshot-raw.json
npm run qa:consumption-matrix -- /private/tmp/verbrauch-snapshot-raw.json --object=Ra-HS-29 --years=2018,2019,2020,2021,2022,2023,2024,2025,2026
```

### Ergebnis des Rohdatenlaufs vom 2026-11-04

Der Rohdaten-Snapshot enthielt 49 Zählerstammdaten und 1.910 historische Zählerstände. Dadurch wurden 49 Zähler mit neun Jahren geprüft, also 441 Kombinationen:

| Kennzahl | Ergebnis |
| :--- | ---: |
| Mit Monats- und Jahreswert verglichen | 356 |
| Treffer ohne Anpassung | 356 |
| Angezeigte Monatssumme gegen Jahreswert vergleichbar | 356 |
| Angezeigte Summe trifft den Jahreswert | 356 |
| Angezeigte Abweichung aus Rohintervall (`explained_by_readings`) | 0 |
| Rohintervall-Abweichungen innerhalb der relativen 2%-Schwelle | 0 |
| Unerwartete Abweichung mit Prüfmarker (`unexpected_with_marker`) | 0 |
| Ungeklärte Abweichung ohne Marker | 0 |
| Maximale angezeigte Abweichung | Rundungsrauschen (`1,8e-12`) |
| Kleiner Abgleich | 0 |
| Große Abweichung | 0 |
| Jahreszeile ohne nutzbaren Monatsverbrauch | 1 |
| Kombinationen ohne Jahreszeile und ohne nutzbaren Monatsverbrauch | 84 |
| Zählerstandsverlauf ohne Rohablesung trotz Monatswert | 18 |
| Kombinationen aus Rohablesungen ergänzt | 89 |
| Kombinationen mit transparentem Abgleich | 10 |
| Kombinationen mit Prüfhinweis | 106 |

Die 18 leeren Zählerstandsverläufe betreffen ausschließlich zwei berechnete Zähler über jeweils neun Jahre:

- `Z_WARMWASSER_WW_ZULAUF_MINUS_ALLER_WW_LOKAL` für `Ra-HS-29_GE_02`
- `Z_WARMWASSER_WW_GESAMT_BERECHNET` für `Ra-HS-29_Allgemein_Heizung`

Für beide existieren keine physischen Rohablesungen. Der Leerzustand ist deshalb fachlich korrekt; ein künstlicher Linienverlauf wäre falsch. Für alle übrigen Zähler-/Jahr-Kombinationen mit Monatswerten ist ein Rohdatenbezug vorhanden.

Die 84 Kombinationen ohne Jahreszeile sind durch die feste Stammdatenbasis größer als im reinen View-Snapshot: Der Rohdatenlauf enthält zusätzlich Zähler, für die im gewählten Jahr keinerlei nutzbarer Monats- oder Jahresverbrauch vorliegt. Es handelt sich damit nicht um 84 nachgewiesene Join- oder Aliasfehler. Alias-Treffer wurden nicht benötigt (`annualMatchesAlias = 0`).

Auch dieser Vergleich belegt zunächst die interne Konsistenz der materialisierten Monats- und Jahresviews. Die unabhängige Rohdatenprüfung ist für die Diagrammherkunft aussagekräftig (`combinationsFromReadings = 89`), ersetzt aber keine fachliche Bewertung jedes einzelnen Verbrauchswerts.

## Fachliche Berechnungslogik

### 1. Primärquelle Monatsview

`_view_verbrauch_monat` ist die primäre Quelle für die Monatsdarstellung. Jede Zeile repräsentiert ein Monatssegment eines Rohwertintervalls. Die UI aggregiert nur passende Kombinationen aus `objekt_id`, `einheit_id` und aktueller bzw. im Audit dokumentierter `zaehler_id`.

Deutsche Zahlenformate wie `1.040,82` werden als `1040.82` gelesen. Monatsangaben mit ein- oder zweistelligen Monatsnummern, z. B. `2025-1` und `2025-10`, werden korrekt dem jeweiligen Monat zugeordnet.

### 2. Historische Jahre

Für ein abgeschlossenes Jahr gelten diese Regeln:

1. Vorhandene Monatswerte werden unverändert übernommen.
2. Fehlende Monate werden zuerst aus passenden Rohintervallen ergänzt, wenn deren Summe zur Jahresview passt.
3. Wenn kein passendes Rohintervall vorhanden ist, wird ein klar positiver verbleibender Jahreswert höchstens auf die von der Jahresview als belegt gemeldeten fehlenden Monate verteilt. Diese Werte sind im UI als `linear fortgeschrieben` markiert. Ein Rest von ungefähr null erzeugt keine künstlichen Nullmonate.
4. Wenn die Monatsreihe nur geringfügig vom Jahreswert abweicht, wird sie innerhalb des kleinen Abgleichsfensters proportional angepasst und als `Jahreswert abgeglichen` sowie `Prüfhinweis` markiert. Größere Abweichungen werden nicht verändert, sondern als Prüfhinweis sichtbar gelassen.

Der Jahreswert aus `_view_verbrauch_jahr` ist dabei die Prüfsumme für die Darstellung. Die UI verschweigt die Herleitung nicht, sondern kennzeichnet fortgeschriebene und abgeglichene Werte.

### 3. Laufendes Jahr

Für das laufende Jahr werden keine zukünftigen Monate prognostiziert.

- Verbrauch aus vorhandenen Monatszeilen bleibt sichtbar.
- Ein belegtes Monatssegment mit leerem Verbrauch kann aus dem verbleibenden Jahreswert ergänzt werden. Das ist als `aus Jahresrest ergänzt` und zusätzlich als Prüfhinweis markiert.
- Vorhandene Rohintervalle dürfen bis zum letzten Messpunkt Monatswerte ergänzen. Diese sind als `aus Rohintervall ergänzt` markiert.
- Monate ohne Monatssegment und ohne Rohintervall bleiben leer.

Damit wird ein fehlender Messwert nicht stillschweigend als Null oder als Zukunftsprognose ausgegeben.

### 4. `in_summe_beruecksichtigen`

Das Feld steuert Summen und Bilanzkacheln. Ein numerischer Monatswert bleibt in der Einzelzähler-Statistik sichtbar, auch wenn er nicht in eine aggregierte Bilanz eingehen darf. Die Kennzeichnung als Prüfhinweis bleibt erhalten.

## Konkrete fachliche Prüfungen

### Black Inn · Strom Hauptzähler (privat HT)

- 2025: Die Monatswerte werden inklusive der fehlenden historischen Segmente dargestellt und summieren sich auf den Tabellenwert `7.159,59 kWh`.
- Die historische Roh-ID `Z_STROM_HT_KWH_PRIVAT_HT` wird über die Audit-Zuordnung dem aktuellen Zähler `Z_STROM_KWH_PRIVAT_HT` zugeordnet.
- 2026: Die sechs belegten Monate werden angezeigt; spätere Monate bleiben leer. Eine Zukunftsprognose wird nicht erzeugt.

### Zählerstandsverlauf

Bei vorhandenen Rohablesungen werden numerische Y-Achsenwerte, Datumsbeschriftungen auf der X-Achse und Messwertpunkte ausgegeben. Bei berechneten Zählern ohne Rohablesungen wird ein erklärender Leerzustand angezeigt, statt eine scheinbare Messkurve zu erzeugen.

## Änderungen im Code

- Monatsparser korrigiert, insbesondere für Oktober bis Dezember.
- Deutsche Tausender- und Dezimalformate werden korrekt verarbeitet.
- Historische Alias-Zähler-IDs aus `source_keys` werden für die Diagrammzuordnung berücksichtigt.
- Monatssegmente mit weniger Tagen als der jeweilige Kalendermonat werden intern weiter als zeitanteilige View-Zeile erkannt. Die wenig hilfreiche sichtbare Kategorie `Teilmonat` wurde aus der Diagrammoberfläche entfernt.
- Rückläufige Rohintervalle werden im Diagramm als Prüfhinweis sichtbar und nicht still als Verbrauch interpretiert.
- Die Legende unterscheidet rückläufige Rohwerte jetzt rot (`Zählerstand prüfen`) von allgemeinen Monats-/Jahresabweichungen orange (`Prüfhinweis`). Der aufklappbare Bereich `Hinweise erklären` nennt die konkrete Ursache und die nächste Prüfung; bei einem fallenden Rohintervall sind die betroffenen Alt-/Neu-Werte enthalten.
- Monatsverbräuche werden aus Rohintervallen zeitanteilig verteilt, wenn die Materialized View dafür Daten liefert.
- Historische Restwerte und laufende belegte Segmente werden sichtbar gekennzeichnet.
- Aktuelle Jahre werden nicht in zukünftige Monate hochgerechnet.
- Monatswertkarten, Legenden sowie X-/Y-Achsen machen die Herleitung sichtbar.
- Render-Rennen beim Objektwechsel während des Nachladens werden verworfen; ein alter Datenstand kann dadurch nicht mehr den neu gewählten Objektstand überschreiben.
- Die Diagrammoberfläche startet mit `Fläche`; die Jahresauswahl in der Statistik ist mit der Dashboard-Jahresauswahl verknüpft.
- Asset-Version auf `v29` erhöht, damit Parser-, Rücklauf- und Diagrammkorrekturen nach dem Deployment geladen werden.
- Große Abweichungen zwischen Monats- und Jahresview werden nicht mehr still skaliert. Monatswertkarten und Balken zeigen dafür `Prüfhinweis`; Linien werden an fehlenden Monaten unterbrochen, und der Balkenmodus zeigt beide Jahre.
- Ein Fehler im Diagramm-Rendering blendet einen verständlichen Leerhinweis ein, ohne Tabelle und Datenqualitätsbereich zu verlieren.
- Die Entscheidung „laufendes Jahr“ kann über einen festen Stichtag injiziert werden; die Regressionstests hängen dadurch nicht mehr von der Systemuhr ab.

Es wurden keine Apps-Script- oder Backend-Dateien geändert.

## Automatisierte Tests

Ausgeführt am 2026-11-04; Matrixdaten vom 2026-11-03:

```text
npm test
11 Testdateien, 226 Tests erfolgreich
```

Zusätzlich:

```text
git diff --check
ohne Befund
```

Die Regressionstests decken unter anderem ab:

- korrekte Monatszuordnung inklusive zweistelliger Monatsnummern
- deutsche Zahlenformate
- historische Zähler-ID-Aliase
- Rohintervall- und Jahresrest-Ergänzung
- kleiner transparenter Abgleich und sichtbare Kennzeichnung größerer Monats-/Jahresabweichungen
- keine künstlichen historischen Nullmonate bei ausgeschöpftem Jahreswert
- keine Prognose zukünftiger Monate im laufenden Jahr
- Teilmonate und fachlich passende Alias-Zuordnungen
- rückläufige Rohintervalle ohne stille Verbrauchserzeugung
- Achsen, Monatswertkarten, Lücken in Linien und Leerzustände
- reproduzierbare Matrix-Klassifikation von Rohvergleich, Fortschreibung und Abweichung
- zeitunabhängige Regressionen für das laufende Jahr über einen festen Teststichtag
- Schutz vor veralteten Dashboard-Renders beim Objektwechsel

## Offene Datenqualitätsbefunde

Die UI-Berechnung ist für die Fälle ohne große Monats-/Jahresabweichung konsistent. Offen bleiben Datenbasisfälle, die fachlich in den Views beziehungsweise im Audit sichtbar bleiben müssen:

- Für berechnete Zähler ohne manuelle Rohablesungen gibt es keinen Zählerstandsverlauf. Das betrifft im aktuellen Rohdatenlauf ausschließlich die beiden oben genannten berechneten Warmwasserzähler und ist erwartbar.
- Die drei zuvor markierten Abweichungen waren auf die UTC-/Europe-Berlin-Monatszuordnung zurückzuführen. Der Folgefix nimmt alle drei Fälle in die Anzeige auf; im erneuten Rohdatenlauf gibt es keine unerklärte oder unerwartet markierte Abweichung mehr.
- Die zuvor 31 `explained_by_readings`-Fälle entstehen nach der korrigierten Monatszuordnung nicht mehr als Summenabweichung. Rohintervall-Ergänzungen bleiben technisch möglich, werden aber nicht mehr als Abweichung vom Jahreswert gezählt.
- 84 Zähler-/Jahr-Kombinationen haben im Rohdatenlauf weder nutzbaren Monats- noch Jahresverbrauch. Das sind Datenlücken in der festen Stammdatenmatrix, nicht automatisch Join- oder Aliasfehler.
- Für `Z_OEL_GETANKT_LITER` existiert 2023 eine Jahreszeile mit 0 Verbrauch und 14 nicht berechenbaren Monatssegmenten wegen rückläufiger Rohwerte. Dieser Fall bleibt ein fachlicher Öl-Datenbefund.
- Die Darstellung verwendet bei fortgeschriebenen oder abgeglichenen Werten bewusst eine Kennzeichnung. Diese Werte sind keine zusätzlichen Rohablesungen.
- Die Matrix-Klassifikation ist unter `tools/qa-consumption-matrix.mjs` reproduzierbar. Sie weist zusätzlich `displayedDifference`, `displayedRelativeDifference`, `displayedDifferenceClass`, `displayedDifferencesExplained`, `displayedReadingsOutsideRelativeThreshold`, `displayedDifferencesUnexpectedWithMarker` und `displayedDifferencesUnexplained` aus. Das Skript arbeitet bewusst mit einem exportierten View-Snapshot und benötigt keine Zugangsdaten. Ein vollständiger Live-Export der Produktivdaten gehört nicht ins Repository.

## Reproduzierbarer QA-Ablauf

1. Lokalen Server auf Port 5182 starten; falls belegt, einen freien Alternativport wie 5183 verwenden.
2. Hauptstraße 29 auswählen und den Tab `Verbrauch` öffnen.
3. Für jeden angebotenen Zähler die Jahre 2018 bis 2026 auswählen.
4. Prüfen, dass Monatswerte nicht als Null erscheinen, wenn keine Berechnung möglich ist.
5. Bei vorhandenen Jahres- und Monatswerten die sichtbare Monatssumme gegen den Tabellenwert vergleichen.
6. Bei Rohablesungen den Zählerstandsverlauf einschließlich Achsen und Datum prüfen.
7. Einen berechneten Zähler ohne Rohablesungen auswählen und den erklärenden Leerzustand prüfen.

Für die reproduzierbare Datenprüfung einen nicht committeten Snapshot der Backend-Antwort speichern und ausführen. Der Abruf verwendet denselben geschützten POST-Weg wie die Web-App, schreibt nur eine validierte JSON-Antwort und ersetzt die Zieldatei nicht, wenn das Backend HTML oder eine Fehlerantwort liefert:

```sh
printf "Zugangsschlüssel eingeben (Eingabe bleibt unsichtbar): "; read -r -s APP_ACCESS_KEY
printf '\n'
if [ -z "$APP_ACCESS_KEY" ]; then echo "Kein Zugangsschlüssel eingegeben."; exit 1; fi
APP_ACCESS_KEY="$APP_ACCESS_KEY" npm run qa:consumption-snapshot -- --output=/private/tmp/verbrauch-snapshot.json
unset APP_ACCESS_KEY
```

Der Aufräumbefehl lautet ausschließlich `unset APP_ACCESS_KEY`; das `=` gehört nur zur temporären Übergabe an `npm` und darf nicht hinter `unset` stehen.

Danach:

```text
npm run qa:consumption-matrix -- /pfad/verbrauch-snapshot.json --object=Ra-HS-29 --years=2018,2019,2020,2021,2022,2023,2024,2025,2026
```

Der Snapshot darf Zugangsschlüssel und andere Geheimnisse nicht enthalten. HTML-Fehlerseiten werden vor `JSON.parse()` erkannt und als Abruffehler gemeldet. Das Ergebnis weist insbesondere `rawMatchWithoutAdjustment`, `smallReconciliation`, `largeMismatch`, `monthlyWithoutAnnual` und `annualWithoutMonthly` getrennt aus.
Zusätzlich wird je Kombination `annualMatchType` (`exact`, `alias` oder `none`) ausgegeben. Damit lässt sich unterscheiden, ob eine Jahreszeile unter dem exakten Schlüssel, über eine dokumentierte Alias-Zuordnung oder gar nicht gefunden wurde.

Die Zahlenformatregel der Google-Sheets-Views ist in `DATA_MODEL.md` dokumentiert: gespeicherte Werte sind numerisch, die sichtbare Darstellung verwendet bei deutscher Region `#,##0.00`.

Dieser Bericht dokumentiert sowohl die durchgeführten Prüfungen als auch die verbleibenden Datenbasisgrenzen. Eine erfolgreiche Testausführung wird nicht als Beleg dafür interpretiert, dass jede Datenzeile fachlich vollständig ist.

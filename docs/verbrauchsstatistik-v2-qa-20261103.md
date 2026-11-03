# QA-Bericht Verbrauchsstatistik V2

Stand: 2026-11-03
Branch: `feature/verbrauchsstatistik-v2`
Objekt: `Ra-HS-29` / Hauptstraße 29
Testserver: lokaler Vite-Server auf Port 5182
Diagramm-Asset: `consumption-charts.js?v=20261103-verbrauchsstatistik-v24`

## Auftrag und Prüfumfang

Geprüft wurden alle 42 im Dashboard angebotenen Zähler mit allen neun auswählbaren Jahren von 2018 bis 2026. Das entspricht 378 Zähler-/Jahr-Kombinationen.

Für jede Kombination wurden automatisiert geprüft:

- Auswahl von Jahr und Zähler im Browser
- Zählerstandsverlauf mit Rohwertpunkten, X-Achse und Y-Achse oder begründetem Leerzustand
- Monatsverbrauch des ausgewählten Jahres
- Jahresentwicklung
- Summe der sichtbaren Monatswerte gegen den Jahreswert der Tabelle
- Vorhandensein oder Fehlen von Werten ohne Umdeutung von „keine Daten“ in Null

Die Browserprüfung wurde nach einem zwischenzeitlichen Vite-Verbindungsabbruch wiederholt. Die erste Auswertung enthielt außerdem zwei Fehler im Prüfskript selbst: einmal wurde das fehlende Jahres-`aria-label` angenommen, danach wurden aktuelle und Vorjahreswerte aus derselben Monatskarte gemeinsam gelesen. Beide Prüfskriptfehler wurden korrigiert; die folgenden Ergebnisse stammen ausschließlich aus dem korrigierten Lauf.

## Ergebnis der vollständigen Matrixprüfung

| Jahre | Kombinationen | Mit Jahres- und Monatswert verglichen | Abweichung > 0,2 | Maximale Abweichung | Jahreswert ohne Monatswerte | Monatswert ohne Jahreswert | Leerer Zählerstandsverlauf trotz Monatswerten |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2018–2020 | 126 | 47 | 0 | 0,02 | 0 | 72 | 6 |
| 2021–2023 | 126 | 45 | 0 | 0,04 | 0 | 72 | 6 |
| 2024–2026 | 126 | 43 | 0 | 0,03 | 0 | 69 | 6 |
| **Gesamt** | **378** | **135** | **0** | **0,04** | **0** | **213** | **18** |

Die verglichenen Monatsreihen stimmen damit innerhalb der sichtbaren Rundung mit dem Jahreswert überein. Es gibt keinen Fall, in dem ein Jahreswert vorhanden ist, aber der Monatsverbrauch leer bleibt. Die 213 Fälle „Monatswert ohne Jahreswert“ sind keine Rechenabweichung: Dort liefert die Monatsview Daten, während für die konkrete Zähler-/Jahr-Kombination keine Jahreszeile vorhanden ist. Das Dashboard zeigt die Monatsdaten trotzdem und lässt den fehlenden Jahreswert als fehlend erkennbar.

Die 18 leeren Zählerstandsverläufe trotz Monatswerten gehören zu berechneten oder anderweitig nicht manuell erfassbaren Zählern. Für diese existieren keine passenden Rohablesungen in `Zaehlerstaende`; ein Linienverlauf kann deshalb nicht seriös erfunden werden. Der Monats- und Jahresverbrauch kann trotzdem aus den materialisierten Verbrauchsviews dargestellt werden.

## Fachliche Berechnungslogik

### 1. Primärquelle Monatsview

`_view_verbrauch_monat` ist die primäre Quelle für die Monatsdarstellung. Jede Zeile repräsentiert ein Monatssegment eines Rohwertintervalls. Die UI aggregiert nur passende Kombinationen aus `objekt_id`, `einheit_id` und aktueller bzw. im Audit dokumentierter `zaehler_id`.

Deutsche Zahlenformate wie `1.040,82` werden als `1040.82` gelesen. Monatsangaben mit ein- oder zweistelligen Monatsnummern, z. B. `2025-1` und `2025-10`, werden korrekt dem jeweiligen Monat zugeordnet.

### 2. Historische Jahre

Für ein abgeschlossenes Jahr gelten diese Regeln:

1. Vorhandene Monatswerte werden unverändert übernommen.
2. Fehlende Monate werden zuerst aus passenden Rohintervallen ergänzt, wenn deren Summe zur Jahresview passt.
3. Wenn kein passendes Rohintervall vorhanden ist, wird der verbleibende Jahreswert gleichmäßig auf die fehlenden Monate verteilt. Diese Werte sind im UI als `linear fortgeschrieben` markiert.
4. Wenn die Monatsreihe nicht exakt zum Jahreswert passt, wird die Monatsverteilung proportional auf den Jahreswert abgeglichen. Diese Werte sind als `Jahreswert abgeglichen` markiert.

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
- Monatsverbräuche werden aus Rohintervallen zeitanteilig verteilt, wenn die Materialized View dafür Daten liefert.
- Historische Restwerte und laufende belegte Segmente werden sichtbar gekennzeichnet.
- Aktuelle Jahre werden nicht in zukünftige Monate hochgerechnet.
- Monatswertkarten, Legenden sowie X-/Y-Achsen machen die Herleitung sichtbar.
- Render-Rennen beim Objektwechsel während des Nachladens werden verworfen; ein alter Datenstand kann dadurch nicht mehr den neu gewählten Objektstand überschreiben.
- Asset-Version auf `v24` erhöht, damit der korrigierte Diagrammcode nach dem Deployment geladen wird.

Es wurden keine Apps-Script- oder Backend-Dateien geändert.

## Automatisierte Tests

Ausgeführt am 2026-11-03:

```text
npm test
10 Testdateien, 209 Tests erfolgreich
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
- Abgleich der Monatsreihe mit dem Jahreswert
- keine Prognose zukünftiger Monate im laufenden Jahr
- Achsen, Monatswertkarten und Leerzustände
- Schutz vor veralteten Dashboard-Renders beim Objektwechsel

## Offene Datenqualitätsbefunde

Die UI-Berechnung ist in der geprüften Matrix konsistent. Offen bleiben Datenbasisfälle, die fachlich in den Views beziehungsweise im Audit sichtbar bleiben müssen:

- Für berechnete Zähler ohne manuelle Rohablesungen gibt es keinen Zählerstandsverlauf.
- In 213 Kombinationen existieren Monatswerte ohne korrespondierende Jahreszeile. Das ist kein Monats-/Jahresmismatch, sollte aber bei der Pflege von `updateVerbrauchViews()` beziehungsweise der Jahresview fachlich beobachtet werden.
- Die Darstellung verwendet bei fortgeschriebenen oder abgeglichenen Werten bewusst eine Kennzeichnung. Diese Werte sind keine zusätzlichen Rohablesungen.

## Reproduzierbarer QA-Ablauf

1. Lokalen Server auf Port 5182 starten.
2. Hauptstraße 29 auswählen und den Tab `Verbrauch` öffnen.
3. Für jeden angebotenen Zähler die Jahre 2018 bis 2026 auswählen.
4. Prüfen, dass Monatswerte nicht als Null erscheinen, wenn keine Berechnung möglich ist.
5. Bei vorhandenen Jahres- und Monatswerten die sichtbare Monatssumme gegen den Tabellenwert vergleichen.
6. Bei Rohablesungen den Zählerstandsverlauf einschließlich Achsen und Datum prüfen.
7. Einen berechneten Zähler ohne Rohablesungen auswählen und den erklärenden Leerzustand prüfen.

Dieser Bericht dokumentiert sowohl die durchgeführten Prüfungen als auch die verbleibenden Datenbasisgrenzen. Eine erfolgreiche Testausführung wird nicht als Beleg dafür interpretiert, dass jede Datenzeile fachlich vollständig ist.

# P6 Testprotokoll: Mieteingänge

Stand: 2026-11-13 23:36 CET
Branch: `codex/p6-payment-hardening`  
Testumgebung: `TEST · Entenhausen`, Backend 4.8.12
Browser-URL: `http://127.0.0.1:5200/?cacheBust=20261113-live-test-p6`

Dieses Protokoll trennt automatisierte Fachtests von der sichtbaren Browserprüfung.
Die TEST-Daten wurden nicht als Produktionsdaten behandelt. Die Verknüpfung von
`Vertraege` zu `Zahlungen` erfolgt über `vertrag_id`; Zeilenpositionen oder die
Sortierung der Google-Sheets sind dafür nicht relevant.

## Ergebnisübersicht

- `npm test`: **20 Testdateien, 474 Tests grün**.
- `npm run check:frontend-assets`: **19 lokale Assets vorhanden**.
- `git diff --check`: **grün**.
- `tests/payment-ui.test.js`: **42 Tests grün**.
- Browserprüfung mit echtem TEST-Backend: **TEST-Daten sichtbar, fachlich zugeordnet und schreibbar**.
- Kein fachlicher Blocker im geprüften Umfang.

## Einzelfälle

| Nr. | Fall | Erwartung | Ergebnis |
| --- | --- | --- | --- |
| 1 | Objektwechsel und Nachladen | Nach Auswahl von TEST bleiben Verträge und Zahlungen auf TEST; ein bereits geöffneter Bereich wird nach dem vollständigen Laden aktualisiert. | **Grün**: `Test für Produktivsystem` ist ausgewählt, die Matrix zeigt TEST-Verträge. Automatisierter Render-Regressionstest grün. |
| 2 | Vertragsverknüpfung | Vertrag und Zahlung werden über dieselbe `vertrag_id` verbunden. | **Grün**: Donald, Mickey/Minnie, Daisy, Dagobert, Gustav sowie Tick/Trick erscheinen mit den erwarteten Monatsbeträgen. |
| 3 | Fachlicher Mietmonat | Eingangsdatum und Mietmonat sind getrennt; eine Zahlung vom November kann einen anderen Monat ausgleichen. | **Grün**: Für Donald wurde am `13.11.2026` eine Zahlung für `2026-03` erfasst. Die UI und das TEST-Backend zeigen nach Reload weiterhin `mietmonat: "2026-03"`. |
| 4 | Pünktliche bzw. vollständige Zahlung | Vollständig bezahlter Monat wird als `Bezahlt` dargestellt. | **Grün**: Matrix und Tooltip zeigen den vollständigen Soll-/Ist-Betrag. Automatisiert geprüft. |
| 5 | Verspätete vollständige Zahlung | Vollständig bezahlt bleibt grün, trägt aber zusätzlich den Hinweis `verspätet`. | **Grün**: Sichtbar bei mehreren TEST-Verträgen, z. B. `800,00 / 800,00 EUR`. |
| 6 | Teilzahlung | Der eingegangene Betrag wird angezeigt, der Rest bleibt offen; Status ist `Teilbezahlt`. | **Grün**: Mickey/Minnie `250,00 / 800,00 EUR`, Tick/Trick `600,00 / 800,00 EUR`. |
| 7 | Offener und überfälliger Monat | Nicht vollständig bezahlte Monate nach Frist werden rot als `Überfällig` markiert; die Frist ist im Tooltip sichtbar. | **Grün**: Tooltip enthält konkretes Fälligkeitsdatum und den offenen Sollbetrag. |
| 8 | Zukünftiger Monat | Monate vor der individuellen Frist werden blau als `Zukünftig` dargestellt und nicht als offen gezählt. | **Grün**: Dezember 2026 ist in der TEST-Matrix entsprechend markiert. |
| 9 | Leerstand | Leerstand bleibt sichtbar, ist neutral/weiß und erhöht die offene Miete nicht. | **Grün**: `WE 07 TEST · Leerstand` zeigt `0,00 EUR / 0,00 EUR` und den Hinweis `Leerstand`. |
| 10 | Kaution teilweise bezahlt | Kaution bleibt außerhalb der Monatsmiete und zeigt bezahlt/offen separat. | **Grün**: Die TEST-Übersicht zeigte zunächst `930,00 / 1.600,00 EUR`; der Kautionsdialog enthielt keinen Mietmonat und schlug `670,00 EUR` Rest vor. |
| 11 | Kaution vollständig bezahlt | Vollständige Kaution wird separat als erledigt geführt. | **Grün**: `670,00 EUR` wurden im echten TEST-Backend erfasst; die UI zeigte anschließend `1.600,00 / 1.600,00 EUR`. Die API-Zeile hat `art = Kaution` und ein leeres `mietmonat`. |
| 12 | Überzahlung | Eine Zahlung über dem offenen Monatsbetrag wird vor dem Speichern auf Monate und/oder Guthaben verteilt; nichts wird still verschluckt. | **Grün**: Ein echter TEST-Eingang von `801,00 EUR` wurde im Aufteilungsdialog auf `800,00 EUR` für April und `1,00 EUR` für Januar verteilt. Beide API-Zeilen tragen dieselbe `zahlungsgruppe_id`; die Summe stimmt exakt. |
| 13 | Guthaben in der Übersicht | Nicht zugeordnete Reste erscheinen als Guthaben und nicht als Mietmonat. | **Grün**: Automatisierter Übersichts-Test grün; die TEST-Übersicht zeigt einen Guthabenbetrag. |
| 14 | Erstattung | Erstattung wird als negativer Betrag geführt und verschlechtert den vorher bezahlten Mietstatus nicht. | **Grün**: Ein echter TEST-Eingang über `1,00 EUR` wurde als `-1,00 EUR`, `art = Erstattung`, für Oktober gespeichert; der Monat blieb in der UI bezahlt. |
| 15 | Storno einer Zahlung | Storno ist append-only, übernimmt den fachlichen Monat des Originals und darf nur einmal erfolgen. | **Grün**: Die echte März-Zahlung wurde über die UI storniert. Die API enthält die Originalzeile und eine Gegenbuchung `-123,45 EUR` mit `storno_von` und `mietmonat = "2026-03"`; die März-Zelle war danach wieder offen. |
| 16 | Retry nach Timeout | Derselbe Schreibversuch verwendet dieselbe Zahlungs-ID und kann sicher wiederholt werden. | **Grün**: Retry- und Queue-Tests grün. |
| 17 | Backend-Schema-Gate | Ohne `payment_schema_ready` wird nicht geschrieben; ein transienter Netzfehler bleibt queue-fähig. | **Grün**: Capability- und Preflight-Tests grün. |
| 18 | Zwei Hauptmieter | Mehrere Vertragsparteien erscheinen gemeinsam, ohne die Zahlungszuordnung zu verlieren. | **Grün**: Mickey Mouse / Minnie Mouse sowie Tick Duck / Trick Duck sichtbar. |
| 19 | CSV-Import | Deutsche CSV-Werte werden gelesen, Vertrag und Mietmonat werden vorgeschlagen; unklare Zeilen bleiben offen. | **Grün**: Parser-, Vorschlags-, Mietmonat- und Import-Tests grün; kein echter Bankexport verwendet. |
| 20 | Inaktive Verträge | Inaktive Verträge erscheinen nicht in der aktiven Monatsmatrix. | **Grün**: Automatisierter Matrix-Test grün. |

## Sichtbare Browserprüfung

Im Browser wurden zusätzlich geprüft:

1. Die Umgebung zeigt dauerhaft `TEST · Entenhausen` und Backend 4.8.12.
2. Nach Auswahl von TEST und Öffnen von `Mieteingänge` erscheinen sieben TEST-Einheiten,
   darunter sechs Vertragsfälle und ein Leerstand.
3. Die Tabelle enthält die erwarteten Mieter, Sollbeträge, Kautionsstände und zwölf
   Monatszellen je Vertrag.
4. Die Statusdarstellung enthält sichtbar `Bezahlt verspätet`, `Teilbezahlt verspätet`,
   `Überfällig verspätet`, `Zukünftig`, `Vor Mietbeginn` und `Leerstand`.
5. Ein März-Zellklick öffnet den Erfassungsdialog mit `Fachlicher Mietmonat: 2026-03`
   und dem getrennten Eingangsdatum. Nach einem Reload bleibt der März-Eintrag im März.
6. Der Kautionsdialog zeigt `Kaution erfassen`, den Restbetrag und kein Mietmonat; nach
   dem Speichern wird die vollständige Kaution separat angezeigt.
7. Der Aufteilungsdialog zeigt die exakte Summenprüfung und speichert eine gemeinsame
   Zahlungsgruppe für mehrere Mietmonate.
8. Die Zusammenfassung zeigt offene Miete, überfällige Monate, wiederholte Verspätungen,
   Guthaben und Kaution getrennt.

## Grenzen dieser Prüfung

- Die Browserprüfung hat bewusst zusätzliche synthetische Schreibvorgänge im TEST-Sheet
  ausgelöst: eine Teilzahlung, deren Storno, eine vollständige Kaution, eine Erstattung
  und eine Überzahlung mit Aufteilung. Diese Zeilen sind Testdaten und dürfen vor einem
  neuen Durchlauf zurückgesetzt oder über ihre Storno-/Gegenbuchungen bereinigt werden.
- CSV wurde mit synthetischen deutschen Beispieldaten geprüft, nicht mit einem echten
  Bankexport.
- Retry-Konflikt, echter Netzwerkabbruch und echter Apps-Script-Lock-Timeout wurden nicht
  im Browser provoziert; dafür existieren die isolierten Queue-/Backend-Regressionstests.
- Der Fehlerpfad bei einer leeren Vollantwort wurde automatisiert geprüft, aber nicht durch
  einen absichtlich blockierten Live-Endpunkt ausgelöst.
- Die Zahlen in der Übersicht sind der aktuelle synthetische TEST-Bestand und keine
  fachliche Aussage über PROD.

## Schlussfolgerung

Die Zuordnung zwischen Mietverträgen und Mieteingängen funktioniert im geprüften TEST-
Bestand auch über echte Schreib- und Reload-Grenzen hinweg. Der zuvor sichtbare falsche
Objektkontext wurde als Frontend-Race beim Hintergrundladen identifiziert und mit einer
Regression abgesichert. Die technische Verknüpfung selbst bleibt ausschließlich ID-basiert
über `vertrag_id`. Das Backend liefert neue `mietmonat`-Werte als Text `YYYY-MM`; die UI
interpretiert ältere Google-Sheets-ISO-Werte zeitzonenrichtig für `Europe/Berlin`.

## Ergänzende PROD-Abnahme am 2026-11-14

Die PROD-Abnahme wurde ausschließlich im dauerhaft getrennten Objekt
`objekt_id = TEST` (`Test für Produktivsystem`) durchgeführt. Die vollständige
Fallliste und die Sheet-Nachweise stehen in
[`docs/p6-1-dublettenwarnung-testprotokoll-20261114.md`](p6-1-dublettenwarnung-testprotokoll-20261114.md).

Für die Abnahme wurde dort ein kontrolliertes Fixture ergänzt: `TEST_WE_03` mit Vertrag
34, Mickey Mouse und Minnie Mouse, `900,00 EUR` Gesamtmiete und `2.000,00 EUR`
Kautions-Soll. Dadurch konnten Kaution, Mehrparteien-Verknüpfung, Mietmonat,
Überzahlung mit Verteilung, Erstattung, Nachzahlung, Storno, erneute Zahlung und
Reload-Persistenz direkt in der PROD-GUI geprüft werden. Die Schreibvorgänge und
anschließenden Sheet-Lesekontrollen betrafen ausschließlich `TEST`; reale Objekte
wurden nicht verändert.

Die fachliche PROD-Abnahme ist für die produktiven Schreib- und Statusfälle abgeschlossen.
Der einzige nicht automatisiert abgenommene Teil ist das explizite Abbrechen der nativen
Dublettenwarnung, weil die Browser-Automation den `confirm()`-Dialog automatisch bestätigt.


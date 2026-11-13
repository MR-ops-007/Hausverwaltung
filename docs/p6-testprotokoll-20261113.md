# P6 Testprotokoll: Mieteingänge

Stand: 2026-11-13 00:57 CET  
Branch: `codex/p6-payment-hardening`  
Testumgebung: `TEST · Entenhausen`, Backend 4.8.11  
Browser-URL: `http://127.0.0.1:5197/?cacheBust=20261113-payment-context-fix-v4`

Dieses Protokoll trennt automatisierte Fachtests von der sichtbaren Browserprüfung.
Die TEST-Daten wurden nicht als Produktionsdaten behandelt. Die Verknüpfung von
`Vertraege` zu `Zahlungen` erfolgt über `vertrag_id`; Zeilenpositionen oder die
Sortierung der Google-Sheets sind dafür nicht relevant.

## Ergebnisübersicht

- `npm test`: **20 Testdateien, 472 Tests grün**.
- `git diff --check`: **grün**.
- `tests/payment-ui.test.js`: **41 Tests grün**.
- Browserprüfung: **TEST-Daten sichtbar und fachlich zugeordnet**.
- Kein fachlicher Blocker im geprüften Umfang.

## Einzelfälle

| Nr. | Fall | Erwartung | Ergebnis |
| --- | --- | --- | --- |
| 1 | Objektwechsel und Nachladen | Nach Auswahl von TEST bleiben Verträge und Zahlungen auf TEST; ein bereits geöffneter Bereich wird nach dem vollständigen Laden aktualisiert. | **Grün**: `Test für Produktivsystem` ist ausgewählt, die Matrix zeigt TEST-Verträge. Automatisierter Render-Regressionstest grün. |
| 2 | Vertragsverknüpfung | Vertrag und Zahlung werden über dieselbe `vertrag_id` verbunden. | **Grün**: Donald, Mickey/Minnie, Daisy, Dagobert, Gustav sowie Tick/Trick erscheinen mit den erwarteten Monatsbeträgen. |
| 3 | Fachlicher Mietmonat | Eingangsdatum und Mietmonat sind getrennt; eine Zahlung vom November kann Februar ausgleichen. | **Grün**: Der geöffnete Donald-Dialog zeigt Eingangsdatum `13.11.2026` und fachlichen Mietmonat `2026-02`. |
| 4 | Pünktliche bzw. vollständige Zahlung | Vollständig bezahlter Monat wird als `Bezahlt` dargestellt. | **Grün**: Matrix und Tooltip zeigen den vollständigen Soll-/Ist-Betrag. Automatisiert geprüft. |
| 5 | Verspätete vollständige Zahlung | Vollständig bezahlt bleibt grün, trägt aber zusätzlich den Hinweis `verspätet`. | **Grün**: Sichtbar bei mehreren TEST-Verträgen, z. B. `800,00 / 800,00 EUR`. |
| 6 | Teilzahlung | Der eingegangene Betrag wird angezeigt, der Rest bleibt offen; Status ist `Teilbezahlt`. | **Grün**: Mickey/Minnie `250,00 / 800,00 EUR`, Tick/Trick `600,00 / 800,00 EUR`. |
| 7 | Offener und überfälliger Monat | Nicht vollständig bezahlte Monate nach Frist werden rot als `Überfällig` markiert; die Frist ist im Tooltip sichtbar. | **Grün**: Tooltip enthält konkretes Fälligkeitsdatum und den offenen Sollbetrag. |
| 8 | Zukünftiger Monat | Monate vor der individuellen Frist werden blau als `Zukünftig` dargestellt und nicht als offen gezählt. | **Grün**: Dezember 2026 ist in der TEST-Matrix entsprechend markiert. |
| 9 | Leerstand | Leerstand bleibt sichtbar, ist neutral/weiß und erhöht die offene Miete nicht. | **Grün**: `WE 07 TEST · Leerstand` zeigt `0,00 EUR / 0,00 EUR` und den Hinweis `Leerstand`. |
| 10 | Kaution teilweise bezahlt | Kaution bleibt außerhalb der Monatsmiete und zeigt bezahlt/offen separat. | **Grün**: Übersicht `900,00 / 1.600,00 EUR`; der Kautionsdialog enthält keinen Mietmonat und schlägt `700,00 EUR` Rest vor. |
| 11 | Kaution vollständig bezahlt | Vollständige Kaution wird separat als erledigt geführt. | **Grün**: Automatisierter Status- und Übersichts-Test grün. |
| 12 | Überzahlung | Eine Zahlung über dem offenen Monatsbetrag wird vor dem Speichern auf Monate und/oder Guthaben verteilt; nichts wird still verschluckt. | **Grün**: Aufteilungsplan, eindeutige Teilbuchungen, gemeinsame `zahlungsgruppe_id` und Guthaben-Rest automatisiert geprüft. |
| 13 | Guthaben in der Übersicht | Nicht zugeordnete Reste erscheinen als Guthaben und nicht als Mietmonat. | **Grün**: Automatisierter Übersichts-Test grün; die TEST-Übersicht zeigt einen Guthabenbetrag. |
| 14 | Erstattung | Erstattung wird als negativer Betrag geführt und verschlechtert den vorher bezahlten Mietstatus nicht. | **Grün**: Betrag-Normalisierung und Statusberechnung automatisiert geprüft. |
| 15 | Storno einer Zahlung | Storno ist append-only, übernimmt den fachlichen Monat des Originals und darf nur einmal erfolgen. | **Grün**: Backend- und lokaler-State-Tests für neue und historische Zahlungen grün. |
| 16 | Retry nach Timeout | Derselbe Schreibversuch verwendet dieselbe Zahlungs-ID und kann sicher wiederholt werden. | **Grün**: Retry- und Queue-Tests grün. |
| 17 | Backend-Schema-Gate | Ohne `payment_schema_ready` wird nicht geschrieben; ein transienter Netzfehler bleibt queue-fähig. | **Grün**: Capability- und Preflight-Tests grün. |
| 18 | Zwei Hauptmieter | Mehrere Vertragsparteien erscheinen gemeinsam, ohne die Zahlungszuordnung zu verlieren. | **Grün**: Mickey Mouse / Minnie Mouse sowie Tick Duck / Trick Duck sichtbar. |
| 19 | CSV-Import | Deutsche CSV-Werte werden gelesen, Vertrag und Mietmonat werden vorgeschlagen; unklare Zeilen bleiben offen. | **Grün**: Parser-, Vorschlags-, Mietmonat- und Import-Tests grün; kein echter Bankexport verwendet. |
| 20 | Inaktive Verträge | Inaktive Verträge erscheinen nicht in der aktiven Monatsmatrix. | **Grün**: Automatisierter Matrix-Test grün. |

## Sichtbare Browserprüfung

Im Browser wurden zusätzlich geprüft:

1. Die Umgebung zeigt dauerhaft `TEST · Entenhausen` und Backend 4.8.11.
2. Nach Auswahl von TEST und Öffnen von `Mieteingänge` erscheinen sieben TEST-Einheiten,
   darunter sechs Vertragsfälle und ein Leerstand.
3. Die Tabelle enthält die erwarteten Mieter, Sollbeträge, Kautionsstände und zwölf
   Monatszellen je Vertrag.
4. Die Statusdarstellung enthält sichtbar `Bezahlt verspätet`, `Teilbezahlt verspätet`,
   `Überfällig verspätet`, `Zukünftig`, `Vor Mietbeginn` und `Leerstand`.
5. Ein Februar-Zellklick öffnet den Erfassungsdialog mit `Fachlicher Mietmonat: 2026-02`
   und dem getrennten Eingangsdatum.
6. Der Kautionsdialog zeigt `Kaution erfassen`, den Restbetrag und kein Mietmonat.
7. Die Zusammenfassung zeigt offene Miete, überfällige Monate, wiederholte Verspätungen,
   Guthaben und Kaution getrennt.

## Grenzen dieser Prüfung

- In diesem Durchlauf wurden keine zusätzlichen Schreibvorgänge in das TEST-Sheet
  ausgelöst. Die Schreibpayloads, Retry-, Storno- und Capability-Fälle sind durch die
  automatisierten Tests abgedeckt; die bestehende TEST-Datenbasis wurde nur gelesen.
- CSV wurde mit synthetischen deutschen Beispieldaten geprüft, nicht mit einem echten
  Bankexport.
- Ein echter Netzwerkabbruch und ein echter Apps-Script-Lock-Timeout wurden nicht im
  Browser provoziert; dafür existieren die isolierten Queue-/Backend-Regressionstests.
- Die Zahlen in der Übersicht sind der aktuelle synthetische TEST-Bestand und keine
  fachliche Aussage über PROD.

## Schlussfolgerung

Die Zuordnung zwischen Mietverträgen und Mieteingängen funktioniert im geprüften TEST-
Bestand. Der zuvor sichtbare falsche Objektkontext wurde als Frontend-Race beim
Hintergrundladen identifiziert und mit einer Regression abgesichert. Die technische
Verknüpfung selbst bleibt ausschließlich ID-basiert über `vertrag_id`.


# P6.1 Testprotokoll: Dublettenwarnung

Stand: 2026-11-14
Branch: `codex/p6-1-payment-duplicate-warning`

P6.1 ergänzt eine weiche Warnung vor einer möglichen doppelten Zahlung. Die Warnung
blockiert nicht grundsätzlich: Der Nutzer kann abbrechen oder ausdrücklich trotzdem
speichern. Es gibt keine Änderung an Apps Script, Google-Sheets-Schema, `zahlung_id`,
Storno- oder Zahlungsgruppenlogik.

## Vergleichsregel

Eine mögliche Dublette liegt vor, wenn alle folgenden Werte übereinstimmen:

- `vertrag_id`
- Eingangsdatum als Kalendertag
- Betrag nach Rundung auf Cent
- fachlicher `mietmonat`
- Zahlungsart (`Miete`, `Nachzahlung`, `Kaution` oder `Erstattung`)

Historische Zahlungen ohne `mietmonat` werden für den Vergleich ihrem Eingangsmonat
zugeordnet. Bei Kautionen bleibt der fachliche Monat leer. Eine gleiche `zahlung_id`
wird als Retry ausgenommen; eine neue manuelle Aktion erhält weiterhin absichtlich eine
neue ID.

## Automatisierte Prüfung

- `npm test`: **20 Testdateien, 483 Tests grün**.
- `tests/payment-ui.test.js`: **51 Tests grün**.
- `npm run check:frontend-assets`: **19 lokale Assets vorhanden**.
- `git diff --check`: **grün**.

Abgedeckte Fälle:

1. Gleiche Vertrags-ID, Datum, Betrag, Mietmonat und Zahlungsart werden erkannt.
2. Abweichendes Datum wird nicht als Dublette gemeldet.
3. Eine andere Zahlungsart wird nicht als Dublette gemeldet.
4. Eine historische Zahlung ohne `mietmonat` wird ihrem Eingangsmonat zugeordnet.
5. Manuelle Eingabe: Abbruch erzeugt keinen Schreibrequest.
6. Manuelle Eingabe: ausdrückliche Bestätigung lässt die Buchung zu.
7. CSV-Übernahme: Abbruch lässt die Importzeile unverändert.
8. CSV-Import zeigt die mögliche Dublette bereits vor der Übernahme an.
9. Eine bereits stornierte Zahlung und ihre Stornozeile werden nicht erneut als Dublette gewertet.
10. Ein Retry mit derselben `zahlung_id` wird nicht als eigene Dublette gewertet.

Die beiden letzten Regeln wurden nach dem Senior-Review ergänzt. Eine stornierte Zahlung
darf anschließend ohne Warnroutine neu erfasst werden; eine identische `zahlung_id` bleibt
ein Idempotenzfall und keine neue Buchung.

## Visuelle Prüfung

Im lokalen Mock wurde die Zahlungsansicht mit Entenhausen-Daten geöffnet. Für Donald Duck
wurde die Februar-Zelle mit `150,00 EUR`, Eingangsdatum `11.11.2026` und Zahlungsart
`Miete` erneut zur Speicherung vorbereitet. Die bestehende Zahlung mit genau dieser
Signatur wurde erkannt und der Browser zeigte sichtbar:

> Mögliche Doppelbuchung: Am 11.11.2026 wurden bereits 150,00 EUR als Miete für 2026-02
> für diesen Vertrag erfasst. Bitte prüfen, ob der Eingang schon gespeichert ist.
>
> Trotzdem speichern?

Der visuelle Test wurde vor dem Bestätigen abgebrochen; es wurde keine zusätzliche
Mock-Zahlung geschrieben.

## Abnahme im echten TEST-Backend

Am 2026-11-14 wurde der aktuelle Frontendstand gegen die TEST-Bereitstellung mit
Backend 4.8.12 geprüft. Als Abnahmeobjekt wurde ausschließlich `objekt_id = TEST`
(`Test für Produktivsystem`) verwendet.

Sichtbar vorhanden waren sechs Vertragsfälle mit mehreren Mietern, Teilzahlungen,
verspäteten Zahlungen, Überzahlungen, Kautionen sowie ein Leerstand. Die Übersicht
zeigte diese Fälle getrennt mit den erwarteten Statusfarben und der Kautionssumme.

Für `WE 01 TEST` / Donald Duck wurde im Januar 2026 zunächst eine neue Zahlung über
2,00 EUR mit Eingangsdatum 14.11.2026 gespeichert. Die Zelle aktualisierte sich von
1,00 EUR auf 3,00 EUR und die Oberfläche meldete `Zahlung gespeichert.`. Eine erneute
Eingabe mit derselben Signatur löste im echten TEST-Backend sichtbar die Warnung aus:

> Mögliche Doppelbuchung: Am 14.11.2026 wurden bereits 2,00 EUR als Miete für 2026-01
> für diesen Vertrag erfasst.

Die Wiederholung wurde im Native-Dialog anschließend ausdrücklich bestätigt, um auch
den Bestätigungsweg zu prüfen. Der TEST-Bestand enthält deshalb für diesen Fall nun
5,00 EUR im Januar (1,00 EUR Bestand plus zwei bestätigte 2,00-EUR-Testbuchungen).
Das ist ein beabsichtigter synthetischer TEST-Datenbestand und betrifft keine
Produktivwohnung.

## Vollständige fachliche PROD-Abnahme im Testobjekt

Am 2026-11-14 wurde der Frontendstand mit Apps Script 4.8.12 gegen die bestehende
PROD-Bereitstellung geprüft. Sämtliche Schreibvorgänge beschränkten sich auf
`objekt_id = TEST` (`Test für Produktivsystem`); reale Objekte wurden nicht beschrieben.

Für die Abnahme wurde das TEST-Fixture kontrolliert erweitert, weil der Vertragsschreibweg
in der Vertragsmaske weiterhin bewusst deaktiviert ist:

- `TEST_WE_03` / `WE 03 TEST Kaution`, Vertrag 34, `900,00 EUR` Gesamtmiete,
  `2.000,00 EUR` Kautions-Soll.
- Vertragsparteien: Mickey Mouse und Minnie Mouse.

Die PROD-Umgebung zeigte `PRODUKTION`, Backend 4.8.12 und nach einem Reload weiterhin
die neue Wohnung, den Vertrag und die Zahlungsdaten. Die folgenden Fälle wurden in der
GUI ausgeführt und anschließend im echten Sheet geprüft:

1. **Teil- und Vollkaution:** `1.200,00 EUR` und anschließend `800,00 EUR` wurden als
   getrennte `Kaution`-Zeilen gespeichert. Die Kaution blieb ohne Mietmonat und wurde
   anschließend als `2.000,00 / 2.000,00 EUR` mit grünem Vertragsstatus angezeigt.
2. **Fachlicher Mietmonat:** Ein Eingang vom `14.11.2026` wurde über die Januar-Zelle
   gespeichert. Das Sheet enthält `mietmonat = 2026-01`; der Dialog zeigte den
   Eingang zusätzlich als `14.11.2026 · Monat 2026-01`.
3. **Überzahlung mit Verteilung:** `1.000,00 EUR` für Januar wurden exakt auf
   `900,00 EUR` Januar und `100,00 EUR` Februar verteilt. Beide Zeilen tragen dieselbe
   `zahlungsgruppe_id`; die Summe stimmt exakt.
4. **Erstattung:** `50,00 EUR` wurden für Januar als `-50,00 EUR`, `art = Erstattung`
   gespeichert. Der vollständig bezahlte Januar blieb als `Bezahlt` sichtbar.
5. **Storno und erneute Zahlung:** Die Januarzahlung über `900,00 EUR` wurde über
   `Rückgängig` append-only mit `-900,00 EUR`, `storno_von` und gleichem Mietmonat
   storniert. Eine anschließende neue Januarzahlung über `900,00 EUR` wurde gespeichert;
   der Dialog zeigte Original, Storno und neue Zahlung.
6. **Nachzahlung:** `50,00 EUR` wurden über die März-Zelle als `art = Nachzahlung`
   und `mietmonat = 2026-03` gespeichert.
7. **Statusdarstellung:** Nach Reload waren `Bezahlt`, `Teilbezahlt`, `Überfällig`,
   `Zukünftig`, verspätete Zahlungen und der separate Kautionsstatus in der Matrix
   weiterhin sichtbar. Die offene Miete und der Kautionsstatus wurden nach jeder
   relevanten Buchung neu berechnet.
8. **Dublettenwarnung:** Eine identische 2-EUR-Zahlung für Dezember wurde zweimal
   über die GUI ausgelöst. Der Browser-Automationslauf bestätigt native `confirm()`-
   Dialoge automatisch; deshalb konnte der Abbruchpfad nicht interaktiv abgenommen
   werden. Die beiden 2-EUR-Zeilen sind als bewusstes synthetisches TEST-Fixture im
   Sheet sichtbar. Der Warn-/Speicherpfad ist durch die automatisierten Tests und den
   identischen Mock-/TEST-Abnahmelauf abgedeckt; der PROD-Abbruchpfad bleibt als
   reproduzierbare manuelle QA-Aufgabe dokumentiert.

**Beobachtete Restunschönheit:** Ältere Sheet-Zeilen werden im Dialog teilweise als
`2026-11-13T23:00:00.000Z` angezeigt, während die neue UI-Zeile als `2026-11-14`
erscheint. Die fachliche Dublettenprüfung und die Mietmonatszuordnung funktionierten
korrekt; die uneinheitliche Darstellung historischer Eingangsdatumswerte ist ein
separater Folgepunkt für die Timestamp-Normalisierung.

## Bewusste Grenzen

- Die Warnung ist keine harte Backend-Sperre. Der Nutzer darf die Buchung nach Prüfung
  bewusst erneut speichern.
- Eine aufgeteilte Überzahlung wird nicht als rekonstruierte Gruppen-Dublette gegen eine
  neue Eingabe zusammengefasst. Die bestehende `zahlungsgruppe_id` und die serverseitige
  Idempotenz bleiben unverändert.
- Das Paket verwendet dieselbe Vergleichsfunktion für manuelle Eingaben und CSV-Import,
  aber weiterhin getrennte UI-Einstiegspunkte.

## Abnahmefazit

Der Ablauf ist im Mock, im echten TEST-Backend und im PROD-Testobjekt `TEST` beobachtet
worden. Die automatisierten Tests sind grün. Die fachliche PROD-Abnahme im TEST-Bereich
ist für die produktiven Schreib- und Statusfälle abgeschlossen. Nicht automatisiert
abgenommen ist nur der explizite Abbruch einer nativen Dublettenwarnung; dafür ist ein
manueller Browserlauf mit aktivem „Abbrechen“ erforderlich. Die synthetischen Buchungen
bleiben als nachvollziehbares Abnahme-Fixture im Objekt `TEST` und betreffen keine
realen Objekte.

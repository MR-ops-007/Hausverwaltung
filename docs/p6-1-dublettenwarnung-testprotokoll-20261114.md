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

- `npm test`: **20 Testdateien, 481 Tests grün**.
- `tests/payment-ui.test.js`: **49 Tests grün**.
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

## Abnahme im Produktiv-Backend

Am 2026-11-14 wurde der Frontendstand mit Apps Script 4.8.12 gegen die bestehende
PROD-Bereitstellung geprüft. Die Abnahme beschränkte sich ausschließlich auf
`objekt_id = TEST` (`Test für Produktivsystem`). Andere produktive Objekte wurden
nicht beschrieben; `Hauptstraße 29` war beim initialen Laden kurz sichtbar, es wurde
dort aber keine Zahlung gespeichert.

Die PROD-Umgebung zeigte `PRODUKTION`, Backend 4.8.12 und den vollständig geladenen
TEST-Bestand. Im geprüften PROD-Testbereich war `WE 01 TEST` mit Donald Duck vorhanden;
der Monat November 2026 stand vor der Prüfung auf `40,00 / 800,00 EUR`.

1. **Echter Schreibweg:** Für November wurden `1,00 EUR`, Eingangsdatum `14.11.2026`,
   Zahlungsart `Miete` und fachlicher Mietmonat `2026-11` gespeichert. Die UI meldete
   `Zahlung gespeichert.`, die Zelle aktualisierte sich von `40,00` auf `41,00 EUR`
   und die offene Miete sank von `7.960,00` auf `7.959,00 EUR`.
2. **Persistenz und Zuordnung:** Nach dem Öffnen des Dialogs war die neue Zeile als
   `2026-11-14 · Monat 2026-11 · 1,00 EUR · Miete` sichtbar. Eingangsdatum und
   fachlicher Mietmonat bleiben damit im PROD-Testfall getrennt nachvollziehbar.
3. **Dublettenwarnung:** Dieselbe Buchung mit gleicher Vertrags-ID, gleichem
   Eingangsdatum, Betrag, Mietmonat und Zahlungsart löste den nativen Hinweis aus:
   `Mögliche Doppelbuchung: Am 14.11.2026 wurden bereits 1,00 EUR als Miete für
   2026-11 für diesen Vertrag erfasst.` Die Warnung wurde abgebrochen. Die Liste
   blieb bei drei vorhandenen Zeilen; es wurde keine zweite identische PROD-Testzeile
   angelegt.

Der PROD-Testbereich enthält aktuell nur den oben geprüften Vertrag und keine Kaution
(`0,00 / 0,00 EUR`). Kautions-, Überzahlungs-, Erstattungs- und Storno-Fälle wurden
daher nicht erneut in PROD geschrieben. Diese Fälle sind im echten TEST-Backend bereits
fachlich und schreibend abgenommen und bleiben dort die maßgebliche Abdeckung für die
entsprechenden P6-Funktionen.

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

Der Ablauf ist in Mock, echtem TEST-Backend und im PROD-Testobjekt beobachtet worden.
Die automatisierten Tests und die reale PROD-Schreib-/Dublettenprüfung sind grün.
P6.1 ist damit fachlich abnahmefähig; der Branch ist noch nicht in `main` gemergt.

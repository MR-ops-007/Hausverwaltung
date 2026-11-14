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

## Teilabnahme im Produktiv-Backend

Am 2026-11-14 wurde der Frontendstand mit Apps Script 4.8.12 gegen die bestehende
PROD-Bereitstellung geprüft. Die Prüfung beschränkte sich ausschließlich auf
`objekt_id = TEST` (`Test für Produktivsystem`). Andere produktive Objekte wurden
nicht beschrieben. Eine vollständige fachliche PROD-Abnahme ist mit dem aktuellen
Fixture nicht möglich, weil dort nur ein Vertrag ohne Kautions-Sollbetrag vorhanden ist.

Die PROD-Umgebung zeigte `PRODUKTION`, Backend 4.8.12 und den vollständig geladenen
TEST-Bestand. Im geprüften PROD-Testbereich war `WE 01 TEST` mit Donald Duck vorhanden;
der Monat November 2026 stand vor der Prüfung auf `40,00 / 800,00 EUR`.

1. **Persistenz und fachlicher Mietmonat:** Für November wurde eine Miete mit
   Eingangsdatum `14.11.2026`, Zahlungsart `Miete` und `mietmonat = 2026-11`
   gespeichert. Die Matrix und der Dialog zeigten den Eingang nach dem Speichern.
2. **Überzahlung mit Verteilung:** Für Februar wurden `900,00 EUR` eingegeben. Der
   Aufteilungsdialog verteilte exakt `800,00 EUR` auf Februar und `100,00 EUR` auf
   März. Die Summe der Teilbeträge entsprach dem Eingang; die offene Miete sank um
   exakt `900,00 EUR`.
3. **Erstattung:** Für Februar wurde eine Erstattung über `1,00 EUR` erfasst. Die
   Speicherung wurde bestätigt, der Wert als `-1,00 EUR` angezeigt und der bereits
   bezahlte Monat blieb bezahlt.
4. **Storno:** Der Storno-Dialog wurde für die März-Teilzahlung geöffnet. Die
   anschließende native Sicherheitsabfrage wurde in diesem Lauf nicht verlässlich
   abgeschlossen; deshalb wird der PROD-Storno nicht als bestanden gemeldet. Der
   Fall bleibt durch die echte TEST-Abnahme und die automatisierten Backend-/UI-Tests
   abgedeckt.
5. **Dublettenwarnung:** Der ursprüngliche PROD-Dublettenversuch war wegen der
   nativen Bestätigungsabfrage kein sauberer Abbruchtest. Dabei entstandene
   synthetische Kleinstbuchungen wurden anschließend durch append-only Stornos
   neutralisiert. Nach dem Aufräumen lag die aktive November-Summe wieder bei
   `40,00 EUR`; die historischen Test- und Gegenbuchungen bleiben als Historie
   erhalten. Der beobachtete Zwischenstand `40,00 -> 42,00 EUR` war daher ein
   Testartefakt und keine fachliche Neuberechnung.

Der PROD-Testbereich enthält aktuell nur `WE 01 TEST` mit Donald Duck und keine Kaution
(`0,00 / 0,00 EUR`). Die Vertragsmaske ist im aktuellen Backend nicht als Schreibweg
für neue Verträge freigeschaltet. Deshalb konnten im PROD-Testobjekt keine Kautions-,
Mehrvertrags- oder Mehrmieter-Fixtures angelegt werden. Diese Fälle sind im echten
TEST-Backend bereits fachlich und schreibend abgenommen und bleiben dort die
maßgebliche Abdeckung; für PROD fehlt noch ein kontrolliert angelegtes Test-Fixture.

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

Der Ablauf ist im Mock, im echten TEST-Backend und teilweise im PROD-Testobjekt
beobachtet worden. Die automatisierten Tests sind grün. Die PROD-Abnahme ist wegen
des unvollständigen TEST-Fixtures und des nicht verlässlich abgeschlossenen Stornos
noch **nicht vollständig**. Eine Freigabe als vollständige PROD-Abnahme wäre erst nach
dem Nachholen dieser Fälle zulässig.

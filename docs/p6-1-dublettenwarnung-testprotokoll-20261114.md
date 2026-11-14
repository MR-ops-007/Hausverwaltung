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
zugeordnet. Bei Kautionen bleibt der fachliche Monat leer. Die Prüfung ignoriert nicht
die `zahlung_id`, weil eine neue manuelle Aktion absichtlich eine neue ID erhält.

## Automatisierte Prüfung

- `npm test`: **20 Testdateien, 479 Tests grün**.
- `tests/payment-ui.test.js`: **47 Tests grün**.
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

## Bewusste Grenzen

- Die Warnung ist keine harte Backend-Sperre. Der Nutzer darf die Buchung nach Prüfung
  bewusst erneut speichern.
- Eine aufgeteilte Überzahlung wird nicht als rekonstruierte Gruppen-Dublette gegen eine
  neue Eingabe zusammengefasst. Die bestehende `zahlungsgruppe_id` und die serverseitige
  Idempotenz bleiben unverändert.
- Das Paket verwendet dieselbe Vergleichsfunktion für manuelle Eingaben und CSV-Import,
  aber weiterhin getrennte UI-Einstiegspunkte.

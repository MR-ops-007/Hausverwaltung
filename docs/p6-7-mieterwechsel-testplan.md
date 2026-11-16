# P6.7 – Mieterwechsel und historische Vertragszeiträume

## Ziel

Ein Mieterwechsel soll die bisherige Vertragshistorie erhalten und gleichzeitig
die Mieteingangskontrolle eindeutig auf den richtigen Vertrag beziehen. Die
Wohnung bleibt dieselbe Einheit; der alte und der neue Mietvertrag erhalten
jedoch jeweils eine eigene `vertrag_id`.

## Entenhausen-Fixture

Der Mock-Grundbestand ist über die Jahresgrenzen hinweg konsistent aufgebaut:

- Wohnungen 1 bis 6 haben laufende Verträge ab 2025 und sind deshalb in den
  Jahresansichten 2025 und 2026 sichtbar.
- Wohnung 7 ist in beiden Jahren als Leerstand ohne Sollmiete enthalten.
- Für 2025 gibt es passende Zahlungseingänge mit unterschiedlichen Fällen:
  vollständig bezahlt, verspätet, teilbezahlt und überzahlt.
- Wohnung 8 ist bewusst der separate Mieterwechsel-Fall und wird ausschließlich
  über die folgende Pluto-/Goofy-Fixture beschrieben.

Die wiederverwendbare Fixture `tools/mock-rental-fixtures.mjs` bildet für
`TEST_WE_08` folgenden Wechsel ab:

| Zeitraum | Vertrag | Person | Status | Monatsmiete |
|---|---|---|---|---:|
| 01.06.2025–31.05.2026 | `TEST_V8_ALT` | Pluto | beendet | 700,00 EUR |
| ab 01.06.2026 | `TEST_V8` | Goofy | aktiv | 800,00 EUR |

Die Zahlungen und Kautionen sind getrennt an die jeweilige `vertrag_id` gebunden.
Pluto hat vollständige Zahlungen für Juni bis Dezember 2025 und Januar bis Mai 2026,
eine nach dem Wechsel eingegangene
Nachzahlung für April mit anschließendem Storno und eine vollständig hinterlegte
Kaution. Goofy hat Zahlungen für Juni bis August 2026, eine Teilzahlung im Juli
und eine teilweise hinterlegte Kaution. Die aktive Mieteransicht zeigt für die
Einheit nur Goofy; in der Mieteingangskontrolle bleiben Pluto und seine Zahlungen
als eigene historische Vertragszeile sichtbar.

## Abnahmekriterien für die spätere UI-Umsetzung

1. Ein Mieterwechsel wird als neuer Vertrag mit neuer `vertrag_id` gespeichert;
   die bisherige Vertragszeile wird nicht überschrieben.
2. Für dieselbe Einheit werden überlappende Vertragszeiträume erkannt und
   verständlich abgewiesen.
3. Ein Wechsel zum Monatsersten ohne Lücke ordnet Mai dem alten und Juni dem
   neuen Vertrag zu.
4. Ein Wechsel mitten im Monat verlangt eine ausdrückliche fachliche Regel,
   bevor Zahlungen oder Verbräuche automatisch aufgeteilt werden.
5. Die Mieteingangskontrolle baut ihre Zeilen aus dem Einheitenbestand auf. Jede
   Einheit des Objekts bleibt in jedem ausgewählten Jahr sichtbar. Je Vertragsperiode,
   die das Jahr abdeckt, gibt es eine eigene Zeile: 2025 erscheint Pluto; 2026 erscheinen
   Pluto für Januar bis Mai und Goofy ab Juni. Einheiten ohne Vertrag erscheinen neutral
   als Leerstand.
6. Zahlungen vor dem Wechsel bleiben beim alten Vertrag. Zahlungen ab dem neuen
   Vertragsbeginn werden dem neuen Vertrag zugeordnet.
7. Eine verspätete Zahlung oder ein Storno für den alten Vertrag verändert nicht
   den Status des neuen Vertrags.
8. Kautionen bleiben je Vertrag getrennt. Die alte Kaution wird nicht automatisch
   als neue Kaution verbucht.
9. Mehrere Vertragsparteien werden je Vertrag korrekt angezeigt.
10. Nach einem Reload stimmen Matrix, Detailansicht und Vertragszeiträume mit den
    gespeicherten `vertrag_id`s überein.

Die aktuelle Charakterisierung hält zusätzlich fest: Eine Nachzahlung von 50 EUR
für Plutos April erzeugt vor dem Storno ein Guthaben von 50 EUR; nach dem Storno
bleibt der Monat bei 700,00 EUR und wird weiterhin als verspätet erkannt. Bei einem
Wechsel mitten im Monat bewertet das heutige Modell beide Verträge noch mit dem
vollen Monatssoll; auf Einheitsebene ergibt das im Beispiel aktuell 1.500,00 EUR
Soll für Juni. Diese Charakterisierung wird nach der Entscheidung zu anteiligem
Soll und Zwischenablesung bewusst angepasst. Sie ist keine fachliche Freigabe für
eine spätere Abrechnung.

## Aktueller UI-Stand

Die Mieteingangskontrolle filtert nach dem gewählten Jahr und nicht nur nach dem
heutigen `aktiv`-Flag. Die Einheiten kommen aus `Einheiten`; Verträge bestimmen nur
die zeitbezogene Belegung. Für 2025 erscheinen der Grundbestand der Wohnungen 1 bis 7
und bei `TEST_WE_08` Pluto. Für 2026 erscheinen Pluto für Januar bis Mai und Goofy
ab dem 01.06.2026 als getrennte Vertragszeilen. Monate außerhalb der jeweiligen
Vertragsperiode bleiben in der jeweiligen Zeile neutral und sind nicht klickbar; der
historische Vertrag wird direkt als eigene Zeile bearbeitbar angezeigt. Eine Einheit
ohne Vertrag bleibt als neutraler Leerstand sichtbar. Verträge mit unbekannter Einheit,
widersprüchlicher Objektzuordnung, Überschneidungen, Lücken und Monatsmitte-Wechseln
werden als strukturierte Datenprüfung angezeigt, statt still aus der Ansicht zu
verschwinden.

Verbrauchsviews verwenden derzeit den aktiven Mieter aus
`_view_aktive_mieter`. Eine abrechnungsfähige Verbrauchsaufteilung nach alten
Vertragszeiträumen bleibt deshalb ebenfalls Bestandteil der späteren Umsetzung.

## Technische Prüfung der Vorbereitung

- `npm test`: 518 Tests in 20 Testdateien grün.
- `npm run check:frontend-assets`: erfolgreich.
- `node --check` für Mock-Server und Fixture: erfolgreich.
- Mock-API-Lauf: Für `TEST_WE_08` wurden beide Verträge, beide Parteien, die
  getrennten Zahlungen/Kautionen und ausschließlich `TEST_V8` in der aktiven
  Mieteransicht bestätigt.
- Die zentrale `contractService.validateContractPeriods()` ist die gemeinsame
  Quelle für Zeitraumfehler und Hinweise in Backend-nahem Code und UI. Sie prüft
  gegen das laufende maximale Vertragsende, erkennt dadurch auch indirekte
  Überschneidungen und offene Vorgänger. Die UI zeigt die Codes `PERIOD_OVERLAP`,
  `PERIOD_GAP`, `MID_MONTH_CHANGE`, `UNKNOWN_UNIT` und `OBJECT_ID_CONFLICT` an.
- Die Typregel entscheidet nur über vertragsfreie Einheiten: `Wohnung`, `Gewerbe`
  oder explizit `mietrelevant` dürfen als Leerstand erscheinen. Eine Einheit mit
  Vertrag wird unabhängig von ihrem Typ angezeigt; `Allgemein` und `Gemeinschaft`
  werden ohne Vertrag nicht als Miet-Leerstand dargestellt.

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

### Persistierter TEST-Datensatz

Die Fixture ist zusätzlich in der echten TEST-Tabelle `Hausverwaltung_Daten_TEST_Entenhausen`
angelegt. Dort entsprechen die Vertrags-IDs 37 und 38 dem beschriebenen Wechsel Pluto → Goofy;
die TEST-Zahlungen und Kautionen sind über die jeweiligen `vertrag_id`s verknüpft. `TEST_WE_07`
ist der separate Leerstandstest ohne Vertrag. Ein aktiver Altvertrag ist außerdem mit Vertrag 26
für Track Duck ab 01.02.2013 hinterlegt: 850,00 EUR Monatsmiete, durchgehende Zahlungen bis
November 2026 und 1.700,00 EUR Kaution. Er dient dazu, sicherzustellen, dass ein lang laufender
Vertrag nicht versehentlich als Leerstand erscheint.

Der am 16.11.2026 geprüfte TEST-Snapshot enthält 17 Verträge, 41 Einheiten und 446 Zahlungen.
Dabei wurden keine fehlenden Vertrags-Startdaten, keine unbekannten Einheiten, keine aktiven
Verträge ohne Sollmiete und keine Verträge ohne Vertragspartei gefunden. Die Browserprüfung
bestätigt für 2026: Pluto erscheint auf `TEST_WE_08` von Januar bis Mai mit bezahlten Monaten,
Goofy ab Juni als eigene Vertragszeile; Monate außerhalb der jeweiligen Vertragsperiode bleiben
neutral. Die übrigen Testpersonen bilden weiterhin Teilzahlung, Überzahlung, Erstattung,
Nachzahlung, wiederholte Verspätung, Mitmieter und offene Kautionen ab.

### Abnahmecheckliste für den echten TEST-Server

| Prüffall | Erwartetes Ergebnis |
|---|---|
| TEST-Objekt, Jahr 2026, `TEST_WE_08` | Pluto steht für Januar bis Mai als historische Vertragszeile, Goofy ab Juni als eigene aktive Vertragszeile. |
| Pluto, April-Nachzahlung und Storno | Der fachliche Mietmonat bleibt April; der alte Vertrag bleibt getrennt vom Goofy-Vertrag. |
| Goofy, Juli | `400,00 / 800,00 EUR`, Status Teilbezahlt; die Kaution zeigt `900,00 / 1.800,00 EUR`. |
| `TEST_WE_07` | Alle Monate zeigen neutralen Leerstand; es entsteht kein offener Mietbetrag. |
| Track Duck, Vertrag 26 | Ab 2013 stehen 850,00 EUR Sollmiete und die gespeicherten Zahlungseingänge zur Verfügung; der aktive Altvertrag wird nicht als Leerstand dargestellt. |
| Teilzahlung, Überzahlung, Erstattung, Nachzahlung, Mitmieter | Die Fälle erscheinen in den jeweils zugeordneten Vertragszeilen und beeinflussen keine andere Vertragsperiode. |
| Kautionen | Kautionen werden je Vertrag separat ausgewertet und nicht als Monatsmiete verbucht. |
| Jahreswechsel | Die Jahresauswahl zeigt historische Verträge im Jahr ihrer Vertragsperiode, nicht nur Verträge mit aktuellem `aktiv`-Flag. |
| Datenqualität | Keine `PERIOD_DATE_INVALID`-, `UNKNOWN_UNIT`- oder `OBJECT_ID_CONFLICT`-Meldung im gepflegten TEST-Bestand. |

Beim Altvertrag ist zusätzlich bewusst zu prüfen, ob es seit 2013 dokumentierte Zeilen in
`Mietanpassungen` gibt. Fehlen solche Einträge trotz zwischenzeitlich geänderter Miete, muss
die Anwendung die Sollhistorie als unvollständig kennzeichnen; sie darf die fehlende Historie
nicht stillschweigend als fachlich bestätigt behandeln. Der TEST-Bestand verwendet fiktive
Entenhausen-Personen. Reale Kontodaten oder nicht anonymisierte Personendaten gehören nicht in
die TEST-Tabelle.

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

## P6.7b – Backend-Abnahme

Die serverseitige Schreiboperation heißt `MIETERWECHSEL_ANLEGEN` und ist ausschließlich
für `admin`-Geräteschlüssel freigeschaltet. Sie wird im bestehenden Script-Lock ausgeführt;
ein `CONTRACT_WRITE_TOKEN` bleibt zusätzlich erforderlich. Der Aufruf erwartet:

- `vertrag_id`: ID des bisherigen Vertrags,
- `erwarteter_stand`: Snapshot des bisherigen Vertrags,
- `data`: neuer Vertrag mit eigener `vertrag_id`, derselben `einheit_id`,
  `hauptperson_id` und `start_datum`,
- optional `parteien`: neue Vertragsparteien; ohne Angabe wird die Hauptperson als
  `Hauptmieter` angelegt.

Vor dem ersten Schreiben werden Einheit, Personen, Zeitraum und erwarteter Stand geprüft.
Der bisherige Vertrag wird am Vortag des neuen Mietbeginns beendet; beide `aktiv`-Werte
werden für den aktuellen Tag aus den Vertragsdaten abgeleitet. Der neue Vertrag und die
Parteien werden anschließend angehängt. Ein Fehler beim zweiten Schreibschritt setzt die
bereits geänderten Zellen zurück.

| Prüffall | Erwartetes Ergebnis |
|---|---|
| Wechsel vom offenen Vertrag zu einem neuen Vertrag am Folgetag | Alter Vertrag endet am Vortag, neuer Vertrag ist aktiv, Parteien sind verknüpft. |
| Derselbe Request erneut | Erfolg mit `bereits_vorhanden`, keine weitere Vertrags- oder Parteienzeile. |
| Neue ID mit abweichender Miete, Kaution, Laufzeit oder Partei | `TENANT_CHANGE_ID_CONFLICT`, keine Änderung. |
| Veralteter `erwarteter_stand` | `TENANT_CHANGE_STALE`, keine Änderung. |
| Neuer Beginn vor oder am alten Ende | `CONTRACT_PERIOD_OVERLAP`, keine Änderung. |
| Unbekannte Person oder Einheit | Schreibfehler, keine Änderung. |
| Fehler beim Anhängen der Parteien | Rollback des alten Vertrags und der neuen Vertragszeile. |
| Doppelte Person in `parteien` | `TENANT_CHANGE_PARTIES_DUPLICATE`, keine Änderung. |
| Gerät mit Rolle `erfassen` | `FORBIDDEN`; `tenant_change_writes` bleibt `false`. |
| Start innerhalb eines Monats | Nur der fachliche Hinweis `MID_MONTH_CHANGE`; keine automatische anteilige Berechnung. |
| Neuer Beginn in der Zukunft | Vorgänger bleibt bis zum Ende aktiv, neuer Vertrag erhält bis zum Beginn `aktiv = false`. |
| `kaution_ist` im Client manipuliert | Der gespeicherte Wert bleibt `0`; die tatsächliche Kaution wird aus Zahlungen abgeleitet. |

Die aktive Mieteransicht wertet Start- und Enddatum ebenfalls aus. Dadurch wird ein
zukünftiger Vertrag am Stichtag automatisch aktiv, auch wenn kein separater Schreibvorgang
die Flag-Spalte erneut ändern muss. Ein Mieterwechsel ohne aktiven Vorgänger, etwa die
Neuvermietung eines echten Leerstands, ist bewusst nicht Teil dieser Operation und wird als
P6.7c separat umgesetzt.

Vor der echten Abnahme müssen `prepareContractSchema()` und einmalig
`installDailyViewTrigger()` im Apps-Script-Projekt ausgeführt werden. Das erste legt das
append-only Blatt `MieterwechselProtokoll` an; das zweite installiert den täglichen Handler
`refreshAktiveMieterViewDaily()`. Dieser Wrapper wartet bis zu 30 Sekunden auf den
Script-Lock, schützt damit den Refresh und ruft `updateAktiveMieterView()` ohne das von
Apps Script gelieferte Ereignisobjekt auf.
Für automatisierte Stichtagstests akzeptiert `updateAktiveMieterView(now)` weiterhin ein
echtes `Date`-Objekt; ein Trigger-Ereignis darf dabei nicht als Stichtag verwendet werden.
Nach der Installation ist der Handler einmal manuell auszulösen und `_view_aktive_mieter`
auf weiterhin vorhandene aktuelle Mieter zu prüfen.

Die Operation ist in `tests/contracts.test.js` und `tests/access.test.js` automatisiert
abgesichert. Für die echte Abnahme wird Apps Script 4.8.13 zuerst in TEST bereitgestellt;
die UI-Maske ist noch nicht Teil dieses Pakets und wird in einem Folgepaket ergänzt.

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

- `npm test`: Die Testzahl wird beim Commit aktualisiert; die P6.7b-Regressionen decken
  Zeitraum-Aktivität, vollständige Idempotenz, Kautionsableitung, doppelte Parteien und
  falsche Tokens ab.
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

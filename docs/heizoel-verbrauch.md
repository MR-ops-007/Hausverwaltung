# Heizölverbrauch

## Fachliche Regeln

- `oel_stand_cm` ist ein Füllstand und kein aufwärts zählender Verbrauchszähler.
- Ohne Tankfüllungsdaten erzeugt nur ein sinkender Stand Verbrauch:
  `Stand_alt - Stand_neu`.
- Der Verbrauch in Litern ist `sinkende cm × Liter pro cm`.
- Ein steigender Stand ist ohne passende Tankfüllungsdaten eine Tankfüllung,
  Korrektur oder ein Messfehler und wird als Ereignis mit Prüfhinweis geführt.
  Liegen passende `oel_stand_l`-Daten vor, wird das Intervall stattdessen über
  die Tankbilanz aus Tankfüllung und Füllstandsänderung rekonstruiert.
- Der Zähler `oel_stand_l` dokumentiert die kumulierte Tankmenge separat. Er dient
  zur Erkennung von Tankfüllungen und wird bei vorhandener Füllstandsablesung für
  die Verbrauchsbilanz des betroffenen Intervalls verwendet.

## Tankkonfiguration

Die Parameter werden objekt- und tankspezifisch in `Haustechnik` gepflegt:

| Tank | Volumen | Arbeitshypothese |
| :--- | ---: | :--- |
| `HAUPTTANK` | 10.000 l | 140 cm bei vollem Tank, ca. 71,43 l/cm |
| `ZUSATZTANK` | 2.000 l | 140 cm bei vollem Tank, ca. 14,29 l/cm |

Die Werte für Hauptstraße 29 sind ausdrücklich eine anpassbare Arbeitshypothese.
Der Zusatztank bleibt separat und fließt standardmäßig nicht in die allgemeine
Hausverbrauchssumme ein. Er kann später über `in_verbrauch_auswertung` zugeschaltet
werden, ohne die Rohdaten zu ändern.

## Anzeige und Eingabe

- Im Zählerstandsverlauf bleibt der Ölstand in `cm` sichtbar.
- Monatsverbrauch, Jahresentwicklung und die zusätzliche Tabellenzeile zeigen den
  berechneten Verbrauch in `l`.
- Steigende Füllstände werden als Prüfhinweis am betroffenen Monatsereignis markiert.
- Wird eine Tankfüllung ohne neuen Füllstand gespeichert, fragt die Eingabe nach.
  Bei `Ja` wird der Füllstand auf das konfigurierte Tankmaximum gesetzt; bei `Nein`
  wird nur die Tankfüllung gespeichert.
- Eine Umrechnung in kWh ist bis zur Festlegung von Heizmedium, Heizwert und
  beheizter Fläche bewusst ausgeschlossen.

## Technische Grenzen

Die Literberechnung verteilt ein Verbrauchsintervall zeitanteilig auf die betroffenen
Kalendermonate. Sie ist damit eine Heuristik für Bestellzyklen und Effizienzvergleiche,
keine geeichte Brennstoffabrechnung. Nachfüllungen zwischen zwei Ablesungen werden
als Ereignis markiert. Liegen Betankungen aus `oel_stand_l` vor, wird der Verbrauch
im Füllintervall bilanziert:
`Verbrauch = getankte Liter − (Stand_neu − Stand_alt) × l/cm`. Ergibt die Bilanz einen
deutlich negativen Wert (gemessener Anstieg größer als die getankte Menge), gilt das
Intervall als unplausibel und wird nicht verbucht. Ohne Betankungsdaten bleibt das
Intervall eine Lücke, die Jahressumme ist dann eine Untergrenze und wird so gewarnt.

Anstiege bis `rauschen_cm` (Standard 1 cm, über `Haustechnik` konfigurierbar) gelten
als Peilstab-Rauschen: kein Verbrauch, keine Tankfüllung, kein Ereignis.

Die Funktion `totalLiters` zur Tankaggregation berücksichtigt nur Tanks mit
`in_verbrauch_auswertung = true`. Das Dashboard zeigt weiterhin die einzelnen Tankwerte;
eine gemeinsame Haus-Gesamtsumme ist vorbereitet, aber noch nicht in die Darstellung
integriert. Der Zusatztank fließt erst nach Freigabe in diese Summe ein.

Die Tankbilanz gilt für jedes Intervall mit Betankung, auch wenn der Füllstand trotz
Lieferung fällt. Diagramm und Tabelle beziehen die Betankungsdaten über
`heatingOilService.fillReadingsFor` und rechnen damit identisch. Ein als Rauschen
verworfener Anstieg verschiebt den Referenzstand nicht: Nach `100 → 100,5 → 90 cm` beträgt
der Verbrauch 10 cm.

Die Umsetzung dieses Pakets liegt im Frontend und in einer testbaren JavaScript-
Fachlogik. `apps-script/Code.gs` und die materialisierten Backend-Views werden
nicht geändert. Die optionale Tabelle `Haustechnik` wird nur gelesen, sofern sie
im Initialdatensatz vorhanden ist; bis dahin greifen die dokumentierten
Arbeitshypothesen für Hauptstraße 29.

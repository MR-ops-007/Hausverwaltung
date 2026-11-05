# Heizölverbrauch

## Fachliche Regeln

- `oel_stand_cm` ist ein Füllstand und kein aufwärts zählender Verbrauchszähler.
- Nur ein sinkender Stand erzeugt Verbrauch: `Stand_alt - Stand_neu`.
- Der Verbrauch in Litern ist `sinkende cm × Liter pro cm`.
- Ein steigender Stand ist eine Tankfüllung, Korrektur oder ein Messfehler. Er wird
  als Ereignis mit Prüfhinweis geführt und nicht vom Verbrauch abgezogen.
- Der Zähler `oel_stand_l` dokumentiert die kumulierte Tankmenge separat. Er dient
  zur Erkennung einer Tankfüllung, nicht zur direkten Berechnung des Ölverbrauchs.

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
keine geeichte Brennstoffabrechnung. Nachfüllungen zwischen zwei Ablesungen können
nicht rückwirkend monatsgenau rekonstruiert werden; sie werden deshalb als Ereignis
markiert und verlangen bei fehlendem Füllstand eine Prüfung.

Die Umsetzung dieses Pakets liegt im Frontend und in einer testbaren JavaScript-
Fachlogik. `apps-script/Code.gs` und die materialisierten Backend-Views werden
nicht geändert. Die optionale Tabelle `Haustechnik` wird nur gelesen, sofern sie
im Initialdatensatz vorhanden ist; bis dahin greifen die dokumentierten
Arbeitshypothesen für Hauptstraße 29.

# P6.7 Vertragszeiträume: Validierungsgrundlage

Dieses Paket ergänzt die gemeinsame Prüfregel `contractService.validateContractPeriods()`
für historische Verträge derselben Einheit.

## Regeln

- Überschneidungen von zwei Vertragszeiträumen derselben Einheit sind Fehler
  (`PERIOD_OVERLAP`).
- Eine Lücke zwischen zwei beendeten bzw. begonnenen Zeiträumen ist ein Hinweis
  (`PERIOD_GAP`), aber kein Schreibfehler. Die Einheit kann in dieser Zeit leer
  gestanden haben.
- Ein Wechsel innerhalb desselben Monats ist ein Hinweis
  (`MID_MONTH_CHANGE`). Die Zeiträume bleiben gültig, aber eine fachliche Regel
  für anteiliges Soll und gegebenenfalls eine Zwischenablesung ist erforderlich.
- Fehlende Startdaten werden bei echten aktiven Verträgen als Fehler gemeldet.
  Eine leere Zeile ohne Mietpartei, Sollmiete und Kaution wird unabhängig vom
  Aktiv-Flag als Leerstands-Platzhalter behandelt und erzeugt keinen
  `PERIOD_DATE_INVALID`-Fehler. Ungültige oder umgekehrte Datumswerte bleiben
  Fehler.
- Die Überschneidungsprüfung vergleicht jeden neuen Zeitraum mit dem bisher
  größten Vertragsende. Dadurch werden auch indirekte Überschneidungen erkannt,
  wenn ein langer Vorgängervertrag bereits durch einen kürzeren Zwischenvertrag
  verdeckt wird. Ein offener Vorgänger überlappt jeden später beginnenden Vertrag.
- Die Funktion normalisiert Datumswerte auf `YYYY-MM`, `YYYY-MM-DD` und eindeutige
  Vertrags-/Einheits-IDs. Sie schreibt keine Daten und enthält keine UI-Logik.

## Bewusste Abgrenzung

Der aktuelle Vertrags-Schreibweg ändert keine `start_datum`- oder `end_datum`-Werte.
Die Validierung wird deshalb in diesem Paket noch nicht pauschal vor jeden
Stammdaten- oder Indexschreibvorgang geschaltet. Das würde auch bereits vorhandene
historische Daten mit bekannten Auffälligkeiten für harmlose Notizänderungen sperren.

Die UI ruft dieselbe Funktion für die Vertragsperioden des ausgewählten Objekts auf und zeigt
die Codes als strukturierte Datenprüfung an. `UNKNOWN_UNIT` und
`OBJECT_ID_CONFLICT` kommen ergänzend aus der Bestandszuordnung; die Einheit ist
dabei die führende Quelle für das Objekt.

Die Typregel entscheidet nur, ob eine vertragsfreie Einheit als Leerstand in der
Mietmatrix erscheint. Eine Einheit mit einem Vertrag wird unabhängig von ihrem
Typ angezeigt; dadurch werden z. B. Stellplätze oder abweichend benannte
Gewerbeeinheiten nicht als unbekannt gemeldet oder unterschlagen. Die Prüfung
kann über alle Vertragszeiträume des Objekts laufen; die UI filtert die Hinweise
nach dem ausgewählten Jahr. Nicht mietrelevante Einheiten mit einem abgeschlossenen
Vertrag erscheinen nur in den Jahren, die dieser Vertrag berührt.

Die serverseitige Durchsetzung ist als P6.7b umgesetzt. Der Admin-only-Schreibtyp
`MIETERWECHSEL_ANLEGEN` beendet den bisherigen aktiven Vertrag am Tag vor dem neuen
Mietbeginn, legt den neuen Vertrag mit eigener `vertrag_id` an und schreibt die neuen
Vertragsparteien. Die Operation läuft im bestehenden Apps-Script-Lock, prüft den vom
Client gelieferten erwarteten Vertragsstand und ruft vor dem ersten Schreiben dieselbe
Zeitraumprüfung auf. Überschneidungen, unbekannte Einheiten oder Personen und unvollständige
Schemas werden abgewiesen. Ein Retry mit derselben neuen Vertrags-ID wird als bereits
gespeichert bestätigt; bei einem Fehler beim Anhängen wird der Vorgänger zurückgesetzt und
die neue Zeile geleert.

Der Schreibweg erwartet ein vollständiges `data`-Objekt für den neuen Vertrag. Nicht
angegebene Vertragsfelder werden aus dem Vorgänger übernommen, `kaution_ist` startet ohne
Angabe mit `0`. `parteien` ist optional; ohne Angabe wird `hauptperson_id` als
`Hauptmieter` verknüpft. Eine UI-Maske zum Anlegen des Wechsels ist bewusst nicht Teil
von P6.7b. Bis dahin ist die Operation eine sichere Backend-Grundlage für den späteren
Erfassungsdialog. Apps Script 4.8.13 muss nach dem Merge in TEST und anschließend PROD
bereitgestellt werden; die URL bleibt unverändert.

## Tests

Die wiederverwendbare Entenhausen-Fixture prüft:

- Pluto bis 2026-05-31 und Goofy ab 2026-06-01: gültige lückenlose Folge.
- Lücke vom 2026-06-01 bis 2026-06-30: Hinweis, kein Fehler.
- Überschneidung ab 2026-06-15: Fehler.
- Wechsel innerhalb Juni 2026: Hinweis auf die noch offene anteilige Sollregel.
- Ungültiges Datum, fehlendes Startdatum und Ende vor Beginn: Fehlercodes ohne
  Ausnahmeabbruch.
- Drei überlappende Zeiträume: der dritte Zeitraum wird gegen den langen ersten
  Zeitraum geprüft, nicht nur gegen den direkten Vorgänger.
- Offener Vorgängervertrag mit späterem Vertrag: Überschneidung wird erkannt.
- UI-Hinweise für Monatsmitte, unbekannte Einheit und widersprüchliche
  Objektzuordnung werden mit Code und Schweregrad dargestellt.
- Vertrag auf einer Einheit vom Typ `Stellplatz`: Die Vertragszeile bleibt sichtbar,
  ohne `UNKNOWN_UNIT`; dieselbe vertragsfreie Einheit erzeugt keinen künstlichen
  Leerstand in der Mietmatrix.
- Eine leere, explizit übergebene Einheitenliste erzeugt keine fremden Zeilen. Ein
  vollständiger Bestand wird nur über den dafür vorgesehenen `allUnits`-Parameter
  verwendet. `buildMatrix` nutzt keinen impliziten State-Rückfall; Aufrufer müssen
  `units` oder bereits aufgebaute `rows` übergeben. Falls die Einheitenliste bewusst
  gefiltert ist, ergänzt `buildUnitRows` bekannte Einheiten mit passenden Verträgen,
  damit Vertragszeilen nicht still verschwinden.
- Unbekannte Warncodes bleiben sichtbar und werden konservativ dem ausgewählten
  Jahr zugeordnet.
- Leere Zeilen ohne Startdatum, Mietpartei, Sollmiete und Kaution werden nicht
  als Vertragsperiode geprüft und als Leerstand dargestellt; ein leeres oder
  veraltetes Aktiv-Flag ändert daran nichts. Ein aktiver Vertrag mit echter
  Mietpartei oder Sollmiete bleibt dagegen mit `PERIOD_DATE_INVALID` sichtbar.
- Ein gültiger Mieterwechsel schreibt Vorgänger, neue Vertragszeile und Vertragsparteien
  gemeinsam; der Vorgänger endet am 2026-05-31, wenn der neue Vertrag am 2026-06-01 beginnt.
- Ein identischer Retry erzeugt weder eine zweite Vertrags- noch eine zweite Parteienzeile.
- Ein falscher erwarteter Stand, eine Überschneidung, eine unbekannte Person oder ein
  Fehler beim Schreiben der Parteien führt zu keinem teilweise gespeicherten Wechsel.
- Ein Erfassungs-Gerät erhält für `MIETERWECHSEL_ANLEGEN` `FORBIDDEN`; die Capability
  `tenant_change_writes` ist nur für Admin-Geräte wahr.

Die Funktion ist Teil des gemeinsam geladenen `ContractService.js` und steht damit
für Browser- und Apps-Script-Code an derselben Stelle bereit. Für den neuen Schreibweg
ist das Apps-Script-Deployment 4.8.13 erforderlich; bestehende Vertrags- und Zahlungsdaten
werden dabei nicht migriert.

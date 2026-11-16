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

Die serverseitige Durchsetzung erfolgt im nächsten Schritt zusammen mit einer
atomaren, idempotenten Mieterwechsel-Operation: alter Vertrag beenden, neuen Vertrag
anlegen, Überschneidung ablehnen und View erst nach erfolgreicher Gesamtänderung
aktualisieren.

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

Die Funktion ist Teil des gemeinsam geladenen `ContractService.js` und steht damit
für Browser- und Apps-Script-Code an derselben Stelle bereit. Für dieses Paket ist
kein Apps-Script-Deployment erforderlich, weil noch kein neuer Schreibweg aktiviert
wird.

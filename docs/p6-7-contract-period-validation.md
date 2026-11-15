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
- Fehlende, ungültige oder umgekehrte Datumswerte werden als Fehler gemeldet.
- Die Funktion normalisiert Datumswerte auf `YYYY-MM`, `YYYY-MM-DD` und eindeutige
  Vertrags-/Einheits-IDs. Sie schreibt keine Daten und enthält keine UI-Logik.

## Bewusste Abgrenzung

Der aktuelle Vertrags-Schreibweg ändert keine `start_datum`- oder `end_datum`-Werte.
Die Validierung wird deshalb in diesem Paket noch nicht pauschal vor jeden
Stammdaten- oder Indexschreibvorgang geschaltet. Das würde auch bereits vorhandene
historische Daten mit bekannten Auffälligkeiten für harmlose Notizänderungen sperren.

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

Die Funktion ist Teil des gemeinsam geladenen `ContractService.js` und steht damit
für Browser- und Apps-Script-Code an derselben Stelle bereit. Für dieses Paket ist
kein Apps-Script-Deployment erforderlich, weil noch kein neuer Schreibweg aktiviert
wird.

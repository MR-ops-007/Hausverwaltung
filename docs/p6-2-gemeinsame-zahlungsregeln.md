# P6.2 – Gemeinsame Zahlungsregeln

## Ziel

Mietmonat, Zahlungsart, Guthaben, Erstattung, Storno-Metadaten und Monatsstatus
sollen in Mock, Browser und Apps Script dieselbe fachliche Bedeutung haben. Vor P6.2
lagen mehrere Varianten derselben Regeln in `payment-ui.js`, `Code.gs` und
`tools/mock-backend-server.mjs`. Das war besonders für Legacy-Zahlungen, leere
`mietmonat`-Werte und Stornos fehleranfällig.

## Umsetzung

`apps-script/PaymentRules.js` ist die gemeinsame, zustandslose Regelquelle. Sie wird

- als Script in `index.html` vor `payment-ui.js` geladen,
- durch Apps Script zusammen mit `Code.gs` bereitgestellt und
- vom Mock-Backend zur Laufzeit eingelesen.

Die Datei schreibt selbst nichts und kennt weder Google Sheets noch den Browser. Die
jeweiligen Adapter liefern nur die Laufzeitdetails, zum Beispiel die Berliner
Zeitzonenformatierung in Apps Script.

### Zentrale Regeln

| Regel | Verhalten |
| :--- | :--- |
| Zahlungsart | `Miete`, `Kaution`, `Nachzahlung`, `Erstattung` und `Storno` werden unabhängig von Groß-/Kleinschreibung auf einen kanonischen Wert gebracht. Leere Art bedeutet `Miete`. |
| Betrag | Deutsches Dezimalformat wird akzeptiert. Es sind höchstens zwei relevante Nachkommastellen erlaubt; Tausenderpunkte müssen korrekt in Dreiergruppen stehen. Ein Tausenderpunkt ohne Dezimalkomma, zum Beispiel `1.250`, wird als 1.250 EUR gelesen. Leere, ungültige oder nicht auf Cent darstellbare Beträge werden abgewiesen. |
| Fachlicher Mietmonat | `YYYY-MM` und deutsche Datumswerte werden normalisiert; ein ISO-Zeitstempel wird in der lokalen Zeitzone ausgewertet. |
| Legacy-Zahlung | Leerer `mietmonat` ohne Zahlungsgruppe wird dem Eingangsmonat zugeordnet. |
| Guthaben | Leerer `mietmonat` mit `zahlungsgruppe_id` bleibt bewusst nicht zugeordnet und erscheint separat als Guthaben. |
| Kaution | Hat keinen Mietmonat. Ein mitgeschickter Mietmonat wird bei der Eingangsnormalisierung verworfen; Kautionen werden nicht in den Monatsstatus eingerechnet. |
| Erstattung | Ist eine eigene, negative Zahlungsart und verschlechtert den Mietstatus nicht. |
| Storno | Monat, Gegenart und Zahlungsgruppe werden aus dem Original abgeleitet; Client-Metadaten können diese Zuordnung nicht überschreiben. |
| Status | `bezahlt`, `teilbezahlt`, `offen`, `überfällig`, `zukünftig` und `leerstand` verwenden dieselbe Cent-Toleranz und Verspätungsregel. |

Die gemeinsame Datei ist keine Datenhaltung und ersetzt nicht die Backend-Idempotenz
über `zahlung_id`. Apps Script validiert weiterhin Schema, Berechtigung, Lock,
Originalzahlung und Betrag. Die UI ergänzt weiterhin die weiche Dublettenwarnung.

## Bewusste Grenzen

- Die gemeinsame Quelle vereinheitlicht Regeln, sie führt keine Zahlungsgruppen-
  Dublettenprüfung nachträglich ein. Das bleibt ein Folgepunkt nach den
  Soll-Historie-Regeln.
- Der technische Monatsstatus ist keine rechtliche Bewertung.
- Ein lokaler Mock ist kein Beleg für einen erfolgreichen Google-Sheets-Schreib-
  vorgang. Für den Release bleibt die echte TEST-Abnahme erforderlich.

## Tests

`tests/payment-rules.test.js` prüft die gemeinsame Quelle isoliert. Zusätzlich laden
die Payment-UI-, Apps-Script- und Zugriffstests dieselbe Datei. Damit werden sowohl
die Browserverwendung als auch der echte Apps-Script-Schreibweg mit dem gemeinsamen
Regelcode geprüft.

Der lokale Prüfstand dieses Branches ist vollständig grün: `npm test` läuft mit 550
Tests in 21 Testdateien, die Frontend-Asset-Prüfung, JavaScript-Syntaxprüfung und
`git diff --check` sind ebenfalls erfolgreich. Zusätzlich wurde der Mock-Server per
HTTP mit einer deutschen Betragsangabe, einem Retry, einem ID-Konflikt und einem
Storno mit serverseitig abgeleiteten Metadaten geprüft. Der Apps-Script-Schreibweg
weist leere, ungültige und nullwertige Beträge ebenfalls direkt ab.

Das wiederholbare Skript `npm run qa:p6-2:test` verwendet ausschließlich den lokalen
TEST-Schlüssel und eindeutige `P62_LIVE_...`-IDs. Vor dem ersten Schreibvorgang prüft es,
dass TEST- und PROD-URL verschieden sind, verlangt `--yes` und vergleicht die erwartete
Backend-Version. Der aktuelle Aufruf lautet daher:
`npm run qa:p6-2:test -- --yes --expect-version=4.8.14`. Bei einem späteren Backend-
Release wird nur der Parameter angepasst. Der Vertrag `35` und das reproduzierbare
Testdatum `2026-11-18` sind die Standardwerte; sie können mit `--contract-id` und
`--test-date=YYYY-MM-DD` überschrieben werden. Es schreibt keine PROD-Daten. Das
Skript ist append-only: Jeder Lauf erzeugt positive Testzeilen und
anschließende Stornozeilen im TEST-Sheet. Der Nettoeffekt ist neutral, die Auditzeilen
bleiben erhalten; für wiederholte Abnahmen sollte deshalb ein eigener Abnahmevertrag
verwendet oder der verwendete Vertrag ausdrücklich dokumentiert werden.

Abnahmekriterien für TEST:

1. Eine Zahlung mit `mietmonat = 2026-02` und Eingangsdatum im November bleibt dem
   Februar zugeordnet.
2. Eine Legacy-Zahlung mit leerem Mietmonat wird dem Eingangsmonat zugeordnet.
3. Ein explizites Guthaben mit Zahlungsgruppe bleibt ohne Mietmonat.
4. Kaution und Erstattung erscheinen getrennt von der Monatsmiete.
5. Ein Storno übernimmt Monat, Gegenart und Zahlungsgruppe aus dem Original, auch
   wenn der Client falsche Werte mitsendet.
6. Retry derselben `zahlung_id` bleibt idempotent; eine abweichende Buchung bleibt
   ein Konflikt.
7. UI und Backend zeigen für bezahlt, teilbezahlt, überfällig und Leerstand dieselben
   Statusgrundlagen.

## Echte TEST-Abnahme am 2026-11-18

Apps Script 4.8.14 ist in TEST auf Deployment `@9` bereitgestellt. `clasp status` bestätigt,
dass `PaymentRules.js` als Datei im TEST-Projekt verfolgt wird. Der geschützte Endpunkt
lieferte `backend_version: 4.8.14`, `payment_schema_ready: true` und `payment_writes: true`.

Der vollständige Lauf mit `npm run qa:p6-2:test -- --yes --expect-version=4.8.14` wurde
auf dem TEST-Vertrag `35` ausgeführt.
Ergebnis: **PASS, 25 Checks grün**. Geprüft wurden fachlicher Mietmonat, Legacy-/Guthaben-
Zuordnung, Retry und ID-Konflikt, Teilzahlung, Überzahlung mit gemeinsamer
`zahlungsgruppe_id`, Kaution mit verworfenem Mietmonat, negative Erstattung, Storno einer
Teilzahlung, zweites Storno, Storno einer Erstattung, deutsche Beträge `1.250,50` und
`1.250`, ungültige Beträge sowie das Berliner Eingangsdatum nach Reload.

Die neun positiven Testzeilen waren nach dem Reload vorhanden. Sieben davon wurden durch
einzelne Storno-Gegenbuchungen neutralisiert; zwei Fälle wurden bereits im Testablauf
fachlich storniert. Die append-only Stornozeilen bleiben als nachvollziehbares
Abnahmeprotokoll im TEST-Sheet. Ein Netzwerk-Retry, der eine bereits gespeicherte Zahlung
zurücklieferte, wurde korrekt als idempotenter Erfolg (`bereits_vorhanden`) bewertet.
Anschließend wurde das PROD-Apps-Script über die bestehende Deployment-ID auf 4.8.14
aktualisiert; URL und Deployment-ID blieben unverändert. Dieser Eintrag beschreibt das
Backend-Deployment. Der Frontend-Teil von P6.2 wird erst mit dem Merge von PR #48 und
dem anschließenden GitHub-Pages-Deploy produktiv. 4.8.13 bleibt als Rollback-Stand
dokumentiert.

Eine geschützte PROD-Capability-Gegenprobe ist in diesem Abnahmelauf noch offen. Der
PROD-Schlüssel wird weder in `runtime-secrets.js` noch in einer lokalen Runtime-
Konfiguration abgelegt: Für die GUI-Abnahme wird er im Zugriffsdialog eingegeben. Für
den einmaligen lesenden API-Check wird er ausschließlich über eine unsichtbare Shell-
Eingabe in `APP_ACCESS_KEY` an den Aufruf übergeben und nicht als CLI-Argument verwendet.
Nicht `export APP_ACCESS_KEY="..."` direkt eintippen, weil der Wert sonst in der
Shell-History landen kann:

```bash
printf 'PROD-Zugangsschlüssel eingeben (Eingabe bleibt unsichtbar): '
read -r -s APP_ACCESS_KEY
printf '\n'
export APP_ACCESS_KEY
```

Nach dem letzten API-Aufruf wird der Wert mit `unset APP_ACCESS_KEY` aus der Shell entfernt.
Das Skript verwendet ausschließlich POST-Requests; der Schlüssel steht nicht in URL,
CLI-Argument, Ausgabe oder gespeicherter Snapshot-Datei. Fehlertexte werden vor der
Ausgabe zusätzlich um den Schlüssel bereinigt. Das Deployment selbst wurde über
`clasp push` und `clasp deploy` aktualisiert; zu prüfen sind
`backend_version: 4.8.14` und `payment_schema_ready: true`.

Vor der PROD-Abnahme wird die Sheet-Datei kopiert. Zusätzlich erstellt
`npm run qa:prod:payment-baseline -- --output=/private/tmp/prod-before.json` einen
Nur-Lese-Bestand der Zahlungszeilen je `vertrag_id`. Die Datei enthält keine Rohzeilen und
keine Namen oder IBANs, sondern nur Zählwerte, Zahlungs-IDs und SHA-256-Fingerprints je Vertrag. Damit
werden auch inhaltliche Ersetzungen bei gleicher Zeilenzahl erkannt. Nach der Abnahme prüft
`npm run qa:prod:payment-baseline -- --compare=/private/tmp/prod-before.json
--output=/private/tmp/prod-after.json`, dass sich außerhalb der Verträge des Objekts
`TEST` keine Zahlungszeile verändert, hinzugefügt oder gelöscht hat. Die Ausgabe nennt im
Fehlerfall die abweichenden `vertrag_id`s, die betroffenen Zahlungs-IDs und unterscheidet Zähl-
und Inhaltsänderung. Auch bei einer festgestellten Abweichung wird der Nachher-Snapshot mit
`ok: false` geschrieben; der Prozess endet zusätzlich mit einem Fehlercode. So bleibt der
Beleg für die Diagnose erhalten. Wird eine Objekt-ID ohne passende Einheit oder Vertrag
angegeben, bricht der Lauf vor dem Snapshot mit einer eindeutigen Fehlermeldung ab. Die
API-Abfrage hat ein Timeout von 30 Sekunden.
Eine legitime Buchung eines anderen Nutzers während der Abnahme ist ein echter False Positive:
Abnahme pausieren, Ursache anhand der ausgegebenen Vertrags-ID klären und die Baseline nicht
blind überschreiben. Die GUI erzeugt UUIDs; die Testbuchungen werden
deshalb über Objekt, Testvertrag, Datum und die tatsächlichen Zahlungs-IDs identifiziert,
nicht über das Präfix des CLI-Abnahmeskripts.

Die Baseline wird unmittelbar vor dem ersten Zugriff der neuen App-Version erstellt; im
Abnahmeprotokoll werden Zeitpunkt, Backend-Version, Commit-SHA und der Name der Sheet-Kopie
festgehalten. Die Snapshot-Dateien liegen nur temporär unter `/private/tmp` und werden nach
der Abnahme gelöscht:

```bash
rm -f /private/tmp/prod-before.json /private/tmp/prod-after.json
```

Die vollständige fachliche Abnahme wird nach dem Merge von PR #48 und dem GitHub-Pages-
Deploy auch im PROD-Testobjekt `TEST` durchgeführt. Dort sind temporäre Schreibvorgänge
erlaubt und vorgesehen, einschließlich Mietzahlung, Teil- und Überzahlung mit Aufteilung,
Kaution, Erstattung, Storno, Retry und Reload-Prüfung. Die erzeugten Testbuchungen werden
anschließend storniert bzw. anhand des Vorher-/Nachher-Snapshots dokumentiert. Reale
PROD-Objekte werden bei diesem Lauf nicht verändert.

## Rollback bei unerwarteter PROD-Abweichung

Bei einer Abweichung außerhalb von `TEST` werden keine weiteren Schreibvorgänge gestartet
und keine Gegenbuchungen auf realen Objekten erzeugt. Die ausgegebenen Vertrags-IDs,
Baseline-Dateien, Sheet-Kopie, Commit-SHA und Backend-Version werden gesichert. Die
Sheet-Kopie wird zuerst in eine separate nicht produktive Datei eingespielt und geprüft.
Eine produktive Wiederherstellung erfolgt ausschließlich über den dokumentierten Backup-
und-Restore-Ablauf; das P6.2-Skript löscht oder überschreibt keine Zahlungszeilen.

Stornos im Objekt `TEST` sind append-only: Nach der GUI-Abnahme ist dort nicht wieder die
ursprüngliche Zeilenzahl zu erwarten. Die Baseline-Prüfung bewertet deshalb Änderungen
außerhalb von `TEST`; die Testbuchungen und ihre Storno-Gegenbuchungen bleiben als
nachvollziehbares Abnahmeprotokoll bestehen.

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
| Betrag | Deutsches Dezimalformat wird akzeptiert und auf Cent gerundet. |
| Fachlicher Mietmonat | `YYYY-MM` und deutsche Datumswerte werden normalisiert; ein ISO-Zeitstempel wird in der lokalen Zeitzone ausgewertet. |
| Legacy-Zahlung | Leerer `mietmonat` ohne Zahlungsgruppe wird dem Eingangsmonat zugeordnet. |
| Guthaben | Leerer `mietmonat` mit `zahlungsgruppe_id` bleibt bewusst nicht zugeordnet und erscheint separat als Guthaben. |
| Kaution | Hat keinen Mietmonat und wird nicht in den Monatsstatus eingerechnet. |
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

Der lokale Prüfstand dieses Branches ist vollständig grün: `npm test` läuft mit 548
Tests in 21 Testdateien, die Frontend-Asset-Prüfung, JavaScript-Syntaxprüfung und
`git diff --check` sind ebenfalls erfolgreich. Zusätzlich wurde der Mock-Server per
HTTP mit einer deutschen Betragsangabe, einem Retry, einem ID-Konflikt und einem
Storno mit serverseitig abgeleiteten Metadaten geprüft.

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

Ein Apps-Script-Deployment ist für die Dokumentation dieses Branches noch nicht
ausgeführt. Vor dem Merge muss `PaymentRules.js` zusammen mit `Code.gs` als neue
Backend-Version in TEST bereitgestellt und dort mit dem isolierten Testobjekt
abgenommen werden. PROD 4.8.13 bleibt bis dahin unverändert.

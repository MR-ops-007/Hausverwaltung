# Betrieb, Testumgebungen und Wiederherstellung

Welche Backend-Version in TEST und PROD bereitgestellt ist und welcher Stand als Rollback
dient, steht ausschließlich in der Deployment-Historie im [`CHANGELOG.md`](../CHANGELOG.md).
Dieses Dokument beschreibt Abläufe und Regeln.

## Mieteingänge (ab Backend 4.8.12)

PR #39 enthält den gehärteten Mieteingangs- und CSV-Import-Ausbau. Er wurde in TEST mit
einem Erfassungs-Schlüssel fachlich abgenommen.
Der PROD-Endpunkt wurde zusätzlich am 2026-11-14 ausschließlich im dauerhaft getrennten
Objekt `TEST` (`Test für Produktivsystem`) schreibend geprüft. Dafür wurde ein
kontrolliertes Fixture `TEST_WE_03` mit Vertrag 34, Mickey Mouse und Minnie Mouse,
`900,00 EUR` Gesamtmiete und `2.000,00 EUR` Kautions-Soll ergänzt. Geprüft wurden
Teil- und Vollkaution, fachlicher Mietmonat, Überzahlung mit Aufteilung, Erstattung,
Nachzahlung, Storno, erneute Zahlung, Statusfarben und Persistenz nach Reload. Die
Sheet-Zeilen wurden nach den GUI-Schreibvorgängen kontrolliert; reale Objekte wurden
nicht verändert. Der native Dubletten-Confirm wird in der Browser-Automation automatisch
bestätigt, deshalb ist nur der Warn-/Speicherpfad, nicht das manuelle Abbrechen, als
PROD-GUI-Fall abgenommen.

Der CSV-Import ist absichtlich lokal und bestätigungspflichtig: Datei auswählen,
Vertrag und fachlichen Mietmonat prüfen, einzelne Buchung übernehmen. Ein Mietmonat
im Verwendungszweck (`YYYY-MM`) wird vorgeschlagen, sonst der Monat des Eingangsdatums;
beides kann vor der Übernahme korrigiert werden. Unklare Zeilen bleiben offen. Die
Version enthält keine direkte Bankanbindung und keine OCR-Verarbeitung.

### Zahlungsfristen

Die Frist steht am Vertrag in `zahlungsziel_typ` und `zahlungsziel_wert`. Ohne
individuelle Angabe gilt der 3. Werktag. Bei `WERKTAG` werden Samstag, Sonntag und
bundesweite Feiertage übersprungen. Für eine Vereinbarung wie „zum 15.“ wird
`KALENDERTAG` mit dem Wert `15` verwendet. Der erste Vertragsmonat beginnt nicht vor
dem tatsächlichen Mietbeginn. Die Anwendung errät keinen Gehaltseingang; abweichende
Vereinbarungen müssen am Vertrag eingetragen werden.
Die Prüfung erfolgt auf Kalendertagesebene: Am Fälligkeitstag bleibt ein offener
Monat bis zum Tageswechsel offen und wird nicht wegen der aktuellen Uhrzeit vorzeitig
als überfällig markiert.

Die Mieteingangsansicht zeigt die konkrete Frist im Zell-Tooltip und im Erfassungsdialog.
Beim Wechsel aus der Objektauswahl übernimmt die Ansicht automatisch dieses Objekt; die
fachliche Verknüpfung der Zeilen erfolgt weiterhin ausschließlich über `vertrag_id`.
`Miete` ist der reguläre Monatsbetrag, `Nachzahlung` ein zusätzlicher Ausgleich für den
ausgewählten Mietmonat. `Erstattung` ist eine negative Rückzahlung an den Mieter und
wird separat geführt; sie macht einen zuvor vollständig bezahlten Monat nicht wieder
zu einer Teilzahlung. Eine Kaution hat keinen Mietmonat und wird separat ausgewertet.
Im Dialog „Bereits erfasst“ wird eine Zahlung zusätzlich im tatsächlichen Eingangsmonat
angezeigt, auch wenn sie fachlich einem anderen Mietmonat zugeordnet ist. Die Zeile zeigt
dann ausdrücklich `Monat YYYY-MM`.
Eine Zahlung, die den offenen Betrag des angeklickten Mietmonats übersteigt, wird nicht
still einem anderen Monat gutgeschrieben. Die App öffnet stattdessen „Zahlung verteilen“:
Der angeklickte Monat wird zuerst vorgeschlagen, danach die ältesten offenen Monate.
Die Beträge können vor dem Speichern angepasst werden; der Rest kann ausdrücklich als
Guthaben ohne `mietmonat` stehen bleiben. Jede Teilbuchung besitzt eine eigene
`zahlung_id`, alle Teilbuchungen teilen eine `zahlungsgruppe_id`. Zugeordnete Teilbeträge
senken den offenen Gesamtbetrag der jeweiligen Monate; ein nicht zugeordneter Rest
erscheint oben als Guthaben.
Die Summe wird während der Eingabe laufend gegen den tatsächlichen Eingang geprüft.
Bei einer Abweichung erscheint direkt im Dialog „Bitte Summe prüfen“ und die Speicherung
bleibt deaktiviert, bis beide Beträge übereinstimmen.

### Dublettenwarnung P6.1

Vor einer manuellen Zahlung und vor der Übernahme einer CSV-Zeile prüft die Oberfläche,
ob bereits eine Zahlung mit derselben `vertrag_id`, demselben Eingangsdatum, Betrag,
fachlichem `mietmonat` und derselben Zahlungsart vorhanden ist. Datumswerte werden dabei
auf den Kalendertag und Beträge auf Cent gerundet. Historische Zahlungen ohne `mietmonat`
werden für diesen Vergleich ihrem Eingangsmonat zugeordnet.

Die Meldung ist bewusst eine weiche Warnung: „Trotzdem speichern“ bleibt möglich, weil
zwei echte Zahlungen am selben Tag mit demselben Betrag fachlich zulässig sein können.
„Abbrechen“ lässt die Eingabe beziehungsweise CSV-Zeile unverändert. Die Regel wird nur
im Frontend verwendet; serverseitige Idempotenz über `zahlung_id` und die Storno-Prüfungen
bleiben die technische Schutzschicht. Aufgeteilte Zahlungsgruppen werden nicht nachträglich
zu einer eigenen Gruppen-Dublette rekonstruiert.

### Zahlungsweg vor dem ersten Schreiben prüfen

Vor einem Zahlungs-Schreibvorgang liest die App `vertrag_capabilities`. Das Backend muss
`payment_writes: true` und `payment_schema_ready: true` liefern. Bei einem alten GAS oder
fehlenden Spalten wird der Schreibvorgang abgebrochen und die fehlenden Spalten werden
angezeigt; es wird keine Zahlung vorgemerkt oder geschrieben.

Historische Zahlungen mit leerem `mietmonat` werden weiterhin über das Eingangsdatum dem
Eingangsmonat zugeordnet. Ein bewusst nicht zugeordnetes Guthaben wird nur an einer
`zahlungsgruppe_id` erkannt. Dadurch wird eine nachträglich ergänzte, leere Spalte nicht
mit Guthaben verwechselt.

Stornos sind append-only und benötigen eine vorhandene Originalzahlung. Vertrag und
Betrag müssen übereinstimmen, das Vorzeichen muss umgekehrt sein, und eine Zahlung kann
nicht zweimal storniert werden. Die UI verwendet dafür `Storno_<zahlung_id>` als stabile
idempotente Kennung. Neue Zahlungen und Zahlungsgruppen erhalten pro Benutzeraktion
neue IDs, damit zwei gleiche Eingänge nicht versehentlich als Duplikat gelten.

Bei historischen Zahlungen ohne `mietmonat` wird der Monat des ursprünglichen Eingangsdatums
auch für die sofortige Anzeige nach einem Storno verwendet. Dadurch steht das Storno bereits
ohne Neuladen im fachlich richtigen Monat; Kautionen und bewusst nicht zugeordnete Guthaben
bleiben ohne Mietmonat.

Bei einem TEST-Bestand, der noch mit Backend 4.8.10 erzeugte Stornos enthält, sind vor einem
erneuten Abnahmetest Stornozeilen mit leerem `mietmonat` zu prüfen. Solche Zeilen müssen entweder
fachlich korrigiert oder aus dem synthetischen TEST-Bestand entfernt werden. Beim erneuten Senden
derselben `zahlung_id` meldet das Backend ab 4.8.12 sonst absichtlich `PAYMENT_ID_CONFLICT`, weil der
korrekt abgeleitete Originalmonat nicht zur alten Zeile passt.

Die fachliche Schreibabnahme ist in TEST vollständig und im PROD-Testobjekt `TEST` für die produktiven
Schreib- und Statusfälle vollständig erfolgt. Das explizite Abbrechen einer nativen
Dublettenwarnung bleibt als manueller QA-Schritt offen.
Für die Speicherung der beiden neuen Vertragsfelder muss einmalig die ausdrücklich
manuell aufzurufende Funktion `prepareContractSchema()` ausgeführt werden. Für die
Zahlungsaufteilung muss zusätzlich einmalig `preparePaymentSchema()` ausgeführt werden.
Beide Funktionen ergänzen nur fehlende Spalten; sie werden nicht automatisch durch
einen Lese- oder Schreibvorgang gestartet.

## Keyfreie lokale Systemprüfung

Für reproduzierbare UI- und Schreibtests ohne PROD-/TEST-Schlüssel steht ein lokaler
Mock bereit. Er verwendet ausschließlich synthetische Entenhausen-Daten und schreibt
nichts in Google Sheets:

```bash
npm run dev:mock-backend
npx vite --host 127.0.0.1 --port 5193
```

Die App kann dafür auf `http://127.0.0.1:5193/?mock=1` geöffnet werden. Der Query-Schalter
greift ausschließlich auf `localhost`/`127.0.0.1` und setzt die API-URL auf
`http://127.0.0.1:8787`; eine `runtime-config.js` muss für diesen Lauf nicht geändert
werden. Die App lädt danach die Mock-Daten, die Mieteingangs-Matrix kann ohne Schlüssel
bedient werden, und Schreibvorgänge bleiben im Prozessspeicher des Mock-Servers. Der
produktive TEST-/PROD-Ablauf wird dadurch nicht verändert. Unit- und Backend-Regressionstests
verwenden denselben Grundsatz: künstliche Daten und Mock-Services, niemals echte Schlüssel
im Testlauf.

### Zahlungstestfälle im Mock

Die Testmatrix enthält bewusst unterschiedliche Fälle:

| Persona | Fachlicher Fall |
| --- | --- |
| Donald Duck | Februar-Teilzahlung, die erst am 11.11. eingeht; Kaution teilweise hinterlegt |
| Mickey Mouse | überwiegend pünktliche Zahlungen; Kaution vollständig hinterlegt |
| Daisy Duck | keine Zahlungen; offene und überfällige Monate |
| Dagobert Duck | mehrere verspätete Monate und eine Teilzahlung; wiederholte Verspätung sichtbar |
| Gustav Gans | Überzahlung, Nachzahlung und negative Erstattung |
| Tick und Trick Duck | zwei Hauptmieter in einer Wohnung; getrennte Teilzahlungen |
| Wohnung 7 | Leerstand ohne Zahlung; wird sichtbar geführt, aber nicht als offene Miete gezählt |

Im Dialog ist `datum` das tatsächliche Eingangsdatum. `mietmonat` ist die fachliche
Zuordnung. Eine Zahlung vom 11.11.2026 kann dadurch den Februar ausgleichen. Im manuellen
Dialog ist der fachliche Mietmonat die angeklickte Monatsspalte und wird dort nur lesbar
angezeigt; für einen anderen Monat wird die entsprechende Spalte geöffnet. Eine vollständig
ausgeglichene verspätete Zahlung ist grün und trägt zusätzlich den Hinweis „verspätet“.
Eine Kaution wird ohne Mietmonat gespeichert und separat gegen `Vertraege.kaution_soll`
ausgewertet.

Der aktuelle TEST-Datensatz enthält zusätzlich einen dauerhaft reproduzierbaren Abnahmesatz:
Donald Duck (Vertrag 29) hat eine gruppierte Zahlung über Oktober und November mit einem
bewusst nicht zugeordneten Rest als Guthaben. Vertrag 32 für TEST_WE_02 ist Mickey und Minnie
gemeinsam zugeordnet und enthält verspätete Vollzahlungen, eine Teilzahlung, eine teilweise
gezahlte Kaution und eine negative Erstattung. Daisy (Vertrag 33) bleibt ohne Zahlung, Dagobert
(Vertrag 34) hat wiederholte Verspätungen und eine Teilzahlung, Gustav (Vertrag 35) eine
Überzahlung mit Erstattung und Tick und Trick (Vertrag 36) getrennte Teilzahlungen.

Für den Mieterwechsel ist `TEST_WE_08` als echter TEST-Datensatz angelegt: Vertrag 37 gehört
Pluto und läuft vom 01.06.2025 bis 31.05.2026; Vertrag 38 gehört Goofy und beginnt am
01.06.2026. Beide Verträge haben eigene Mietzahlungen, Vertragsparteien und Kautionen.
Vertrag 37 ist **kein Leerstand**. Der dauerhaft leere Bestandstest ist `TEST_WE_07`.
Zusätzlich enthält Vertrag 26 für Track Duck einen historischen, vollständig bezahlten
Verlauf ab 01.02.2013 mit 850,00 EUR Monatsmiete und 1.700,00 EUR Kaution. Damit lassen
sich aktive Altverträge, historische Vertragszeilen, echte Leerstände, Statusfarben,
Kautionsanzeige, Guthaben, Erstattungen und mehrere Vertragsparteien direkt im echten
TEST-Backend prüfen. Die Buchungen sind Testdaten und dürfen bei Bedarf zurückgesetzt oder
durch neue Fixture-IDs ergänzt werden.

Der zuletzt geprüfte TEST-Snapshot umfasst 17 Verträge, 41 Einheiten und 446 Zahlungen.
Die Datenprüfung ergab keine fehlenden Vertrags-Startdaten, keine unbekannten Einheiten,
keine aktiven Verträge ohne Sollmiete und keine Verträge ohne Vertragspartei.

Das detaillierte Testprotokoll mit getrennten automatisierten und visuellen Ergebnissen steht
in [`docs/p6-testprotokoll-20261113.md`](p6-testprotokoll-20261113.md). Es dokumentiert auch
die Prüfung des Objektkontexts und der Verknüpfung über `vertrag_id`.

Für die Vertragsmaske wurden im TEST-Blatt `Vertraege` die Felder `zahlungsziel_typ` und
`zahlungsziel_wert` ergänzt. Das entspricht dem Ergebnis von `prepareContractSchema()`; nach
einem vollständigen Neuladen sollte der Button „Vertragsdaten speichern“ dort nicht mehr wegen
eines unvollständigen Schemas deaktiviert sein. Die Rolle `admin` und ein gültiger
`CONTRACT_WRITE_TOKEN` bleiben für tatsächliche Vertragsänderungen erforderlich.

Der Mock enthält außerdem Strom-, Kaltwasser-, Warmwasser- und Heizöl-Verbrauchsdaten
für 2025 und 2026 sowie Audit- und Bilanzzeilen. Die Fixture-Quelle liegt in
`tools/mock-consumption-fixtures.mjs` und wird beim Neustart reproduzierbar neu geladen.
Für den produktiven Schreibweg müssen die optionalen Spalten `mietmonat`, `storno_von`,
`gegen_art` und `zahlungsgruppe_id` im Blatt `Zahlungen` vorhanden sein; fehlen sie, lehnt das Backend ab 4.8.12 den
erweiterten Datensatz verständlich mit `PAYMENT_SCHEMA_MISSING` ab, statt die Zuordnung
still zu verlieren.

Dieses Dokument beschreibt den sicheren Betrieb der Hausverwaltung mit getrennten
Test- und Produktivdaten. Die verbindliche Aufgabenpriorisierung steht in
`ROADMAP.md`; Zugangsschlüssel werden niemals in Git oder in dieser Dokumentation
gespeichert.

## Umgebungen

| Umgebung | Datenbasis | Apps-Script-Projekt | Schlüssel | Zweck |
| --- | --- | --- | --- | --- |
| Produktion | Produktives Google Sheet | Produktive Bereitstellung | eigene `APP_ACCESS_KEYS_JSON` und `CONTRACT_WRITE_TOKEN` | echte Daten |
| Test (aktuell) | Kopierte TEST-Tabelle mit synthetischen Daten | Separates Testprojekt und geschütztes TEST-Deployment | eigene Testschlüssel | Entwicklung und Abnahme |
| Lokal | per `runtime-config.js` ausgewählte API | Test oder Produktion, bewusst festgelegt | Eingabe im Browser, nicht im Repository | lokale Prüfung |

Test und Produktion müssen immer unterschiedliche Sheet-IDs, GAS-Projekte,
Deployment-URLs und Script Properties verwenden. Eine gleiche URL ist kein
zulässiger Testaufbau. Auch die synthetische TEST-Umgebung wird mit eigenen
Schlüsseln geschützt und ist kein ungeschützter Ersatz für eine Testumgebung.

## Backend-Stand

Den aktuellen Stand je Umgebung zeigt die Deployment-Historie im
[`CHANGELOG.md`](../CHANGELOG.md). Deployments aktualisieren die bestehenden
Bereitstellungen, die URLs bleiben dabei gleich. Nach jedem Deploy muss ein anonymer
GET-Aufruf gegen den Endpunkt `UNAUTHORIZED` liefern. Die lokale `clasp`-Zielauswahl wird für jeden Befehl aus dem gewählten
Profil gesetzt; ein PROD-Push oder -Deploy verlangt eine ausdrückliche Bestätigung.

## Testdatenbasis aufbauen

Eine vollständige Kopie der Produktivdatei ist nur als eingeschränkt zugängliches
Backup sinnvoll. Für tägliche Tests ist eine bereinigte Testdatei vorzuziehen, weil
eine Vollkopie sonst Mieternamen, Verträge, Zahlungen und Zählerhistorie dupliziert.

Empfohlener Ablauf:

1. Produktivdatei in Google Drive nur für Backup-Zwecke kopieren und Zugriff auf den
   Administrator beschränken.
2. Für die Testumgebung eine bereinigte Datei oder Vorlage mit den Tabellenköpfen,
   dem Objekt `TEST` und synthetischen Testpersonen verwenden.
3. `Code.gs`, `Contracts.gs`, `ContractService.js`, Manifest und Migrationen in ein
   separates Apps-Script-Testprojekt übernehmen. Nicht davon ausgehen, dass eine
   Google-Sheets-Kopie das gebundene Script korrekt mitkopiert.
4. Im geschützten Testprojekt eigene Script Properties setzen:
   `APP_ACCESS_KEYS_JSON` und gegebenenfalls `CONTRACT_WRITE_TOKEN`. Niemals
   Produktionsschlüssel wiederverwenden.
5. Als Web-App-Testbereitstellung veröffentlichen und die URL ausschließlich in der
   lokalen Konfiguration verwenden.
6. Mit dem vorhandenen Testbereich (`TEST_WE_01`, `TEST_WE_02`, `TEST_Allgemein`)
   Lesen, Schreiben, Duplikat, Korrektur und Verbrauchsview-Aktualisierung prüfen.

Die Testdatei wird in diesem Paket nicht automatisch kopiert. Das ist eine bewusste
Sicherheitsgrenze: Eine externe Kopie mit realen personenbezogenen Daten darf nicht
ohne ausdrückliche Auswahl von Quelle, Ziel und Zugriffskreis angelegt werden. Der
verbindliche Ablauf für Backup und Restore steht in `docs/backup-restore.md`.

## Lokale API-Auswahl

`config.js` enthält keine Backend-URL mehr. Ohne lokale Konfiguration wird kein
Backend angesprochen. Für eine Testumgebung:

```bash
cp config.local.example.js runtime-config.js
```

Danach in `runtime-config.js` die beiden Profile für TEST und PRODUKTION eintragen.
Die Datei ist ignoriert und darf nicht committed werden. Die aktuelle Umgebung steht
anschließend in `CONFIG.ENVIRONMENT` als `test` beziehungsweise `production` zur
Verfügung und wird in der roten TEST- beziehungsweise grünen PROD-Leiste angezeigt.
Der Umschalter fragt vor dem Wechsel auf Produktion nach und lädt die App danach neu.

Für **„Zum Home-Bildschirm hinzufügen“** muss die App über HTTPS geöffnet werden.
Das Manifest `manifest.webmanifest`, die iOS-Metadaten und die Icons werden bereits
ausgeliefert. Die sichtbare TEST-/PROD-Kennzeichnung bleibt auch beim eigenständigen
Start erhalten. Ein Service Worker ist derzeit bewusst nicht aktiviert; Offline-Betrieb
nach dem vollständigen Schließen der App ist daher kein Abnahmekriterium.

### GitHub-Pages-Bereitstellung

Die öffentliche Frontend-Adresse wird durch `.github/workflows/pages.yml` aus `main`
gebaut. Der Workflow erzeugt `runtime-config.js` erst im Build aus den sechs
nicht-sensitiven Repository-Variablen `HV_TEST_API_URL`, `HV_TEST_SCRIPT_ID`,
`HV_TEST_DEPLOYMENT_ID`, `HV_PROD_API_URL`, `HV_PROD_SCRIPT_ID` und
`HV_PROD_DEPLOYMENT_ID`. Fehlt eine Variable, bricht der Build ab, statt eine
scheinbar funktionierende App ohne Backend zu veröffentlichen.

Die GAS-URLs und Projekt-IDs sind keine Zugangsschlüssel. Die eigentlichen
`APP_ACCESS_KEY`-Werte werden niemals in GitHub Pages oder den Workflow geschrieben,
sondern bleiben im jeweiligen Browser-Speicher getrennt nach Umgebung.

Vor jedem Testlauf prüfen:

- Browser-URL und Deployment-URL gehören zur selben Umgebung.
- Im Browser ist kein alter Schlüssel der anderen Umgebung gespeichert.
- `TEST` wird verwendet; produktive Objekte werden nicht für Schreibtests verwendet.
- Nach dem Test wird der Testschlüssel aus dem Browser entfernt oder der Testbrowser
  geschlossen.

Die Regel gilt auch für CLI-Skripte: `tools/fetch-verbrauch-snapshot.mjs` nimmt die
URL über `HV_API_URL` oder `--url` entgegen und liest sie nicht aus einer
versionierten Datei.

## Backup und Restore

Produktiv-Backups werden mit Datum und Quelle abgelegt. Ein Restore wird zuerst in
eine neue, nicht produktive Google-Sheets-Datei durchgeführt. Erst nach Prüfung der
Tabellenköpfe, Zeilenzahlen, Formeln, Views und Script-Anbindung darf über eine
produktive Wiederherstellung entschieden werden.

Ein Restore-Protokoll enthält mindestens:

- Zeitpunkt und ausführende Person,
- Quelle und Ziel (Dateiname und Sheet-ID),
- verwendeten Datenstand,
- geprüfte Tabellen und Zeilenzahlen,
- Ergebnis von `npm test` und dem manuellen Test,
- Entscheidung: verworfen, als Test akzeptiert oder produktiv freigegeben.

Der vollständige Ablauf und eine ausfüllbare Protokollvorlage stehen in
`docs/backup-restore.md`.

Ein Backup ist keine Transaktion und ersetzt keine fachliche Prüfung. Das Apps Script
arbeitet mit Google-Sheets-Operationen; ein Rollback ist deshalb ein kontrollierter
Restore und kein automatisches Zurückrollen einzelner Requests.

## Deployment-Checkliste

### Release-Regel (verbindlich, festgelegt am 2026-11-24)

`clasp` darf für TEST und PROD verwendet werden. Entscheidend ist die Freigabe:

1. **Vor jedem Push** wird das Ziel mit `npm run clasp:<umgebung>:status` geprüft. Der
   vorhandene Code wird gepullt und der Diff kontrolliert, damit kein fremder oder neuerer
   Stand überschrieben wird.
2. **Testen:** Ein TEST-Deploy darf für die Abnahme aus dem PR-Stand erfolgen. Danach werden
   Schema-Voraussetzungen, Verhalten und Abnahmekriterien in TEST geprüft.
3. **PROD** wird erst nach erfolgreicher Prüfung und nach ausdrücklicher Freigabe des
   Product Owners für genau diesen PROD-Deploy beschrieben oder bereitgestellt. Die Freigabe
   muss vor `clasp:prod:push` und `clasp:prod:deploy` vorliegen. PROD wird aus dem gemergten
   Stand auf `main` deployt. Eine Freigabe des grundsätzlichen Vorgehens ist keine Freigabe
   für einen konkreten Deploy; ein erfolgreicher TEST-Deploy ist keine PROD-Freigabe.
4. **Dokumentieren:** Nach dem Deploy werden Deployment-Version, ausgeführte Prüfungen und
   Ergebnis in der Deployment-Historie im `CHANGELOG.md` festgehalten.
5. **Lesender Zugriff** auf TEST und PROD (Status, Deployments, Versionen, Pull in einen
   getrennten Hilfsordner zum Vergleich) ist ohne gesonderte Freigabe erlaubt.

### Frontend

1. `main` aktualisieren und Feature-Branch anlegen.
2. `npm ci`, `npm test` und `git diff --check` ausführen.
3. Mit `runtime-config.js` ausschließlich gegen die vorgesehene Umgebung testen.
4. Desktop und Mobil visuell prüfen.
5. PR und CI abwarten, nach Freigabe mergen.

### Apps Script

1. `npm run clasp:test:pull` oder bewusst `npm run clasp:prod:status` ausführen und den Pull-Diff prüfen.
2. Backend-Version und Changelog-Status abgleichen.
3. `npm run clasp:test:push` nur für TEST ausführen; PROD nutzt `npm run clasp:prod:push`
   und verlangt die zusätzliche Bestätigung.
4. Neue Version der bestehenden Bereitstellung veröffentlichen; bei einer neuen
   Bereitstellung die API-URL aktualisieren.
5. `prepareContractSchema()` einmal manuell ausführen. Die Funktion legt bei 4.8.13
   zusätzlich `MieterwechselProtokoll`, bei 4.8.15 das Blatt
   `MieterhöhungsPrüfungen` und bei 4.8.16 die optionalen Regelspalten im Blatt
   `Objekte` an; sie wird nicht automatisch durch einen API-Aufruf gestartet.
   Vor dem Ausführen eine Sheet-Kopie als Rückfallstand sichern.
6. `installDailyViewTrigger()` einmal manuell ausführen und die Rückmeldung
   `already_present` prüfen. Die Funktion legt nur einen täglichen Trigger für
   `refreshAktiveMieterViewDaily()` an und entfernt einen alten Trigger auf
   `updateAktiveMieterView()`. Der Wrapper wartet bis zu 30 Sekunden auf den Script-Lock
   und schützt damit den vollständigen View-Refresh; ein wegen eines belegten Locks
   übersprungener Lauf wird protokolliert. Die Apps-Script-Zeitzone muss auf `Europe/Berlin`
   stehen.
7. Den täglichen Handler einmal manuell auslösen und `_view_aktive_mieter` prüfen. Die
   aktuellen Mieter müssen weiterhin enthalten sein. Das Ereignisobjekt eines Zeit-Triggers
   darf nicht als Stichtag an die Datumslogik weitergereicht werden.
8. Mit dem passenden Umgebungsschlüssel einen geschützten Lese- und Schreibtest
   durchführen.
9. Ergebnis, Deployment-Version und Rollback-Stand in der Deployment-Historie im
   `CHANGELOG.md` ergänzen: einen TEST-Deploy aus dem PR-Stand im selben PR, einen
   PROD-Deploy (nur aus `main` nach Merge) im nächsten ohnehin anstehenden PR.

Für P6.6c muss die Capability `rent_increase_review_writes: true` mit einem
autorisierten `admin`- oder `erfassen`-Profil zurückkommen. Danach mindestens einen
fälligen Prüfabschluss, eine Wiederöffnung und die Wiedervorlage nach zwölf Monaten
prüfen. Ein erneuter Abschluss mit derselben Signatur muss als bereits gespeichert
gelten und darf den ursprünglichen Abschlusszeitpunkt nicht verändern. Das neue
Blatt ist pro Vertrag idempotent; Vertragsdaten und Mietbeträge werden durch diese
Aktion nicht geändert.

## Sicherheitsgrenzen

- Keine Schlüssel in `config.js`, `config.local.example.js`, GitHub Actions oder Logs.
- Keine Backend-URL in `config.js`; lokale URLs gehören ausschließlich in die
  ignorierte `runtime-config.js`.
- Test- und Produktionsschlüssel niemals teilen oder wiederverwenden.
- Die produktive und die synthetische TEST-Web-App-URL sind ohne gültigen Schlüssel
  nicht ausreichend, um Daten zu lesen; die Schutzwirkung wird mit einem echten
  `UNAUTHORIZED`-Test bestätigt.
- Eine Testumgebung mit einer kopierten Produktivdatei ist nicht automatisch anonymisiert.
- Für lokale Tests mit der echten TEST-API kann einmalig `runtime-secrets.example.js` nach
  `runtime-secrets.js` kopiert und dort ausschließlich der TEST-`APP_ACCESS_KEY` eingetragen
  werden. `runtime-secrets.js` ist in `.gitignore`, wird nicht in das GitHub-Pages-Artefakt
  kopiert und enthält keinen PROD-Schlüssel. Beim ersten Abruf übernimmt `cloud-service.js`
  den lokalen TEST-Schlüssel automatisch in den umgebungsbezogenen Browser-Speicher. Danach
  ist keine erneute Eingabe bei neuen Cache-Busting-URLs oder lokalen Ports erforderlich.

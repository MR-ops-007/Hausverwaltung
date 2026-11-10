# Betrieb, Testumgebungen und Wiederherstellung

Stand: 2026-11-10

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

## Letzter Backend-Stand

Backend 4.8.5 wurde am 2026-11-10 als neue Version der bestehenden Bereitstellungen
veröffentlicht. PROD steht auf Deployment-Version 41, TEST auf Deployment-Version 5;
die URLs blieben unverändert. Ein anonymer GET-Aufruf gegen beide Endpunkte liefert
`UNAUTHORIZED`. Die lokale `clasp`-Zielauswahl wird für jeden Befehl aus dem gewählten
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

### Frontend

1. `main` aktualisieren und Feature-Branch anlegen.
2. `npm ci`, `npm test` und `git diff --check` ausführen.
3. Mit `runtime-config.js` ausschließlich gegen die vorgesehene Umgebung testen.
4. Desktop und Mobil visuell prüfen.
5. PR und CI abwarten, danach mergen.

### Apps Script

1. `npm run clasp:test:pull` oder bewusst `npm run clasp:prod:status` ausführen und den Pull-Diff prüfen.
2. Backend-Version und Changelog-Status abgleichen.
3. `npm run clasp:test:push` nur für TEST ausführen; PROD nutzt `npm run clasp:prod:push`
   und verlangt die zusätzliche Bestätigung.
4. Neue Version der bestehenden Bereitstellung veröffentlichen; bei einer neuen
   Bereitstellung die API-URL aktualisieren.
5. Mit dem passenden Umgebungsschlüssel einen geschützten Lese- und Schreibtest
   durchführen.
6. Ergebnis und Rollback-Stand in `CHANGELOG.md` beziehungsweise diesem Dokument
   ergänzen.

## Sicherheitsgrenzen

- Keine Schlüssel in `config.js`, `config.local.example.js`, GitHub Actions oder Logs.
- Keine Backend-URL in `config.js`; lokale URLs gehören ausschließlich in die
  ignorierte `runtime-config.js`.
- Test- und Produktionsschlüssel niemals teilen oder wiederverwenden.
- Die produktive und die synthetische TEST-Web-App-URL sind ohne gültigen Schlüssel
  nicht ausreichend, um Daten zu lesen; die Schutzwirkung wird mit einem echten
  `UNAUTHORIZED`-Test bestätigt.
- Eine Testumgebung mit einer kopierten Produktivdatei ist nicht automatisch anonymisiert.

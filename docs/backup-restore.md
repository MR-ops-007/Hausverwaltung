# Backup und Restore

Stand: 2026-11-09

Dieses Runbook beschreibt den sicheren Umgang mit Backups der Google-Sheets-Daten.
Ein Restore wird niemals direkt auf die produktive Datei ausprobiert. Zuerst wird
immer eine neue, nicht produktive Zieldatei verwendet.

## Backup anlegen

1. In Google Drive die produktive Tabelle als Kopie anlegen.
2. Den Dateinamen mit Datum und Zweck versehen, zum Beispiel
   `Hausverwaltung Backup 2026-11-09`.
3. Die Freigabe auf den Administrator beschränken. Die Kopie darf nicht als
   öffentliches Testsystem verwendet werden.
4. In der Kopie dokumentieren:
   - Quelldateiname und Quell-Sheet-ID,
   - Zieldateiname und Ziel-Sheet-ID,
   - Zeitpunkt und ausführende Person,
   - Apps-Script-Version und Deployment-Stand.
5. Stichprobenartig Tabellenköpfe, Zeilenzahlen und die vier Verbrauchsviews
   prüfen. Ein Backup gilt erst dann als verwendbar, wenn diese Prüfung
   protokolliert ist.

## Restore-Test

1. Eine neue leere Google-Sheets-Datei als Restore-Ziel anlegen.
2. Die Tabellen aus der Backup-Kopie in das Ziel kopieren. Die produktive Datei
   bleibt dabei unverändert.
3. Tabellenköpfe und Zeilenzahlen gegen das Backup vergleichen.
4. Das Apps Script nur an das Restore-Ziel binden beziehungsweise ein separates
   Restore-Projekt verwenden. Keine produktiven Script Properties übernehmen.
5. Mit einer lokalen `runtime-config.js` gegen das Restore-Ziel lesen. Schreibtests
   sind nur im ausdrücklich dafür angelegten TEST-Bereich erlaubt.
6. `npm test`, einen geschützten Lesetest und die Verbrauchsview-Prüfung ausführen.
7. Das Ergebnis als `verworfen`, `als Test akzeptiert` oder `produktiv freigegeben`
   dokumentieren. Eine produktive Freigabe erfordert eine separate Entscheidung.

## Restore-Protokollvorlage

```text
Datum/Uhrzeit:
Ausführende Person:
Quelle (Name und Sheet-ID):
Ziel (Name und Sheet-ID):
Datenstand / Backup-Datum:
Apps-Script-Version und Deployment:
Geprüfte Tabellen und Zeilenzahlen:
npm test:
Lesetest:
Verbrauchsview-Prüfung:
Ergebnis: verworfen / als Test akzeptiert / produktiv freigegeben
Bemerkungen:
```

## Aktueller Stand

Der Restore-Test ist in diesem Paket als manueller Betriebsschritt vorbereitet,
aber noch nicht mit einer Produktivkopie ausgeführt. Dafür müssen Quelle, Ziel und
der Zugriffskreis im Google-Konto bewusst ausgewählt werden. Es werden keine
Produktivdaten automatisch kopiert oder überschrieben.

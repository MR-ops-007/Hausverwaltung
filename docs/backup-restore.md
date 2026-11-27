# Backup und Restore

Stand: 2026-11-27 (Backup-Projekt 1.0.0)

Sicherungen der Hausverwaltungs-Tabelle laufen in einem **eigenen Apps-Script-Projekt**
(`apps-script-backup/`), getrennt von der Web-App in `apps-script/`. Nur das Backup-Projekt
hat Zugriff auf Google Drive; die öffentlich erreichbare Web-App bleibt ohne
(Entscheidung 2026-11-27, `ROADMAP.md`). Das Backup-Projekt hat keine Web-App, liest die
Quelltabelle nur und schreibt nie hinein.

Ein Restore wird nie direkt auf die produktive Datei ausprobiert, sondern immer zuerst in
eine neue, separate Testdatei. Eine automatische Wiederherstellung der Produktion gibt es
bewusst nicht.

## Was das Backup-Projekt tut

| Funktion (`apps-script-backup/Backup.js`) | Zweck |
| --- | --- |
| `setupBackup()` | Einmalig: prüft die Quelle, legt den privaten Ordner an und richtet genau einen Wochen-Trigger ein (sonntags gegen 3 Uhr). Wiederholbar. |
| `runWeeklyBackup()` | Vom Trigger: Kopie nur, wenn sich der Datenbestand seit der letzten automatischen Kopie geändert hat; danach Rotation. |
| `createManualBackup()` | Kopie vor einem Release oder einer Migration; außerhalb der Rotation, wird nie automatisch gelöscht. |
| `listBackups()` | Übersicht aller Kopien im Ordner samt Freigabe-Warnungen (Ausführungslog). |
| `restoreLatestBackupToTestFile()` | Restore-Test: neueste Kopie in eine neue Testdatei, Vergleich von Blättern, Größen, Kopfzeilen und Zellinhalten (Hash je Blatt). |

**Geänderter Datenbestand.** Verglichen wird ein SHA-256-Fingerabdruck über alle Blätter
außer den abgeleiteten (Name beginnt mit `_`, z. B. `_view_verbrauch_monat`). Der tägliche
View-Refresh allein löst also keine Kopie aus.

**Rotation.** Es bleiben höchstens drei automatische Kopien: die neueste, eine mittlere bis
49 Tage und eine ältere. Wird die mittlere älter als 49 Tage, ersetzt sie die ältere, und
die nächstjüngere rückt nach. Bei wöchentlichen Kopien ist die mittlere damit 1–7 Wochen,
die ältere 8–14 Wochen alt; ohne Änderungen entstehen keine Kopien und nichts wird
gelöscht. Überzählige Kopien gehen in den Papierkorb (30 Tage wiederherstellbar).
Manuelle Kopien und Restore-Testdateien sind über die Dateibeschreibung
(`hv-backup:manuell`, `hv-backup:restore-test`) gekennzeichnet und von der Rotation
ausgenommen.

**Freigabe.** Vor jeder Kopie prüft das Projekt, dass der Ordner privat ist (keine
Linkfreigabe, keine weiteren Bearbeiter oder Betrachter). Sonst bricht es ohne Kopie ab;
eine Kopie, die durch die Ordnerfreigabe sichtbar würde, wird sofort in den Papierkorb
gelegt. Zusätzlich prüft jeder Wochenlauf die Einzelfreigaben aller vorhandenen Kopien:
Ist eine Kopie nachträglich freigegeben, schlägt der Lauf fehl, und Apps Script meldet den
fehlgeschlagenen Trigger per E-Mail. Kopien können die Script-Properties der gebundenen Web-App mitnehmen (Geräteschlüssel,
Vertragstoken) und dürfen deshalb nie freigegeben werden.

**Lock.** Wochenlauf, manuelle Kopie und Restore-Test laufen unter dem Script-Lock des
Backup-Projekts; ein paralleler Aufruf meldet `LOCK_BUSY` und legt nichts an.

**Grenzen.** Das Backup-Projekt kann den Script-Lock der Web-App nicht nutzen. Läuft
während der Kopie gerade ein Schreibvorgang, enthält die Kopie ihn ganz oder gar nicht
(Drive kopiert die Datei als Ganzes); eine Änderung zwischen Fingerabdruck und Kopie führt
höchstens zu einer zusätzlichen Kopie in der Folgewoche.

## Einrichtung je Umgebung (einmalig)

Zuerst TEST, PROD erst nach Abnahme und ausdrücklicher Freigabe.

1. Auf script.google.com ein neues, eigenständiges Projekt anlegen, z. B.
   „Hausverwaltung Backup TEST“. Die Script-ID (Projekteinstellungen) in `config.local.js`
   beim Profil als `backupScriptId` eintragen (Vorlage: `config.local.example.js`).
2. Code übertragen: `npm run clasp:test:backup:push` (PROD:
   `npm run clasp:prod:backup:push`, verlangt `--confirm-prod`, ist im Skript enthalten).
   `npm run clasp:test:backup:status` zeigt das Ziel vorab.
3. In den Projekteinstellungen die Script-Properties setzen:
   `SOURCE_SPREADSHEET_ID` (ID der Hausverwaltungs-Tabelle der Umgebung) und
   `BACKUP_LABEL` (`TEST` bzw. `PROD`).
4. Im Backup-Projekt in der Datei `Backup.js` die Funktion `setupBackup()` ausführen und
   die Berechtigungen bestätigen (Drive, Tabellen lesen, Trigger). Rückmeldung prüfen:
   `created_folder`, `trigger_already_present`, `folder_url`.
5. Einmal `runWeeklyBackup()` ausführen: Die erste Kopie entsteht immer. Ein zweiter
   Aufruf direkt danach muss `UNCHANGED` melden.
6. Restore-Test nach dem Abschnitt unten durchführen und protokollieren.

## Kopie vor Release oder Migration

Vor `prepareContractSchema()` oder einer Migration im Backup-Projekt der Umgebung
`createManualBackup()` (Datei `Backup.js`) ausführen und den Dateinamen aus der Rückmeldung
im PR oder in der Deployment-Historie nennen.

## Restore-Test

1. Im Backup-Projekt `restoreLatestBackupToTestFile()` (Datei `Backup.js`) ausführen. Die
   Funktion legt `HV-Restore-Test <Umgebung> <Zeit>` im Backup-Ordner an und vergleicht
   Blätter, Zeilen-/Spaltenzahl, Kopfzeilen und je Blatt einen SHA-256-Hash über alle
   Zellwerte mit der Kopie. `status: success` gibt es nur bei vollständiger Übereinstimmung;
   eine Abweichung nennt nur den Blattnamen, keine Zellinhalte. `status: success` und
   `abweichungen: []` sind die Voraussetzung für die weiteren Schritte.
2. Die Testdatei stichprobenartig öffnen: Stammdaten, letzte Zahlungen, letzte
   Zählerstände und die vier Verbrauchsviews.
3. Optional einen Lesetest mit der App: Das an die Testdatei gebundene Script-Projekt
   (Kopie der Web-App) nur in dieser Datei bereitstellen, eigenen Testschlüssel setzen,
   keine produktiven Script-Properties weiterverwenden; mit lokaler `runtime-config.js`
   lesen. Schreibtests sind dort nicht vorgesehen.
4. Ergebnis mit der Vorlage unten protokollieren: `verworfen`, `als Test akzeptiert` oder
   `produktiv freigegeben`. Eine Wiederherstellung der Produktion ist eine eigene
   Entscheidung und wird manuell durchgeführt.
5. Die Testdatei danach in den Papierkorb legen, sofern sie nicht weiter gebraucht wird.

## Restore-Protokollvorlage

```text
Datum/Uhrzeit:
Ausführende Person:
Umgebung:
Quelle (Kopie, Name und ID):
Ziel (Testdatei, Name und ID):
Datenstand (Erstellzeit der Kopie):
Backup-Projekt-Version:
Abweichungen laut restoreLatestBackupToTestFile():
Stichprobe Stammdaten/Zahlungen/Zählerstände/Verbrauchsviews:
Lesetest mit der App (optional):
Ergebnis: verworfen / als Test akzeptiert / produktiv freigegeben
Bemerkungen:
```

## Protokoll

| Datum | Umgebung | Schritt | Ergebnis |
| --- | --- | --- | --- |
| – | – | noch keine Einrichtung | – |

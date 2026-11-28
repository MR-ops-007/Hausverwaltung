# Backup und Restore

Stand: 2026-11-28 (Backup-Projekt 1.1.0, Backend 4.8.19)

Sicherungen der Hausverwaltungs-Tabelle laufen in einem **eigenen Apps-Script-Projekt**
(`apps-script-backup/`), getrennt von der Web-App in `apps-script/`. Nur das Backup-Projekt
hat Zugriff auf Google Drive; die öffentlich erreichbare Web-App bleibt ohne
(Entscheidung 2026-11-27, `ROADMAP.md`). Das Backup-Projekt hat keine Web-App, liest die
Quelltabelle nur und schreibt nie hinein.

Ein Restore wird nie direkt auf die produktive Datei ausprobiert, sondern immer zuerst in
eine neue, separate Testdatei. Eine automatische Wiederherstellung der Produktion gibt es
bewusst nicht. Die echte Rücksicherung (Abschnitt „Rücksicherung“) ist zweistufig: Das
Backup-Projekt bereitet vor und prüft, geschrieben wird ausschließlich von der Web-App
(`apps-script/Restore.gs`) unter ihrem eigenen Lock und mit Wartungssperre.

## Was das Backup-Projekt tut

| Funktion (`apps-script-backup/Backup.js`) | Zweck |
| --- | --- |
| `setupBackup()` | Einmalig: prüft die Quelle, legt den privaten Ordner an und richtet genau einen Wochen-Trigger ein (sonntags gegen 3 Uhr). Wiederholbar. |
| `runWeeklyBackup()` | Vom Trigger: Kopie nur, wenn sich der Datenbestand seit der letzten automatischen Kopie geändert hat; danach Rotation. |
| `createManualBackup()` | Kopie vor einem Release oder einer Migration; außerhalb der Rotation, wird nie automatisch gelöscht. |
| `listBackups()` | Übersicht aller Kopien: Datei-ID, Umgebung, Art, Erstellzeit, Fingerabdruck (Datenblätter) und Blattübersicht, dazu Freigabe-Warnungen (Ausführungslog). Keine Zellinhalte. |
| `restoreLatestBackupToTestFile()` | Restore-Test: neueste Kopie in eine neue Testdatei, Vergleich von Blättern, Größen, Kopfzeilen und Zellinhalten (Hash je Blatt). |
| `restoreBackupToTestFile()` | Wie oben, aber für die Kopie aus der Script-Property `RESTORE_BACKUP_ID`. |
| `prepareRestore()` | Schritt 1 der Rücksicherung für die Kopie aus `RESTORE_BACKUP_ID`: Probe-Restore, Schema-Prüfung, Auswirkung, Vor-Restore-Kopie. Schreibt nicht in die Tabelle. |

**Geänderter Datenbestand.** Verglichen wird ein SHA-256-Fingerabdruck über alle Blätter
außer den abgeleiteten (Name beginnt mit `_`, z. B. `_view_verbrauch_monat`). Der tägliche
View-Refresh allein löst also keine Kopie aus.

**Rotation.** Es bleiben höchstens drei automatische Kopien: die neueste, eine mittlere bis
49 Tage und eine ältere. Wird die mittlere älter als 49 Tage, ersetzt sie die ältere, und
die nächstjüngere rückt nach. Bei wöchentlichen Kopien ist die mittlere damit 1–7 Wochen,
die ältere 8–14 Wochen alt; ohne Änderungen entstehen keine Kopien und nichts wird
gelöscht. Überzählige Kopien gehen in den Papierkorb (30 Tage wiederherstellbar).
Manuelle Kopien, Vor-Restore-Kopien und Restore-Testdateien sind über die Dateibeschreibung
(`hv-backup:manuell`, `hv-backup:vor-restore`, `hv-backup:restore-test`) gekennzeichnet und
von der Rotation ausgenommen.

**Freigabe.** Vor jeder Kopie prüft das Projekt, dass der Ordner privat ist (keine
Linkfreigabe, keine weiteren Bearbeiter oder Betrachter). Sonst bricht es ohne Kopie ab;
eine Kopie, die durch die Ordnerfreigabe sichtbar würde, wird sofort in den Papierkorb
gelegt. Zusätzlich prüft jeder Wochenlauf die Einzelfreigaben aller vorhandenen Kopien:
Ist eine Kopie nachträglich freigegeben, schlägt der Lauf fehl, und Apps Script meldet den
fehlgeschlagenen Trigger per E-Mail. Kopien können die Script-Properties der gebundenen Web-App mitnehmen (Geräteschlüssel,
Vertragstoken) und dürfen deshalb nie freigegeben werden.

**Lock.** Einrichtung, Wochenlauf, manuelle Kopie, Restore-Test und Vorbereitung laufen unter dem Script-Lock des
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
   die Berechtigungen bestätigen (Drive, Tabellen, Trigger). `SpreadsheetApp.openById`
   verlangt den vollen Tabellen-Scope; der Code liest trotzdem nur (Test in
   `tests/backup.test.js`). Rückmeldung prüfen:
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

## Rücksicherung (Tabelle auf eine Kopie zurücksetzen)

Setzt die **gesamte** Tabelle auf eine gewählte Kopie zurück; einzelne Blätter werden bewusst
nicht zurückgesichert (Abhängigkeiten zwischen Verträgen, Zahlungen und Zählerständen).
Alle Änderungen seit der Kopie gehen verloren und bleiben nur in der Vor-Restore-Kopie
erhalten. Zuerst in TEST üben; in PROD nur nach ausdrücklicher Entscheidung.

1. **Kopie wählen.** Im Backup-Projekt `listBackups()` (Datei `Backup.js`) ausführen und die
   Datei-ID der gewünschten Kopie notieren (Art `auto`, `manuell` oder `vor-restore`). Es
   gibt keinen Standard „neueste“.
2. **Vorbereiten.** Im Backup-Projekt die Script-Property `RESTORE_BACKUP_ID` auf diese ID
   setzen und `prepareRestore()` (Datei `Backup.js`) ausführen. Die Funktion
   - legt einen Probe-Restore in eine Testdatei an und vergleicht ihn per Hash mit der Kopie,
   - prüft das Schema: Jedes heutige Datenblatt muss in der Kopie mit gleicher Kopfzeile
     vorhanden sein, und die Kopie darf kein Datenblatt haben, das es heute nicht mehr gibt.
     Abgeleitete Blätter (`_…`) zählen nicht; sie werden nach dem Restore neu berechnet,
   - zeigt die Auswirkung (Zeilen je Blatt jetzt und danach) und den Datenstand der Kopie,
   - legt eine Vor-Restore-Kopie des heutigen Stands an und prüft, dass sie den Datenblättern
     der Tabelle entspricht.

   Nur `status: prepared` erlaubt den nächsten Schritt. Die Rückmeldung nennt beide IDs.
   `RESTORE_BACKUP_ID` wird im Backup-Projekt danach gelöscht.
3. **Freigeben und schreiben.** Im Script-Projekt der Tabelle (Web-App) die Script-Properties
   `RESTORE_BACKUP_ID` und `RESTORE_PRE_COPY_ID` aus der Rückmeldung setzen und in der Datei
   `Restore.gs` die Funktion `restoreFromBackup()` ausführen. Zwischen Schritt 2 und 3 darf
   sich in der Tabelle nichts ändern: Weicht sie von der Vor-Restore-Kopie ab, lehnt die
   Funktion ohne Schreiben ab, und Schritt 2 ist zu wiederholen.
4. **Ergebnis prüfen.** `restoreStatus()` (Datei `Restore.gs`) zeigt den Zustand. Nach
   `completed` lädt die App beim nächsten Start den zurückgesetzten Stand (die Datenstempel
   sind erneuert). Stichprobe in der App und Protokoll nach der Vorlage unten.

`restoreFromBackup()` ist nur im Editor ausführbar: `doGet`/`doPost` erreichen keine Funktion
aus `Restore.gs`, und ein Aufruf mit Argument (z. B. als Trigger) wird abgelehnt (Tests in
`tests/restore.test.js`). Die Web-App braucht dafür keinen Drive-Zugriff.

**Zustände** (Script-Property `HV_RESTORE_STATE` der Web-App):

| Zustand | Bedeutung | Wartungssperre | Restore-IDs |
| --- | --- | --- | --- |
| `prepared` | Prüfungen laufen oder sind vor dem ersten Schreiben gescheitert (`fehler`) | nein | bleiben |
| `running` | Es wird geschrieben | ja | bleiben |
| `failed` | Fehler nach dem ersten Schreiben; die Tabelle kann gemischt sein | ja | bleiben |
| `completed` | Inhalt per Hash geprüft, Ansichten und Datenstempel erneuert | nein | gelöscht |
| `abgebrochen` | `cancelRestore()` bewusst ausgeführt | nein | gelöscht |

**Wartungssperre.** Während `running` und `failed` antworten alle Schreibwege (Zählerstände,
Zahlungen, Storno, Import, Verteilung, Verträge, Index, Mieterwechsel, Mieterhöhungsprüfungen,
Neuberechnung der Verbrauchs-Views) mit `MAINTENANCE`. Die Meldung ist vorübergehend: Die
Offline-Queue behält die Einträge und sendet sie später erneut. Lesen bleibt möglich; der
tägliche View-Refresh setzt aus. Ein nicht lesbarer Zustand gilt als gesperrt.

**Fehler mitten im Schreiben.** Die Sperre und beide IDs bleiben. Ursache beheben und
`restoreFromBackup()` mit denselben IDs erneut ausführen; der Vergleich mit der
Vor-Restore-Kopie entfällt bei der Wiederholung. Nur bewusst: `cancelRestore()` (Datei
`Restore.gs`) hebt die Sperre auf, obwohl die Tabelle gemischt sein kann. Danach die
Vor-Restore-Kopie über Schritt 1–3 zurücksichern.

**Grenzen.** Formeln werden als Formeln zurückgeschrieben, alle anderen Zellen als Werte.
Zahlenformate kommen aus der Kopie, und Text wird so geschrieben, dass Sheets ihn nicht neu
deutet (`2026-05` bleibt Text, `0012` behält die Nullen, `=…` wird keine Formel); die
Hash-Prüfung danach erkennt jede verbleibende Abweichung. Übrige Formatierung,
Datenvalidierung, Blattschutz und Diagramme der heutigen Tabelle bleiben stehen.
Script-Properties (Geräteschlüssel, Vertragstoken) und Trigger der Web-App werden nicht
zurückgesetzt.

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
| 2026-11-27 | TEST | Projekt „Hausverwaltung Backup TEST“ angelegt, 1.0.0 gepusht | `setupBackup()` scheiterte: `openById` verlangt Scope `spreadsheets` → 1.0.1 |
| 2026-11-27 | TEST | `setupBackup()` (1.0.1), Quelle `Hausverwaltung_Daten_TEST_Entenhausen` | Ordner „Hausverwaltung Backups TEST“ angelegt, ein Wochen-Trigger; zweiter Aufruf: `created_folder: false`, `trigger_already_present: true` |
| 2026-11-27 | TEST | `runWeeklyBackup()` zweimal | erste Kopie `HV-Backup TEST 2026-11-27 13-54 auto`; zweiter Lauf `UNCHANGED` |
| 2026-11-27 | TEST | Zählerstand über die App erfasst, `runWeeklyBackup()` | neue Kopie `HV-Backup TEST 2026-11-27 13-58 auto` mit dem neuen Wert; zwei Kopien behalten, nichts gelöscht |
| 2026-11-27 | TEST | `restoreLatestBackupToTestFile()` aus der 13-58-Kopie | `status: success`, `abweichungen: []`, 30 Blätter (u. a. `Zaehlerstaende` 1926 Zeilen, `Zahlungen` 641); Ziel `HV-Restore-Test TEST 2026-11-27 14-07` |
| 2026-11-27 | TEST | Stichprobe in der Restore-Datei | ausstehend |
| | TEST | Rücksicherung (Backup 1.1.0, Backend 4.8.19) | ausstehend |

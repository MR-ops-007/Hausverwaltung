# Zugriffsschutz (Backend 4.8.0)

Stand: 2026-10-28

## Ziel

Die Web-App-URL steht in `config.js` und wird von der öffentlichen Pages-Seite ausgeliefert.
Sie ist deshalb nicht geheim. Geschützt wird der Zugriff durch einen Zugangsschlüssel.

## Überblick

- Ein App-Schlüssel (Script Property `APP_ACCESS_KEY`) schützt **Lesen und Schreiben**
  (Zählerstände, Zahlungen, Verträge). Der `CONTRACT_WRITE_TOKEN` bleibt für Vertragsänderungen
  zusätzlich nötig.
- Lesen läuft per POST: `{ "typ": "LESEN", "view": "alle" | "dashboard" | "verbrauch" | "vertrag_capabilities", "key": "..." }`.
  `GET` liefert bei gesetztem Schlüssel keine Daten mehr.
- Fehlender oder falscher Schlüssel: Antwort `{ "status": "error", "code": "UNAUTHORIZED" }`
  (Apps Script kann keinen HTTP-401 senden, der Status ist 200).
- Schreibtypen sind eine Erlaubnisliste: `ZAEHLERSTAND_NEU`, `ZAHLUNG`, `VERTRAG_AKTUALISIEREN`,
  `INDEX_ANWENDEN`. Alles andere ergibt den Fehler „Unbekannter Typ.“ und schreibt nichts.
- Die Prüfung läuft vor dem Skript-Lock. Der Vergleich erfolgt ohne frühen Abbruch.
- **Übergangsmodus:** Ist `APP_ACCESS_KEY` nicht gesetzt (oder leer), verhält sich das Backend wie
  4.7.0. Das Frontend zeigt dann „⚠️ Backend ohne Zugangsschlüssel“. Der Schutz beginnt erst mit dem
  Setzen der Property und wirkt sofort, ein neues Deployment ist dafür nicht nötig.

## Einspielen (Reihenfolge einhalten)

1. **Backend 4.8.0 deployen:** `Code.gs` ersetzen, neue Version der bestehenden Bereitstellung
   veröffentlichen (URL bleibt gleich). Die App läuft unverändert weiter (Übergangsmodus).
2. **Frontend mergen** (PR nach `main`, Pages-Deployment abwarten, Seite hart neu laden). Die App liest
   jetzt per POST und zeigt die Warnung zum fehlenden Schlüssel.
3. **Schlüssel erzeugen** (`openssl rand -hex 24`), im Passwortmanager ablegen und als Script Property
   `APP_ACCESS_KEY` setzen.
4. **Prüfen:**
   - Die Web-App-URL im Browser öffnen: es erscheint `UNAUTHORIZED` statt Daten.
   - App neu laden: der Dialog fragt den Schlüssel ab, danach erscheinen die Daten.
   - Einen Zählerstand im Testbereich speichern.
5. Auf weiteren Geräten den Schlüssel einmal eingeben.

Das Frontend darf **nicht vor** dem Backend 4.8.0 live gehen: Ein älteres Backend würde die
Leseanfrage als Schreibvorgang behandeln. Das Frontend sendet deshalb `data: []` (es entstehen keine
Zeilen) und meldet „Version 4.8.0 erforderlich“, liefert aber keine Daten.

## Rollback

- Schlüssel entfernen (Script Property löschen): Übergangsmodus, sofort wirksam.
- Backend zurück: In „Bereitstellungen verwalten“ die vorherige Version wählen. Das neue Frontend
  zeigt dann „Version 4.8.0 erforderlich“; bei Bedarf das Frontend-Commit zurücknehmen.

## Schlüssel wechseln oder verloren

- Neuen Schlüssel in der Script Property eintragen. Jedes Gerät fragt beim nächsten Laden neu.
- Der Schlüssel liegt pro Browser im `localStorage` (`hv_access_key`). Entfernen über die
  Browserdaten der Seite.

## Offline-Queue

- Nur Netzwerkfehler und vorübergehende Serverfehler (HTTP 5xx, 429) werden in die Queue gelegt.
  Ablehnungen (falscher Schlüssel, Validierung) werden im Dialog als Fehler gemeldet.
- Einträge verlassen die Queue erst nach bestätigtem `success`. Vom Backend abgelehnte Einträge
  wandern in `offline_queue_failed` im `localStorage`, statt gelöscht zu werden.
- Der Schlüssel wird beim Senden angehängt und nicht in der Queue gespeichert.

## Grenzen

- Gemeinsames Geheimnis, keine Benutzerverwaltung. Wer den Schlüssel hat, hat vollen Zugriff.
- Der Schlüssel liegt im Browser des Geräts. Bei fremdem Zugriff auf das Gerät Schlüssel wechseln.
- Kein Rate Limiting; ein zufälliger Schlüssel (48 Hex-Zeichen) macht Raten praktisch aussichtslos.
- Quelltext und `config.js` bleiben öffentlich und enthalten kein Geheimnis.

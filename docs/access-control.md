# Zugriffsschutz (Backend 4.8.5)

Stand: 2026-11-10

## Ziel

Die Web-App-URL steht in `config.js` und wird von der öffentlichen Pages-Seite ausgeliefert.
Sie ist deshalb nicht geheim. Geschützt wird der Zugriff durch einen Zugangsschlüssel.

## Überblick

- Der Zugriffsschutz ist **fail-closed**: Ohne gültige Schlüsselkonfiguration liefert das
  Backend keine Daten und führt keine Schreibaktion aus.
- Mehrere Geräte werden über `APP_ACCESS_KEYS_JSON` in den Script Properties verwaltet. Ein Eintrag
  enthält `id`, `label`, `key`, `role` und optional `aktiv`:

  ```json
  [{"id":"iphone-admin","label":"iPhone Admin","key":"...","role":"admin","aktiv":true},
   {"id":"ipad-erfassen","label":"iPad Erfassen","key":"...","role":"erfassen","aktiv":true}]
  ```

- `erfassen` darf lesen sowie Zählerstände und Zahlungen schreiben.
- `admin` darf zusätzlich Verträge und Indexänderungen schreiben.
- `APP_ACCESS_KEY` bleibt als einzelner Admin-Fallback für die Übergangsphase kompatibel.
  Sobald `APP_ACCESS_KEYS_JSON` gesetzt ist, wird diese Mehrgeräte-Konfiguration verwendet.
- Der `CONTRACT_WRITE_TOKEN` bleibt für Vertragsänderungen zusätzlich nötig.
- Lesen läuft per POST: `{ "typ": "LESEN", "view": "alle" | "dashboard" | "verbrauch" | "vertrag_capabilities", "key": "..." }`.
  `GET` liefert bei gesetztem Schlüssel keine Daten mehr.
- Fehlender, falscher oder nicht konfigurierter Schlüssel: Antwort
  `{ "status": "error", "code": "UNAUTHORIZED" }`
  (Apps Script kann keinen HTTP-401 senden, der Status ist 200).
- Schreibtypen sind eine Erlaubnisliste: `ZAEHLERSTAND_NEU`, `ZAHLUNG`, `VERTRAG_AKTUALISIEREN`,
  `INDEX_ANWENDEN`. Dazu kommt die Backend-Aktion `VERBRAUCH_VIEWS_AKTUALISIEREN` (ab 4.8.1).
  Alles andere ergibt den Fehler „Unbekannter Typ.“ und schreibt nichts.
- Die Prüfung läuft vor dem Skript-Lock. Der Vergleich erfolgt ohne frühen Abbruch.
- `GET` liefert grundsätzlich keine Daten. Lesen läuft ausschließlich per POST mit gültigem
  Geräteschlüssel.
- Vertrags- und Indexänderungen werden anhand der Rolle mit `FORBIDDEN` abgewiesen, bevor ein Lock
  angefordert oder geschrieben wird.

## Einspielen (Reihenfolge einhalten)

1. **Backend 4.8.5 deployen:** `Code.gs` ersetzen und eine neue Version der bestehenden
   Bereitstellung veröffentlichen. Vorher mindestens einen Admin- und einen Erfassungs-Schlüssel
   erzeugen und als Script Property setzen.
2. **Frontend mergen** (PR nach `main`, Pages-Deployment abwarten, Seite hart neu laden).
3. **Prüfen:**
   - Die Web-App-URL im Browser öffnen: es erscheint `UNAUTHORIZED` statt Daten.
   - App mit Admin-Schlüssel laden: Daten und Vertragsansicht erscheinen.
   - App mit Erfassungs-Schlüssel laden: Daten erscheinen, Vertragsänderungen werden abgewiesen.
   - Einen Zählerstand und eine Zahlung im Testbereich speichern.
4. Schlüssel je Gerät über die geplante Einrichtung oder einmalig im Browser hinterlegen.

Das Frontend darf **nicht vor** dem Backend 4.8.0 live gehen: Ein älteres Backend würde die
Leseanfrage als Schreibvorgang behandeln. Das Frontend sendet deshalb `data: []` (es entstehen keine
Zeilen) und meldet „Version 4.8.0 erforderlich“, liefert aber keine Daten.

## Rollback

- Bei einem Fehler die vorherige Apps-Script-Version bereitstellen. Die neue Mehrgeräte-
  konfiguration bleibt dabei in den Script Properties erhalten und wird von der alten Version
  ignoriert.
- Backend zurück: In „Bereitstellungen verwalten“ die vorherige Version wählen. Das neue Frontend
  zeigt dann „Version 4.8.0 erforderlich“; bei Bedarf das Frontend-Commit zurücknehmen.

## Schlüssel wechseln oder verloren

- Neue oder gesperrte Geräte in `APP_ACCESS_KEYS_JSON` ändern. Ein deaktiviertes Gerät wird beim
  nächsten Zugriff sofort abgewiesen.
- Ein neuer Schlüssel muss pro Gerät einmal hinterlegt werden. Er liegt pro Browser im
  `localStorage` (`hv_access_key`). Entfernen über die
  Browserdaten der Seite.

## Offline-Queue

Ausführlich in `docs/offline-sync-und-korrekturen.md`. Kurzfassung:

- Einträge verlassen die Queue nur nach bestätigtem `success` oder durch Verwerfen durch den Nutzer. Leere oder unklare Antworten gelten nie als Erfolg.
- Netzwerkfehler, Zeitlimit, HTTP 5xx/429, `LOCK_TIMEOUT`, unklare Antworten und abgelehnter Schlüssel lassen Einträge als `pending` liegen (Apps Script meldet Fehler meist mit HTTP 200, deshalb kennzeichnet das Backend vorübergehende Fehler mit `transient: true`).
- Vom Backend abgelehnte Einträge (z. B. `CONFLICT`) bleiben mit Grund sichtbar (`rejected`) und werden nicht von selbst erneut gesendet. Die frühere Liste `offline_queue_failed` wird übernommen.
- Der Schlüssel wird beim Senden angehängt und nicht in der Queue gespeichert.
- Eine beschädigte Queue wird nie überschrieben, sondern angezeigt und erst nach geprüfter Sicherung zurückgesetzt.

## Grenzen

- Die Geräteschlüssel sind eine kleine Geräteverwaltung, keine vollständige Benutzerverwaltung.
  Wer einen aktiven Schlüssel besitzt, erhält die zugehörige Rolle.
- Der Schlüssel liegt im Browser des Geräts. Bei fremdem Zugriff auf das Gerät Schlüssel wechseln.
- Kein Rate Limiting; ein zufälliger Schlüssel (48 Hex-Zeichen) macht Raten praktisch aussichtslos.
- Quelltext und `config.js` bleiben öffentlich und enthalten kein Geheimnis.
- Die Anzeige des Gerätenamens im Korrekturprotokoll ist ein separates Folgepaket. Die
  Zugriffsbeschränkung ist bereits wirksam; bestehende `quelle`-Werte werden nicht rückwirkend
  umgeschrieben.

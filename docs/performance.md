# Performance-Paket: Ladezeiten der App

Stand: 2026-11-25. Dieses Dokument beschreibt, wie die App ihre Daten lädt, was in den
Schritten 1 bis 3 geändert wurde, wie gemessen wurde und welche Grenzen bekannt sind.

## Ausgangslage (Messung 2026-11-24)

| Abruf | Dauer (iPhone, WLAN / Mobilfunk) | Größe |
| --- | --- | --- |
| `alle` (Start, Hintergrund) | 9,6–10,8 s / 12,5–13,0 s | 5,0 MB |
| `dashboard` | 2,6–3,5 s | 4–6 KB |
| `vertrag_capabilities` | 1,7–1,9 s | ~0,2 KB |

Befunde:

- Jede Anfrage an Apps Script kostet rund 1,7 bis 1,9 s Grundaufwand, unabhängig von der
  Datenmenge.
- Von den 5,0 MB übernahm das Frontend nur rund 0,65 MB. Verbrauchs-Views (4 MB), Kopien
  und Migrationsblätter wurden übertragen und verworfen.
- Das Lesen der Blätter im Backend (`getDataRange()` je Blatt) ist der größte Einzelposten.

## Überblick der Schritte

| Schritt | PR | Wirkung |
| --- | --- | --- |
| Ladezeit-Anzeige | #60 | Jede Anfrage mit Dauer und Größe sichtbar (Diagnosezeile) |
| 1: schlanker Start | #61, Backend 4.8.17 | View `stammdaten` mit 653 KB statt 5,1 MB; Capabilities parallel |
| 2: lokaler Zwischenspeicher | #62 | Sofortstart aus IndexedDB, Schreibsperre bis zur Aktualisierung |
| 2b: Verbrauch lokal | #63 | Verbrauchs-Views lokal gespeichert, vorgeladen, sofort sichtbar |
| 3: Datenstand und Backend-Cache | dieser PR, Backend 4.8.18 | „unverändert“ ohne Lesen, Stammdaten aus dem CacheService, Start-Anfragen parallel |

## Schritt 3: Datenstand-Stempel und Zwischenspeicher im Backend

### Datenstand-Stempel

Je Bereich ein Stempel in den Script Properties:

| Bereich | Property | Erneuert bei |
| --- | --- | --- |
| Stammdaten | `HV_DATENSTAND_DATEN` | jedem Schreibvorgang über die App (auch bei Fehlern, nicht bei unbekanntem Typ), manueller Änderung in einem Blatt außer `_view_verbrauch_*`, nach 6 Stunden |
| Verbrauch | `HV_DATENSTAND_VERBRAUCH` | Neuberechnung der Verbrauchs-Views, manueller Änderung in einem Blatt `_view_verbrauch_*`, nach 6 Stunden |

Warum fehlgeschlagene Schreibvorgänge den Stempel trotzdem erneuern: Ein Schreibvorgang kann
vor dem Fehler bereits Zeilen geschrieben haben. Ein unnötiges Neuladen der Stammdaten
(rund 650 KB) ist billiger als ein falsches „unverändert“. Den großen Verbrauchsstand
betrifft das nicht.

- Die Views `stammdaten` und `verbrauch` liefern den aktuellen Stempel als `_datenstand`.
- Schickt die App `known_stamp` mit dem aktuellen Stempel, antwortet das Backend
  `{ "unchanged": true, "_datenstand": "…" }` und liest kein Blatt.
- Manuelle Änderungen im Sheet erkennt der einfache Trigger `onEdit` in `Code.gs`. Er muss
  nicht installiert werden. Ist das Blatt nicht erkennbar, erneuert er beide Stempel.
- Zählerstände, Zahlungen und Vertragsänderungen ändern die Verbrauchs-Views nicht; diese
  werden nur über „Verbrauchsdaten aktualisieren“ neu berechnet. Deshalb erneuern
  Schreibvorgänge nur den Stammdaten-Stempel.

**Grenze:** Änderungen, die weder über die App noch als Bearbeitung im Sheet passieren
(Skriptfunktionen im Editor wie Migrationen, Sortieren, Zeilen einfügen ohne Werte), werden
spätestens nach 6 Stunden sichtbar. Sofort sichtbar machen: im Sheet eine beliebige Zelle
bearbeiten oder im Apps-Script-Editor in `Code.gs` die Funktion `bumpDatenstandSafe`
ausführen.

### Zwischenspeicher im Backend

- Nur für `stammdaten`: Die fertige JSON-Antwort wird gzip-komprimiert, Base64-kodiert und in
  Stücken unter 100 KB im `CacheService` abgelegt. Der Schlüssel enthält den Stempel; ein
  neuer Stempel macht alte Einträge wirkungslos. Ablauf nach 6 Stunden.
- Fehler beim Ablegen oder unvollständige Einträge sind unkritisch, dann wird gelesen.
- **Nicht für `verbrauch`:** In TEST dauerte das Ablegen der 4 MB bis zu 12,5 s, und der
  CacheService hielt die Einträge nicht zuverlässig (zweiter Abruf wieder 4,3–5,8 s). Den
  Verbrauch decken „unverändert“ und der lokale Speicher der App ab.

### Berechtigungen

Keine neue Berechtigung. Bewusst nicht verwendet: `DriveApp` (Änderungszeitpunkt der
Datei), weil das eine neue Autorisierung erzwingt und die Web-App bis dahin blockiert.
Verwendet: `PropertiesService` (bereits genutzt), `CacheService`, `Utilities`.

### Frontend

- Start mit gespeichertem Stand: `stammdaten` mit `known_stamp`. Bei „unverändert“ wird der
  gespeicherte Stand bestätigt („System vollständig geladen (…, keine Änderungen)“).
- Dashboard und Stammdaten werden gleichzeitig angefragt; angezeigt wird in fester
  Reihenfolge.
- Verbrauch: Mit Stempel fragt die App beim Öffnen des Reiters und nach dem Start günstig
  nach, höchstens alle 5 Minuten. Ohne Stempel (älteres Backend) gilt weiter die
  6-Stunden-Regel.
- Ältere Backends ignorieren `known_stamp` und liefern wie bisher Daten; das Frontend ist
  in beide Richtungen kompatibel.
- Scheitert nur der Dashboard-Abruf, übernimmt die App trotzdem die Stammdaten und meldet
  „Mieterliste nicht aktualisiert“. Nur ein abgelehnter Schlüssel bricht sofort ab.
- Der lokale Stand wird nur mit allen Pflichtblättern gespeichert und geladen (Objekte,
  Einheiten, Personen, Verträge, Vertragsparteien, Mietanpassungen, Zähler, Zählerstände,
  Zahlungen; `localCache.REQUIRED_SHEETS`). Ein unvollständiger Stand wird verworfen und
  vollständig neu geladen, nie als „unverändert“ bestätigt.
- Solange der gespeicherte Stand angezeigt wird (`dataStale`), bleiben Zahlungen, Verträge
  und Prüfungen lesbar. Zahlungsdialog, Storno, CSV-Import, Vertragsänderung und
  Prüfabschluss/Wiederöffnung zeigen dann einen Hinweis; zusätzlich sperrt `cloudService`
  diese Schreibvorgänge (`DATA_STALE`). Zählerstände bleiben erlaubt.

### Tests

- Backend (`tests/access.test.js`): zählt Blatt-Lesezugriffe; bei bekanntem Stempel und bei
  einem Treffer im Zwischenspeicher wird kein Blatt gelesen. Fehlt ein Stück im
  Zwischenspeicher, wird die Antwort aus den Blättern neu gebaut. `onEdit` je Blatt,
  unbekannter Typ ohne, fehlgeschlagene Zahlung mit neuem Stempel.
- Start (`tests/init-app.test.js`, echter `initApp` aus `index.html`): Dashboard-Fehler bei
  erfolgreichen Stammdaten, abgelehnter Schlüssel, „unverändert“ mit vollständigem Stand,
  unvollständiger Stand ohne `Zahlungen`.
- Oberfläche (`tests/local-cache.test.js`): Hinweise statt Dialog/Schreibvorgang auf
  gespeichertem Stand.

## Messungen in TEST (2026-11-25, nachts, Mac, nur lesend)

Backend-Abrufe, je 3 Runden:

| Abruf | 4.8.17 | 4.8.18 |
| --- | --- | --- |
| `stammdaten` nach einer Änderung | 6,8–7,9 s | 3,7–7,2 s |
| `stammdaten` aus dem Backend-Cache | – | 1,3–2,0 s |
| `stammdaten` unverändert | – | 1,3–1,7 s, 0 KB |
| `verbrauch` voll | 4,6–5,1 s | 5,7–7,2 s |
| `verbrauch` unverändert | – | 1,1–1,8 s, 0 KB |

Inhalt: Die Antworten von 4.8.17, 4.8.18 (gelesen) und 4.8.18 (aus dem Backend-Cache) sind
nach Entfernen von `_datenstand` byte-gleich, Umlaute bleiben erhalten.

App gegen TEST (lokaler Server, Desktop-Browser):

| Fall | Bis „vollständig geladen“ |
| --- | --- |
| Start ohne lokalen Speicher (Schritt 1, vorher) | 9–11 s |
| Start ohne lokalen Speicher (jetzt, Stammdaten aus Backend-Cache) | 3,8 s |
| Start mit lokalem Speicher, keine Änderungen (4 Läufe) | 3,7–3,9 s, Daten nach ~0,1 s sichtbar |
| Start nach einer Änderung | 4,5 s, Stammdaten vollständig neu |
| Verbrauch öffnen, Stand älter als 5 Minuten | sofort sichtbar (91 ms), Prüfung 1,2 s „unverändert“ |

Als Schreibvorgang für die Tests diente ein absichtlich unbekannter Anfragetyp
(`STEMPEL_TEST_UNBEKANNT`): Er durchläuft denselben Schreibweg samt Stempel-Erneuerung, ändert
aber keine Daten. In TEST wurden keine Daten geschrieben.

## Abnahme (offen)

1. **Manuelle Änderung im Sheet (nur TEST):** eine Zelle im TEST-Sheet ändern, App neu
   öffnen → Status ohne „keine Änderungen“, Änderung sichtbar. Damit ist bestätigt, dass
   der einfache Trigger `onEdit` den Stempel schreiben darf. Falls nicht: Änderung wird
   spätestens nach 6 Stunden sichtbar; dann wäre ein installierbarer Trigger nötig.
2. **iPhone, TEST:** App zweimal öffnen → beim zweiten Mal „keine Änderungen“, Ladezeit-Zeile
   zeigt `LESEN stammdaten (unverändert)`.
3. **Verbrauch aktualisieren (TEST):** „Verbrauchsdaten aktualisieren“ → danach lädt der
   Reiter die Views vollständig neu.
4. **Manuelle Änderung in `Zahlungen` (TEST):** danach lädt der Start die Stammdaten neu,
   der Verbrauch bleibt „unverändert“.
5. **Gespeicherter Stand (TEST):** App öffnen und sofort, solange „wird aktualisiert“ steht,
   eine Zahlung erfassen wollen → Hinweis statt Dialog.

## PROD-Deploy 4.8.18

Nur nach ausdrücklicher Freigabe (Release-Regel in `docs/betrieb.md`).

1. `npm run clasp:prod:status`, PROD-Code in einen Hilfsordner ziehen und mit 4.8.17
   (`main` vor diesem PR) vergleichen.
2. `npm run clasp:prod:push` aus `main`, Push per Pull verifizieren.
3. `npm run clasp:prod:deploy`. **Kein Schemaschritt**, keine neue Autorisierung. Die
   Properties `HV_DATENSTAND_*` entstehen beim ersten Lesen automatisch.
4. Anonymer Abruf liefert `UNAUTHORIZED`; in der App „Backend 4.8.18“ und beim zweiten Start
   „keine Änderungen“.
5. Rollback: Version 4.8.17 (`@46`). Die zusätzlichen Properties stören 4.8.17 nicht.

## Mögliche nächste Schritte

- Dashboard (`_view_aktive_mieter`) ebenfalls stempeln; dann wäre der Start mit
  unveränderten Daten bei rund 1,5 s.
- Verbrauchs-Views nach Objekt und Jahr laden statt alle 4 MB.
- Ladezeit-Anzeige auf PROD hinter einem Info-Symbol verstecken (Wunsch des Product Owners).

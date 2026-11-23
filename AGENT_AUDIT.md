# AGENT_AUDIT – Regeln für KI-Agenten

Verbindliche Leitplanken für alle KI-Assistenten und Coding Agents, die an diesem Repository
arbeiten. Wo welche Information steht, regelt die Tabelle „Wo steht was“ in
[`PROJECT_STATE.md`](PROJECT_STATE.md). Die frühere Fassung dieses Dokuments steht unverändert in
[`docs/archiv/agent-audit-bis-2026-11-20.md`](docs/archiv/agent-audit-bis-2026-11-20.md).

## Grundregeln

- **Erst verstehen.** Vor einer Empfehlung oder Änderung die betroffenen Dateien lesen. Doku kann
  veraltet sein. Immer unterscheiden: implementiert, getestet, gemergt, in TEST bereitgestellt,
  in PROD bereitgestellt.
- **Branch und PR.** Keine Änderungen direkt auf `main`. Ein Paket, ein Branch, ein PR. Es arbeitet
  immer nur ein Agent an einem Branch; parallele Arbeit an demselben Paket nur nach Absprache mit
  dem Product Owner.
- **Klein und umkehrbar.** Keine Refactorings, Umbenennungen von Dateien, Funktionen oder
  Datenfeldern und keine Framework-Wechsel zusammen mit Features. Bewährte Funktionen bleiben erhalten.
- **Gemeinsame Regeln nutzen.** Fachlogik gehört in die gemeinsamen Quellen
  (`apps-script/ContractService.js`, `apps-script/PaymentRules.js`, `calc-service.js`,
  `validation-service.js`) und wird nicht parallel nachgebaut.
- **Datenintegrität zuerst.** Stabile fachliche IDs, korrekte Historisierung, Idempotenz und
  Schutz vor Dubletten haben Vorrang vor Komfort.
- **Freigaben.** Merges, Backend-Deployments, Schemafunktionen, Trigger-Einrichtung, Migrationen und
  produktive Datenänderungen nur nach ausdrücklicher Freigabe des Product Owners. PROD-Befehle
  laufen ausschließlich über `npm run clasp:prod:*` mit Bestätigung.
- **Geheimnisse und Daten.** TEST und PROD bleiben getrennt; Tests verwenden synthetische Daten.
  Schlüssel, Tokens und personenbezogene Daten gehören weder in Commits noch in PR-Texte, Logs
  oder Chats.
- **Direkt umsetzen.** Änderungen über die Repository-Werkzeuge durchführen statt umfangreiche
  Kopiervorlagen zu liefern.

## Vor jedem Pull Request

1. `npm test`, `npm run check:frontend-assets`, Syntaxprüfung (`node --check` für die
   JavaScript-Dateien) und `git diff --check`.
2. Bei UI-Änderungen: Darstellung auf Desktop und Mobil prüfen, gegen den Mock
   (`npm run dev:mock-backend`, App mit `?mock=1`) oder gegen TEST.
3. Doku im selben PR anpassen, und nur an der jeweiligen Quelle: Schema in `DATA_MODEL.md`,
   Backend-Änderung im `CHANGELOG.md` (Version in `apps-script/Code.gs` erhöhen),
   Prioritäten in `ROADMAP.md`, geänderte Grundregeln in `PROJECT_STATE.md`.
   Keine Testzahlen, PR-Stände oder Deployment-Details in Übersichtsdokumente schreiben.

## Inhalt der PR-Beschreibung

- Was war vorhanden, wo lag das Problem?
- Kleinster sinnvoller Lösungsansatz.
- Geänderte Dateien und Funktionen.
- Fachliche und technische Risiken.
- Tatsächlich durchgeführte Tests (nur Nachgewiesenes).
- Was ist offen, welche Freigabe wird benötigt (Merge, TEST-Deploy, PROD-Deploy, Schemafunktion)?

## Fachliche Stolperstellen

- Ein niedrigerer Zählerstand ist nicht automatisch falsch: Erstablesung, Zählerwechsel,
  4- oder 5-stelliger Überlauf und ersetzte Zähler sind legitim. Die Klassifikation liegt
  zentral in `calc-service.classifyReadingInterval()`.
- Frontend-Prüfungen verbessern die Bedienung, ersetzen aber keine Prüfung im Apps Script.
  Schreibwege müssen serverseitig validiert, gesperrt (`LockService`) und idempotent sein.
- Google Sheets ist die Datenbank: Spalten werden über Kopfzeilen gefunden, nicht über
  Spaltenbuchstaben. Neue Spalten werden nur über die manuellen Schemafunktionen angehängt.
- Das Objekt `TEST` in PROD ist ausschließlich für Schreibtests reserviert und wird aus
  produktiven Kennzahlen herausgehalten.

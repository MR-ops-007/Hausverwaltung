# PROJECT_STATE – Hausverwaltung

Kurzer Überblick: Was gilt jetzt, und wo stehen die Details. Dieses Dokument enthält
bewusst keine Testzahlen, PR-Stände, Deployment-Nummern oder Projektgeschichte, weil diese
Angaben schnell veralten. Die Historie bis zum 2026-11-20 steht unverändert in
[`docs/archiv/project-state-bis-2026-11-20.md`](docs/archiv/project-state-bis-2026-11-20.md).

## Wo steht was (Quellen der Wahrheit)

Jeder Fakt hat genau eine Quelle. Andere Dokumente verweisen darauf, statt ihn zu wiederholen.

| Frage | Quelle |
| --- | --- |
| Welche Blätter, Spalten, IDs und Fachregeln gibt es? | [`DATA_MODEL.md`](DATA_MODEL.md) |
| Welche Backend-Version steht im Code? | `BACKEND_VERSION` in [`apps-script/Code.gs`](apps-script/Code.gs) |
| Was hat sich im Backend geändert, was ist in TEST/PROD bereitgestellt, was ist der Rollback-Stand? | [`CHANGELOG.md`](CHANGELOG.md) inklusive Deployment-Historie |
| Was ist als Nächstes geplant, was ist offen, welche Entscheidungen gelten? | [`ROADMAP.md`](ROADMAP.md) |
| Wie werden Umgebungen betrieben, deployt und Schemas vorbereitet? | [`docs/betrieb.md`](docs/betrieb.md) |
| Zugriffsschutz, Schlüssel, Rollen | [`docs/access-control.md`](docs/access-control.md) |
| Backup und Restore | [`docs/backup-restore.md`](docs/backup-restore.md) |
| Apps-Script-Dateien, `clasp`, Migrationen | [`apps-script/Readme.md`](apps-script/Readme.md) |
| Einrichtung, Dateiübersicht, Entwicklungsablauf | [`README.md`](README.md) |
| Regeln für KI-Agenten | [`AGENT_AUDIT.md`](AGENT_AUDIT.md) |
| Fachdetails und Abnahmen einzelner Pakete | `docs/*.md`, siehe unten |
| Aktueller Teststand | CI-Lauf in GitHub Actions bzw. lokal `npm test`; keine Testzahlen in der Doku |

Paketbezogene Detaildokumente:

- [`docs/offline-sync-und-korrekturen.md`](docs/offline-sync-und-korrekturen.md) – Offline-Queue, `stand_id`, Korrekturfenster
- [`docs/verbrauchsstatistik-v2-qa-20261103.md`](docs/verbrauchsstatistik-v2-qa-20261103.md) – Verbrauchsstatistik und QA-Matrix
- [`docs/heizoel-verbrauch.md`](docs/heizoel-verbrauch.md) – Heizöl-Tankbilanz
- [`docs/contracts-index-plan.md`](docs/contracts-index-plan.md) – Verträge und Indexmiete
- [`docs/p6-2-gemeinsame-zahlungsregeln.md`](docs/p6-2-gemeinsame-zahlungsregeln.md) – gemeinsame Zahlungsregeln
- [`docs/p6-3-soll-historie.md`](docs/p6-3-soll-historie.md) – historisches Mietsoll
- [`docs/p6-6-mieterhoehungs-erinnerungen.md`](docs/p6-6-mieterhoehungs-erinnerungen.md) – Mieterhöhungsprüfung
- [`docs/p6-7-contract-period-validation.md`](docs/p6-7-contract-period-validation.md) und
  [`docs/p6-7-mieterwechsel-testplan.md`](docs/p6-7-mieterwechsel-testplan.md) – Vertragszeiträume und Mieterwechsel
- Testprotokolle: [`docs/p6-testprotokoll-20261113.md`](docs/p6-testprotokoll-20261113.md),
  [`docs/p6-1-dublettenwarnung-testprotokoll-20261114.md`](docs/p6-1-dublettenwarnung-testprotokoll-20261114.md)

## Systemüberblick

- **Frontend:** Vanilla JavaScript, HTML, CSS. Auslieferung über GitHub Pages
  (`.github/workflows/pages.yml`), installierbar als Home-Screen-App. TEST und PRODUKTION
  sind als Profile hinterlegt und in der Oberfläche sichtbar umschaltbar.
- **Backend:** Google Apps Script (`apps-script/`), synchronisiert über `clasp` mit getrennten
  Zielen für TEST und PROD. PROD-Push und -Deploy verlangen eine ausdrückliche Bestätigung.
- **Persistenz:** Google Sheets. Verbrauchsdaten werden in materialisierten Views
  (`_view_verbrauch_*`) berechnet und über eine Nutzeraktion aktualisiert.
- **Gemeinsame Fachregeln:** `apps-script/ContractService.js` und `apps-script/PaymentRules.js`
  werden unverändert von Browser, Apps Script und Mock-Backend verwendet.
- **Zugriff:** fail-closed mit Geräteschlüsseln und den Rollen `admin` und `erfassen`;
  GET liefert keine Daten.
- **Tests:** Vitest, Mock-Backend mit synthetischen Entenhausen-Daten, CI bei jedem PR.

## Funktionsumfang in `main`

Welche Backend-Version in TEST und PROD läuft, steht ausschließlich in der
Deployment-Historie im [`CHANGELOG.md`](CHANGELOG.md).

| Bereich | Umfang |
| --- | --- |
| Zählerstände | Erfassung mit Plausibilitätsprüfung, Offline-Queue, idempotenter `stand_id`, 15-Minuten-Korrekturfenster, Überlaufklassifikation |
| Verbrauch | Verbrauchsstatistik mit Monats-/Jahresdiagrammen, Herleitungskennzeichnung, Bilanzkennzahlen, Datenqualitätshinweise im Dashboard |
| Heizöl | Tankbilanz für Haupt- und Zusatztank, Literdarstellung als gekennzeichnete Näherung |
| Verträge | Vertragsansicht und -bearbeitung, Dokumentlinks, Indexmiete mit VPI-Abruf, Änderungshistorie in `Mietanpassungen` |
| Mieteingänge | Monatsmatrix je Einheit, Teil-/Über-/Nachzahlung, Kaution, Erstattung, Storno, Guthaben, CSV-Import mit manueller Zuordnung, Dublettenwarnung, historisches Mietsoll |
| Mieterwechsel | Serverseitiger Schreibweg `MIETERWECHSEL_ANLEGEN` mit Zeitraumprüfung; **keine Eingabemaske** |
| Mieterhöhung | Interne Prüfübersicht mit getrennten Terminen für Prüfung, Verlangen und Wirksamkeit, Kappungsgrenze je Objekt, geräteübergreifender Prüfabschluss und Wiedervorlage |

## Betriebsregeln

- TEST und PROD bleiben getrennt: eigene Sheets, Apps-Script-Projekte, Deployments und
  Script Properties. TEST enthält nur synthetische Daten.
- In PROD ist das Objekt `TEST` ein dauerhaft getrennter Bereich für Schreibtests; reale
  Objekte werden für Tests nicht verwendet.
- Schlüssel, Tokens und produktive Daten gehören weder ins Repository noch in Logs oder Chats.
- Schemafunktionen (`prepareContractSchema()`, `preparePaymentSchema()`) und Trigger-Einrichtung
  laufen nur manuell und nach Freigabe; vorher wird eine Sheet-Kopie gesichert.
- Jede Änderung läuft über Branch und Pull Request; Merges und Deployments erfolgen erst nach
  ausdrücklicher Freigabe durch den Product Owner.
- Ein Merge auf `main` veröffentlicht das Frontend automatisch über GitHub Pages, das Backend
  dagegen erst mit einem eigenen Deploy. Neue Schreibwege prüfen vorher die Capability-Abfrage
  `vertrag_capabilities` und brechen bei einem älteren Backend verständlich ab; neue Anzeigen
  können bis zum Backend-Deploy mit Standardwerten erscheinen. Die Neuordnung dieses Ablaufs
  ist ein eigenes Roadmap-Paket.

## Bekannte Einschränkungen

Offene Arbeit und ihre Priorität stehen in [`ROADMAP.md`](ROADMAP.md). Wichtig für den Alltag:

- Kein Service Worker: Die Offline-Queue hält Zählerstände, ein Neustart der App ohne Netz
  wird aber nicht unterstützt.
- Verbrauchsviews werden nicht bei jeder Ablesung neu berechnet, sondern über die Aktion
  „Verbrauchsdaten aktualisieren“.
- Mieterwechsel erzeugen noch keine eigenen Verbrauchszeilen je Vertrag.
- Neue Verträge lassen sich nicht über die Oberfläche anlegen (weder Mieterwechsel noch
  Neuvermietung einer leeren Einheit).
- Die Mieterhöhungsprüfung ist ein internes Werkzeug, keine Rechtsberatung. Ohne
  hinterlegte Kappungsgrenze je Objekt zeigt sie den gekennzeichneten Standardwert von 20 %.
- Ein getesteter Restore der Produktivdaten steht noch aus.

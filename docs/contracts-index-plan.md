# Mietvertragsdaten und Indexmieten

Stand: 2026-10-21. Branch: `codex/rental-contract-index`. Nur lokale Vorbereitung;
keine produktive Schemaaenderung, kein Deployment und keine Aenderung an Vertrag 21.

## A. Bestandsaufnahme

- `data-service.js` liest `Vertraege`, `Personen`, `Vertragsparteien` und `Zahlungen`.
- Es gab keine UI zur Vertragsbearbeitung. `erhoehungs_typ` und `letzte_anpassung`
  waren dokumentierte Vertragsfelder ohne Indexrechner.
- `doPost` schreibt bisher Zahlungen oder Zaehlerstaende als neue Zeilen. Dieser
  bestehende Transaktionspfad bleibt erhalten. Er wird nicht fuer Vertragsupdates verwendet.
- `kaution_soll` / `kaution_ist` sind Bestandsfelder; es gibt keine automatische
  Kautionsabstimmung. Zahlungen behalten ihren Vertrag-FK und ihr Transaction Log.
- `soll_gesamt` wird in der Mieteransicht aus dem Vertrag gelesen. Die neue
  Vertragsbearbeitung setzt es auf Kaltmiete plus verbindliche Nebenkosten.
- Schema-Hilfen existieren fuer andere Stammdaten, jedoch kein generischer
  Vertragsschema-Upgrade. Neue Vertragsfelder werden deshalb explizit vorbereitet.
- Materialisierte Views werden ausschliesslich ueber bestehende Backendfunktionen
  aufgebaut. Der neue Client schreibt keine View-Zellen.

## B. Minimaler Datenmodell-Diff

An `Vertraege` werden nur acht Spalten angehaengt:

| Feld | Zweck |
| --- | --- |
| `vertragsdokument_url` | Bestehender HTTPS-Link auf den Vertrag |
| `sondervereinbarungen_url` | Bestehender HTTPS-Link auf die Zusatzvereinbarung |
| `vertrag_hinweis` | Vertragliche Besonderheiten als Freitext |
| `nk_betriebskosten` | Optionale Dokumentation eines NK-Teilbetrags |
| `nk_heizung_warmwasser` | Optionale Dokumentation eines NK-Teilbetrags |
| `index_basis_monat` | Massgeblicher Indexmonat, Text `YYYY-MM` |
| `index_basis_wert` | Massgeblicher positiver Indexstand |
| `index_reihe` | Identische VPI-Reihe und Basisjahr fuer beide Werte |

`soll_nebenkosten` bleibt beim Speichern Pflichtfeld und alleinige NK-Rechengroesse.
Leere alte Vertraege bleiben lesbar; fehlende Betraege werden nicht als null EUR
interpretiert. Die beiden optionalen Teilbetraege werden niemals anstelle des
Gesamtfelds addiert. Eine Abweichung wird lediglich angezeigt.

Neue Tabelle `Mietanpassungen`, append-only:
`anpassung_id`, `vertrag_id`, `art`, `erfasst_am`, `wirksam_ab`, `zugang_datum`,
`erklaerung_url`, `index_neu_monat`, `index_neu_wert`, `index_reihe`,
`vorher_json`, `nachher_json`.

Die JSON-Snapshots enthalten den Vertragsstand vor und nach einer expliziten
Aenderung. Sie sind historische Belege, keine zweite aktuelle Vertragsquelle.
Auch Stammdatenaenderungen werden mit `art=STAMMDATEN` dokumentiert.
Historie wird nicht automatisch aus bestehenden Stammdaten erfunden.

Sofort: Dokumentlinks, NK-Dokumentation, Indexbasis und Anpassungsnachweis.
Spaeter: eigene Vertrag-Dokumente-Tabelle, falls mehrere beliebige Dokumenttypen
noetig sind; Etage gehoert dann zu `Einheiten`, nicht zum Vertrag;
Kuendigungsverzicht erst nach Definition von Datum/Bedeutung.
Bereits abgedeckt: `aktiv`, `start_datum`, `end_datum` bleiben Vertragszustand.
Kein paralleles Statusfeld und keine neue Nebenkostenabrechnung.

## C. Implementierung und Grenzen

- `apps-script/ContractService.js`: dieselbe reine Regelimplementierung in Browser
  und GAS. Vorschau: neue Kaltmiete = alte Kaltmiete * neuer Index / Basisindex;
  Gesamt = gerundete neue Kaltmiete + unveraenderte Nebenkosten.
- `contract-ui.js`: bestehende Vertraege anzeigen/bearbeiten, Hauptmieter ueber
  Vertragsparteien, Dokumentlinks, Indexvorschau und Aenderungsverlauf.
- `apps-script/Contracts.gs`: gezieltes Update eines bestehenden Vertrags unter
  dem `doPost`-ScriptLock; kein Append eines doppelten Vertrags. Vollstaendiger
  Standvergleich gegen parallele Aenderungen, Historie und gezielte Ruecksetzung
  bei fehlgeschlagenem Schreiben. Formeln ausserhalb geaenderter Felder bleiben.
- `cloud-service.js`: eigener Online-Schreibweg, keine Offline-Warteschlange und
  keine leere Antwort als Erfolg. Capability-Pruefung verhindert Schreiben an ein
  altes Deployment, das den neuen Transaktionstyp nicht kennt.
- Schreibschutz: Script Property `CONTRACT_WRITE_TOKEN`, niemals im Repository,
  nur manuell im Passwortfeld fuer den aktuellen Vorgang eingeben. Dies ist eine
  begrenzte Freigabe fuer neue Aktionen, kein Ersatz fuer spaetere Nutzeranmeldung.
  Bestehende oeffentliche Lese-/Schreibwege werden nicht hier umgebaut.
- `vpi-service.js` ruft auf Wunsch bzw. bei leerer Indexbasis die offizielle
  Bundesbank-Reihe `BBDP1.M.DE.N.VPI.C.A00000.I20.L` ab (Destatis-Daten).
  An den oeffentlichen Dienst wird nur der gewaehlte Monat uebermittelt,
  keine Vertrags-ID oder Mieterdaten. Der Antwort werden Monat, Reihe und Basisjahr
  strukturiert entnommen und geprueft. Keine Schaetzung, keine Zukunftswerte,
  kein Ueberschreiben einer gespeicherten Basis. Bei Ausfall bleibt manuelle
  Eingabe moeglich; die UI zeigt den Abruffehler und keinen erfundenen Wert.
  Erfolgreiche Abrufe werden nur im aktuellen Browserlauf gecacht.
- Nur Wohnraum: Gewerbe-Indexklauseln sind nicht durch diesen Rechner abgedeckt.
- Vorschau loest keine Mietanpassung aus. Uebernahme erfordert Textformbestaetigung,
  Zugang, HTTPS-Dokumentlink, Wirksamkeitsdatum und separate Bestaetigung.
- Geprueft werden mindestens ein Jahr unveraenderte Miete sowie der Beginn des
  uebernaechsten Monats nach Zugang. Bei einem Jahrestag mitten im Monat wird auf
  den naechsten Monatsersten aufgerundet. Gesetzliche Sonderfaelle, Wirksamkeit der
  konkreten Klausel und Erklaerung bleiben fachlich zu pruefen.
- Zukunft wird nicht in aktuelle Sollmieten geschrieben. Vorgemerkte automatische
  Anpassungen gibt es nicht; Uebernahme erst am/nach dem Wirksamkeitstag.
- Indexmieten koennen nicht direkt im Kaltmietenfeld geaendert werden. Eine
  bestehende Indexbasis kann nur mit dokumentierter Indexanpassung fortgeschrieben
  werden. Fehlerkorrekturen brauchen einen gesondert geprueften Datenpflegevorgang.
- Keine automatischen Aenderungen von Kautionen, Zahlungen, Vertragsparteien,
  Mietbeginn/-ende oder Familien-Stammdaten.

Rechtsgrundlage der Wohnraumpruefung (Stand 2026-10-21):
[§ 557b BGB](https://www.gesetze-im-internet.de/bgb/__557b.html).
Die Vorschau ersetzt keine Pruefung der konkreten Indexvereinbarung.

## D. Freizugebende Migration und Rueckweg

1. Vorbereitete lokale Aenderungen reviewen, Tests ausfuehren. Bestehende
   `Vertraege`, `Mietanpassungen` (falls vorhanden) und GAS-Version sichern.
2. Erst nach ausdruecklicher Freigabe: produktives GAS mit `clasp:pull` abgleichen.
   Pull zuerst in einer separaten Arbeitskopie ausfuehren, damit lokaler Entwurf
   erhalten bleibt. Diff einschliesslich Manifest und neuen Script-Dateien pruefen.
3. Erst nach Freigabe Code pushen und Deployment aktualisieren. Versionen und
   Status stehen in `CHANGELOG.md`; dort nach dem Deploy `4.7.0` auf `produktiv` setzen.
4. `prepareContractSchema()` nach Freigabe manuell ausfuehren. Die Funktion haengt
   fehlende Spalten an und erzeugt das leere Historienblatt. Keine Seed-Daten,
   keine bestehenden Betraege, IDs oder Familienzuordnungen werden geaendert.
5. Script Property `CONTRACT_WRITE_TOKEN` setzen. Ohne sie lehnt das Backend
   Vertrags-Schreibaktionen ab. Einmal mit einem anonymen Testvertrag pruefen.
6. Familie Dano / Vertrag 21 bleibt unveraendert. Keine automatischen Beispielwerte
   uebernehmen. Dokumentlinks und Indexbasis ausschliesslich aus Originalen pflegen.

Rollback vor Nutzung: frueheres Deployment reaktivieren, neue Felder/Blatt koennen
unbenutzt bestehen bleiben. Nur nach Pruefung auf neue Daten duerfen ausschliesslich
die neu ergaenzten leeren Spalten bzw. das leere Historienblatt entfernt werden.
Nach Nutzung: Historie niemals loeschen; Snapshot und aktuellen Vertrag vergleichen
und eine bewusste Gegenkorrektur dokumentieren. Kein pauschales Zurueckspielen
einer alten Tabelle, das neuere Mieterdaten verlieren wuerde.

Sheets bietet keine echten ACID-Transaktionen. Der Handler setzt bei Fehlern
geaenderte Zellen zurueck, kann aber bei Prozessabbruch oder parallelen manuellen
Sheet-Edits keine Transaktionsgarantie geben. Historie und Vertrag nach solchen
Fehlern gemeinsam pruefen. ScriptLock serialisiert App-Schreibwege, nicht manuelle
Sheet-Bearbeitung. Das bestehende Authentifizierungsmodell bleibt ein offener Punkt.

## E. PR-Vorbereitung

Titel: Mietvertragsdaten und dokumentierte Indexanpassungen ergaenzen

Die App erhaelt eine Vertragsansicht mit Dokumentlinks, optionaler
Nebenkosten-Aufschluesselung und Indexvorschau. Bestaetigte wirksame Anpassungen
werden mit unveraenderten Nebenkosten und Alt-/Neu-Snapshot dokumentiert.
Schema und Backend sind nur lokal vorbereitet; Produktionsfreigabe steht aus.

Vor Merge: `npm test`, Diff pruefen; vor produktiver Nutzung zusaetzlich
GAS-Abgleich, Schemafreigabe und Deployment. Kein PR wurde remote erstellt.

Validierung: 135 Tests in sieben Dateien. Neue Tests decken alle Mietmodelle,
Indexanstieg/-rueckgang, unveraenderte NK, Jahresfrist, Zugang/Wirksamkeit,
Dokumentlinks, Bestand ohne neue Felder, State-Lesen, Historienschreiben,
Konfliktpruefung, Ruecksetzung, Backend-Capabilities, Onlinefehler und UI-Speichern
bei gleichzeitigem Vertragswechsel ab. Desktop-/Mobilpruefung mit synthetischen
Daten ohne JavaScript-Fehler oder horizontalen Ueberlauf. Zusaetzlich geprueft:
ID-basierte Vertragsupdates nach Zeileneinfuegen/Sortieren, Ablehnung doppelter IDs,
VPI-Antwortformat, passendes Basisjahr, fehlende Monatswerte, Cache und veraltete
asynchrone Antworten nach Vertragswechsel.

Offizielle Quelle und API-Beschreibung:
- https://statistiken.bundesbank.de/statistiken-en/timeseries/BBDP1/M.DE.N.VPI.C.A00000.I20.L
- https://statistiken.bundesbank.de/statistiken-en/help-991452?article=bundesbank-sdmx-web-service-api-991448

Mitgefundene Testbasis-Korrekturen: Verbrauchsdashboard-Test verwendet einen festen
Stichtag statt des aktuellen Tages; ISO-Ablesedaten werden zeitzonenstabil in
Europe/Berlin angezeigt, damit die Regression auch auf UTC-CI-Rechnern besteht.

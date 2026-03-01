# Datenmodell - Hausverwaltung (Google Sheets Backend)

## 1. Philosophie
Dieses Modell folgt dem Prinzip eines **Transaction Logs**. Jede Eingabe in der App erzeugt eine neue Zeile in der Tabelle `Transaktionen`. Dies ermöglicht eine lückenlose Historie und einfache Korrekturen.

## 2. Tabelle: `Transaktionen`
Dies ist die Ziel-Tabelle für alle POST-Requests aus der App.

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `zeitstempel` | ISO-String | Erfassungszeitpunkt (Primärschlüssel-Teil) |
| **B** | `einheit_id` | String | Verknüpfung zu Tabelle 'Einheiten' (z.B. LOK_WE_01) |
| **C** | `typ` | String | Kategorie: `ZAEHLERSTAND`, `MIETE`, `SONSTIGES` |
| **D** | `wert_1` | Zahl | Zähler: Kaltwasser (m³) / Miete: Betrag (€) |
| **E** | `wert_2` | Zahl | Zähler: Warmwasser (m³) / Miete: - |
| **F** | `wert_3` | Zahl | Zähler: Strom (kWh) / Miete: - |
| **G** | `bezeichnung` | String | Freitext oder Sub-Typ (z.B. "Heizöl", "Sonderumlage") |
| **H** | `rohdaten` | JSON | Das komplette Objekt als Backup (für Debugging) |

## 3. Stammdaten-Struktur (Read-Only für App)
Diese Tabellen müssen im Sheet vorhanden sein, damit die App funktioniert:

### Tabelle: `Einheiten`
* `objekt_id`: (LOK, Ra-HS-29)
* `einheit_id`: Eindeutiger Key
* `typ`: (Wohnung, Gewerbe, Allgemein)
* `nummer`: Anzeigename der Einheit
* `qm`: Quadratmeter der Einheit
* `personen_standard`: Vorgesehene Zahl der Personen der Einheit zur Berechnung von Kosten 

### Tabelle: `Mieter`
* `mied_id`: Fortlaufende Nummer
* `einheit_id`: Zuordnung zur Wohnung
* `mietername`: Aktueller Bewohner
* `aktiv`: (TRUE/FALSE)
* `personen_aktuell`: Zuordnung zur Wohnung
* `soll_kaltmiete`: Zuordnung zur Wohnung
* `soll_nebenkosten`: Zuordnung zur Wohnung
* `soll_gesamt`: Zuordnung zur Wohnung
* `einzug_datum`: Zuordnung zur Wohnung
* `auszug_datum`: Zuordnung zur Wohnung

---

## 4. Erweiterbarkeit (Zukunftssicher)
Falls neue Messwerte (z.B. Heizöl in Litern) hinzukommen:
1. Wir nutzen die Spalte `wert_1` und setzen `typ` auf `BRENNSTOFF`.
2. Die Spalte `bezeichnung` enthält dann den Wert "Heizöl".
3. Alternativ fügen wir einfach Spalte **I** (`wert_4`) hinzu. Der `dataService` in JS ist bereits so gebaut, dass er neue Felder im JSON ignoriert oder flexibel mappt.

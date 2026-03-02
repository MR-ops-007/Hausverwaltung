# Datenmodell - Hausverwaltung (Google Sheets Backend)

## 1. Philosophie
Dieses Modell folgt dem Prinzip eines **Transaction Logs**. Jede Eingabe in der App erzeugt eine neue Zeile in der Tabelle `Transaktionen`. Dies ermöglicht eine lückenlose Historie und einfache Korrekturen.

---

## 2. Erweiterbarkeit (Zukunftssicher)
Falls neue Messwerte (z.B. Heizöl in Litern) hinzukommen:
1. Wir nutzen die Spalte `wert_1` und setzen `typ` auf `BRENNSTOFF`.
2. Die Spalte `bezeichnung` enthält dann den Wert "Heizöl".
3. Alternativ fügen wir einfach Spalte **J** (`wert_4`) hinzu. Der `dataService` in JS ist bereits so gebaut, dass er neue Felder im JSON ignoriert oder flexibel mappt.

---

## 3. Transaktions-Daten (Dynamisch)
Ziel-Tabelle für alle POST-Requests der App.

### Tabelle: `Transaktionen`
Speichert jeden Schreibvorgang der App. 

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `zeitstempel` | ISO-String | Eindeutiger Zeitstempel der Erfassung |
| **B** | `einheit_id` | String | Verknüpfung zu 'Einheiten' |
| **C** | `typ` | String | `ZAEHLERSTAND`, `MIETZAHLUNG`, `AUSGABE`, `SYSTEM` |
| **D** | `wert_1` | Zahl | Kaltwasser (m³) / Ist-Miete (€) / Betrag (€) |
| **E** | `wert_2` | Zahl | Warmwasser (m³) / Nebenkostenzahlung (€) |
| **F** | `wert_3` | Zahl | Strom (kWh) / Heizöl (l) |
| **G** | `mietername` | String | Name des Mieters zum Zeitpunkt der Erfassung |
| **H** | `bezeichnung` | String | Freitext oder Sub-Typ (z.B. "Heizöl", "Sonderumlage") |
| **I** | `rohdaten` | JSON | Das komplette Objekt als Backup (für Debugging) |

---

## 4. Stammdaten
Diese Tabellen müssen im Sheet vorhanden sein, damit die App fehlerfrei funktioniert:

### Tabelle: `Einheiten` (Stammdaten)
Die Aufteilung der Häuser. Die physischen Wohnungen/Gewerbe.

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `objekt_id` | String | z.B. LOK, Ra-HS-29 |
| **B** | `einheit_id` | String | Eindeutiger Key (z.B. LOK_WE_01) |
| **C** | `typ` | String | Wohnung, Gewerbe, Allgemein |
| **D** | `nummer` | String | Anzeigename (z.B. "1. OG rechts") |
| **E** | `qm` | Zahl | Wohnfläche für Umlage |
| **F** | `personen_standard` | Zahl | Standardbelegung (Soll) |

---

### Tabelle: `Mieter` (Stammdaten & Verträge)
Historie der Mietverhältnisse. Einheiten können mehrere Einträge haben (alte vs. neue Mieter).

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `miet_id` | Zahl | Fortlaufende Nummer |
| **B** | `einheit_id` | String | Zuordnung zur Wohnung |
| **C** | `mietername` | String | Name des Mieters |
| **D** | `aktiv` | Boolean | TRUE = Aktuell |
| **E** | `personen_aktuell` | Zahl | Tatsächliche Personenanzahl |
| **F** | `soll_kaltmiete` | Zahl | Aktuelle Soll-Kaltmiete |
| **G** | `soll_nebenkosten` | Zahl | Aktuelle Soll-Nebenkosten |
| **H** | `soll_gesamt` | Zahl | Summe F+G |
| **I** | `miet_modell` | String | `Kalt+NK`, `Pauschal`, `Warmmiete` |
| **J** | `erhoehungs_typ` | String | `Index`, `Staffel`, `Normal` |
| **K** | `letzte_anpassung` | Datum | Datum der letzten Mieterhöhung |
| **L** | `einzug_datum` | Datum | Mietbeginn |
| **M** | `auszug_datum` | Datum | Mietende (wenn bekannt) |
| **N** | `kaution_soll` | Zahl | Vereinbarte Kaution |
| **O** | `kaution_ist` | Zahl | Tatsächlich gezahlte Kaution |

---

### Tabelle: `Objekte` (Stammdaten)
Die Stammdaten der Häuser.

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `objekt_id` | String | Eindeutiger Key |
| **B** | `bezeichnung` | String | Name (z.B. "Haus am See") |
| **C** | `strasse` | String | Anschrift |
| **D** | `plz` | String | PLZ |
| **E** | `ort` | String | Ort |
| **F** | `adresszusatz` | String | Adresszusatz für zusätzliche Informationen |
---


## 5. Konfiguration & Kosten
Diese Tabellen sind die Grundlage für die Nebenkostenabrechnung.

### Tabelle: `Parameter` (Konfiguration)
Hinterlegt Kostensätze pro Haus (wichtig für die Berechnung).

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `objekt_id` | String | Zuordnung zum Haus |
| **B** | `bezeichnung` | String | z.B. `PREIS_WASSER_M3`, `PREIS_STROM_KWH` |
| **C** | `wert` | Zahl | Betrag |
| **D** | `einheit` | String | €, m³, kWh |

### Tabelle: `Zaehler_Staende` (Konsolidierung)
Wird vom System/Script befüllt (Letzter bekannter Stand).

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `objekt_id` | String | Zuordnung zum Haus |
| **B** | `einheit_id` | String | Zuordnung |
| **C** | `datum_letzte_ablesung`| Datum | Zeitstempel |
| **D** | `kw_stand` | Zahl | Letzter Wert Kaltwasser |
| **E** | `ww_stand` | Zahl | Letzter Wert Warmwasser |
| **F** | `strom_stand` | Zahl | Letzter Wert Strom |

### Tabelle: `Fixkosten` 
Jährliche Kosten des Objekts, die umgelegt werden müssen.

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `objekt_id` | String | Zuordnung zum Haus |
| **B** | `jahr` | Zahl | Abrechnungsjahr |
| **C** | `kategorie` | String | `GRUNDSTEUER`, `VERSICHERUNG`, `REINIGUNG` etc. |
| **D** | `betrag` | Zahl | Gesamtsumme |
| **E** | `umlage_key` | String | `QM`, `PERSONEN`, `EINHEIT` |

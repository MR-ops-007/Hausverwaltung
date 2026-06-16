# Datenmodell - Hausverwaltung (Google Sheets Backend) - AKTUALISIERT

## 1. Philosophie
Dieses Modell folgt dem Prinzip eines **Transaction Log**. Jede Eingabe in der App erzeugt eine neue Zeile in der Tabelle `Zaehlerstaende` oder `Zahlungen`. Dies ermöglicht eine lückenlose Historie und einfache Korrekturen.

**Wichtige Änderung:** Das alte Sheet `Mieter` wurde in `Personen` und `Vertraege` aufgeteilt. `Vertragsparteien` ermöglicht mehrere Hauptmieter pro Vertrag.

---

## 2. Erweiterbarkeit
Siehe Originalversion (zusatz_wert, bezeichnung).

---

## 3. Transaktions-Daten (Dynamisch)

### Tabelle: `Zaehlerstaende` (Messwerte)
Speichert jeden Zählerstand (nicht mehr `Transaktionen`).

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `stand_id` | String | PK: Eindeutige ID (z.B. UUID) |
| **B** | `zaehler_id` | String | FK -> Zaehler.zaehler_id |
| **C** | `zeitstempel` | Datum/Zeit | Format: `DD.MM.YYYY HH:mm` |
| **D** | `wert` | Zahl | Gemessener Wert (m³, kWh, l) |
| **E** | `quelle` | String | `UI`, `Import`, `Korrektur` |

### Tabelle: `Zahlungen`
Speichert jede Zahlung auf einen Vertrag.

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `zahlung_id` | String | PK: Eindeutige ID |
| **B** | `vertrag_id` | String | FK -> Vertraege.vertrag_id |
| **C** | `datum` | Datum | Buchungsdatum |
| **D** | `betrag` | Zahl | Gezahlter Betrag |
| **E** | `art` | String | `Miete`, `Kaution`, `Nachzahlung`, `Erstattung` |

---

## 4. Stammdaten

### Tabelle: `Objekte` (Häuser)
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `objekt_id` | String | PK: Eindeutiger Key |
| **B** | `bezeichnung` | String | Name (z.B. "Haus am See") |
| **C** | `strasse` | String | Anschrift |
| **D** | `plz` | String | PLZ |
| **E** | `ort` | String | Ort |
| **F** | `adresszusatz` | String | Optional |
| **G** | `besitzer_id` | String | FK -> Nutzer.nutzer_id (Optional: für Datenschutz) |

### Tabelle: `Einheiten` (Wohnungen/Gewerbe)
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `einheit_id` | String | PK: Eindeutiger Key |
| **B** | `objekt_id` | String | FK -> Objekte.objekt_id |
| **C** | `typ` | String | `Wohnung`, `Gewerbe`, `Allgemein` |
| **D** | `nummer` | String | Anzeigename (z.B. "1. OG rechts") |
| **E** | `qm` | Zahl | Wohnfläche |
| **F** | `personen_standard` | Zahl | Standardbelegung (Soll) |

### Tabelle: `Personen` (Natürliche Personen)
**Wichtig:** Trennt Person von Mietvertrag. Mehr Hauptmieter sind hier möglich.
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `person_id` | String | PK: Eindeutiger Key |
| **B** | `name` | String | Vollständiger Name |
| **C** | `email` | String | Optional |
| **D** | `telefon` | String | Optional |

### Tabelle: `Vertraege` (Mietverhältnisse)
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `vertrag_id` | String | PK: Eindeutiger Key |
| **B** | `einheit_id` | String | FK -> Einheiten.einheit_id |
| **C** | `hauptperson_id` | String | FK -> Personen.person_id (Technischer Anker für 1. Ansprechpartner) |
| **D** | `start_datum` | Datum | Mietbeginn |
| **E** | `end_datum` | Datum | Mietende (wenn bekannt) |
| **F** | `aktiv` | Boolean | TRUE = Aktuell |
| **G** | `mietmodell` | String | `Kalt+NK`, `Pauschal`, `Warmmiete` |
| **H** | `erhoehungs_typ` | String | `Index`, `Staffel`, `Normal` |
| **I** | `soll_kaltmiete` | Zahl | Aktuelle Soll-Kaltmiete |
| **J** | `soll_nebenkosten` | Zahl | Aktuelle Soll-Nebenkosten |
| **K** | `kaution_soll` | Zahl | Vereinbarte Kaution |
| **L** | `kaution_ist` | Zahl | Tatsächlich gezahlte Kaution |

### Tabelle: `Vertragsparteien` (N:M zwischen Vertrag und Person)
**Wichtig:** Ermöglicht mehrere Hauptmieter (z.B. 2 Personen mit Rolle "Hauptmieter").
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `vertrag_id` | String | FK -> Vertraege.vertrag_id (PK) |
| **B** | `person_id` | String | FK -> Personen.person_id (PK) |
| **C** | `rolle` | String | `Hauptmieter`, `Mitmieter`, `Eigentümer` |
| **D** | `ordnet` | Number | Optional: Reihenfolge (1, 2, ...) |
| **E** | `vollmacht` | Boolean | Optional: Wer darf den Vertrag führen? |

### Tabelle: `Zaehler` (Zähler-Definition)
**Wichtig:** Trennt den Zähler (Stammdaten) vom Messwert (`Zaehlerstaende`).
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `zaehler_id` | String | PK: Eindeutiger Key |
| **B** | `objekt_id` | String | FK -> Objekte.objekt_id (für Allgemeine Zähler) |
| **C** | `einheit_id` | String | FK -> Einheiten.einheit_id (nullable, für WE/GE Zähler) |
| **D** | `medium` | String | `Kaltwasser`, `Warmwasser`, `Strom`, `Oel`, `Zusatz` |
| **E** | `bezeichnung` | String | Freitext/Anzeige (z.B. "Strom HT") |
| **F** | `einheit` | String | `m3`, `kWh`, `l`, `h` |

### Tabelle: `Parameter` (Konfiguration)
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `objekt_id` | String | FK -> Objekte.objekt_id |
| **B** | `bezeichnung` | String | z.B. `PREIS_WASSER_M3` |
| **C** | `wert` | Zahl | Betrag |
| **D** | `einheit` | String | €, m³, kWh |
| **E** | `gueltig_ab` | Datum | Beginn der Vertragsperiode |
| **F** | `gueltig_bis` | Datum | Ende der Vertragsperiode |
	

### Tabelle: `Fixkosten`
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `kosten_id` | String | PK: Eindeutiger Key |
| **B** | `objekt_id` | String | FK -> Objekte.objekt_id |
| **C** | `jahr` | Zahl | Abrechnungsjahr |
| **D** | `kategorie` | String | `GRUNDSTEUER`, `VERSICHERUNG` |
| **E** | `betrag` | Zahl | Gesamtsumme |
| **F** | `umlage_key` | String | `QM`, `PERSONEN`, `EINHEIT` |

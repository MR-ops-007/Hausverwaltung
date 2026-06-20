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
| **B** | `objekt_id` | String | Fremdschlüssel (FK) (verknüpft mit Objekte) FK -> Zaehler.objekt_id |
| **C** | `einheit_id` | String | Fremdschlüssel (FK) (verknüpft mit Einheiten) FK -> Zaehler.einheit_id |
| **D** | `zaehler_id` | String | Fremdschlüssel (FK) (verknüpft mit Zähler) FK -> Zaehler.zaehler_id |
| **E** | `zeitstempel` | Datum/Zeit | Format: `DD.MM.YYYY HH:mm` |
| **F** | `wert` | Zahl | Gemessener Wert (m³, kWh, l) |
| **G** | `quelle` | String | `UI`, `Import`, `Korrektur` |

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
| **B** | `name` | String | Nachname |
| **C** | `vorname` | String | Vorname |
| **D** | `email` | String | Optional |
| **E** | `telefon` | String | Optional |
| **F** | `personen_aktuell` | Zahl | Reale Anzahl der dort lebenden Personen (für Umlageschlüssel) |

### Tabelle: `Vertraege` (Mietverhältnisse)
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `vertrag_id` | String | PK: Eindeutiger Key |
| **B** | `einheit_id` | String | FK -> Einheiten.einheit_id |
| **C** | `hauptperson_id` | String | FK -> Personen.person_id (Technischer Anker für 1. Ansprechpartner) |
| **D** | `start_datum` | Datum | Mietbeginn (Historisch: `einzug_datum`) |
| **E** | `end_datum` | Datum | Mietende (Historisch: `auszug_datum`, wenn bekannt) |
| **F** | `aktiv` | Boolean | TRUE = Aktuell |
| **G** | `mietmodell` | String | `Kalt+NK`, `Pauschal`, `Warmmiete` |
| **H** | `erhoehungs_typ` | String | `Index`, `Staffel`, `Normal` |
| **I** | `letzte_anpassung` | Datum | Letzte vertragliche Mietpreisänderung |
| **J** | `soll_kaltmiete` | Zahl | Aktuelle Soll-Kaltmiete |
| **K** | `soll_nebenkosten` | Zahl | Aktuelle Soll-Nebenkosten |
| **L** | `soll_gesamt` | Zahl | Summe aus soll_kaltmiete und soll_nebenkosten |
| **M** | `kaution_soll` | Zahl | Vereinbarte Kautionssumme |
| **N** | `kaution_ist` | Zahl | Tatsächlich bisher gezahlte Kaution |

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

Diese Tabelle beschreibt, **welche Zähler existieren**, zu welchem Objekt bzw. welcher Einheit sie gehören und welche Regeln für die Plausibilitätsprüfung gelten. Die eigentlichen Ablesewerte werden ausschließlich in `Zaehlerstaende` gespeichert.

| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `zaehler_id` | String | PK: Eindeutiger Key |
| **B** | `objekt_id` | String | FK -> Objekte.objekt_id; Pflichtfeld, da jeder Zähler einem Objekt zugeordnet ist |
| **C** | `einheit_id` | String | FK -> Einheiten.einheit_id; nullable für Allgemein-/Hauszähler |
| **D** | `medium` | String | `Kaltwasser`, `Warmwasser`, `Strom`, `Oel`, `Zusatz` |
| **E** | `bezeichnung` | String | Freitext/Anzeige, z. B. `Strom HT`, `Strom NT`, `Kaltwasser Bad`, `Öltank` |
| **F** | `einheit` | String | `m3`, `kWh`, `l`, `h` |
| **G** | `einbauort` | String | Freitext/Anzeige, z. B. `Keller`, `Flur`, `Wohnung`, `Zählerschrank` |
| **H** | `stellen` | Zahl | Anzahl der sichtbaren Zählerstellen vor dem Überlauf, z. B. `4` bei Zählern von `0000` bis `9999`; nullable, wenn nicht relevant |
| **I** | `ueberlauf_erlaubt` | Boolean | `TRUE`, wenn ein niedrigerer neuer Wert durch Zählerüberlauf plausibel sein kann; sonst `FALSE` |
| **J** | `max_plausibler_verbrauch` | Zahl | Optionaler Schwellenwert für maximal plausiblen Verbrauch je Ableseintervall; dient zur Warnung bei Extremwerten |
| **K** | `aktiv` | Boolean | `TRUE` = Zähler wird aktuell verwendet; `FALSE` = historischer/ersetzter Zähler |
| **L** | `ersetzt_durch_zaehler_id` | String | Optional: FK -> Zaehler.zaehler_id, wenn dieser Zähler durch einen neuen Zähler ersetzt wurde |
| **M** | `hinweis` | String | Freitext für Besonderheiten, z. B. `4-stelliger Zwischenzähler`, `OVAG-Hauptzähler`, `Zählerwechsel 2024` |

#### Plausibilitätsregeln für Zählerstände

Die Validierung neuer Zählerstände basiert auf den Stammdaten aus `Zaehler` und den letzten gespeicherten Messwerten aus `Zaehlerstaende`.

Grundregeln:

1. **Erstablesung:** Wenn kein vorheriger Wert vorhanden ist, wird der neue Wert akzeptiert.
2. **Normalfall:** Wenn `neuer_wert >= letzter_wert`, ist der Wert grundsätzlich plausibel.
3. **Zählerüberlauf:** Wenn `neuer_wert < letzter_wert`, `ueberlauf_erlaubt = TRUE` und `stellen` gesetzt ist, kann ein Überlauf berechnet werden.
4. **Zählerwechsel:** Wenn ein alter Zähler durch einen neuen ersetzt wurde, darf der neue Zähler mit einem niedrigeren Wert starten. Dies muss über `aktiv`, `ersetzt_durch_zaehler_id` oder einen dokumentierten Hinweis nachvollziehbar sein.
5. **Warnung statt harter Blockade:** Bei unklaren Fällen soll die UI zunächst warnen und eine bewusste Bestätigung ermöglichen, statt Eingaben pauschal zu verhindern.
6. **Extremverbrauch:** Wenn `max_plausibler_verbrauch` gesetzt ist und der berechnete Verbrauch diesen Wert überschreitet, soll eine Warnung angezeigt werden.

Beispiel Überlauf bei 4-stelligem Zähler:

```text
letzter_wert = 9876
neuer_wert = 123
stellen = 4
max_wert = 10000

verbrauch = 10000 - 9876 + 123 = 247
```

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

---

## 5. Performance-Optimierung (Flache Lese-Ansichten)

Um die Ladezeiten der Benutzeroberfläche (UI) zu minimieren, verwendet das System das Prinzip einer **Materialized View**. Die relationalen Tabellen (`Einheiten`, `Vertraege`, `Personen`, `Vertragsparteien`) bleiben die "Single Source of Truth" für Schreiboperationen. Für Leseoperationen der UI wird jedoch eine aggregierte, flache Hilfstabelle automatisiert vom Backend gepflegt.

### Hilfstabelle: `_view_aktive_mieter`
Diese Tabelle wird bei jeder vertraglichen Änderung oder beim Laden asynchron aktualisiert. Sie bündelt alle für das Dashboard kritischen Mieterdaten in einer einzigen Zeile pro Einheit.

| Spalte | Feldname | Datentyp | Beschreibung | Herkunft / Logik |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `einheit_id` | String | PK: Eindeutiger Key der Wohneinheit | `Einheiten.einheit_id` |
| **B** | `vertrag_id` | String | FK: ID des aktuell aktiven Mietvertrags | `Vertraege.vertrag_id` (wo `aktiv` = TRUE) |
| **C** | `mieter_name` | String | Vollständiger Name des Hauptmieters | `Personen.name` + ", " + `Personen.vorname` (Format: Nachname, Vorname) |
| **D** | `start_datum` | Datum | Einzugsdatum / Mietbeginn | `Vertraege.start_datum` |
| **E** | `soll_gesamt` | Zahl | Aktuelle monatliche Soll-Gesamtmiete | `Vertraege.soll_gesamt` |
| **F** | `personen_aktuell` | Zahl | Anzahl der aktuell gemeldeten Personen | `Personen.personen_aktuell` |

**Konsistenz-Regel:** Es dürfen niemals manuelle Änderungen in `_view_aktive_mieter` vorgenommen werden. Die Tabelle ist ein reiner Lese-Cache (Read-Only Cache). Schreibzugriffe erfolgen strikt über die Quelltabellen.

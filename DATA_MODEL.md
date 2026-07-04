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
| **A** | `stand_id` | String | PK: Eindeutige ID im Format `ST_{objekt_id}_{einheit_id}_{zaehler_id}_{YYYY-MM-DD HH:mm}` |
| **B** | `objekt_id` | String | Fremdschlüssel (FK) (verknüpft mit Objekte) FK -> Zaehler.objekt_id |
| **C** | `einheit_id` | String | Fremdschlüssel (FK) (verknüpft mit Einheiten) FK -> Zaehler.einheit_id |
| **D** | `zaehler_id` | String | ID des konkreten Zählers/Messpunkts; für neue Daten nach `Z_{einheit_id}_{medium}` oder `Z_{einheit_id}_{medium}_{messpunkt}` |
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
| **H** | `eingange` | String | Optional: kommagetrennte Gebäudeeingänge, z. B. `A,B,C` |

#### Reservierter Testbereich

Das Objekt `TEST` ist als dauerhaft getrennter Testbereich reserviert. Es dient zur Prüfung produktiver Schreibwege, ohne reale Objekt-, Einheiten- oder Zählerdaten zu verändern.

Zugehörige Stammdaten:

```text
objekt_id: TEST
einheit_id: TEST_WE_01
einheit_id: TEST_WE_02
einheit_id: TEST_Allgemein
zaehler_id: Z_STROM_KWH_WOHNUNG_1
zaehler_id: Z_KALTWASSER_KW_WOHNUNG_1
zaehler_id: Z_WARMWASSER_WW_WOHNUNG_1
zaehler_id: Z_STROM_KWH_WOHNUNG_2
zaehler_id: Z_KALTWASSER_KW_WOHNUNG_2
zaehler_id: Z_WARMWASSER_WW_WOHNUNG_2
zaehler_id: Z_STROM_KWH_ALLGEMEIN
zaehler_id: Z_KALTWASSER_KW_HAUPTZAEHLER
zaehler_id: Z_WARMWASSER_WW_ZULAUF
zaehler_id: Z_OEL_STAND_IN_CM
zaehler_id: Z_OEL_GETANKT_LITER
```

Der Testbereich enthält eine belegte Testwohnung (`TEST_WE_01`), einen Leerstand (`TEST_WE_02`) und einen Allgemeinbereich (`TEST_Allgemein`). Er nutzt noch die historisch gewachsenen Test-IDs. Die UI muss Vorwerte unabhängig davon immer nach `zaehler_id`, `objekt_id` und `einheit_id` filtern.

Auswertungen und spätere Dashboards sollen diesen Testbereich entweder sichtbar als Testdaten markieren oder aus produktiven Kennzahlen ausschließen.

### Tabelle: `Einheiten` (Wohnungen/Gewerbe)
| Spalte | Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- | :--- |
| **A** | `einheit_id` | String | PK: Eindeutiger Key |
| **B** | `objekt_id` | String | FK -> Objekte.objekt_id |
| **C** | `typ` | String | `Wohnung`, `Gewerbe`, `Allgemein` |
| **D** | `nummer` | String | Anzeigename (z.B. "1. OG rechts") |
| **E** | `qm` | Zahl | Wohnfläche |
| **F** | `personen_standard` | Zahl | Standardbelegung (Soll) |
| **G** | `eingang` | String | Optional: Gebäudeeingang, z. B. `A`, `B`, `C` oder `Allgemein` |

#### LOK Eingänge

Das Objekt `LOK` nutzt die optionalen Gebäudeeingänge `A`, `B` und `C`.

Aktuelle Zuordnung:

```text
LOK_WE_01 bis LOK_WE_05 -> Eingang A
LOK_WE_06 bis LOK_WE_09 -> Eingang B
LOK_WE_10_A -> Eingang B
LOK_WE_10_B -> Eingang B
LOK_WE_10_S -> Eingang B
LOK_WE_11 bis LOK_WE_15 -> Eingang C
LOK_GE_01 -> Eingang A
LOK_Allgemein -> Allgemein
```

Die Zuordnung wird in Apps Script zentral über `getLokEinheitEntranceMapping` gepflegt, damit Korrekturen nicht an mehreren Stellen erfolgen müssen. `ensureLokStructureData` ergänzt die Felder `Objekte.eingange` und `Einheiten.eingang` sowie fehlende LOK-Einheiten und Zähler idempotent.

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
| **A** | `zaehler_id` | String | ID des konkreten Zählers/Messpunkts. Neue IDs folgen `Z_{einheit_id}_{medium}` oder bei Bedarf `Z_{einheit_id}_{medium}_{messpunkt}` |
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
| **N** | `erfassbar` | Boolean | `TRUE`/leer = erscheint in der manuellen Eingabemaske; `FALSE` = wird nicht manuell erfasst |
| **O** | `berechnet` | Boolean | `TRUE` = berechneter/virtueller Wert; `FALSE`/leer = normaler physischer Zähler |

#### Zähleridentität

Für neue Zähler ist `zaehler_id` eine einheitgebundene fachliche ID. Das Standardformat ist:

```text
Z_{einheit_id}_{medium}
```

Wenn es innerhalb derselben Einheit mehrere Zähler mit demselben `medium` gibt, wird ein optionaler Messpunkt ergänzt:

```text
Z_{einheit_id}_{medium}_{messpunkt}
```

Beispiele:

```text
einheit_id: LOK_WE_10_A
medium: strom_ht_kwh
zaehler_id: Z_LOK_WE_10_A_strom_ht_kwh

einheit_id: LOK_WE_10_A
medium: kaltwasser_m3
zaehler_id: Z_LOK_WE_10_A_kaltwasser_m3

einheit_id: LOK_Allgemein
medium: kaltwasser_m3
messpunkt: hauptzaehler
zaehler_id: Z_LOK_Allgemein_kaltwasser_m3_hauptzaehler
```

`medium` beschreibt die Messgröße, z. B. `strom_ht_kwh`, `kaltwasser_m3`, `warmwasser_m3` oder `oel_stand_cm`. Es ersetzt keinen konkreten Zähler, sondern ist Bestandteil der ID.

Historische `zaehler_id`s bleiben gültig. Migrationen auf das neue Format erfolgen nur kontrolliert, wenn die betroffenen `Zaehlerstaende` eindeutig vorbereitet sind. Zur Sicherheit bleibt die UI-Vorwertsuche weiterhin auf `objekt_id + einheit_id + zaehler_id` eingegrenzt.

#### Erfassbare und berechnete Zähler

Die UI-Eingabemaske zeigt nur Zähler an, die aktiv und manuell erfassbar sind.

Ein Zähler wird in der Eingabemaske angezeigt, wenn:

```text
aktiv ist nicht FALSE
erfassbar ist nicht FALSE
berechnet ist nicht TRUE
```

Berechnete oder virtuelle Werte bleiben Teil des Datenmodells und können für Auswertungen, Verbrauchsberechnungen und Dashboards genutzt werden. Sie werden aber nicht als Eingabefeld in der manuellen Zählererfassung angezeigt.

Beispiel:

| zaehler_id | Bedeutung | erfassbar | berechnet |
| :--- | :--- | :--- | :--- |
| `Z_KALTWASSER_KW_WOHNUNG_4` | Physischer Kaltwasserzähler Wohnung 4 | `TRUE` | `FALSE` |
| `Z_KALTWASSER_VERBRAUCH_WOHNUNG_4` | Berechneter Verbrauch zur Ermittlung des Warmwasser-Zulaufs | `FALSE` | `TRUE` |

#### Plausibilitätsregeln für Zählerstände

Die Validierung neuer Zählerstände basiert auf den Stammdaten aus `Zaehler` und den letzten gespeicherten Messwerten aus `Zaehlerstaende`.

Grundregeln:

1. **Erstablesung:** Wenn kein vorheriger Wert vorhanden ist, wird der neue Wert akzeptiert.
2. **Normalfall:** Wenn `neuer_wert >= letzter_wert`, ist der Wert grundsätzlich plausibel.
3. **Zählerüberlauf:** Wenn `neuer_wert < letzter_wert`, `ueberlauf_erlaubt = TRUE` und `stellen` gesetzt ist, kann ein Überlauf berechnet werden.
4. **Zählerwechsel:** Wenn ein alter Zähler durch einen neuen ersetzt wurde, darf der neue Zähler mit einem niedrigeren Wert starten. Dies muss über `aktiv`, `ersetzt_durch_zaehler_id` oder einen dokumentierten Hinweis nachvollziehbar sein.
5. **Warnung statt harter Blockade:** Bei unklaren Fällen soll die UI zunächst warnen und eine bewusste Bestätigung ermöglichen, statt Eingaben pauschal zu verhindern.
6. **Extremverbrauch:** Wenn `max_plausibler_verbrauch` gesetzt ist und der berechnete Verbrauch diesen Wert überschreitet, soll eine Warnung angezeigt werden.
7. **Rückläufige Füllstandszähler:** Bei `oel_stand_cm` ist ein niedrigerer Folgewert normaler Verbrauch. Ein höherer Folgewert bedeutet Betankung, Korrektur oder Messfehler und muss mit eigener Logik geprüft werden. Ein Überlauf ist hier fachlich nicht plausibel.

Beispiel Überlauf bei 4-stelligem Zähler:

```text
letzter_wert = 9876
neuer_wert = 123
stellen = 4
max_wert = 10000

verbrauch = 10000 - 9876 + 123 = 247
```

#### Migration bestehender Zählerstände

Bestehende importierte `Zaehlerstaende` enthalten alte `stand_id`-Werte in einem einheitlichen historischen Format, das nur auf `zaehler_id` und Datum basiert.

Da die bisherigen Produktivdaten im Wesentlichen aus einem Objekt stammen, ist die Migration überschaubar:

1. Fehlende `objekt_id` mit dem bekannten Bestandsobjekt ergänzen.
2. Fehlende `einheit_id` zuerst aus bereits vorbereiteten Bestandszeilen lernen, danach deterministisch aus der vorhandenen `zaehler_id` ableiten.
3. `stand_id` auf das neue Format `ST_{objekt_id}_{einheit_id}_{zaehler_id}_{YYYY-MM-DD HH:mm}` umstellen.
4. Per `writeStandIdMigrationReport` das Sheet `_migration_stand_id_report` erzeugen und prüfen, dass keine Mapping-Konflikte, keine ungelösten Zuordnungen und keine doppelten neuen `stand_id`s existieren.
5. Für neue Objekte einheitgebundene `zaehler_id`s nach `Z_{einheit_id}_{medium}` oder `Z_{einheit_id}_{medium}_{messpunkt}` verwenden.

Bekannte historische Übertragungsfehler bei `einheit_id` werden in der Migration per Override korrigiert, z. B. `Ra-HS-29_WE_010` -> `Ra-HS-29_WE_10` und Flur-/Heizungszähler auf eigene Allgemein-Einheiten.

Der historische berechnete Warmwasser-Gesamtwert wird als virtueller Zähler `Z_WARMWASSER_WW_GESAMT_BERECHNET` geführt. Er ist `berechnet = TRUE`, `erfassbar = FALSE` und verwendet `einbauort = berechneter Wert, kein Zaehler`.

Duplikate werden vor der Anwendung der Migration separat über `writeStandIdDuplicateReport` in `_migration_duplicate_report` geprüft. Exakte Doppelungen werden als Löschkandidat markiert. Historische Doppelwerte mit genau zwei unterschiedlichen numerischen Werten werden als Zählerstand plus berechneter Verbrauch interpretiert: Der höhere Wert bleibt beim ursprünglichen Zähler, der niedrigere Wert erhält eine virtuelle `zaehler_id` mit Suffix `_VERBRAUCH_BERECHNET`. Alle anderen abweichenden Werte müssen manuell geprüft werden.

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

### Hilfstabelle: `_view_verbrauch_monat`
Diese Tabelle wird durch `updateVerbrauchViews` im Apps Script neu aufgebaut. Sie ist die prüfbare Detailbasis für Verbrauchsauswertungen.

Zwei aufeinanderfolgende Zählerstände desselben Zählers bilden ein Intervall. Der Verbrauch dieses Intervalls wird tagesgenau auf die betroffenen Kalendermonate verteilt. Lange Ableseabstände werden dadurch geglättet, ohne dass die UI eigene schwere Berechnungen ausführen muss.

Wichtige Felder:

| Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- |
| `jahr` | Zahl | Kalenderjahr des Monatssegments |
| `monat` | String | Monat im Format `YYYY-MM` |
| `objekt_id` | String | Objekt des Zählers |
| `einheit_id` | String | Einheit des Zählers |
| `einheit_name` | String | Anzeigename der Einheit |
| `mieter_name` | String | Aktiver Mieter aus `_view_aktive_mieter`, falls vorhanden |
| `verbrauchsgruppe` | String | Grobe Auswertungsgruppe, z.B. `WOHNUNG`, `ALLGEMEIN`, `HAUPTZAEHLER`, `BERECHNET` |
| `untergruppe` | String | Weitere Gruppierung, z.B. `FLUR`, `HEIZUNG`, `PRIVAT_HT`, `PRIVAT_NT` |
| `zaehler_id` | String | Fachliche Zähler-ID |
| `medium` | String | Medium des Zählers |
| `start_datum`, `end_datum` | Datum | Ableseintervall |
| `start_wert`, `end_wert` | Zahl | Rohwerte aus `Zaehlerstaende` |
| `differenz_gesamt` | Zahl | Verbrauch des gesamten Intervalls |
| `tage_gesamt` | Zahl | Länge des gesamten Intervalls in Tagen |
| `tage_im_monat` | Zahl | Anteilstage dieses Monats am Intervall |
| `anteil_im_monat` | Zahl | Monatsanteil am Intervall |
| `verbrauch_monat` | Zahl | Auf den Monat verteilter Verbrauch |
| `berechnungsmethode` | String | z.B. `DIREKT`, `UEBERLAUF`, `OEL_FUELLSTAND`, `NICHT_BERECHENBAR` |
| `plausibilitaet_status` | String | `OK` oder prüfpflichtiger Warnstatus |
| `plausibilitaet_hinweis` | String | Erklärung für fachliche Prüfung |
| `in_summe_beruecksichtigen` | Boolean | Gibt an, ob der Wert in Summen laufen darf |

### Hilfstabelle: `_view_verbrauch_jahr`
Diese Tabelle wird aus `_view_verbrauch_monat` aggregiert. Sie dient der schnellen Dashboard-Anzeige und späteren Jahresauswertungen.

Gruppiert wird nach `jahr`, `objekt_id`, `einheit_id` und `zaehler_id`. Warnstatus werden nicht verworfen, sondern als Prüfhinweis mitgezählt.

Wichtige Felder:

| Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- |
| `jahr` | Zahl | Abrechnungsjahr |
| `objekt_id` | String | Objekt des Zählers |
| `einheit_id` | String | Einheit des Zählers |
| `mieter_name` | String | Aktiver Mieter, falls vorhanden |
| `verbrauchsgruppe` | String | Grobe Auswertungsgruppe |
| `untergruppe` | String | Weitere Gruppierung |
| `zaehler_id` | String | Fachliche Zähler-ID |
| `medium` | String | Medium des Zählers |
| `verbrauch_jahr` | Zahl | Summe der Monatsverbräuche im Jahr |
| `verbrauch_monat_durchschnitt` | Zahl | Durchschnitt über Monate mit berechnetem Verbrauch |
| `anzahl_monate_mit_verbrauch` | Zahl | Anzahl betroffener Monatssegmente |
| `anzahl_warnungen` | Zahl | Anzahl prüfpflichtiger Monatssegmente |
| `plausibilitaet_status` | String | `OK` oder kombinierte Warnstatus |
| `in_summe_beruecksichtigen` | Boolean | Gibt an, ob der Wert in Summen laufen darf |

### Hilfstabelle: `_view_verbrauch_audit`
Diese Tabelle wird gemeinsam mit den Verbrauchsviews aufgebaut. Sie ist die Kontrollinstanz dafür, ob alle Zählerstände in die Verbrauchsberechnung eingeflossen sind oder bewusst nicht berechnet werden konnten.

Pro Zähler aus `Zaehler` wird eine Audit-Zeile erzeugt. Zusätzlich werden ungelöste Messwertgruppen aufgenommen, wenn Zählerstände keinem eindeutigen Stammdaten-Zähler zugeordnet werden können.

Wichtige Felder:

| Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- |
| `status` | String | `OK`, `KANONISCH_ZUGEORDNET`, `NUR_EIN_WERT`, `KEINE_ABLESUNG`, `MONATSZEILEN_ABWEICHUNG` oder `UNGELOESTE_MESSWERTE` |
| `objekt_id` | String | Objekt des Zählers oder der ungelösten Messwertgruppe |
| `einheit_id` | String | Kanonische Einheit aus `Zaehler` oder ursprüngliche Einheit bei ungelösten Messwerten |
| `zaehler_id` | String | Kanonische Zähler-ID oder ursprüngliche ID bei ungelösten Messwerten |
| `readings_count` | Zahl | Anzahl gefundener Rohwerte |
| `intervalle_count` | Zahl | Anzahl möglicher Verbrauchsintervalle |
| `erwartete_monatszeilen` | Zahl | Erwartete Monatssegmente aus allen Intervallen |
| `monatszeilen` | Zahl | Tatsächlich erzeugte Zeilen in `_view_verbrauch_monat` |
| `jahreszeilen` | Zahl | Tatsächlich erzeugte Zeilen in `_view_verbrauch_jahr` |
| `source_keys` | String | Ursprüngliche Messwert-Keys, falls sie von der kanonischen Zähleridentität abweichen |
| `hinweis` | String | Erklärung für Warn- oder Auditstatus |

Historische Schreibweisen wie `Z_STROM_HT_KWH_PRIVAT_HT` dürfen nur dann auf `Z_STROM_KWH_PRIVAT_HT` gemappt werden, wenn die Zuordnung im Objekt eindeutig ist. Gleiches gilt für alte oder fehlerhafte `einheit_id`s.

### Hilfstabelle: `_view_verbrauch_bilanz_jahr`
Diese Tabelle wird gemeinsam mit den Verbrauchsviews aufgebaut. Sie enthält fachlich berechnete Jahreskennzahlen, die nicht einem einzelnen physischen Zähler entsprechen.

Erste Kennzahl:

| `bilanz_id` | `label` | Formel |
| :--- | :--- | :--- |
| `BILANZ_STROM_BLACK_INN` | `Strom · Black Inn` | `Strom · Black Inn · Privat HT + Strom · Black Inn · Privat NT - Strom · Flur - Strom · Heizung - Strom · Black Inn · Büro - Z_STROM_KWH_WOHNUNG_3 - Z_STROM_KWH_WOHNUNG_4` |

Wohnung 2 wird explizit nicht abgezogen. Wohnung 1, 5, 10 und 11 werden nach aktuellem Stand nicht abgezogen, da sie als OVAG-Zähler geführt sind. Kodi HT/NT bleibt separat, da OVAG und kein Zwischenzähler vom Black-Inn-Hauptzähler.

Wichtige Felder:

| Feldname | Datentyp | Beschreibung |
| :--- | :--- | :--- |
| `jahr` | Zahl | Abrechnungsjahr |
| `objekt_id` | String | Objekt der Bilanzkennzahl |
| `bilanz_id` | String | Eindeutige Kennzahl-ID |
| `label` | String | Anzeige-Label für die UI |
| `medium` | String | Medium der Kennzahl |
| `wert` | Zahl | Berechneter Jahreswert |
| `wert_monat_durchschnitt` | Zahl | Durchschnitt über die berücksichtigten Verbrauchsmonate |
| `source_zaehler_ids` | String | Verwendete Quellzähler |
| `missing_source_zaehler_ids` | String | Fehlende Quellzähler, falls die Bilanz unvollständig ist |
| `formel_text` | String | Lesbare Herleitung |
| `plausibilitaet_status` | String | `OK`, `QUELLWERTE_FEHLEN` oder `WARNUNGEN_IN_QUELLWERTEN` |

**Konsistenz-Regel:** Die Verbrauchsviews und der Audit-View sind reine Read-Only-Caches. Fachliche Korrekturen erfolgen in den Quelltabellen oder über dokumentierte Migrationsfunktionen, nicht direkt in den View-Sheets.

### Migration: kanonische Zählerstand-Identitäten
Historische, eindeutig auflösbare Abweichungen zwischen `Zaehlerstaende` und `Zaehler` werden über `previewCanonicalZaehlerstandMigration`, `writeCanonicalZaehlerstandMigrationReport` und `applyCanonicalZaehlerstandMigration` korrigiert.

Die Migration darf nur eindeutige Zuordnungen anwenden. Sie aktualisiert `objekt_id`, `einheit_id`, `zaehler_id` und die daraus abgeleitete `stand_id`.

Fälle mit leerer Ziel-`einheit_id` im Zählerstamm werden nicht automatisch migriert. Sie erhalten den Status `ZIEL_EINHEIT_FEHLT`, weil sonst neue `stand_id`s mit `UNKNOWN_EINHEIT` entstehen würden. Zuerst muss in `Zaehler` eine fachlich richtige Einheit gesetzt werden.

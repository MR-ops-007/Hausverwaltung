# PROJECT_STATE - Hausverwaltung (MR-ops-007)

# Projektstatus: Hausverwaltung App


**Datum:** 03.03.2026

## Aktueller Stand
- **Daten-Infrastruktur:** Google Sheets Anbindung steht (doGet/doPost).
- **Synchronisation:** Transaktionen (Historie) und Zaehler_Staende (Stammdaten-Update) funktionieren konsistent gemäß DATA_MODEL.md.
- **UI:** Dynamische Generierung von Objekt-Karten und Einheiten-Listen implementiert.
- **Fixes:** Context-Fehler in ui-service behoben, ID-Mapping zwischen Frontend und GAS stabilisiert.

## Offene To-Dos
1. **Dynamische Zählermasken:** Anpassung der Inputs basierend auf Einheitstyp (z.B. Heizöl für Zentralheizung, Maschinenstunden für Gewerbe).
2. **Begrifflichkeiten:** "Einheit" bei Gewerbe-Objekten (GE) durch passendere Begriffe ersetzen.
3. **Sync-Status UI:** Der "Prüfe Verbindung..." Text wird nach erfolgreichem Laden nicht aktualisiert.
4. **Refactoring:** GAS-URL zentral in `config.js` konsolidieren.

## Nächste Schritte
- Implementierung der Logik in `ui-service.js`, die prüft, welche Zähler für eine Einheit relevant sind.
- Update der `index.html` Initialisierung für den Status-Text.
  
---

**Datum:** 03.03.2026
**Status:** Phase 2 (Datenanbindung & Plausibilität) - In Bearbeitung
**Entwickler-Level:** Senior Refactoring / Stabilisierung

---

## 1. Aktueller Stand der Komponenten

### Datenmodell (DATA_MODEL.md)
- **Status:** Finalisiert.
- **Inhalt:** Alle 7 Tabellen (Objekte, Einheiten, Mieter, Zaehler_Staende, Parameter, Fixkosten, Transaktionen) sind definiert.
- **Besonderheit:** Tabelle `Zaehler_Staende` wurde um die Spalte `bezeichnung` erweitert.

### Backend (Google Apps Script - Code.gs)
- **Status:** Bereitgestellt (Version 02.03.2026).
- **Funktion:** - `doGet`: Liefert alle 7 Tabellen als JSON.
    - `doPost`: Schreibt in `Transaktionen` UND aktualisiert zeitgleich die Anker-Werte in `Zaehler_Staende`.
    - Enthält `LockService` gegen Race-Conditions und Datumsformatierung (DD.MM.YYYY).

### Frontend (JavaScript-Services)
- **data-service.js:** Konsolidiert. Unterstützt nun Kleinschreibung im State (`einheiten`) und bietet die notwendigen API-Methoden `getUniqueObjects` und `getUnitsByObject` (alias `getEinheitenByObjekt`). Mieter-Logik für inaktive Mieter (Auszug in Vergangenheit) ist implementiert.
- **ui-service.js:** Erweitert um die vollständige Zählermaske (KW, WW, HT, NT, Öl, Zusatz).
- **cloud-service.js:** Unverändert, übernimmt den Datentransport.

---

## 2. Bekannte Probleme & Blockaden (Blocker)

1. **Datenfluss-Hänger:** Die App meldet beim Öffnen der Zählermaske "Daten werden noch geladen...". Der State im `dataService` scheint trotz erfolgreichem Boot nicht korrekt mit den gelieferten Serverdaten befüllt zu werden (Mapping-Problem zwischen Groß/Kleinschreibung vermutet).
2. **UI-Logik:** Einheiten vom Typ "Allgemein" werden aktuell noch als "Leerstand" betitelt, wenn kein Mieter zugeordnet ist.

---

## 3. Nächste Schritte (Backlog)

1. **Diagnose & Fix:** Prüfung des Daten-Mappings via Diagnose-Script (Kommen Daten vom Google Sheet an? In welchem Format (Groß/Kleinschreibung) kommen sie an? Wo genau bleibt der Ladevorgang hängen?) in `data-service.js` (Initialisierung des State).
2. **Plausibilitäts-Check:** Einbau einer Warnung in der UI, wenn der neue Zählerstand niedriger ist als der letzte Wert aus `Zaehler_Staende`.
3. **UI-Feinschliff:** Differenzierung zwischen "Allgemein" und "Leerstand" basierend auf der Einheit-Bezeichnung oder einem Flag.
4. **Integrationstest:** Vollständiger Durchlauf: Erfassung -> Google Sheet Check (beide Tabellen).

---

**Anmerkung:** Die Konsistenz zwischen `ui-service.js` (erwartet englische Funktionsnamen & Kleinschreibung) und `data-service.js` wurde wiederhergestellt.

---

## 📌 Stand: 2026-03-02
**Status:** Phase 1 (Infrastruktur) nahezu abgeschlossen. Datenmodell finalisiert.

### 1) Projektziel & Fokus
- **Ziel:** Zentrale Cloud-Verwaltung für **mehrere Mehrfamilienhäuser (MFH)**.
- **Skalierung:** Pro Objekt bis zu 15 Wohneinheiten (WE) und 3 Gewerbeeinheiten (GE).
- **Plattform:** macOS/iOS Browser (Safari-optimiert).
- **Kern-Features:** Objektwahl, Mieterübersicht, Zählerstandserfassung (KW, WW, Strom).
- **Prinzip:** Vanilla JS (ES6 Module) mit Google Sheets als Backend (GET/POST).

### 2) Architektur & Files
- **index.html:** Zentrale Einstiegsseite. Beinhaltet das Grundlayout und die Container für die dynamischen Views.
- **NEU:** **app.js:** (Main Entry) Initialisiert die App, lädt die initialen Daten über den Cloud-Service und steuert das Routing/Modul-Setup. (ToDo)
- **config.js:** Zentrale Konfiguration (API-URLs, Sheet-IDs, statische Parameter).
- **cloud-service.js:** Schnittstelle zum Google Apps Script (GET/POST). Kernfunktion: `loadAllDataFromCloud` und `sendDataToCloud`.
- **data-service.js:** Das "Gehirn". Hält den aktuellen State im Speicher. Filtert Daten nach der aktuellen Objekt-Wahl (Multi-Objekt-Logik).
- **ui-service.js:** (In Überarbeitung) Generiert HTML-Fragmente dynamisch. Verantwortlich für den Objekt-Umschalter und die Darstellung der Einheiten/Mieter.
- **NEU:** **utils.js:** Hilfsfunktionen für kaufmännische Rundung, Währungsformatierung und Datumsvalidierung. (ToDo)
- **style.css:** Responsives Design, optimiert für die mobile Nutzung auf iOS (Safari).
- **NEU:** `tests/`: Verzeichnis für automatisierte Unit-Tests. (ToDo)

### 3) Datenmodell (Relational / Google Sheets)
Die Daten liegen in einem Google Sheet mit folgenden Tabellen (kurze Zusammenfassung, Orientierung am `DATA_MODEL.md` (7 Tabellen)):
- **Objekte:** Stammdaten der verschiedenen Häuser (z.B. Adresse, Baujahr).
- **Einheiten:** Zuordnung zu Objekten, inkl. m² und Typ (WE/GE).
- **Mieter:** Aktive Mietverhältnisse pro Einheit (Soll-Miete, NK-Pauschale).
- **Zaehler_Staende:** Historie der Werte für KW, WW, Strom, Öl je Einheit/Haus.
- **Parameter:** Kostensätze (Strom/Wasser/Öl) mit `gueltig_ab/bis` pro Objekt.
- **Fixkosten:** Jährliche Kosten (Grundsteuer, Versicherung etc.) pro Objekt.
- **Transaktionen:** Log-Datei für alle Eingänge (Miete, Zähler-Updates) mit Zeitstempel.

- Zentraler Anker: `einheit_id` & `objekt_id`.
- Transaktions-Log (Spalten A-I) für lückenlose Historie. 
  

### 4) Roadmap & Fortschritt
- [x] **Phase 1: Infrastruktur & Modellierung**
  - [x] Cloud-Anbindung (GET/POST Basis).
  - [x] Finales Datenmodell (`DATA_MODEL.md`).
  - [x] Dynamische UI für Objektwahl.
  - [>] Google Apps Script an neue Datenstruktur anpassen.
  - [ ] Dateistruktur anpassen (idealerweise nach Implementierung Unit Tests)
- [ ] **Phase 2: Schreibzugriff & Stabilität (TDD-Fokus)**
  - [ ] Update `Code.gs` für 9-Spalten-Layout.
  - [ ] **Unit-Tests:** Validierung der Zähler-Eingaben (Neu >= Alt).
  - [ ] **Unit-Tests:** Korrektes Mapping der Sheet-Daten in den State.
  - [ ] Bugfix: Zähler-Speicherung (aktuell nur Zeitstempel).
- [ ] **Phase 3: Mieter-Management & Validierung**
  - [ ] UI für Mieter-Einzug/Auszug.
  - [ ] Plausibilitäts-Check-Service (Warnung bei Extrem-Verbräuchen).
- [ ] **Phase 4: Finanzen & Abrechnung**
  - [ ] Mieteingangs-Maske (Soll/Ist).
  - [ ] PDF-Export für Nebenkostenabrechnung.

### 5) Qualitätssicherung (Testing-Strategie)
* Wir nutzen kleine Test-Skripte, um die Logik der `services` zu prüfen, ohne die echte Cloud zu belasten (Mocking).
* Ziel: "Green-Light-Check" vor jedem Major-Commit.
  
### 6) Gesammelte To-Dos (Backlog)
- [ ] **Objekt-Umschalter:** UI-Komponente zur Wahl des Hauses (Daten-Refresh im UI-Service).
- [ ] **Mieteingang 2.0:** Erweiterung von Checkbox auf **Betrags-Logik** (Soll/Ist/Teilzahlung).
- [ ] **Zähler-Validierung:** Plausibilitätsprüfung (Neu-Wert >= Alt-Wert).
- [ ] **Dashboard-View:** "Wer hat diesen Monat noch nicht gezahlt?" (Haus-übergreifend oder pro Objekt).
- [ ] **Historie:** Pro Einheit die letzten 12 Monate Mietstatus anzeigen.

### 7) Offene Fragen / Entscheidungen
- **Gewerbe-Besonderheit:** Wie behandeln wir die MwSt.-Ausweisung für die 3 GE in der Abrechnung?
- **Sync-Indikator:** Brauchen wir eine optische Anzeige, ob die Daten gerade mit dem Google Sheet synchronisiert werden?

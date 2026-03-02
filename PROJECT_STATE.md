# PROJECT_STATE - Hausverwaltung (MR-ops-007)

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

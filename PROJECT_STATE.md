# PROJECT_STATE - Hausverwaltung (MR-ops-007)

## 📌 Stand: 2026-02-28

### 1) Projektziel & Fokus
- **Ziel:** Zentrale Cloud-Verwaltung für **mehrere Mehrfamilienhäuser (MFH)**.
- **Skalierung:** Pro Objekt bis zu 15 Wohneinheiten (WE) und 3 Gewerbeeinheiten (GE).
- **Plattform:** macOS/iOS Browser (Safari-optimiert).
- **Prinzip:** Vanilla JS (ES6 Module) mit Google Sheets als Backend.

### 2) Architektur & Files
- **index.html:** Zentrale Einstiegsseite. Beinhaltet das Grundlayout und die Container für die dynamischen Views.
- **app.js:** (Main Entry) Initialisiert die App, lädt die initialen Daten über den Cloud-Service und steuert das Routing/Modul-Setup.
- **config.js:** Zentrale Konfiguration (API-URLs, Sheet-IDs, statische Parameter).
- **cloud-service.js:** Schnittstelle zum Google Apps Script (GET/POST). Kernfunktion: `loadAllDataFromCloud` und `sendDataToCloud`.
- **data-service.js:** Das "Gehirn". Hält den aktuellen State im Speicher. Filtert Daten nach der aktuellen Objekt-Wahl (Multi-Objekt-Logik).
- **ui-service.js:** (In Überarbeitung) Generiert HTML-Fragmente dynamisch. Verantwortlich für den Objekt-Umschalter und die Darstellung der Einheiten/Mieter.
- **utils.js:** Hilfsfunktionen für kaufmännische Rundung, Währungsformatierung und Datumsvalidierung.
- **style.css:** Responsives Design, optimiert für die mobile Nutzung auf iOS (Safari).

### 3) Datenmodell (Relational / Google Sheets)
Die Daten liegen in einem Google Sheet mit folgenden Tabellen:
- **Objekte:** Stammdaten der verschiedenen Häuser (z.B. Adresse, Baujahr).
- **Einheiten:** Zuordnung zu Objekten, inkl. m² und Typ (WE/GE).
- **Mieter:** Aktive Mietverhältnisse pro Einheit (Soll-Miete, NK-Pauschale).
- **Zaehler_Staende:** Historie der Werte für KW, WW, Strom, Öl je Einheit/Haus.
- **Parameter:** Kostensätze (Strom/Wasser/Öl) mit `gueltig_ab/bis` pro Objekt.
- **Fixkosten:** Jährliche Kosten (Grundsteuer, Versicherung etc.) pro Objekt.
- **Transaktionen:** Log-Datei für alle Eingänge (Miete, Zähler-Updates) mit Zeitstempel.

### 4) Roadmap & Fortschritt
- [x] Phase 1: Grundgerüst & Cloud-Anbindung (Google Apps Script).
- [>] Phase 2: MVP Stabilisierung (**Fokus: Sauberes Umschalten zwischen Objekten & Mietlogik**).
- [ ] Phase 3: Logik (NK-Abrechnung & Verteilung nach m²).
- [ ] Phase 4: Export & Reporting (Jahresabrechnung PDF).

### 5) Gesammelte To-Dos (Backlog)
- [ ] **Objekt-Umschalter:** UI-Komponente zur Wahl des Hauses (Daten-Refresh im UI-Service).
- [ ] **Mieteingang 2.0:** Erweiterung von Checkbox auf **Betrags-Logik** (Soll/Ist/Teilzahlung).
- [ ] **Zähler-Validierung:** Plausibilitätsprüfung (Neu-Wert >= Alt-Wert).
- [ ] **Dashboard-View:** "Wer hat diesen Monat noch nicht gezahlt?" (Haus-übergreifend oder pro Objekt).
- [ ] **Historie:** Pro Einheit die letzten 12 Monate Mietstatus anzeigen.

### 6) Offene Fragen / Entscheidungen
- **Gewerbe-Besonderheit:** Wie behandeln wir die MwSt.-Ausweisung für die 3 GE in der Abrechnung?
- **Sync-Indikator:** Brauchen wir eine optische Anzeige, ob die Daten gerade mit dem Google Sheet synchronisiert werden?

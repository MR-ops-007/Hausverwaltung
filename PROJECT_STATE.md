# Projekt-Status: Hausverwaltung Prototyp

## 📌 Aktueller Stand (2026-02-27)
Das Projekt wurde erfolgreich von einer flachen Struktur auf ein **relationales Datenmodell** umgestellt. Die Kernlogik für die Cloud-Anbindung und die Datenverwaltung ist implementiert.

## 🏗 Architektur & Files
- `index.html`: Basis-Struktur (muss noch auf neue UI-Logik angepasst werden).
- `config.js`: Enthält statische Konfigurationen.
- `cloud-service.js`: Kommuniziert mit Google Apps Script (GET/POST). Nutzt nun `loadAllDataFromCloud`.
- `data-service.js`: Das "Gehirn". Verwaltet den State für Objekte, Einheiten, Mieter, Zähler, Parameter und Fixkosten.
- `ui-service.js`: (In Überarbeitung) Soll die dynamische Anzeige basierend auf der Objektwahl steuern.

## 📊 Datenmodell (Relational)
Die Daten liegen in einem Google Sheet mit folgenden Tabellen:
1. **Objekte**: Stammdaten der Häuser.
2. **Einheiten**: Physische Wohnungen inkl. m².
3. **Mieter**: Aktive Mietverhältnisse (Soll-Miete, NK-Pauschale).
4. **Zaehler_Staende**: Letzte bekannte Werte für KW, WW, Strom, Öl.
5. **Parameter**: Kostensätze (Strom/Wasser/Öl) mit `gueltig_ab/bis` pro Objekt.
6. **Fixkosten**: Jährliche Kosten (Grundsteuer, etc.) pro Objekt.
7. **Transaktionen**: Log-Datei für alle Eingänge aus der App.

## 🔄 Cloud-Schnittstelle (Google Apps Script)
- **GET**: Liefert alle Tabellen als gebündeltes JSON-Objekt.
- **POST**: Schreibt Transaktionen (Typ: Zählerstand oder Miete) in das Transaktionen-Blatt.

## 📝 Nächste Schritte (TODO)
- [ ] **QA Test**: Verifizieren, ob das Datenpaket korrekt im Browser ankommt (über GitHub Pages).
- [ ] **UI-Update**: Umstellung der App auf "Objekt-Auswahl zuerst".
- [ ] **Calc-Service**: Einführung einer `calc-service.js` zur Live-Berechnung von Verbrauchskosten.
- [ ] **Miet-Modul**: Eingabemaske für (Teil-)Zahlungen der Miete.

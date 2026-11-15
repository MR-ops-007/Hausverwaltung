# P6.3 – Historisches Soll bei Mieterhöhungen

## Ziel

Ein historischer Mietmonat darf nicht mit dem heute aktuellen Vertragssoll bewertet
werden. Die Mieteingangsansicht verwendet deshalb den zum jeweiligen Monat geltenden
Sollbetrag aus der append-only Tabelle `Mietanpassungen`.

## Fachliche Regel

1. Der Betrag aus `nachher_json.soll_gesamt` gilt ab `wirksam_ab` einschließlich.
2. Für Monate vor der ersten dokumentierten Anpassung gilt der Betrag aus
   `vorher_json.soll_gesamt`.
3. Bei älteren `STAMMDATEN`-Einträgen ohne `wirksam_ab` wird zunächst
   `nachher_json.letzte_anpassung`, ersatzweise `erfasst_am`, als Fallback verwendet.
   Dieser Fall ist eine technische Übergangslösung. Die UI markiert das unsichere
   Übergangsfenster vom vorherigen dokumentierten Wirksamkeitsmonat (beziehungsweise
   dem Mietbeginn) bis zum geschätzten Monat; Monate danach gelten als sicher.
4. Historienzeilen ohne Änderung des monatlichen Sollbetrags werden ignoriert.
5. Die Regel gilt an einer Stelle für Monatsstatus, Dialoganzeige und
   Überzahlungsverteilung. Bestehende Zahlungseingänge werden nicht rückwirkend verändert.
6. Für Monate ab dem letzten vergangenen Historieneintrag gilt der aktuelle Betrag aus
   `Vertraege` als Gegenwartswahrheit. Weicht er vom letzten `nachher_json.soll_gesamt`
   ab, bleibt der aktuelle Betrag sichtbar und die UI meldet `Historie prüfen`.
7. Ein zukünftiges `wirksam_ab` darf dagegen die späteren Monate vorbereiten und wird
   nicht durch den aktuellen Betrag überschrieben.
8. Ist am Vertrag `letzte_anpassung` befüllt, aber keine passende Historienzeile geladen,
   zeigt die UI `Anpassung ohne Historieneintrag` nur ab dem dokumentierten
   Anpassungsmonat statt den fehlenden Verlauf still zu ignorieren.

### Bedeutung von `letzte_anpassung`

Im Datenmodell bezeichnet `Vertraege.letzte_anpassung` den Monat der letzten
vertraglichen Mietpreisänderung, nicht das Datum des Zugangs eines
Erhöhungsschreibens. Bei einer dokumentierten Indexanpassung kommt der belastbare
Wirksamkeitsmonat aus `Mietanpassungen.wirksam_ab`. Bei älteren
`STAMMDATEN`-Zeilen ohne dieses Feld ist `nachher_json.letzte_anpassung` nur ein
geschätzter Kompatibilitätswert; ersatzweise wird der Erfassungsmonat verwendet.
Aus diesem Fallback werden keine zusätzlichen gesetzlichen Vorlauf- oder
Nachlauffristen abgeleitet. Eine solche Frist wäre nur vertretbar, wenn Zugang und
rechtliche Wirksamkeit separat gespeichert würden.

Die Historie wird chronologisch nach Wirksamkeitsmonat verarbeitet. Bei mehreren
Anpassungen gilt jeweils der zuletzt wirksame Betrag.

## Sichtbare Hinweise

Historische Monate tragen den Hinweis `historisches Soll`. Der Status-Tooltip erklärt:
`Historischer Sollbetrag aus dem dokumentierten Änderungsverlauf.` Bei einem Fallback ohne
explizites `wirksam_ab` ergänzt die UI `Der Wirksamkeitsmonat ist geschätzt` nur im
unsicheren Übergangsfenster. Fehlt der Vorher-Snapshot, erscheint `Die Sollhistorie ist
unvollständig` nur vor dem ersten Wirksamkeitsmonat. Weicht der aktuelle Vertrag vom
letzten historischen Nachher-Snapshot ab, erscheint `Historie prüfen`. Fehlt die passende
Historienzeile, wird der Hinweis erst ab dem am Vertrag dokumentierten Anpassungsmonat
angezeigt.
Der CSV-Vorschlag vergleicht den Eingang mit dem Soll des erkannten Mietmonats, nicht nur
mit dem heutigen Vertragssoll.

## Bewusste Grenzen

- Das Paket legt keine rechtliche Prüfung einer Mieterhöhung fest.
- Es erzeugt keine Erinnerung und versendet keine Nachricht; das ist P6.6.
- Es ändert keine Verträge, Mietanpassungen oder Zahlungseingänge.
- Nachforderungen, Guthabenumbuchungen und die Behandlung von Erstattungen im Saldo
  bleiben separate fachliche Folgepakete.
- Neue Datenbank- oder Apps-Script-Spalten sind nicht erforderlich.
- Die Wirksamkeit wird auf Monatsgranularität ausgewertet. Ein Datum innerhalb eines Monats
  gilt für den gesamten Monat; eine tagesgenaue anteilige Miete ist nicht Bestandteil von P6.3.

## Automatisierte Abnahme

Die Tests in `tests/payment-ui.test.js` decken ab:

- Vorher-/Nachher-Sollbetrag vor und ab einem Wirksamkeitsmonat.
- Überzahlungsverteilung über eine dokumentierte Mieterhöhung hinweg.
- Ignorieren einer Vertragsänderung ohne Solländerung.
- Legacy-Fallback über `letzte_anpassung`.
- Sichtbare Kennzeichnung des historischen Solls in der Monatsmatrix.
- Aktueller Vertragssatz nach dem letzten vergangenen Eintrag und Warnung bei einer
  Inkonsistenz zwischen Vertrag und Historie.
- Zukünftiger Wirksamkeitsmonat sowie Fallback-Kennzeichnung bei fehlendem `wirksam_ab`.
- CSV-Vorschlag für einen Eingang vor einer Mieterhöhung.
- Begrenztes geschätztes Übergangsfenster bei mehreren Anpassungen.
- Zeitlich begrenzte Hinweise für unvollständige oder fehlende Historie.
- Anpassungsdatum am Vertrag ohne passende Historienzeile.

Die vollständige Testausgabe und die abschließenden Prüfsummen werden nach dem Lauf in
`PROJECT_STATE.md` und im Pull Request dokumentiert.

## Durchgeführte Prüfung auf dem Branch

- `npm test`: 499 Tests in 20 Testdateien grün.
- `npm run check:frontend-assets`: 19 lokale Assets vorhanden.
- `node --check payment-ui.js`: grün.
- `git diff --check`: grün.
- Lokale Browserprüfung: TEST · Entenhausen geladen, Mieteingänge geöffnet, Objekt
  `Test für Produktivsystem` gewählt; Zusammenfassung, Vertragsstatus, Monatsmatrix,
  Status-Tooltips und CSV-Bereich wurden ohne Darstellungsfehler geladen.
- Kein Apps-Script-Deployment erforderlich, da ausschließlich die bestehende Leselogik
  im Frontend erweitert wurde.

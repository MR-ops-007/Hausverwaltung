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
   Dieser Fall ist eine technische Übergangslösung und wird in der UI als historisches
   Soll gekennzeichnet.
4. Historienzeilen ohne Änderung des monatlichen Sollbetrags werden ignoriert.
5. Die Regel gilt an einer Stelle für Monatsstatus, Dialoganzeige und
   Überzahlungsverteilung. Bestehende Zahlungseingänge werden nicht rückwirkend verändert.

Die Historie wird chronologisch nach Wirksamkeitsmonat verarbeitet. Bei mehreren
Anpassungen gilt jeweils der zuletzt wirksame Betrag.

## Sichtbare Hinweise

Historische Monate tragen den Hinweis `historisches Soll`. Der Status-Tooltip erklärt:
`Historischer Sollbetrag aus dem dokumentierten Änderungsverlauf.` Im Hilfetext der
Mieteingänge wird außerdem beschrieben, dass Anpassungen ab ihrem Wirksamkeitsmonat
berücksichtigt werden.

## Bewusste Grenzen

- Das Paket legt keine rechtliche Prüfung einer Mieterhöhung fest.
- Es erzeugt keine Erinnerung und versendet keine Nachricht; das ist P6.6.
- Es ändert keine Verträge, Mietanpassungen oder Zahlungseingänge.
- Nachforderungen, Guthabenumbuchungen und die Behandlung von Erstattungen im Saldo
  bleiben separate fachliche Folgepakete.
- Neue Datenbank- oder Apps-Script-Spalten sind nicht erforderlich.

## Automatisierte Abnahme

Die Tests in `tests/payment-ui.test.js` decken ab:

- Vorher-/Nachher-Sollbetrag vor und ab einem Wirksamkeitsmonat.
- Überzahlungsverteilung über eine dokumentierte Mieterhöhung hinweg.
- Ignorieren einer Vertragsänderung ohne Solländerung.
- Legacy-Fallback über `letzte_anpassung`.
- Sichtbare Kennzeichnung des historischen Solls in der Monatsmatrix.

Die vollständige Testausgabe und die abschließenden Prüfsummen werden nach dem Lauf in
`PROJECT_STATE.md` und im Pull Request dokumentiert.

## Durchgeführte Prüfung auf dem Branch

- `npm test`: 488 Tests in 20 Testdateien grün.
- `npm run check:frontend-assets`: 19 lokale Assets vorhanden.
- `node --check payment-ui.js`: grün.
- `git diff --check`: grün.
- Lokale Browserprüfung: TEST · Entenhausen geladen, Mieteingänge geöffnet, Objekt
  `Test für Produktivsystem` gewählt; Zusammenfassung, Vertragsstatus, Monatsmatrix,
  Status-Tooltips und CSV-Bereich wurden ohne Darstellungsfehler geladen.
- Kein Apps-Script-Deployment erforderlich, da ausschließlich die bestehende Leselogik
  im Frontend erweitert wurde.

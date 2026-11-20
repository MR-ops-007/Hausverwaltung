# P6.6 – Erinnerungen für Mieterhöhungen

## Ziel

Die Vertragsansicht zeigt je Vertrag eine interne Prüferinnerung für mögliche
Mieterhöhungen. Die Übersicht hilft bei der Terminplanung und macht fehlende
Stammdaten sichtbar. Sie ist keine rechtliche Bewertung, ersetzt keine Prüfung
des Mietvertrags und ändert keine Vertrags- oder Sollwerte automatisch.

## Anzeige

Die Übersicht enthält:

- Anpassungsart: normale Mieterhöhung, Indexmiete oder Staffelmiete.
- letzte dokumentierte Anpassung, sofern vorhanden.
- früheste interne Prüfung, sofern sie aus den Daten abgeleitet werden kann.
- Status: `Keine Anpassung dokumentiert`, `Noch nicht möglich`,
  `Prüfung fällig` oder `Prüfung erforderlich`.
- einen direkten Link zum ausgewählten Vertrag.

Die Liste wird für die aktuell laufenden Verträge des ausgewählten Objekts
angezeigt und nach Einheit und Mieter sortiert. Beendete historische Verträge
bleiben über die Vertragsauswahl bearbeitbar, erzeugen aber keine laufende
Erinnerung. Ein Klick auf „Vertrag anzeigen“ öffnet die Vertragsbearbeitung
für genau diesen Vertrag, scrollt dorthin und setzt den Tastaturfokus auf den
Editor.

## Arbeitsablauf und Prüfabschluss

Die Übersicht unterscheidet zwischen Handlungsbedarf und Information:

- `Prüfung fällig` und `Prüfung erforderlich` stehen als offene Fälle oben.
- `Noch nicht möglich` und `Keine Anpassung dokumentiert` bleiben erreichbar,
  sind aber in „Weitere Verträge anzeigen“ eingeklappt.
- Ein globaler Hinweis zählt offene Fälle über alle Objekte. Damit muss nicht
  jedes Objekt einzeln geöffnet werden, um den Arbeitsvorrat zu erkennen.
- Eine fällige Prüfung kann mit „Prüfung als erledigt markieren“ bestätigt
  werden. Sie erscheint danach unter „Prüfungen abgeschlossen“ und kann dort
  wieder geöffnet werden.

Seit P6.6c liegt dieser Status im eigenen Sheet `MieterhöhungsPrüfungen` und ist
damit geräte- und browserübergreifend verfügbar. Gespeichert werden Vertrag,
Erinnerungs-Signatur, Status, Abschlussdatum, erfassendes Gerät beziehungsweise
Profil, optionale Notiz und `wiedervorlage_ab`. Die UI akzeptiert den Abschluss
für die Rollen `admin` und `erfassen`; Vertragsdaten selbst werden dadurch nicht
geändert. Ändert sich die Signatur, wird der Abschluss automatisch ungültig.
Am Datum der Wiedervorlage erscheint der Fall wieder als offen. Das ist keine
rechtliche Bestätigung und keine automatische Mieterhöhung.

## Zentrale Berechnung

Die Berechnung liegt ausschließlich in
`apps-script/ContractService.js` unter
`contractService.rentIncreaseReminder()`. Die UI rendert nur das Ergebnis.
Damit werden spätere Ansichten und Tests nicht mit einer zweiten Terminlogik
ausgestattet.

Die Berechnung nutzt in dieser Reihenfolge:

1. den letzten dokumentierten Historieneintrag aus `Mietanpassungen`;
2. das Feld `letzte_anpassung` am Vertrag als Fallback;
3. bei einer fehlenden Anpassung das `start_datum` des Vertrags.

Ein Historieneintrag ohne `wirksam_ab` wird über `nachher_json.letzte_anpassung`
oder ersatzweise `erfasst_am` datiert und als geschätzt gekennzeichnet. Ein
fehlendes oder ungültiges Startdatum bleibt immer `Prüfung erforderlich`, auch
wenn ein älteres Anpassungsdatum am Vertrag vorhanden ist. Weicht das
Vertragsdatum von der letzten Historienzeile ab, wird ebenfalls
`Prüfung erforderlich` angezeigt, damit die unvollständige Datenlage nicht wie
ein belastbarer Termin wirkt.

## Fachliche Regeln

### Normale Mieterhöhung

Als konservative interne Orientierung wird zwölf Monate nach Vertragsbeginn
oder der letzten dokumentierten Anpassung geprüft. Gibt es noch keine
Anpassung, wird nach Ablauf dieser ersten zwölf Monate `Prüfung fällig`
angezeigt; vor diesem Termin bleibt der Status `Keine Anpassung dokumentiert`.
Das ist eine technische Erinnerungsregel und keine Aussage darüber, ob eine
Erhöhung rechtlich oder vertraglich zulässig ist.

### Indexmiete

Für eine Indexmiete müssen Index-Basis-Monat, Basiswert und Indexreihe
vorhanden sein. Fehlt eines dieser Felder, erscheint `Prüfung erforderlich`.
Die interne Prüfung liegt frühestens am Jahrestag der relevanten Basis. Liegt
der Jahrestag nicht am ersten Monatstag, wird für die Darstellung der erste
Tag des Folgemonats verwendet. Die bestehende Indexberechnung und ihre
Bestätigungslogik werden dadurch nicht verändert.

### Staffelmiete

Im aktuellen Vertragsmodell gibt es noch keine Staffeltermine. Eine
Staffelmiete wird deshalb nicht geschätzt, sondern als `Prüfung erforderlich`
angezeigt. Ein späteres Terminmodell ist ein eigenes Folgepaket.

### Unvollständige Daten

Fehlen Startdatum, letzte Anpassung und ein verwertbarer Historienbezug, kann
kein Termin abgeleitet werden. Die Anzeige nennt den fehlenden Grund. Verträge
fallen dabei nicht aus der Übersicht.

## Bewusste Grenzen

- Es gibt keine E-Mail-, Push- oder Kalenderbenachrichtigung.
- Es wird keine Mieterhöhung vorgeschlagen, gespeichert oder automatisch
  angewendet.
- Die Berechnung berücksichtigt keine rechtliche Prüfung, Kappungsgrenzen,
  Fristenberechnung im Einzelfall oder örtliche Sonderregeln.
- Die Monatsgranularität der Soll-Historie bleibt unverändert.
- Die vollständige Staffeltermin-Verwaltung und eine spätere Erinnerung an
  konkrete Staffelstufen bleiben Folgeaufgaben.
- Die Wiedervorlage liegt zwölf Monate nach dem Abschlussdatum. Der 29. Februar
  wird dabei auf den 28. Februar des Folgejahres begrenzt.
- Der Prüfstatus ist ein Arbeits- und Nachvollziehbarkeitsstatus, keine
  rechtliche Entscheidung. Eine Notiz kann den fachlichen Ausgang der Prüfung
  festhalten; Vertrags- oder Mietbeträge werden nicht automatisch verändert.

## Testabdeckung

Automatisiert geprüft werden:

- Vertrag ohne Anpassungshistorie mit sichtbarem Status und abgeleitetem
  frühestem Termin; nach Ablauf der ersten zwölf Monate wird er fällig.
- zukünftiger erster Prüfungstermin.
- beendeter historischer Vertrag ohne Eintrag in der laufenden Erinnerungsübersicht.
- dokumentierte Indexanpassung mit fälligem Termin.
- Staffelmiete ohne Terminmodell.
- fehlendes Startdatum, fehlende Indexbasis und Vertragsdatum ohne
  Historienzeile.
- Historieneintrag ohne `wirksam_ab` mit Kennzeichnung als geschätzt.
- Darstellung der Übersicht, Statushinweis, rechtlicher Vorbehalt und Link
  zum Vertrag.
- globaler Reminder über mehrere Objekte, eingeklappte Informationsfälle,
  Fokus-/Scroll-Sprung zum Vertragseditor sowie Markieren und Wiederöffnen einer
  fälligen Prüfung über den Backend-Status.
- Backend-Schema, Rollenfreigabe, Abschluss, Idempotenz, Wiederöffnung,
  Signaturänderung, zwölfmonatige Wiedervorlage und Schaltjahr.

Vor TEST und PROD muss `prepareContractSchema()` einmal ausgeführt werden. Die
Funktion legt das Blatt `MieterhöhungsPrüfungen` an. Danach muss die neue
Apps-Script-Version bereitgestellt und die Capability
`rent_increase_review_writes: true` mit einem autorisierten Profil geprüft
werden. Ein Rollback auf 4.8.14 lässt die neue UI-Schreibaktion bewusst
gesperrt; Lesen der übrigen Vertragsdaten bleibt möglich.

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
- interne Wiedervorlage, frühestes Erhöhungsverlangen und früheste angenommene
  Wirksamkeit getrennt, sofern sie aus den Daten abgeleitet werden können.
- bei Wohnraum Kappungsgrenze und Vergleichsmiete getrennt; daraus wird noch
  kein maximaler Erhöhungsbetrag berechnet.
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
Beim Abschluss können eine eigene Wiedervorlage und eine Notiz erfasst werden.
Ohne Datum gilt der Standard von zwölf Monaten; ein vergangener Termin wird
abgewiesen.

## UI-Abnahmekriterien

Diese Prüfung ist vor jedem Release mit Änderungen an `contract-ui.js`,
`style.css` oder der Vertragsansicht im echten Browser zu wiederholen. Ein
grüner Unit-Testlauf reicht dafür nicht aus.

- Desktop, mindestens 1280 px breit: Die Übersicht bleibt lesbar; bei drei
  oder vier Spalten laufen keine Texte, Status-Pillen, Eingabefelder oder
  Buttons über die Kartenkante.
- Breiter Desktop, mindestens 1600 px: Vier Karten dürfen nebeneinander
  erscheinen, aber jede Karte bleibt mindestens 320 px breit.
- Mobil, 390 px breit: Die Karten stehen einspaltig. Wiedervorlage und Notiz
  stehen untereinander; beide Felder und alle Buttons bleiben innerhalb der
  Karte. Es entsteht kein horizontaler Seiten-Scroll.
- Lange Inhalte: `Gustav Gans / Trick Duck`, lange Hinweise und der Status
  `Prüfung erforderlich` umbrechen lesbar und verdecken keine Folgekarten.
- Unterschiedliche Karteninhalte: Karten ohne Eingabefelder bleiben kompakt;
  Textzeilen werden nicht vertikal auf die Höhe einer längeren Nachbarkarte
  auseinandergezogen.
- Interaktion: Datum, Notiz, „Vertrag anzeigen“ und „Prüfung als erledigt
  markieren“ sind bedienbar. Der Vertragssprung scrollt zum Editor und setzt
  den Fokus sichtbar.
- Ladezustand: Wird die Ansicht vor Abschluss des Hintergrundladens geöffnet,
  zeigt sie einen verständlichen Ladezustand. Nach Abschluss ist kein erneutes
  Öffnen der Ansicht erforderlich.
- Cache: Der Browser lädt nach einer CSS- oder Script-Änderung tatsächlich
  die neue Version; Versionsparameter der geänderten Assets werden angepasst.

Für die Geometrieprüfung gilt zusätzlich: Bei jedem Eingabefeld muss die rechte
Kante innerhalb der rechten Kante seiner Karte liegen. Diese Prüfung wurde bei
der ursprünglichen Vier-Spalten-Darstellung verletzt und ist deshalb ein
eigener Abnahmepunkt.

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

Die Regelbasis wird zentral mit dem Ergebnis geliefert und in der Signatur des
Prüfabschlusses gespeichert. Dazu gehören Rechtsbereich, Erhöhungstyp,
Prüftermine, Kappungsgrenze, Quelle und Gültigkeit, Vergleichsmiete und das
aktuelle Nettokalt-Soll. Ändert sich diese Basis, wird ein vorheriger Abschluss
wieder offen.

## Fachliche Regeln

### Normale Mieterhöhung

Als interne Arbeitsvorlage wird elf Monate nach Vertragsbeginn oder der letzten
relevanten normalen Mieterhöhung geprüft. Das früheste Erhöhungsverlangen wird
mit zwölf Monaten ausgewiesen. Die früheste angenommene Wirksamkeit wird für
normale Mieterhöhungen als Beginn des **dritten Kalendermonats** nach diesem
Verlangen angezeigt. Gibt es noch keine Anpassung, wird nach Ablauf des
internen Prüftermins `Prüfung fällig` angezeigt; vor diesem Termin bleibt der
Status `Keine Anpassung dokumentiert`. Das ist eine technische Orientierung,
keine rechtliche Einzelfallprüfung. Die Darstellung orientiert sich für die
Wirksamkeit an § 558b Abs. 1 BGB; die konkrete Zulässigkeit muss weiterhin
fachlich geprüft werden.

### Indexmiete

Für eine Indexmiete müssen Index-Basis-Monat, Basiswert und Indexreihe
vorhanden sein. Fehlt eines dieser Felder, erscheint `Prüfung erforderlich`.
Die interne Prüfung liegt elf Monate nach der relevanten Basis; Erhöhungsverlangen
und angenommene Wirksamkeit werden separat und monatsweise ausgewiesen. Für die
Indexmiete wird die Wirksamkeit als Beginn des **übernächsten Monats** nach dem
Zugang der Erklärung dargestellt, entsprechend § 557b Abs. 3 BGB. Die
bestehende Indexberechnung und ihre Bestätigungslogik werden dadurch nicht
verändert.

### Staffelmiete

Im aktuellen Vertragsmodell gibt es noch keine Staffeltermine. Eine
Staffelmiete wird deshalb nicht geschätzt, sondern als `Prüfung erforderlich`
angezeigt. Ein späteres Terminmodell ist ein eigenes Folgepaket.

### Kappungsgrenze und Vergleichsmiete

Die Kappungsgrenze wird objektbezogen aus `Objekte` gelesen. Unterstützt werden
`kappungsgrenze_prozent`, `kappungsgrenze_gueltig_ab`,
`kappungsgrenze_gueltig_bis`, `kappungsgrenze_quelle` und
`kappungsgrenze_geprueft_am`. Eine konfigurierte 15-%-Grenze gilt nur im
angegebenen Zeitraum. Fehlt eine zeitlich passende Konfiguration, wird 20 % als
sichtbar gekennzeichneter Standardwert angezeigt; das ist keine Feststellung,
dass am Ort tatsächlich 20 % gelten. Die Vergleichsmiete wird über
`vergleichsmiete_monatlich` und `vergleichsmiete_pro_qm` separat geführt. Ohne
Vergleichsdaten wird kein scheinpräziser maximaler Erhöhungsbetrag berechnet.

### Gewerbe

Gewerbeeinheiten werden nicht mit der Wohnraumlogik bewertet. Für sie gilt als
interne Arbeitsregel eine Prüfung spätestens alle fünf Jahre, konfigurierbar
über `gewerbe_pruefung_intervall_jahre`. Auch Gewerbeverträge ohne dokumentierte
Mieterhöhung bleiben damit im Prüfvorrat.

### Relevante Erhöhungsarten

Normale Mieterhöhungen, Indexmieten und Staffelmieten werden getrennt bewertet.
Modernisierungs-, Betriebs- und Heizkostenanpassungen setzen die normale
Mieterhöhungsfrist nicht automatisch zurück. Fehlt der Erhöhungstyp, erscheint
`Prüfung erforderlich`, statt stillschweigend `Normal` anzunehmen.

### Unvollständige Daten

Fehlen Startdatum, letzte Anpassung und ein verwertbarer Historienbezug, kann
kein Termin abgeleitet werden. Die Anzeige nennt den fehlenden Grund. Verträge
fallen dabei nicht aus der Übersicht.

## Bewusste Grenzen

- Es gibt keine E-Mail-, Push- oder Kalenderbenachrichtigung.
- Es wird keine Mieterhöhung vorgeschlagen, gespeichert oder automatisch
  angewendet.
- Die Berechnung ist keine rechtliche Prüfung. Sie berücksichtigt keinen
  individuellen Zugangsnachweis und keine örtliche Sonderregel außerhalb der
  ausdrücklich konfigurierten Kappungsgrenze. Die rechtliche Basis muss fachlich
  geprüft werden.
- Die Monatsgranularität der Soll-Historie bleibt unverändert.
- Die vollständige Staffeltermin-Verwaltung und eine spätere Erinnerung an
  konkrete Staffelstufen bleiben Folgeaufgaben.
- Die Wiedervorlage liegt standardmäßig zwölf Monate nach dem Abschlussdatum,
  kann je Abschluss individuell gesetzt werden, aber nicht in der Vergangenheit.
  Der 29. Februar wird dabei auf den letzten gültigen Februartag begrenzt.
- Der Prüfstatus ist ein Arbeits- und Nachvollziehbarkeitsstatus, keine
  rechtliche Entscheidung. Eine Notiz kann den fachlichen Ausgang der Prüfung
  festhalten; Vertrags- oder Mietbeträge werden nicht automatisch verändert.

## Testabdeckung

Automatisiert geprüft werden:

- Vertrag ohne Anpassungshistorie mit sichtbarem Status und abgeleitetem
  Prüftermin; nach Ablauf der internen elf Monate wird er fällig.
- zukünftiger erster Prüfungstermin.
- beendeter historischer Vertrag ohne Eintrag in der laufenden Erinnerungsübersicht.
- dokumentierte Indexanpassung mit fälligem Termin.
- Staffelmiete ohne Terminmodell.
- fehlendes Startdatum, fehlende Indexbasis und Vertragsdatum ohne
  Historienzeile.
- Historieneintrag ohne `wirksam_ab` mit Kennzeichnung als geschätzt.
- fehlender Erhöhungstyp, Sonderanpassungen ohne Zurücksetzen der normalen Frist,
  Gewerbeprüfung mit fünfjährigem Standardintervall sowie 15-%- und 20-%-Regelbasis.
- getrennte Termine für interne Prüfung, Erhöhungsverlangen und Wirksamkeit,
  Vergleichsmiete ohne automatische Kappungsberechnung sowie individuelle
  Wiedervorlage und gespeicherte Prüfnotiz.
- Darstellung der Übersicht, Statushinweis, rechtlicher Vorbehalt und Link
  zum Vertrag.
- globaler Reminder über mehrere Objekte, eingeklappte Informationsfälle,
  Fokus-/Scroll-Sprung zum Vertragseditor sowie Markieren und Wiederöffnen einer
  fälligen Prüfung über den Backend-Status.
- Backend-Schema einschließlich Objekt-Regelspalten, Rollenfreigabe, Abschluss,
  Idempotenz, Wiederöffnung, Signaturänderung, individuelle Wiedervorlage,
  Notiz und Schaltjahr.

Vor TEST und PROD muss `prepareContractSchema()` einmal ausgeführt werden. Die
Funktion legt das Blatt `MieterhöhungsPrüfungen` und die optionalen Regelspalten
im Blatt `Objekte` an. Danach muss die neue
Apps-Script-Version bereitgestellt und die Capability
`rent_increase_review_writes: true` mit einem autorisierten Profil geprüft
werden. Ein Rollback auf 4.8.14 lässt die neue UI-Schreibaktion bewusst
gesperrt; Lesen der übrigen Vertragsdaten bleibt möglich.

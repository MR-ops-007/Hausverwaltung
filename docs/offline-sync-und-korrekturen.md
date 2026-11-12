# Offline-Sync, Konflikte und Korrekturen (Backend 4.8.4)

Stand: 2026-10-30

## Ziel und Nutzungsszenario

Die Hausverwaltung wird von einer Person genutzt. Zählerstände werden teilweise im Keller erfasst, wo die Mobilfunkverbindung schlecht oder gar nicht vorhanden ist. Zahlungen werden nur im Büro bei stabiler Verbindung erfasst und sind nicht Teil der Offline-Unterstützung.

Qualitätsziel: **Kein stiller Datenverlust, keine falsche Speicherbestätigung, keine Abweichung zwischen angeblich gespeicherten und tatsächlich vorhandenen Zählerständen.**

- Ein erfasster Wert wird entweder vom Backend bestätigt oder nachweislich auf dem Gerät zwischengespeichert. Gelingt beides nicht, erscheint eine Fehlermeldung und die Eingabe bleibt offen.
- Ist ein Wert noch nicht in der Datenbank, ist das jederzeit oben auf der Seite sichtbar. Ein Button sendet ihn erneut.
- Korrekturen sind nachvollziehbar (Grund, alter und neuer Wert) und nur bewusst möglich.

## Zustände eines Werts

| Zustand | Bedeutung | Wo sichtbar |
| :--- | :--- | :--- |
| lokal erfasst / `pending` | Nur in der Queue auf diesem Gerät, noch nicht übertragen oder nicht bestätigt | Anzeige „noch nicht in der Datenbank gespeichert“ |
| `rejected` | Vom Backend abgelehnt (z. B. fachlicher Konflikt), wartet auf deine Entscheidung | Anzeige mit Grund und Aktionen |
| bestätigt | Das Backend hat `success` gemeldet | Datenbestand und „Letzter Stand“ |

Nur bestätigte Werte stehen im Datenbestand der App (`dataService.state.zaehlerstaende`) und in der Anzeige „Letzter Stand“. Lokal erfasste Werte werden dort **nicht** eingetragen. Für die Plausibilitätsprüfung beim nächsten Erfassen werden noch nicht übertragene Werte (`pending`) als Vergleichswert berücksichtigt, damit z. B. ein zweiter Offline-Wert nicht gegen einen veralteten Stand geprüft wird.

## Identität eines Zählerstands: `stand_id`

Die UI bildet die `stand_id` beim Erfassen aus dem Zähler und der Minute des Zeitstempels:

```text
ST_{zaehler_id}_{YYYY-MM-DD HH:mm}
```

Sie entsteht auf dem Gerät und bleibt bei jedem Wiederholen gleich (sie liegt im gespeicherten Queue-Eintrag). Das Backend bildet bei fehlender `stand_id` dieselbe ID (4.6.4). Die Wiederholung desselben Eintrags ist dadurch gefahrlos (siehe unten).

## Verhalten des Backends

Für jeden Eintrag eines `ZAEHLERSTAND_NEU` wird die `stand_id` mit dem Bestand verglichen:

| Fall | Ergebnis |
| :--- | :--- |
| `stand_id` noch nicht vorhanden | Zeile wird angelegt |
| `stand_id` vorhanden, **gleicher** Wert | Als bereits gespeichert gewertet (Erfolg, keine neue Zeile). Das macht Wiederholungen aus der Queue gefahrlos, auch wenn die erste Antwort verloren ging. |
| `stand_id` vorhanden, **anderer** Wert | `CONFLICT`, es wird nichts geschrieben (auch keine unkritischen Einträge derselben Anfrage) |
| dieselbe `stand_id` mit verschiedenen Werten in einer Anfrage | `DOPPELTE_STAND_ID`, nichts wird geschrieben |

Werte werden numerisch verglichen (`1500`, `"1500,0"` und `1500.0` sind gleich). Die Antwort bei Erfolg enthält `angelegt`, `bereits_vorhanden` und `ueberschrieben`.

### Korrekturfenster (Minutenwechsel)

Ein Tippfehler um 13:50:55 und die Korrektur um 13:51:04 haben verschiedene `stand_id`s. Deshalb prüft das Backend zusätzlich, ob es für denselben Zähler einen Wert gibt, der höchstens **15 Minuten** (`KORREKTUR_FENSTER_MINUTEN`) vor dem neuen Zeitstempel liegt:

| Fall | Ergebnis |
| :--- | :--- |
| Wert im Fenster, **gleicher** Wert | Als bereits gespeichert gewertet |
| Wert im Fenster, **anderer** Wert | `CONFLICT` mit `art: NAHE_ABLESUNG`, `alte_zeit`, `minuten_abstand` |
| kein Wert im Fenster | normale neue Ablesung |

`art` ist `GLEICHE_MINUTE` bei identischer `stand_id` und `NAHE_ABLESUNG` bei einem Wert im Fenster. Du entscheidest:

- **Überschreiben** (mit Pflichtgrund): Die vorhandene Zeile bekommt den neuen Wert, ihr Zeitstempel und ihre `stand_id` bleiben. Es entsteht keine zweite Zeile.
- **Als neue Ablesung speichern** (nur bei `NAHE_ABLESUNG`): Die App sendet `neueAblesung: true`, der Wert wird zusätzlich angelegt, die vorhandenen Werte bleiben unverändert.

Das Fenster gilt nur nach vorn. Die Konstante muss in `apps-script/Code.gs` und `ui-service.js` (`KORREKTUR_FENSTER_MINUTEN`) gleich sein.

### Überschreiben mit Grund und Protokoll

Der Client sendet dieselbe Anfrage erneut mit `ueberschreiben: { grund: "…" }`. Der Grund ist Pflicht (mindestens 3 Zeichen), sonst `GRUND_FEHLT` und es wird nichts geändert.

**Reihenfolge:** Das Backend schreibt zuerst das Protokoll, leert den Schreibpuffer (`SpreadsheetApp.flush()`) und ändert danach den Zählerstand. Schlägt das Protokollieren fehl, bleibt der Zählerstand unverändert, es gibt also keinen Wert ohne Protokoll. Schlägt (sehr unwahrscheinlich) das Ändern nach dem Protokollieren fehl, steht eine Korrektur im Protokoll, die nicht angewendet wurde. Der Wiederholungsversuch protokolliert sie erneut (zwei Protokollzeilen mit gleichen Werten). Google Sheets bietet hier keine Transaktion, dieser Ablauf ist die einfachste Lösung ohne stille Lücke.

Blatt `Zaehlerstand_Korrekturen` (wird beim ersten Überschreiben automatisch angelegt):

| Spalte | Inhalt |
| :--- | :--- |
| `korrigiert_am` | Zeitpunkt, `YYYY-MM-DD HH:mm:ss`, Europe/Berlin |
| `stand_id` | betroffener Zählerstand |
| `zaehler_id` | betroffener Zähler |
| `alter_wert` / `neuer_wert` | Wert vor und nach der Korrektur |
| `grund` | vom Nutzer angegebener Grund |
| `quelle` | Quelle des neuen Eintrags (`UI`) |
| `art` | `GLEICHE_MINUTE` oder `NAHE_ABLESUNG` |

### Lock-Timeout und Leseansicht

- Kann das Backend die Sperre nicht innerhalb von 10 Sekunden erhalten, antwortet es `code: LOCK_TIMEOUT`, `transient: true`. Der Client behandelt das als vorübergehend.
- Neue Leseansicht `zaehlerstaende`: liefert nur das Blatt `Zaehlerstaende`. Die App liest damit nach dem Speichern oder Synchronisieren gezielt nach, ohne alle Blätter zu laden. Ein Backend ohne diese Ansicht (4.8.3) liefert stattdessen alle Blätter, was ebenfalls funktioniert.

## Ablauf in der App

### Speichern

1. Die UI vergleicht den neuen Wert mit dem **letzten Wert vor dem Korrekturfenster** (bestätigte und noch nicht übertragene Werte). Werte aus den 15 Minuten davor zählen nicht als Vergleichswert, sonst würde eine Korrektur nach unten fälschlich als Fehler blockiert.
2. Plausibilitätswarnungen (`validation-service.js`) müssen wie bisher bestätigt werden.
3. Die Anfrage geht an das Backend. **Nur `status: success` gilt als gespeichert.**
   - Ist die Antwort leer, nicht lesbar oder hat einen unbekannten Status, ist unklar, ob gespeichert wurde. Der Zählerstand wird dann in die Queue gelegt und später erneut gesendet (sicher dank `stand_id`). Andere Typen gelten als nicht bestätigt und es erscheint ein Fehler.
   - Bei Netzwerkfehler, Zeitlimit (20 s), HTTP 5xx/429 oder `LOCK_TIMEOUT` wird der Wert in die Queue gelegt.
   - Meldet der Browser „offline“, wird der Wert direkt in die Queue gelegt.
4. **Queue-Speichern wird geprüft:** Der Eintrag gilt nur als offline gesichert, wenn er nach dem Schreiben im `localStorage` wieder gelesen werden kann. Sonst erscheint „… weder gesendet noch zwischengespeichert …“ (`QUEUE_WRITE_FAILED`), die Eingabe bleibt offen und es wird keine Erfolgsmeldung gezeigt.
5. Bei `CONFLICT` erscheint **immer** eine Warnung mit altem und neuem Wert (bei `NAHE_ABLESUNG` mit „vor N Min.“). Danach Grund abfragen und überschreiben, oder bei `NAHE_ABLESUNG` als zusätzliche Ablesung speichern.
6. Nach bestätigtem Speichern liest die App die Zählerstände aus der Datenbank nach (Ansicht `zaehlerstaende`). So entsteht kein Phantomwert bei „bereits vorhanden“ und das Überschreiben landet in der richtigen Zeile. Ist das Nachladen nicht möglich, wird nur lokal nachgeführt, wenn die Antwort `bereits_vorhanden: 0` belegt.

### Offline-Queue

Die Queue liegt im `localStorage` des Geräts (`offline_queue`). Einträge: `pending` oder `rejected`. Ein Eintrag verlässt die Queue nur nach bestätigtem `success` oder durch **Verwerfen** durch dich.

| Situation beim Senden | Verhalten |
| :--- | :--- |
| Netzwerkfehler, Zeitlimit, HTTP 5xx/429, `LOCK_TIMEOUT` | bleibt `pending`, Rest bleibt liegen, begrenzte Wiederholung |
| Antwort leer, nicht lesbar oder unbekannter Status | bleibt `pending` (nicht abgelehnt), begrenzte Wiederholung |
| Schlüssel abgelehnt | bleibt `pending`; automatisch kein Dialog, beim Button wird der Schlüssel abgefragt |
| Backend lehnt ab (`CONFLICT`, Validierung) | wird `rejected` mit Grund, blockiert den Rest nicht |

**Abgelehnte Einträge werden nie von selbst erneut gesendet.** Ein fachlicher Konflikt bleibt sichtbar, bis du ihn bewusst auflöst (Überschreiben mit Grund, als neue Ablesung speichern) oder verwirfst. Für abgelehnte Einträge ohne Konflikt gibt es je Eintrag „Erneut versuchen“ (z. B. nach Behebung einer Ursache).

### Wann wird gesendet?

`navigator.onLine` ist in schlechten Netzen unzuverlässig (Verbindung kann abreißen, obwohl `true` gemeldet wird, und ein `online`-Ereignis kann ausbleiben). Deshalb gibt es mehrere Auslöser, aber kein dauerndes Polling:

- **App-Start:** Beim Laden der Hintergrunddaten wird zuerst die Queue gesendet und danach gelesen. Die geladenen Daten zeigen so den Stand nach der Synchronisation.
- **`online`-Ereignis** des Browsers.
- **Zurückkehren zur App** (Tab wieder sichtbar): löst einen begrenzten Versuch aus, auch wenn der Browser „offline“ meldet.
- **Begrenzte Wiederholung:** Scheitert eine Übertragung vorübergehend, wird nach 30 Sekunden, 2 Minuten und 5 Minuten erneut versucht. Diese zeitgesteuerten Versuche ignorieren `navigator.onLine` (der Wert kann fälschlich `false` sein). Danach nur noch über die anderen Auslöser. Jeder neue Auslöser setzt die Zählung zurück. Gibt es keine offenen Einträge, wird nichts gesendet.
- **Button „Jetzt erneut senden“:** versucht es auch dann, wenn der Browser „offline“ meldet (der Versuch entscheidet).
- Jeder Abruf hat ein **Zeitlimit** (Schreiben 20 s, Lesen 60 s). Ein hängender Abruf blockiert die Queue deshalb nicht dauerhaft.

Nach bestätigter Übertragung liest die App die Zählerstände gezielt nach.

### Anzeige „nicht gespeichert“

Unter der Statuszeile erscheint, solange Einträge offen sind: „⚠️ N Werte noch nicht in der Datenbank gespeichert“, ggf. mit Hinweis auf abgelehnte Einträge.

- **Jetzt erneut senden** (nur bei offenen Einträgen) versucht alle `pending`-Einträge.
- **Details anzeigen** listet Zähler, Wert, Zeitpunkt, Status und Grund. Bei einer Eingabe mit mehreren Zählerständen sind die Konflikte markiert („⚠️ Konflikt“) und die Anzahl steht dabei („3 Zählerstände, davon 1 mit Konflikt“). Je Eintrag: **Verwerfen**, bei `CONFLICT` zusätzlich **Überschreiben …** und bei `NAHE_ABLESUNG` **Als neue Ablesung speichern**, bei anderen Ablehnungen **Erneut versuchen**.

### Mehrere Zählerstände in einer Eingabe

Alle Zählerstände einer Eingabe werden gemeinsam gesendet. Hat einer davon einen Konflikt, schreibt das Backend **nichts** von dieser Eingabe, auch die Werte ohne Konflikt nicht. Die Entscheidung gilt deshalb für die ganze Eingabe. Damit nichts unbeabsichtigt verloren geht, nennen die Dialoge die Zahlen:

- **Überschreiben:** „Zusätzlich werden N weitere Zählerstände dieser Eingabe (ohne Konflikt) gespeichert.“
- **Als neue Ablesung speichern:** „Alle N Zählerstände dieser Eingabe …“
- **Verwerfen:** Der Dialog listet alle Zählerstände des Eintrags, markiert die Konflikte und warnt, dass die Werte ohne Konflikt ebenfalls verloren gehen. Erst nach Bestätigung wird verworfen.

Ein Aufteilen der Eingabe (nur den konfliktbehafteten Wert separat behandeln) ist nicht vorgesehen: Bei Einzelnutzung und wenigen Zählern pro Eingabe wäre der Mehraufwand größer als der Nutzen.

### Beschädigte Queue

Lässt sich der Inhalt von `offline_queue` (oder der alten Liste `offline_queue_failed`) nicht lesen, weil er kein gültiges JSON oder keine Liste ist, gilt das **nicht** als leere Queue:

- Die Daten bleiben unverändert im Speicher liegen und werden nie überschrieben.
- Oben auf der Seite erscheint dauerhaft „❌ Die gespeicherte Offline-Queue ist beschädigt …“, auch ohne weitere Einträge.
- Neue Werte lassen sich so lange nicht offline zwischenspeichern. Das Speichern meldet `QUEUE_CORRUPT` mit Hinweis, es gibt keine Erfolgsmeldung, die Eingabe bleibt offen.
- **Rohdaten anzeigen** zeigt den gespeicherten Text zum Kopieren.
- **Sichern und zurücksetzen** arbeitet in zwei Phasen, auch wenn `offline_queue` und `offline_queue_failed` gleichzeitig beschädigt sind:
  1. Alle beschädigten Listen werden unter `<Schlüssel>_defekt_<Kennung>` gesichert und durch Zurücklesen geprüft. Misslingt eine Sicherung, bleiben **alle Originale unverändert**; schon angelegte Sicherungskopien sind harmlos und werden in der Meldung genannt.
  2. Erst danach werden die Originale entfernt. Misslingt das bei einer Liste, meldet die App genau, was gesichert und zurückgesetzt wurde und was noch beschädigt ist („Teilweise abgeschlossen …“). Ein erneutes „Sichern und zurücksetzen“ schließt den Rest ab (die Sicherung ist wiederholbar).
  Die angezeigte Meldung beschreibt immer den tatsächlichen Zustand. Nach vollständigem Abschluss ist die Queue wieder nutzbar. Die Sicherungen bleiben im Browser-Speicher und sind in den Entwicklerwerkzeugen unter „Local Storage“ einsehbar.

### Frühere Formate

Einträge aus Frontend-Ständen vor 4.8.4 (rohe Payloads in `offline_queue`, abgelehnte Einträge in `offline_queue_failed`) werden beim ersten Lesen übernommen. Die alte Liste wird erst gelöscht, **nachdem** die übernommene Queue nachweislich gespeichert ist. Gelingt das Speichern nicht, bleibt die alte Liste erhalten und die Übernahme wird beim nächsten Lesen wiederholt. Die Einträge haben dabei stabile IDs. Ist eine der beiden Listen beschädigt, gilt der Abschnitt „Beschädigte Queue“.

## Einspielen (Reihenfolge einhalten)

1. **Backend 4.8.4 deployen** (`Code.gs` ersetzen, neue Version der bestehenden Bereitstellung). Ein älteres Frontend funktioniert weiter. Konflikte erscheinen dort als Fehlermeldung. Hinweis: Auch eine echte zweite Ablesung innerhalb von 15 Minuten löst diese Meldung aus und lässt sich erst mit dem neuen Frontend bestätigen.
2. **Frontend mergen**, Pages-Deployment abwarten, Seite hart neu laden.
3. **Prüfen:**
   - Zähler im Testbereich speichern, dieselbe Minute mit anderem Wert: Warnung, Grund, danach Wert geändert und Zeile im Blatt `Zaehlerstand_Korrekturen`.
   - Dasselbe mit einer Minute Abstand: Warnung „vor 1 Min.“, Überschreiben ersetzt die ältere Zeile; alternativ „Als neue Ablesung speichern“ legt eine zweite Zeile an.
   - Zwei Zähler gemeinsam erfassen, bei einem davon einen Konflikt erzeugen: Die Dialoge nennen die Zahlen, „Verwerfen“ listet beide Werte.
   - Flugmodus ein (Seite vorher laden und geöffnet lassen), Wert speichern: Meldung „noch NICHT in der Datenbank“, Anzeige oben. Flugmodus aus: Eintrag wird gesendet (spätestens nach dem Button oder der Wiederholung), Anzeige verschwindet, der Wert steht im Sheet.
4. Danach CHANGELOG-Status von 4.8.4 auf `produktiv` setzen und Git-Tag setzen.

## Rollback

- Backend zurück: In „Bereitstellungen verwalten“ die vorherige Version (4.8.3) wählen. Das neue Frontend läuft weiter, Wiederholungen aus der Queue sind dann nicht mehr idempotent (mögliche Dopplungen bei einer Wiederholung nach verlorener Antwort).
- Das Blatt `Zaehlerstand_Korrekturen` kann bleiben oder gelöscht werden. Es wird beim nächsten Überschreiben neu angelegt.

## Grenzen (bewusst nicht gelöst)

- **Neuladen ohne Internet wird nicht unterstützt.** Die App hat keinen Service Worker und keinen Offline-Cache. Wer die Seite im Keller ohne Verbindung neu lädt (oder wenn das Betriebssystem den Tab beendet und neu laden muss), sieht „Fehler beim Laden“ und kann dort nicht erfassen. **Die Seite muss vor dem Keller mit Verbindung geladen sein und geöffnet bleiben.** Die offene Queue bleibt dabei im `localStorage` erhalten und wird beim nächsten erfolgreichen Laden angezeigt und gesendet. Ein Service Worker mit Offline-Erfassung wäre ein eigenes Vorhaben.
- Die Queue liegt im Browser-Speicher des jeweiligen Geräts. Löscht der Browser Websitedaten (manuell oder bei längerer Nichtnutzung, z. B. Safari auf iOS), gehen offene Einträge verloren. Offene Einträge deshalb zeitnah übertragen.
- Korrigieren lässt sich nur innerhalb von **15 Minuten** nach dem letzten Wert des Zählers. Später entsteht ein zweiter Wert am Tag (ein späteres Überschreiben ist nicht vorgesehen).
- Zwei echte Ablesungen desselben Zählers innerhalb von 15 Minuten lösen jedes Mal die Warnung aus; „Als neue Ablesung speichern“ bestätigt das.
- Mieteingänge verwenden ab dem P6/P7-Arbeitsstand denselben bestätigungspflichtigen
  Schreibweg wie andere Transaktionen. Bei einer vorübergehenden Netzwerkstörung darf
  eine Zahlung in die bestehende Offline-Queue gelangen; sie gilt erst nach Backend-
  Bestätigung als gespeichert. Gleiche `zahlung_id`s sind im gehärteten Backend 4.8.10
  idempotent; Stornos werden gegen die Originalzahlung geprüft.
  Das Eingangsdatum und der fachliche `mietmonat` werden getrennt gespeichert; dadurch
  kann eine verspätete Zahlung einem offenen Vormonat zugeordnet werden. Kautionen bleiben
  außerhalb der Monatsmiete, Erstattungen werden negativ erfasst.
  CAMT/MT940 und automatische Bankanbindung sind nicht Teil des CSV-MVP.
- Es gibt keine Benutzerverwaltung: Im Protokoll steht kein Name, nur die Quelle. Gleichzeitige Änderungen mehrerer Personen sind nicht Teil des Szenarios.
- **Anforderung an die spätere Verbrauchs-Plausibilität („Sprung“):** Mehrere Werte desselben Zählers am selben Tag dürfen nicht allein deshalb auffallen, weil ein Zahlendreher korrigiert wurde. Die Prüfung sollte pro Zähler und Tag den jeweils letzten Wert bewerten. Noch nicht umgesetzt.

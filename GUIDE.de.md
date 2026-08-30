# Anleitung: Laufbursche EPF unlock

> **Machbarkeitsstudie.** Dieses Werkzeug zeigt, was das Bluetooth-Protokoll der EPF-E-Scooter
> (ePowerFun) technisch hergibt. Es ist kein fertiges Produkt. Fehlerfreier Betrieb wird nicht
> versprochen, es gibt keinerlei Gewährleistung. Was du hier tust, tust du auf eigenes Risiko und nur
> am eigenen Fahrzeug.

## 1. Was du brauchst

Alles passiert im Browser über Web Bluetooth: verbinden, Live-Werte lesen, Tempolimits setzen,
Fahrstufe schalten, Fahrzeug sperren beziehungsweise entsperren. Es gibt nichts zu installieren.
Gebraucht wird:

**Ein Browser, der Web Bluetooth kann.**

- **iOS:** der Browser **Bluefy** (kostenlos im App Store). Safari und jeder andere iOS-Browser laufen
  auf der Safari-Engine, die überhaupt kein Web Bluetooth hat.
- **Android oder Desktop:** **Chrome** oder ein anderer Chromium-Browser. Web Bluetooth ist eingebaut,
  kein Extra-Browser nötig.

**Ein EPF-E-Scooter (ePowerFun).** Die offizielle ePowerFun-App und die Uniscooter-App teilen sich
denselben BLE-Kern, deshalb spricht diese Seite beide mit demselben Protokoll an. Nicht jedes Modell
kann jede Funktion über Bluetooth, die Seite zeigt nur, was sie am Fahrzeug wirklich lesen oder setzen
kann.

---

## 2. Kein Modell wählen

Anders als beim SoFlow-Werkzeug gibt es hier kein Modell-Dropdown. EPF und Uniscooter nutzen ein
gemeinsames Protokoll, die Seite stellt also nichts ein. Du tippst nur auf Verbinden und wählst deinen
E-Scooter im Auswahldialog des Browsers.

---

## 3. Verbinden

1. Öffne die Seite in Bluefy oder Chrome.
2. Schalte den E-Scooter ein. Er muss ein paar Meter neben dem Handy bleiben.
3. Falls dein E-Scooter ein Passwort verlangt, trage es oben im Feld Passwort ein. Sonst lass es leer.
4. Tippe auf **Verbinden** und wähle deinen E-Scooter in der Auswahl des Browsers.
5. Beobachte die Statusanzeige oben rechts: erst `connecting`, dann `linking`, dann `connected`.

**Android: Standort muss an sein.** Chrome scannt auf Android nur nach Bluetooth, wenn die
Standortdienste (GPS) eingeschaltet sind und Chrome die Berechtigung Standort beziehungsweise Geräte
in der Nähe hat. Sonst bleibt die Geräteliste leer, obwohl der E-Scooter direkt daneben steht.
Schließe außerdem die ePowerFun-App vorher ganz (aus dem App-Wechsler wischen), sonst hält sie die
Verbindung und der E-Scooter sendet kein Signal mehr, das der Browser sehen kann.

Nach dem Verbinden liest die Seite von selbst die Controller-Info, die Seriennummer sowie die
Parameter und fragt den Zustand der weiteren Einstellungen ab (NFC, Blinkerton, Passwortschutz,
Antriebstyp). Das allererste Verbinden braucht immer die Auswahl des Browsers, das ist eine
Sicherheitsregel, die keine Verknüpfung überspringen kann.

---

## 4. Tempolimit setzen und testen

In der Karte **Tempolimit** stehen vier Werte: Eco, Comfort, Sport sowie Tempomat, jeweils ein Byte in
km/h.

1. Trage in der gewünschten Fahrstufe den Wert in km/h ein. Unter den Feldern siehst du den fertigen
   Frame als Vorschau.
2. Tippe auf **Tempolimits schreiben**. Die Seite sendet die Werte an den E-Scooter.

Wie weit das geht: Der Regler der Hersteller-App reicht nur bis 20 km/h (bei manchen Modellen 22) und
schickt am oberen Anschlag selbst den Wert 22. Bis 22 ist also belegt. Diese Seite lässt dich höhere
Werte eintragen, ob der Controller sie fährt oder intern abriegelt, zeigt aber erst der Test.

**So testest du, ob der E-Scooter den Wert wirklich fährt:**

1. Such dir einen sicheren, freien Ort auf privatem Gelände, kein Verkehr. Helm auf.
2. Fahr kurz Vollgas und merk dir, bei welcher km/h-Zahl der E-Scooter abriegelt. Das ist dein
   Ausgangswert.
3. Setze einen Wert leicht darüber, zum Beispiel 2 bis 3 km/h mehr und tippe auf Tempolimits schreiben.
4. Fahr wieder Vollgas und beobachte die Kachel **Geschwindigkeit**. Steigt sie über den vorherigen
   Riegel? Dann nimmt der Controller den Wert an.
5. Wiederhole das in kleinen Schritten. Ab welchem Wert es nicht mehr weiter geht, ist der harte Deckel
   der Firmware.
6. Ein hoher Zahlenwert macht den E-Scooter nicht schneller, als Motor und Akku hergeben. Er zeigt nur,
   ob der Controller ihn annimmt.

Melde dein Ergebnis mit dem kopierten Log (Abschnitt 9): Modell, Firmware, gesetzter Wert sowie die
erreichte Live-Geschwindigkeit.

---

## 5. Fahrstufe setzen

Wähle in der Karte **Einstellungen** die Fahrstufe 1 (Eco), 2 (Comfort) oder 3 (Sport) und tippe auf
Senden. Jede Stufe hat ihr eigenes Tempolimit aus Abschnitt 4.

---

## 6. Fahrzeug sperren und entsperren

Das ist die **Wegfahrsperre beziehungsweise der Diebstahlschutz** des E-Scooters, NICHT die
Geschwindigkeit. In der Karte Einstellungen steht der Schalter Wegfahrsperre. Gesperrt stellt den
E-Scooter ab, entsperrt gibt ihn frei. Der Schalter reist im selben Frame wie die anderen Basiswerte.

---

## 7. Weitere Einstellungen

In der Karte **Weitere Einstellungen** liegen Komfort-Funktionen. Ihr aktueller Zustand wird beim
Verbinden vom E-Scooter gelesen, bis dahin steht ein Strich statt eines erfundenen Werts:

- **Frontlicht** an oder aus.
- **Ambientelicht** (Deko-LED) an oder aus.
- **Tempomat** an oder aus.
- **Anfahrmodus** (Zero-Start: aus dem Stand anfahren statt erst nach Anschieben) an oder aus.
- **Einheit** zwischen km/h und mph umschalten.
- **Rollername** ändern (der Name, der im Bluetooth-Dialog erscheint).
- **Passwort** setzen sowie den Passwortschutz ein- oder ausschalten.
- **NFC** ein oder aus, dazu gespeicherte Karten löschen.
- **Blinkerton** an oder aus.
- **Antriebstyp** (interner Antriebsmodus des Controllers, modellabhängig).

Diese Funktionen haben nichts mit der Geschwindigkeit zu tun. Ein neues Passwort lässt sich nur setzen,
nicht auslesen, deshalb ist das Feld dafür leer.

---

## 8. Live-Werte lesen

Sobald Daten ankommen, füllen sich die Kacheln (Geschwindigkeit, Akku, Spannung, Strom, Leistung,
Controller- sowie Motortemperatur, Tages- sowie Gesamtkilometer, Fahrstufe, Wegfahrsperre,
Fehlercode). Der Log zeigt zusätzlich die rohen Bytes als Hex. Nicht jedes Modell liefert jedes Feld,
dann bleibt dort ein Strich. Die erweiterten Controller-Parameter erscheinen in der eigenen Karte,
sie sind vorerst nur lesbar.

Jedes gesendete Kommando erscheint ebenfalls im Log, blau gesendet und braun empfangen. Ein Echo
heißt nur, dass der E-Scooter den Befehl angenommen hat, nicht dass er den Wert auch fährt.

---

## 9. Sauber testen und Ergebnis melden

Teste ausschliesslich am eigenen Gerät auf privatem Gelände. Der Log unten ist ein vollständiger
Mitschnitt (jedes gesendete sowie empfangene Byte). Mit **Log kopieren** bekommst du den ganzen
Mitschnitt als Text, mit **Diagnose** listest du alle Bluetooth-Geräte plus die GATT-Dienste auf.

Probleme oder Erfolge bitte als [GitHub-Issue](https://github.com/Laufbursche42/epf-unlock/issues)
melden. Häng den kopierten Log an, dann sieht man genau, was gesendet sowie empfangen wurde.

---

## 10. Verschlüsselung

Es gibt keine. Anders als bei manchen anderen Scootern ist hier weder AES noch ein rollierendes Secret
im Spiel: die binären Frames sind Klartext, gesichert nur durch eine CRC-16/MODBUS. Der einzige
Zugangsschutz ist das optionale Klartext-Passwort (`AT+PWD`). Du musst nichts einstellen.

---

## 11. Grenzen, die man kennen sollte

- Die drei Werte sind die Tempolimits der Fahrstufen, kein Sonder-Freischalt-Parameter. Bis 22 km/h
  ist belegt (so weit geht die Hersteller-App selbst), alles darüber ist Versuch und kann von der
  Firmware abgeriegelt sein.
- Die erweiterten Controller-Parameter sind nur lesbar, der genaue Schreibweg ist noch nicht
  nachgebaut.
- Es gibt hier kein Firmware-Flashen. Die ePowerFun-App macht ein Firmware-Update über Bluetooth,
  dieser Weg ist hier aber bewusst nicht umgesetzt.

---

## 12. Recht

Das Anheben der Höchstgeschwindigkeit hebt die Drossel auf. Die ABE erlischt damit und der Betrieb auf
öffentlichen Wegen ist dann nicht erlaubt. Nutzung ausschliesslich am eigenen Gerät und auf eigenes
Risiko.

# Anleitung: Laufbursche EPF unlock

> **Nur-Lesen-Build.** Dieses Werkzeug liest den EPF-Scooter (ePowerFun) aus: Live-Telemetrie,
> Parameter und Geräte-Info. Es schreibt nichts auf den Scooter. Alle Tuning-Bedienelemente werden
> zwar angezeigt, sind aber deaktiviert, weil der Schreibweg zwar aus der App dokumentiert, aber an
> keinem echten Gerät bestätigt ist.

## 1. Was du brauchst

Alles passiert im Browser über Web Bluetooth: verbinden, Live-Werte lesen, Parameter und Einstellungen
anschauen, Geräte-Info abfragen. Dieser Build schreibt nichts auf den Scooter. Es gibt nichts zu
installieren. Gebraucht wird:

**Ein Browser, der Web Bluetooth kann.**

- **iOS:** der Browser **Bluefy** (kostenlos im App Store). Safari und jeder andere iOS-Browser laufen
  auf der Safari-Engine, die überhaupt kein Web Bluetooth hat.
- **Android oder Desktop:** **Chrome** oder ein anderer Chromium-Browser. Web Bluetooth ist eingebaut,
  kein Extra-Browser nötig.

**Ein EPF-E-Scooter (ePowerFun).** Die offizielle ePowerFun-App und die Uniscooter-App teilen sich
denselben BLE-Kern, deshalb spricht diese Seite beide mit demselben Protokoll an. Nicht jedes Modell
liefert jedes Feld, die Seite zeigt nur, was sie am Fahrzeug wirklich lesen kann.

---

## 2. Verbinden

1. Öffne die Seite in Bluefy oder Chrome.
2. Schalte den E-Scooter ein. Er muss ein paar Meter neben dem Handy bleiben.
3. Falls dein E-Scooter ein Passwort verlangt, trage es oben im Feld Passwort ein. Sonst lass es leer.
   Das Passwort wird nur gebraucht, damit ein geschützter Scooter sich auslesen lässt.
4. Tippe auf **Verbinden** und wähle deinen E-Scooter in der Auswahl des Browsers.
5. Beobachte die Statusanzeige oben rechts: erst `connecting`, dann `linking`, dann `connected`.

**Android: Standort muss an sein.** Chrome scannt auf Android nur nach Bluetooth, wenn die
Standortdienste (GPS) eingeschaltet sind und Chrome die Berechtigung Standort beziehungsweise Geräte
in der Nähe hat. Sonst bleibt die Geräteliste leer, obwohl der E-Scooter direkt daneben steht.
Schließe außerdem die ePowerFun-App vorher ganz (aus dem App-Wechsler wischen), sonst hält sie die
Verbindung und der E-Scooter sendet kein Signal mehr, das der Browser sehen kann.

Nach dem Verbinden liest die Seite von selbst die Controller-Info, die Seriennummer sowie die
Parameter und fragt den Zustand der weiteren Einstellungen ab (NFC, Blinkerton, Passwortschutz,
Antriebstyp).

---

## 3. Live-Werte lesen

Sobald Daten ankommen, füllen sich die Kacheln (Geschwindigkeit, Akku, Spannung, Strom, Leistung,
Controller- sowie Motortemperatur, Tages- sowie Gesamtkilometer, Fahrstufe, Wegfahrsperre). Der Log
zeigt zusätzlich die rohen Bytes als Hex. Nicht jedes Modell liefert jedes Feld, dann bleibt dort ein
Strich.

---

## 4. Einstellungen und Tempolimits (nur lesen)

Die Karte **Tempo sperren / entsperren** sowie die Karte **Einstellungen** zeigen die aktuell vom
Scooter gelesenen Werte: die vier Fahrstufen-Limits (Eco, Comfort, Sport, Tempomat), den Rücklesewert
der Werksdrossel sowie die Schalter (Frontlicht, Ambientelicht, Tempomat, Anfahrmodus, Einheit,
Wegfahrsperre) und die Fahrstufe.

Diese Werte werden nur angezeigt. Jedes Bedienelement, das auf den Scooter schreiben würde, ist in
diesem Build ausgegraut, der Grund steht unter jeder Karte und hinter dem `?` in jeder Zeile.

---

## 5. Erweiterte Parameter

Die Karte **Erweiterte Parameter** zeigt Motor- sowie Regelungsparameter aus dem Parameterblock,
dekodiert mit den im Code dokumentierten Skalierungen. Sie sind nur lesbar.

---

## 6. Geräte-Info

Die Karte **Geräte-Info** füllt sich mit Controller-Modell, Hardware, Bootloader, Firmware, UniqueCode
und Seriennummer. Die Abfrage-Knöpfe lesen auf Wunsch mehr: Gerätetyp (`AT+DEVICE?`), UID (`AT+UID`)
und Passwort-Status (`AT+TYPE?`). Das sind Lesezugriffe, deshalb bleiben sie aktiv.

---

## 7. Log und Ergebnis melden

Der Log unten zeigt jeden Frame als rohes Hex, blau gesendet und braun empfangen, das Neueste unten.
Mit **Log kopieren** bekommst du den ganzen Mitschnitt als Text, mit **Log leeren** wird er geleert,
mit **Diagnose** listest du alle Bluetooth-Geräte plus die GATT-Dienste auf.

Probleme oder Befunde bitte als [GitHub-Issue](https://github.com/Laufbursche42/epf-unlock/issues)
melden. Häng den kopierten Log an, dann sieht man genau, was gesendet sowie empfangen wurde.

---

## 8. Verschlüsselung

Es gibt keine. Anders als bei manchen anderen Scootern ist hier weder AES noch ein rollierendes Secret
im Spiel: die binären Frames sind Klartext, gesichert nur durch eine CRC-16/MODBUS. Der einzige
Zugangsschutz ist das optionale Klartext-Passwort (`AT+PWD`).

---

## 9. Recht

Dieser Build schreibt nichts auf den Scooter, er ändert also nichts am Fahrzeug. Zum Hintergrund: Ein
Anheben der Höchstgeschwindigkeit würde die Drossel aufheben, die ABE erlischt und der Betrieb auf
öffentlichen Wegen wäre dann nicht erlaubt. Nutzung ausschließlich am eigenen Gerät und auf eigenes
Risiko.

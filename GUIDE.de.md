# Anleitung: Laufbursche EPF unlock

> **Die Schreib-Frames werden wirklich gesendet.** Dieses Werkzeug liest den EPF-Scooter (ePowerFun)
> aus (Live-Telemetrie, Parameter, Geräte-Info) und schreibt die dokumentierten Einstellungen. Es gibt
> keine BLE-Verschlüsselung. Das Tempolimit auf 22 km/h anzuheben ist genau das, was die Hersteller-App
> selbst tut; Werte über etwa 22 km/h hängen von einer Firmware-Klemme im Controller ab und werden am
> echten Gerät womöglich nicht übernommen (hardwareseitig unbestätigt). Riskante Schreibvorgänge fragen
> vorher nach. Nur am eigenen Scooter und auf eigenes Risiko.

## 1. Was du brauchst

Alles passiert im Browser über Web Bluetooth: verbinden, Live-Werte lesen, Parameter und Einstellungen
lesen und schreiben, Geräte-Info abfragen. Es gibt nichts zu installieren. Gebraucht wird:

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
   Das Passwort wird nur gebraucht, damit ein geschützter Scooter sich lesen und schreiben lässt. Mit
   dem Haken "Passwort für dieses Gerät merken" bleibt es lokal für das nächste Mal gespeichert.
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

## 4. Einstellungen und Tempolimits

Die Karte **Tempo sperren / entsperren** sowie die Karte **Einstellungen** zeigen die aktuell vom
Scooter gelesenen Werte und lassen sie ändern: die vier Fahrstufen-Limits (Eco, Comfort, Sport,
Tempomat) sowie die Schalter (Frontlicht, Ambientelicht, Tempomat, Anfahrmodus, Einheit, Wegfahrsperre)
und die Fahrstufe gehen über den Monitor-Frame (`0xAB`) raus; die Werksdrossel (Register `0x20`, km/h
mal 10) geht über den RW-Frame (`0x17`) raus. Jedes hat einen eigenen Senden-Knopf, die riskanten
(Tempolimits, Werksdrossel, Wegfahrsperre) fragen vorher nach. Der aktuelle Schalter-Zustand wird beim
Schreiben unverändert übernommen, damit sich nur das eine Feld ändert, das du anfasst. Beachte die
Firmware-Klemme: die Hersteller-App geht selbst bis 22 km/h, Werte darüber werden vom Controller
womöglich ignoriert (das `?` in jeder Zeile erklärt es).

---

## 5. Erweiterte Parameter

Die Karte **Erweiterte Parameter** zeigt Motor- sowie Regelungsparameter aus dem Parameterblock,
dekodiert mit den im Code dokumentierten Skalierungen, und lässt jeden als rohes 16-Bit-Wort über den
RW-Frame (`0x17`) zurückschreiben. Die Register, die die Hersteller-App selbst schreibt (Gasannahme
`0x09`, Bremse `0x0A`, Tempolimit `0x20`), sind mit "app" markiert. Nur Register `0x20` hat eine
dokumentierte Skalierung (km/h mal 10); jeder andere Wert ist ein rohes Wort, weil seine
Schreib-Skalierung nicht dokumentiert ist - das Tool erfindet keine. Darunter erreicht "Beliebiges
Register schreiben" als Escape-Hatch jede Adresse: Adresse und rohes Wort eintragen, der Rest wird zum
RW-Frame gebaut. Ein falscher Wert kann den Controller stören, deshalb wird vorher nachgefragt.

---

## 6. Geräte-Info und weitere Einstellungen

Die Karte **Geräte-Info** füllt sich mit Controller-Modell, Hardware, Bootloader, Firmware, UniqueCode
und Seriennummer. Die Abfrage-Knöpfe lesen auf Wunsch mehr: Gerätetyp (`AT+DEVICE?`), UID (`AT+UID`)
und Passwort-Status (`AT+TYPE?`). Die Karte **Weitere Einstellungen** setzt Name (`AT+NAME`), ein neues
Passwort (`AT+PWDM`), die Passwortpflicht (`AT+TYPE`), NFC (`AT+NFC`, plus Karten löschen `AT+DEL`),
Blinkerton (`AT+TLVOICEOFF`) und Antriebstyp (`AT+DRIVEMODE`).

---

## 7. Log, Rohkonsole und Ergebnis melden

Der Log unten zeigt jeden Frame als rohes Hex, blau gesendet und braun empfangen, das Neueste unten. Er
ist standardmäßig anonymisiert (Bluetooth-Adressen, Seriennummern, Passwörter und rohe Geräte-IDs
werden geschwärzt), damit du ihn gefahrlos teilen kannst; den Haken "Log anonymisieren" nur zum lokalen
Debuggen entfernen. Mit **Log kopieren**, **Log leeren** und **Als .txt speichern** exportierst du den
Mitschnitt, mit dem Frei-senden-Feld schickst du eigene Hex-Bytes oder einen `AT`-Befehl, mit
**Diagnose** listest du alle Bluetooth-Geräte plus die GATT-Dienste auf.

Probleme oder Befunde bitte als [GitHub-Issue](https://github.com/Laufbursche42/epf-unlock/issues)
melden. Häng den kopierten Log an, dann sieht man genau, was gesendet sowie empfangen wurde.

---

## 8. Verschlüsselung

Es gibt keine. Anders als bei manchen anderen Scootern ist hier weder AES noch ein rollierendes Secret
im Spiel: die binären Frames sind Klartext, gesichert nur durch eine CRC-16/MODBUS. Der einzige
Zugangsschutz ist das optionale Klartext-Passwort (`AT+PWD`).

---

## 9. Recht

Dieses Werkzeug schreibt auf den Scooter. Ein Anheben der Höchstgeschwindigkeit hebt die Drossel auf,
die ABE erlischt und der Betrieb auf öffentlichen Wegen wäre dann nicht erlaubt. Nutzung ausschließlich
am eigenen Gerät und auf eigenes Risiko.

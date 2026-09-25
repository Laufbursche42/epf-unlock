# Laufbursche EPF unlock

A static web page that reads EPF (ePowerFun) e-scooters over Web Bluetooth. Connect to your scooter
and, straight from the browser, read the live telemetry, read every controller parameter and setting,
read the device info and follow the raw protocol log. This is a **read-out build**: it writes nothing
to the scooter. Nothing to install: no app store, no signing, no developer account. It runs in
**Bluefy** on iOS and in **Chrome** on Android or desktop.

> **This is a feasibility study.** It exists to show what the ePowerFun Bluetooth protocol makes
> possible, not to be a finished product. The protocol was reconstructed from the official app
> (com.zydtech.epowerfun 1.5.5) and the Uniscooter app (com.zydtech.uniscooter 1.5.0), which share the
> same BLE core. Error-free operation is not promised and there is no warranty of any kind. Whatever
> you do with it, you do at your own risk.
>
> **No tuning in this build.** A write path for speed limits and settings is documented from the app,
> but it is not confirmed on any real device, so every tuning control is shown for context yet
> permanently disabled. See [What it does](#what-it-does).

**Open the web app: [laufbursche42.github.io/epf-unlock](https://laufbursche42.github.io/epf-unlock/)**

Or run it yourself, no build step, no dependencies: clone the repo and serve the folder over a
local HTTP server. Opening `index.html` directly as a `file://` URL will not work, the page fetches
its own documents and browsers block that over `file://`.

```
git clone https://github.com/Laufbursche42/epf-unlock.git
cd epf-unlock
python -m http.server 8000
```

Any static server works. With Node installed, this does the same job:

```
npx serve .
```

Then open the printed address in a browser that supports Web Bluetooth.

**Guide: [Deutsch](GUIDE.de.md) | [English](GUIDE.en.md)** covers everything step by step, from
connecting to the first send.

## One protocol for the whole range

Unlike the SoFlow tool there is no model dropdown here: ePowerFun and Uniscooter share one BLE core
(`com.zydtech.library`), so a single protocol covers the range. The page connects to the data service
`F1F0` and the command service `F2F0` and speaks the same frames regardless of the model. If the
scooter is protected by a password, you enter it once and it is sent as a plain-text `AT+PWD` command.

Not every model exposes every function. The page reads the actual state from the scooter on connect
and shows a dash where a value has not been read yet, rather than a made-up default.

## What it does

This build reads the scooter. Every read path below is active; every write path is documented but
disabled (see [No tuning in this build](#no-tuning-in-this-build)).

Active (read):

- **Connect** by picking the scooter in the browser dialog, with an optional plain-text password
  (`AT+PWD`). The password is an authentication precondition for reading a protected device, so this
  gate stays active.
- **Read the telemetry** the scooter sends back (speed, battery, voltage, current, power, controller
  and motor temperature, trip and total kilometers, ride stage, immobilizer state and the fault code),
  kept fresh by a keep-frame heartbeat.
- **Read the current settings**: ride stage, headlight, ambient light, cruise control, boot mode
  (zero-start), unit and immobilizer state, plus the four ride-stage speed limits (Eco, Comfort,
  Sport, cruise) and the factory limiter read-back. They are shown for viewing only.
- **Read the advanced controller parameters** (max currents, undervoltage protection, PWM frequency,
  motor pole pairs, throttle and brake response and more).
- **Read the device info** with the query buttons: controller model, hardware, bootloader, firmware,
  unique code, serial number, device type (`AT+DEVICE?`), UID (`AT+UID`) and password status
  (`AT+TYPE?`).
- **Follow the raw protocol log**: every frame is logged as plain hex, blue for sent and brown for
  received, newest at the bottom. Copy or clear the log, or list the GATT services with Diagnostics.

### No tuning in this build

The write frames for speed limits, switches, name, password, NFC, drive type and trip reset are
documented from the app bytecode, but none is confirmed on a real ePowerFun device and several
preconditions are still open (custom-head bytes, a firmware clamp above ~22 km/h, factory password
requirement, write-ack parsing, the exact register-0x20 send sequence). In line with the standing rule
"device unknowns stay gated, never invented", every tuning control is shown for context but permanently
disabled. Nothing is written to the scooter.

## Encryption

There is none. Unlike the SoFlow models there is no AES and no rolling secret: the binary frames are
plain text, secured only by a CRC-16/MODBUS, and the only access control is the optional plain-text
password (`AT+PWD`). Nothing to configure.

## Browser support

- **iOS:** the **Bluefy** browser. Safari and every other iOS browser run on the Safari engine, which
  has no Web Bluetooth at all.
- **Android or desktop:** **Chrome** or another Chromium browser (Edge). Web Bluetooth is built in.

There is no OTA firmware flashing here and no LED control. The ePowerFun app does ship firmware over
Bluetooth, but that path is out of scope for this tool.

## Project structure

```
index.html                - the single page: cards, dialogs, per-value help icons
protocol.js               - pure protocol logic: UUIDs, CRC-16/MODBUS, frame builders, parsers
app.js                    - Web Bluetooth glue, connect, decode, UI and the diagnostic log
i18n.js                   - the German and English string table
styles.css                - theme and layout
GUIDE.de.md, GUIDE.en.md  - the step-by-step guide
```

## How it works

- `protocol.js` holds the GATT UUIDs, the CRC-16/MODBUS routine, one builder per outbound frame
  (register read, the monitor/speed-limit frame, the register write, the control and keep frames, and
  the `AT+...` commands) and the parsers for every inbound frame.
- The user picks the scooter, `app.js` connects, subscribes to the two notify characteristics and runs
  the connect sequence: send the password if given, read controller info, serial and the parameter
  block, then query NFC, turn-signal sound, password status and drive type. A keep frame keeps the
  telemetry flowing.
- The read frames (register reads, the control and keep frames and the `AT+...` queries) are written
  to the data or command characteristic; notifications are decoded per frame type and rendered, and
  every frame is logged raw as hex. The write builders stay in `protocol.js` to document the protocol,
  but the UI never calls them in this read-out build.

## Development

No build step and no dependencies. Edit the files and reload the page. Serve locally, Web Bluetooth
needs `https` or `localhost`:

```
python -m http.server 8000
```

New user-facing strings go into both languages in `i18n.js`, once as a `data-t` key in `index.html`.

## Reporting

Found a problem or want to confirm what works on a real scooter? Open a
[GitHub issue](https://github.com/Laufbursche42/epf-unlock/issues). The copy button under the log
gives you the full diagnostic transcript to paste in.

## Legal

This build does not write to the scooter, so it changes nothing on the vehicle. For background: raising
the maximum speed would lift the factory limit, the operating permit (Betriebserlaubnis, ABE) would
then be void and riding the scooter in public traffic would no longer be allowed. Use it on your own
vehicle only. Everything you do with this page is at your own risk.

## License

PolyForm Noncommercial 1.0.0 with two additional terms, in full in [LICENSE.md](LICENSE.md).

## Privacy

Nothing leaves your device but the page load itself. The details are in [PRIVACY.md](PRIVACY.md).

## Trademarks

An independent project, not affiliated with ePowerFun. "ePowerFun" and the model names are trademarks
of their respective owners and are used here only to say which scooters this page works with. See
[TRADEMARKS.md](TRADEMARKS.md).

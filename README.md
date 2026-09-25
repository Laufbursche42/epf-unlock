# Laufbursche EPF unlock

A static web page that reads and writes EPF (ePowerFun) e-scooters over Web Bluetooth. Connect to your
scooter and, straight from the browser, read the live telemetry, read and write every documented
controller parameter and setting, read the device info and follow the raw protocol log. Nothing to
install: no app store, no signing, no developer account. It runs in **Bluefy** on iOS and in **Chrome**
on Android or desktop.

> **This is a feasibility study.** It exists to show what the ePowerFun Bluetooth protocol makes
> possible, not to be a finished product. The protocol was reconstructed from the official app
> (com.zydtech.epowerfun 1.5.5) and the Uniscooter app (com.zydtech.uniscooter 1.5.0), which share the
> same BLE core. Error-free operation is not promised and there is no warranty of any kind. Whatever
> you do with it, you do at your own risk.
>
> **The write frames are sent for real.** There is no BLE encryption. Raising the speed limit to
> 22 km/h is what the vendor app itself does; values above ~22 km/h depend on a controller firmware
> clamp and may not take effect on a real device (hardware-unconfirmed). See
> [What it does](#what-it-does).

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

Every control below sends the documented frame for real once connected. Risky writes (speed limits,
register 0x20, password, NFC, any register-write escape hatch) ask for confirmation first.

- **Connect** by picking the scooter in the browser dialog, with an optional plain-text password
  (`AT+PWD`, remembered per device on request).
- **Read the telemetry** the scooter sends back (speed, battery, voltage, current, power, controller
  and motor temperature, trip and total kilometers, ride stage, immobilizer state and the fault code),
  kept fresh by a keep-frame heartbeat.
- **Read and write the settings**: ride stage, headlight, ambient light, cruise control, boot mode
  (zero-start), unit and immobilizer state, plus the four ride-stage speed limits (Eco, Comfort,
  Sport, cruise) via the Monitor frame (`0xAB`), and the factory limiter (register `0x20`,
  km/h times 10) via the RW frame (`0x17`).
- **Read and write the advanced controller parameters** (max currents, undervoltage protection, PWM
  frequency, motor pole pairs, throttle and brake response and more). Each is shown decoded and written
  as a raw 16-bit word via the RW frame `0x17`. Only register `0x20` has a documented scaling; every
  other write value is a raw word (scaling unconfirmed). A generic "write any register" escape hatch
  reaches every address.
- **Read and set** name (`AT+NAME`), password (`AT+PWDM`), password requirement (`AT+TYPE`), NFC
  (`AT+NFC` / `AT+DEL`), turn-signal sound (`AT+TLVOICEOFF`) and drive type (`AT+DRIVEMODE`).
- **Read the device info** with the query buttons: controller model, hardware, bootloader, firmware,
  unique code, serial number, device type (`AT+DEVICE?`), UID (`AT+UID`) and password status
  (`AT+TYPE?`).
- **Raw console**: a free hex / `AT` send field, the raw protocol log (every frame as plain hex, blue
  for sent and brown for received, newest at the bottom, anonymized by default for public sharing) with
  copy / clear / save, and a GATT service dump via Diagnostics.

### Honest framing

There is no BLE encryption; the frames are plain text secured only by a CRC-16/MODBUS. Raising the
Sport limit and register `0x20` to 22 km/h is exactly what the vendor app itself does, so that path is
proven. Values above ~22 km/h depend on a controller firmware clamp: a foreign report (ZydDash) sees
the firmware clamp the same controller type to 0.6 - 22.0 km/h regardless of the app-declared max of
60, so higher values may be silently ignored on a real device (hardware-unconfirmed). The advanced
parameters other than `0x20` are written as raw words because their write scaling is not documented -
the tool never invents a scaling.

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
- The read frames (register reads, the control and keep frames and the `AT+...` queries) and the write
  frames (the Monitor/speed-limit frame, the RW register write `0x17` for register `0x20` and the
  advanced parameters, and the `AT+...` setters) are written to the data or command characteristic;
  notifications are decoded per frame type and rendered, and every frame is logged raw as hex. Each
  write control calls the matching builder in `protocol.js`; a register write is preceded by a
  `sendTran` pulse and followed by a read-back, exactly as the app does.

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

This tool writes to the scooter. Raising the maximum speed lifts the factory limit, the operating
permit (Betriebserlaubnis, ABE) then becomes void and riding the scooter in public traffic is no longer
allowed. Use it on your own vehicle only. Everything you do with this page is at your own risk.

## License

PolyForm Noncommercial 1.0.0 with two additional terms, in full in [LICENSE.md](LICENSE.md).

## Privacy

Nothing leaves your device but the page load itself. The details are in [PRIVACY.md](PRIVACY.md).

## Trademarks

An independent project, not affiliated with ePowerFun. "ePowerFun" and the model names are trademarks
of their respective owners and are used here only to say which scooters this page works with. See
[TRADEMARKS.md](TRADEMARKS.md).

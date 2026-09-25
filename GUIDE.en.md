# Guide

This page reads and writes your EPF scooter (ePowerFun) directly over Web Bluetooth. It runs in Chrome
or Edge on Android or desktop, and in Bluefy on iOS. Nothing leaves your device.

> **The write frames are sent for real.** This tool reads the scooter (live telemetry, parameters,
> device info) and writes the documented settings. There is no BLE encryption. Raising the speed limit
> to 22 km/h is what the vendor app itself does; values above ~22 km/h depend on a controller firmware
> clamp and may not take effect on a real device (hardware-unconfirmed). Risky writes ask for
> confirmation first. Your own scooter only, at your own risk.

## Requirements

- Chrome or Edge on Android or desktop, or Bluefy on iOS, served over HTTPS or `http://localhost`,
  not opened by double-clicking the file.
- Bluetooth active on your computer or phone.
- The scooter is on and in range. It must not be connected to the ePowerFun app at the same time,
  otherwise it may not advertise its services.
- On Android, location must be on and Chrome needs the location or nearby-devices permission, or the
  chooser stays empty.

## Connect

1. If your scooter requires a password, enter it in the Password field. Otherwise leave it empty. The
   password is only needed so a protected scooter lets you read and write it. Tick "Remember the
   password for this device" to store it locally for next time.
2. Tap Connect and pick the scooter in the browser dialog.
3. Watch the status badge: `connecting`, then `linking`, then `connected`.

After connecting, the app automatically reads controller info, serial number and the parameter block,
queries NFC, turn-signal sound, password status and drive type, and keeps the live values fresh with a
keep frame.

## Live values

The Live values card shows speed, ride mode, battery, immobilizer, voltage, current, power, controller
and motor temperature, and trip and total kilometers. The values are derived from the app code and
should be confirmed on the real device. The raw messages are also logged as hex.

## Settings and speed limits

The Lock/unlock speed card and the Settings card show the current values read from the scooter and let
you change them: the four ride-stage speed limits (Eco, Comfort, Sport, cruise) and the switches
(headlight, ambient light, cruise control, boot mode, unit, immobilizer) plus the ride stage go out on
the Monitor frame (`0xAB`); the factory limiter (register `0x20`, km/h times 10) goes out on the RW
frame (`0x17`). Each has its own send button, and the risky ones (speed limits, factory limiter,
immobilizer) ask for confirmation. The current switch state is carried over unchanged on write, so only
the one field you touch changes. Note the firmware clamp: the vendor app itself goes up to 22 km/h, and
values above that may be ignored by the controller (`?` on each row explains it).

## Advanced parameters

The Advanced parameters card shows the motor and control parameters from the parameter block, decoded
with the scalings documented in the code, and lets you write each one back as a raw 16-bit word via the
RW frame (`0x17`). The registers the vendor app itself writes (throttle response `0x09`, brake response
`0x0A`, speed limit `0x20`) are marked "app". Only register `0x20` has a documented scaling (km/h times
10); every other value is a raw word because its write scaling is not documented - the tool never
invents one. Below the list, "Write any register" is a generic escape hatch: enter an address and a raw
word and it builds the RW frame for you. A wrong value can upset the controller, so these ask for
confirmation.

## Device info

The Device info card fills with controller model, hardware, bootloader, firmware, unique code and
serial number. The query buttons read more on demand: device type (`AT+DEVICE?`), UID (`AT+UID`) and
password status (`AT+TYPE?`). The More settings card sets the name (`AT+NAME`), a new password
(`AT+PWDM`), the password requirement (`AT+TYPE`), NFC (`AT+NFC`, plus clear cards `AT+DEL`),
turn-signal sound (`AT+TLVOICEOFF`) and drive type (`AT+DRIVEMODE`).

## Log and raw console

The protocol log shows every frame as raw hex, blue for sent and brown for received, newest at the
bottom. It is anonymized by default (Bluetooth addresses, serial numbers, passwords and raw device IDs
are redacted) so you can share it safely; untick "Anonymize log" only for local debugging. Copy, Clear
and Save as .txt export the log, the free-send field sends your own hex bytes or an `AT` command, and
Diagnostics lists all Bluetooth devices and their GATT services. Report what you see on a real scooter
with the copied log attached.

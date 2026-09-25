# Guide

This page reads your EPF scooter (ePowerFun) directly over Web Bluetooth. It runs in Chrome or Edge
on Android or desktop, and in Bluefy on iOS. Nothing leaves your device.

> **Read-out build.** This tool reads the scooter: live telemetry, parameters and device info. It
> writes nothing to the scooter. Every tuning control is shown for context but disabled, because the
> write path is documented from the app yet not confirmed on any real device.

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
   password is only needed so a protected scooter lets you read it.
2. Tap Connect and pick the scooter in the browser dialog.
3. Watch the status badge: `connecting`, then `linking`, then `connected`.

After connecting, the app automatically reads controller info, serial number and the parameter block,
queries NFC, turn-signal sound, password status and drive type, and keeps the live values fresh with a
keep frame.

## Live values

The Live values card shows speed, ride mode, battery, immobilizer, voltage, current, power, controller
and motor temperature, and trip and total kilometers. The values are derived from the app code and
should be confirmed on the real device. The raw messages are also logged as hex.

## Settings and speed limits (read-only)

The Lock/unlock speed card and the Settings card show the current values read from the scooter: the
four ride-stage speed limits (Eco, Comfort, Sport, cruise), the factory limiter read-back, and the
switches (headlight, ambient light, cruise control, boot mode, unit, immobilizer) plus the ride stage.

These are shown for viewing only. Every control that would write to the scooter is greyed out in this
build, and the reason is spelled out under each card and behind the `?` on each row.

## Advanced parameters

The Advanced parameters card shows motor and control parameters from the parameter block, decoded with
the scalings documented in the code. These are read-only.

## Device info

The Device info card fills with controller model, hardware, bootloader, firmware, unique code and
serial number. The query buttons read more on demand: device type (`AT+DEVICE?`), UID (`AT+UID`) and
password status (`AT+TYPE?`). These are reads, so they stay active.

## Log

The protocol log shows every frame as raw hex, blue for sent and brown for received, newest at the
bottom. Copy log gives you the full capture as text, Clear log empties it, and Diagnostics lists all
Bluetooth devices and their GATT services. Report what you see on a real scooter with the copied log
attached.

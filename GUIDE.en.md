# Guide

This page talks to your EPF scooter (ePowerFun) directly over Web Bluetooth. It runs in Chrome or
Edge on Android or desktop. Nothing leaves your device.

## Requirements

- Chrome or Edge, served over HTTPS or `http://localhost`, not opened by double-clicking the file.
- Bluetooth active on your computer or phone.
- The scooter is on and in range. It must not be connected to the ePowerFun app at the same time,
  otherwise it may not advertise its services.

## Connect

1. If your scooter requires a password, enter it in the Password field. Otherwise leave it empty.
2. Optionally set a name filter (for example ePF) so only matching devices show in the chooser.
3. Tap Connect and pick the scooter in the dialog.

After connecting, the app automatically reads controller info, serial number and the parameter block
and keeps the live values fresh with a keep frame.

## Live values

The Live values card shows speed, ride mode, battery, lock, voltage, current, power, controller and
motor temperature, and trip and total kilometers. The values are derived from the app code and should
be confirmed on the real device. The raw messages are also logged as hex.

## Setting the speed limit

The Speed limit card has four values: Eco, Comfort, Sport and cruise, each one byte in km/h. Enter
the value you want, a preview of the finished frame is shown below the field, then tap Write speed
limits. The factory default is Eco 6, Comfort 10, Sport 20, cruise 3.

Important: raising above 20 km/h concerns your own scooter only. On public roads this usually voids
the road approval. Whether the controller actually rides values above 20 is what the test on the
vehicle shows.

## Settings

Switches (headlight, ambient light, cruise control, boot mode, unit, lock) and the ride stage go
through the monitor frame, which always sends all base values together. The app uses the last read
state for that, so writes are only possible once the live values and parameters have been read.

More settings holds name, password, NFC, turn signal sound and drive type as AT commands.

## Advanced parameters

The Advanced parameters card shows motor and control parameters from the parameter block, decoded
with the scalings documented in the code. These values are read-only for now, because the exact write
path is not yet fully proven.

## Console and log

Under Raw command you can send your own hex or AT commands. The protocol log shows every frame as raw
hex, blue for sent and brown for received. Copy log sends a capture, Diagnostics lists all Bluetooth
devices and their GATT services.

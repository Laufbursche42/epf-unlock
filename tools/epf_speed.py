#!/usr/bin/env python3
"""
EPF (ePowerFun) - BLE Speed-Limit Tester (Python/bleak Variante)

Sendet den per Reverse Engineering ermittelten Monitor-Frame ueber den Daten-Service
(F1F0 / write F1F1), der die vier Tempolimits plus das Schalter-Bitfeld traegt. Reine
Referenz zur Webapp, gleiche Bytes wie protocol.js. Nur am eigenen Fahrzeug auf privatem
Gelaende. Nutzung auf eigenes Risiko.

Installation:
    pip install bleak

Beispiele:
    python epf_speed.py --scan
    python epf_speed.py --address <MAC-oder-UUID> --sport 22
    python epf_speed.py --address <...> --eco 6 --comfort 10 --sport 22 --cruise 3
    python epf_speed.py --address <...> --pwd 1234 --sport 22
    python epf_speed.py --address <...> --raw "AB000A0103060A16"
"""

import argparse
import asyncio

DATA_SERVICE = "0000f1f0-0000-1000-8000-00805f9b34fb"
DATA_TX = "0000f1f1-0000-1000-8000-00805f9b34fb"   # App -> Scooter (write)
DATA_RX = "0000f1f2-0000-1000-8000-00805f9b34fb"   # Scooter -> App (notify)
CMD_TX = "0000f2f1-0000-1000-8000-00805f9b34fb"    # App -> Scooter (AT-ASCII)

HEAD_MONITOR = 0xAB


# ---------- CRC-16/MODBUS (poly 0x8005 reflektiert 0xA001, init 0xFFFF) ----------
def crc16_modbus(data):
    crc = 0xFFFF
    for b in data:
        crc ^= b & 0xFF
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def append_crc16(body):
    crc = crc16_modbus(body)
    return bytes(body) + bytes([crc & 0xFF, (crc >> 8) & 0xFF])


# ---------- Frame-Bau ----------
def switch_byte(gear=1, head=False, atmo=False, cruise=False, boot=False, metric=False, lock=False):
    # Reihenfolge (setBaseParams reversedArray): bit7 lock ... bit0 gearBit0
    g = gear & 0x03
    v = 0
    v |= (1 if lock else 0) << 7
    v |= (1 if metric else 0) << 6
    v |= (1 if boot else 0) << 5
    v |= (1 if cruise else 0) << 4
    v |= (1 if atmo else 0) << 3
    v |= (1 if head else 0) << 2
    v |= ((g >> 1) & 1) << 1
    v |= (g & 1) << 0
    return v & 0xFF


def build_monitor(value, limit_cruise, limit_mode1, limit_mode2, limit_mode3):
    body = [HEAD_MONITOR, 0x00, 0x0A, value & 0xFF,
            limit_cruise & 0xFF, limit_mode1 & 0xFF, limit_mode2 & 0xFF, limit_mode3 & 0xFF]
    return append_crc16(body)


async def run(args):
    from bleak import BleakScanner, BleakClient

    if args.scan:
        print("Scanne 8 s ...")
        devices = await BleakScanner.discover(timeout=8.0)
        for d in devices:
            print("  {}  {}".format(d.address, d.name or "(ohne Namen)"))
        return

    if not args.address:
        print("Bitte --address angeben (oder --scan).")
        return

    async with BleakClient(args.address) as client:
        print("Verbunden mit", args.address)
        if args.pwd:
            frame = ("AT+PWD[" + args.pwd + "]").encode("ascii")
            await client.write_gatt_char(CMD_TX, frame, response=False)
            print("Passwort gesendet: AT+PWD[***]")
            await asyncio.sleep(0.3)

        if args.raw:
            data = bytes.fromhex(args.raw.replace(" ", ""))
        else:
            val = switch_byte(gear=args.gear, head=args.head, atmo=args.atmo,
                              cruise=args.cruise_sw, boot=args.boot, metric=args.metric, lock=args.lock)
            data = build_monitor(val, args.cruise, args.eco, args.comfort, args.sport)

        await client.write_gatt_char(DATA_TX, data, response=False)
        print("Gesendet:", data.hex(" "))


def main():
    p = argparse.ArgumentParser(description="EPF BLE Speed-Limit Tester")
    p.add_argument("--scan", action="store_true", help="BLE-Geraete auflisten")
    p.add_argument("--address", help="MAC- oder UUID-Adresse des Scooters")
    p.add_argument("--pwd", help="Klartext-Passwort (AT+PWD), falls gesetzt")
    p.add_argument("--eco", type=int, default=6, help="Tempolimit Eco (km/h)")
    p.add_argument("--comfort", type=int, default=10, help="Tempolimit Comfort (km/h)")
    p.add_argument("--sport", type=int, default=20, help="Tempolimit Sport (km/h)")
    p.add_argument("--cruise", type=int, default=3, help="Tempomat-Limit (km/h)")
    p.add_argument("--gear", type=int, default=1, help="aktive Fahrstufe 1..3")
    p.add_argument("--head", action="store_true", help="Frontlicht an")
    p.add_argument("--atmo", action="store_true", help="Ambientelicht an")
    p.add_argument("--cruise-sw", action="store_true", help="Tempomat-Schalter an")
    p.add_argument("--boot", action="store_true", help="Anfahrmodus (Zero-Start) an")
    p.add_argument("--metric", action="store_true", help="Einheit auf Meilen")
    p.add_argument("--lock", action="store_true", help="Wegfahrsperre an")
    p.add_argument("--raw", help="Rohframe als Hex direkt an F1F1 senden")
    args = p.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()

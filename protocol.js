"use strict";
/*
 * protocol.js - EPF / ePowerFun BLE-Protokoll (com.zydtech.library)
 *
 * Reine Protokoll-Logik ohne DOM. Jede Konstante, jeder Frame-Aufbau und jeder Parser
 * ist aus dem Decompile belegt. Fundstellen verweisen auf PROTOCOL.md
 * und die dort zitierten Java-/Smali-Zeilen (ePowerFun 1.5.5, geteilter Kern
 * com.zydtech.library). Wo eine Bedeutung nur abgeleitet ist, steht UNSICHER dabei.
 *
 * Alle Mehrbyte-Werte des Geräts sind Big-Endian. Die CRC16 wird Low-Byte zuerst
 * angehängt (CRC-16/MODBUS).
 */

const EPF = (function () {

  // ---- GATT-UUIDs (Constant.java:60-71, StringExt.toUUID:362-380) ---------------
  const UUID = {
    DATA_SERVICE: "0000f1f0-0000-1000-8000-00805f9b34fb",
    DATA_TX:      "0000f1f1-0000-1000-8000-00805f9b34fb", // App -> Scooter (binär)
    DATA_RX:      "0000f1f2-0000-1000-8000-00805f9b34fb", // Scooter -> App (notify)
    CMD_SERVICE:  "0000f2f0-0000-1000-8000-00805f9b34fb",
    CMD_TX:       "0000f2f1-0000-1000-8000-00805f9b34fb", // App -> Scooter (AT-ASCII)
    CMD_RX:       "0000f2f2-0000-1000-8000-00805f9b34fb", // Scooter -> App (notify)
    DEVINFO:      "0000180a-0000-1000-8000-00805f9b34fb",
    OTA_SERVICE:  "02f00000-0000-0000-0000-00000000fe00",
    OTA_TX:       "02f00000-0000-0000-0000-00000000ff01",
    OTA_RX:       "02f00000-0000-0000-0000-00000000ff02",
  };

  // ---- Opcodes und Frame-Bytes (Constant.java:11-58) ----------------------------
  const OP = {
    READ_PARAMETER: 0x03,
    ESC_INFO:       0x07,
    BAT_INFO:       0x08,
    WRITER_PARAMETER: 0x10,
    RW_PARAMETER:   0x17,
    UPDATE_FM:      0x50,
    HANDSHAKE:      0x51,
    KEEP:           0x02,
  };
  const HEAD_ESC = 0x01;     // Standard-Kopf binärer Befehle
  const HEAD_TRAN = 0xA5;    // Steuer-/Transparent-Frames
  const END_TRAN = 0x5A;
  const HEAD_MONITOR = 0xAB; // Monitor-/Tempolimit-Frames

  // ============================================================================
  //  Byte-Helfer
  // ============================================================================
  function u8(buf, i)  { return buf[i] & 0xff; }
  function s8(buf, i)  { return (buf[i] << 24) >> 24; }                 // signed int8
  function u16BE(buf, i) { return ((buf[i] & 0xff) << 8) | (buf[i + 1] & 0xff); }
  function s16BE(buf, i) { const v = u16BE(buf, i); return v >= 0x8000 ? v - 0x10000 : v; }
  function u24BE(buf, i) { return ((buf[i] & 0xff) << 16) | ((buf[i + 1] & 0xff) << 8) | (buf[i + 2] & 0xff); }
  function u32BE(buf, i) { return (((buf[i] & 0xff) * 0x1000000) + ((buf[i + 1] & 0xff) << 16) + ((buf[i + 2] & 0xff) << 8) + (buf[i + 3] & 0xff)); }
  function getBit(v, n) { return (v >> n) & 1; }

  function toHex(buf) {
    return Array.from(buf, b => (b & 0xff).toString(16).padStart(2, "0")).join(" ");
  }
  function asciiTrim(buf, start, end) {
    let s = "";
    for (let i = start; i < end && i < buf.length; i++) {
      const c = buf[i] & 0xff;
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.replace(/[^\x20-\x7e]+$/g, "").trim();
  }

  // ============================================================================
  //  CRC-16/MODBUS  (CRC16.java:62-65 -> CRC(0x8005, 0xFFFF, refin, refout, 0))
  //  Standard-Parameter, Ergebnis wird Low-Byte zuerst angehängt.
  // ============================================================================
  function crc16Modbus(buf, offset, length) {
    let crc = 0xFFFF;
    const end = offset + length;
    for (let i = offset; i < end && i < buf.length; i++) {
      crc ^= (buf[i] & 0xff);
      for (let b = 0; b < 8; b++) {
        if (crc & 1) crc = (crc >>> 1) ^ 0xA001; // 0xA001 = reflektiertes 0x8005
        else crc >>>= 1;
      }
    }
    return crc & 0xFFFF;
  }
  function appendCrc16(bytes) {
    const crc = crc16Modbus(bytes, 0, bytes.length);
    return Uint8Array.from([...bytes, crc & 0xff, (crc >> 8) & 0xff]);
  }

  // ============================================================================
  //  AUSGEHENDE FRAMES (Daten-Kanal F1F1, sofern nicht anders vermerkt)
  // ============================================================================

  // Register-Lesen / kurzer Standardbefehl, 8 Byte (BleCore.java:2219-2240)
  // [head, command, addrHi, addrLo, countHi, countLo, crcLo, crcHi], CRC über 0..5
  function buildRead(command, address, count, head) {
    const b = new Uint8Array(6);
    b[0] = (head === undefined) ? HEAD_ESC : head;
    b[1] = command & 0xff;
    b[2] = (address >> 8) & 0xff;
    b[3] = address & 0xff;
    b[4] = (count >> 8) & 0xff;
    b[5] = count & 0xff;
    return appendCrc16(b);
  }

  // Bekannte Lese-Abfragen (command-inventory)
  const READ = {
    escInfo:        () => buildRead(OP.ESC_INFO, 0, 4),        // getEscInfo (BleCore.java:452)
    batInfoSN:      () => buildRead(OP.BAT_INFO, 0, 7),        // getSN (BleCore.java:1514)
    parameters:     () => buildRead(OP.READ_PARAMETER, 0, 16), // startGetAdvParams (BleCore.java:1222)
    serviceMileage: () => buildRead(OP.READ_PARAMETER, 74, 4), // getServiceMileage (BleCore.java:508)
    limitedSpeed:   () => buildRead(OP.READ_PARAMETER, 0x20, 1), // Register 0x20 gezielt lesen (limitedSpeedValue, PROTOCOL 2.12)
  };

  // Tempolimit- / Basis-Schalter-Frame, 10 Byte (BleCore.java sendMonitor C01381:881-897)
  // [0xAB, 0x00, 0x0A, valueByte, limitCruise, limitMode1, limitMode2, limitMode3, crcLo, crcHi]
  // CRC über Bytes 0..7. valueByte siehe encodeSwitchByte.
  function buildMonitor(valueByte, limitCruise, limitMode1, limitMode2, limitMode3, headMonitor) {
    const b = new Uint8Array(8);
    b[0] = (headMonitor === undefined) ? HEAD_MONITOR : headMonitor;
    b[1] = 0x00;
    b[2] = 0x0A;
    b[3] = valueByte & 0xff;
    b[4] = limitCruise & 0xff;
    b[5] = limitMode1 & 0xff;
    b[6] = limitMode2 & 0xff;
    b[7] = limitMode3 & 0xff;
    return appendCrc16(b);
  }

  // Bitfeld-Byte für buildMonitor (setBaseParams reversedArray, BleCore.java:2744/2765)
  // Reihenfolge nach Umkehr -> MSB..LSB:
  //   bit7 lock, bit6 metricInch, bit5 boot, bit4 cruise,
  //   bit3 atmosphere, bit2 headLight, bit1 gearBit1, bit0 gearBit0
  function encodeSwitchByte(s) {
    const gear = s.gearPosition & 0x03;
    let v = 0;
    v |= (s.lockSw            ? 1 : 0) << 7;
    v |= (s.metricInchSw      ? 1 : 0) << 6;
    v |= (s.bootMode          ? 1 : 0) << 5;
    v |= (s.cruiseControlSw   ? 1 : 0) << 4;
    v |= (s.atmosphereLightSw ? 1 : 0) << 3;
    v |= (s.headLightSw       ? 1 : 0) << 2;
    v |= getBit(gear, 1) << 1;
    v |= getBit(gear, 0) << 0;
    return v & 0xff;
  }

  // Baut aus einem vollständigen Basis-Zustand den Monitor-Frame (wie setBaseParams).
  // headMonitor: der (ggf. gelernte) Monitor-Kopf des Geräts, Standard 0xAB.
  function buildBaseParamsFrame(state, headMonitor) {
    const val = encodeSwitchByte(state);
    return buildMonitor(val, state.limitCruise, state.limitMode1, state.limitMode2, state.limitMode3, headMonitor);
  }

  // Generischer Register-Schreibbefehl RW_PARAMETER 0x17 (BleCore.java C01361:708-729)
  // [0x01, 0x17, aHi, aLo, (n/2)Hi, (n/2)Lo, aHi, aLo, (n/2)Hi, (n/2)Lo, nBytes, value..., crcLo, crcHi]
  function buildRwParam(address, value, head) {
    const n = value.length;
    const words = (n / 2) | 0;
    const b = new Uint8Array(11 + n);
    b[0] = (head === undefined) ? HEAD_ESC : head;
    b[1] = OP.RW_PARAMETER;
    b[2] = (address >> 8) & 0xff;
    b[3] = address & 0xff;
    b[4] = (words >> 8) & 0xff;
    b[5] = words & 0xff;
    b[6] = (address >> 8) & 0xff;
    b[7] = address & 0xff;
    b[8] = (words >> 8) & 0xff;
    b[9] = words & 0xff;
    b[10] = n & 0xff;
    b.set(value, 11);
    return appendCrc16(b);
  }

  // Hoechstgeschwindigkeit ueber Register 0x20 setzen (limitedSpeedValue), zweiter Tempolimit-Hebel
  // ausserhalb der Gang-Geschwindigkeiten. Belegt: setAdvParams pos 10 schreibt genau ein Register
  // 0x20 per RW-Frame 0x17, Wert = round(kmh * opv) mit opv=10 als Int16 Big-Endian
  // (BleCore$setAdvParams$1.smali:774-825, default_parameter.json no:10 address 32 opv 10,
  // ValueExt.toBytes16 Big-Endian). 25 km/h -> 250 -> 00 FA -> Frame 01 17 00 20 00 01 00 20 00 01 02 00 fa d2 e7.
  // Head 0x01 (ESC-Kanal) bzw ein Custom-ESC-Kopf. Achtung: die Controller-Firmware kann den Wert
  // trotzdem klemmen (z. B. auf 22.0 km/h), das ist geraeteabhaengig (PROTOCOL 2.12).
  function buildSetMaxSpeed(kmh, head) {
    const raw = Math.max(0, Math.min(0xffff, Math.round(kmh * 10)));
    const value = Uint8Array.from([(raw >> 8) & 0xff, raw & 0xff]);
    return buildRwParam(0x20, value, head);
  }

  // Steuer-Frame sendCommand2 (BleCore.java:2254-2270): [0xA5, cmd, ~cmd, 0,0,0,0, 0x5A]
  function buildControl(command) {
    return Uint8Array.from([HEAD_TRAN, command & 0xff, (~command) & 0xff, 0, 0, 0, 0, END_TRAN]);
  }
  const sendTran      = () => buildControl(0x00); // "Keep UF Mode", treibt Poll-Schleife
  const sendPack      = () => buildControl(0x01);
  const sendStopTran  = () => buildControl(0xFF);

  // Heartbeat sendKeep (BleCore.java:2335): [0xA5, 0x02, 0xFD, 0x5A]
  function buildKeep() {
    return Uint8Array.from([HEAD_TRAN, OP.KEEP, 0xFD, END_TRAN]);
  }

  // AT-Kommandos (Kommando-Kanal F2F1, ASCII, keine CRC) - command-inventory
  function at(str) { return new TextEncoder().encode(str); }
  const AT = {
    pwd:            (p) => at("AT+PWD[" + p + "]"),      // Login (BleCore.java:2538)
    setPwd:         (p) => at("AT+PWDM[" + p + "]"),     // Passwort setzen (2784)
    hasPwdQuery:    ()  => at("AT+TYPE?"),               // (2653)
    setHasPwdOn:    ()  => at("AT+TYPE[B"),              // Passwort an (2871)
    setHasPwdOff:   ()  => at("AT+TYPE[A"),              // Passwort aus (2874)
    setName:        (n) => at("AT+NAME[" + n + "]"),     // (2777)
    deviceQuery:    ()  => at("AT+DEVICE?"),             // (2589)
    driveTypeQuery: ()  => at("AT+DRIVEMODE?"),          // (2595)
    setDriveType:   (t) => at("AT+DRIVEMODE[" + t + "]"),// (2845)
    nfcQuery:       ()  => at("AT+NFC?"),                // (2611)
    setNfc:         (b) => at("AT+NFC[" + (b ? "1" : "0") + "]"), // (2893)
    nfcDelete:      ()  => at("AT+DEL[1]"),              // (2887)
    tlVoiceQuery:   ()  => at("AT+TLVOICEOFF?"),         // (2637)
    setTlVoice:     (t) => at("AT+TLVOICEOFF[" + t + "]"),// (2907)
    uid:            ()  => at("AT+UID"),                 // (2647)
    ludoQuery:      ()  => at("AT+SETLUDO:?"),           // (2605)
    setLudo:        (b) => at("AT+SETLUDO[" + (b ? "1" : "0") + "]"), // (2881)
    fingerprintInfo:(id)=> at("AT+FGP" + id),            // (2573)
  };

  // ============================================================================
  //  EINGEHENDES PARSING
  // ============================================================================

  // --- Kommando-Kanal F2F2: ASCII-Antworten (parsingCmdBuf) --------------------
  function parseCmd(bytes) {
    const s = new TextDecoder().decode(bytes).trim();
    let kind = "unknown", value = null;
    if (s.includes("OK+PWD:Y") || s.includes("ERR+AT")) { kind = "pwdOk"; value = true; }
    else if (s.includes("OK+PWD:N"))     { kind = "pwdFailed"; value = false; }
    else if (s.includes("OK+PWDM"))      { kind = "setPwd"; value = true; }
    else if (s.includes("ERR+PWDM"))     { kind = "setPwd"; value = false; }
    else if (s.includes("OK+NAME:"))     { kind = "setName"; value = true; }
    else if (s.includes("ERR+NAME:"))    { kind = "setName"; value = false; }
    else if (s.includes("OK+DEVICE"))    { kind = "device"; value = s.substring(s.indexOf("OK+DEVICE") + 9); }
    else if (s.includes("OK+TYPE:"))     { kind = "hasPwd"; value = (s.split("OK+TYPE:")[1] || "").trim().startsWith("B"); }
    else if (s.includes("OK+UID:"))      { kind = "uid"; value = (s.split("OK+UID:")[1] || "").trim(); }
    else if (s.includes("OK+DRIVEMODE:")){ kind = "driveType"; value = (s.split("OK+DRIVEMODE:")[1] || "").trim(); }
    else if (s.includes("OK+TLVOICEOFF:")){ kind = "tlVoice"; value = (s.split("OK+TLVOICEOFF:")[1] || "").trim(); }
    else if (s.includes("OK+NFC:"))      { kind = "nfc"; value = (s.split("OK+NFC:")[1] || "").trim(); }
    else if (s.includes("OK+DEL:"))      { kind = "nfcDelete"; value = (s.split("OK+DEL:")[1] || "").trim(); }
    else if (s.includes("OK+SETLUDO:"))  { kind = "ludo"; value = (s.split("OK+SETLUDO:")[1] || "").trim(); }
    else if (s.includes("OK+SFGP:"))     { kind = "fingerprintEntry"; value = (s.split("OK+SFGP:")[1] || "").trim(); }
    return { raw: s, kind: kind, value: value };
  }

  // --- Datenkanal F1F2: Dispatch (parsingDataBuf) ------------------------------
  // Rueckgabe { type, data, hex }. Sammelpuffer (ESC/BAT/Params) liegen im State-Objekt.
  function parseData(buf, state) {
    const hex = toHex(buf);
    const head = buf[0] & 0xff;
    const cmd = buf[1] & 0xff;

    // ESC-Kanal (Kopf 0x01 bzw. customHeadEsc): Reads, Batterie, Parameter, Schreibquittungen.
    if (head === HEAD_ESC || (state && head === state.customHeadEsc)) {
      switch (cmd) {
        case OP.READ_PARAMETER: return { type: "params", data: collectParams(buf, state), hex };
        case OP.ESC_INFO:       return { type: "escInfo", data: collectEscInfo(buf, state), hex };
        case OP.BAT_INFO:       return { type: "batInfo", data: collectBatInfo(buf, state), hex };
        case OP.WRITER_PARAMETER: return { type: "writeAck", ok: true, hex };
        case 0x90:              return { type: "writeAck", ok: false, hex };
        case OP.RW_PARAMETER:   return { type: "rwAck", ok: true, hex };
        case 0x97:              return { type: "rwAck", ok: false, hex };
        case 0x81:              return { type: "timeout", hex };
        default:                return { type: "escUnknown", hex };
      }
    }

    // Monitor-Kanal: Kopf 0xAB (Standard) ODER ein Custom-Head (z. B. 0xAF beim ePF pulse),
    // erkannt am Sub-Kommando 0x00 (Telemetrie) bzw. 0x01 (Basisparameter). Der Kopf wird aus
    // dem Frame GELERNT und fuer die eigenen Schreib-Frames (sendMonitor) uebernommen, genau wie
    // die App per Config.currentHeadMonitor (SubPackageOnce.isInArray, BleCore.java:882).
    if (cmd === 0x00 || cmd === 0x01) {
      if (state) state.customHeadMonitor = head;
      if (cmd === 0x00) return { type: "monitor", data: parseMonitor(buf, state), hex };
      return { type: "baseParams", data: parseBaseParams(buf), hex };
    }

    return { type: "unknown", hex };
  }

  // Echtzeit-Telemetrie (HEAD 0xAB, buf[1]=0x00), Offsets verifiziert im Smali
  function parseMonitor(buf, state) {
    const rawSpeed = Math.max(u16BE(buf, 6), u16BE(buf, 8));
    const thousand = state && state.thousandUnits;
    const speed = thousand ? rawSpeed / 10.0 : rawSpeed / 1000.0; // /1000, bei ThousandUnits abweichend (UNSICHER)
    const voltage = u16BE(buf, 10) / 10.0;
    const current = s16BE(buf, 12) / 64.0;
    const reg0 = u16BE(buf, 21);
    return {
      electricity: u8(buf, 3),                 // Akku in Prozent
      gearPosition: u8(buf, 4),
      speedRaw6: u16BE(buf, 6), speedRaw8: u16BE(buf, 8),
      speed: Math.round(speed * 10) / 10,      // km/h (Skalierung /1000 aus Code)
      voltage: Math.round(voltage * 10) / 10,  // V
      current: Math.round(current * 10) / 10,  // A
      escTemperature: s8(buf, 14),             // Grad C
      motorTemperature: s8(buf, 15),           // Grad C
      mileage: Math.round(u16BE(buf, 16) / 10.0 * 10) / 10,        // Trip km
      totalMileage: Math.round(u24BE(buf, 18) / 10.0 * 10) / 10,   // Gesamt km
      power: Math.round(voltage * current * 10) / 10,              // W (U*I)
      registerZero: reg0,
      switches: decodeSwitches(reg0),
      faultCodeHex: toHex(buf.slice(2, 22)),   // UNSICHER: genauer Bereich nicht eindeutig
    };
  }

  // Schalter-Bits aus registerZero der Monitor-Antwort (verifiziert im Smali)
  function decodeSwitches(reg0) {
    return {
      headLightSw:       getBit(reg0, 2) === 1,
      atmosphereLightSw: getBit(reg0, 15) === 1,
      cruiseControlSw:   getBit(reg0, 9) === 1,
      bootMode:          getBit(reg0, 5) === 1,
      metricInchSw:      getBit(reg0, 6) === 1,
      lockSw:            getBit(reg0, 11) === 1,
    };
  }

  // Basisparameter/Limits (HEAD 0xAB, buf[1]=0x01)
  function parseBaseParams(buf) {
    const u10 = u16BE(buf, 10);
    return {
      limitCruise: u8(buf, 3),
      limitMode1: u8(buf, 4),
      limitMode2: u8(buf, 5),
      limitMode3: u8(buf, 6),
      displayName: asciiTrim(buf, 8, 18) || toHex(buf.slice(8, 18)),
      displayVersion: "V" + u8(buf, 20) + "." + u8(buf, 21) + "." + u8(buf, 22),
      thousandUnits: getBit(u10, 12) === 1,
    };
  }

  // ESC-Info fragmentiert (8 Byte ab buf[5], Zieloffset = u16BE@2), fertig bei 0x40
  function collectEscInfo(buf, state) {
    const off = u16BE(buf, 2);
    for (let i = 0; i < 8; i++) state.escInfoBuf[off + i] = buf[5 + i];
    if (off === 0x40) {
      const b = state.escInfoBuf;
      return {
        complete: true,
        model:      asciiTrim(b, 0, 16),
        hardware:   asciiTrim(b, 16, 32),
        boot:       asciiTrim(b, 32, 48),
        firmware:   asciiTrim(b, 48, 64),
        uniquecode: asciiTrim(b, 64, 80),
      };
    }
    return { complete: false, at: off };
  }

  // Batterie-/SN-Info fragmentiert (8 Byte buf[5..12]), fertig bei Offset 8
  function collectBatInfo(buf, state) {
    const off = u16BE(buf, 2);
    for (let i = 0; i < 8; i++) state.batInfoBuf[off + i] = buf[5 + i];
    if (off === 8) return { complete: true, info: asciiTrim(state.batInfoBuf, 0, 16) };
    return { complete: false, at: off };
  }

  // Parameter-Lesepuffer: Wort-adressiert, Byte-Offset = Register*2 (BleCore.java:1844)
  function collectParams(buf, state) {
    const reg = u16BE(buf, 2);
    const words = (buf[4] & 0xff) >> 1;
    for (let i = 0; i < words * 2; i++) state.paramsBuf[reg * 2 + i] = buf[5 + i];
    return { at: reg, words: words, full: parseFullAdvParams(state.paramsBuf) };
  }

  // FullAdvParams aus paramsBuf (Offsets/Skalierungen aus BleCore.java:1870-2049)
  function parseFullAdvParams(p) {
    const reg0 = s16BE(p, 0);
    return {
      registerZero: reg0 & 0xffff,
      cruiseSw:      getBit(reg0, 9) === 1,
      isMetric:      getBit(reg0, 6) === 1,
      isZeroStart:   getBit(reg0, 5) === 1,
      lockandUnlock: getBit(reg0, 11),
      restoreDefault: getBit(reg0, 13),
      maxModulationDepth: Math.round(s16BE(p, 4) * 50 / 21845),
      motorPolePairs: s16BE(p, 8),
      acceleratedThrottleResponse: Math.round(s16BE(p, 18) * 10 / 30000),
      acceleratorBrakeResponse: Math.round(s16BE(p, 20) * 10 / 30000),
      maxDischargeCurrent: Math.round(s16BE(p, 22) / 64.0 * 10) / 10,
      maxBrakingCurrent: Math.round(s16BE(p, 24) / 64.0 * 10) / 10,
      voltageProtection: Math.round(s16BE(p, 38) / 10.0 * 10) / 10,
      motorDiameter: Math.round(s16BE(p, 46) * 10 / 254.0 * 10) / 10,
      limitedSpeedValue: Math.round(s16BE(p, 64) / 10.0),
      pwmFrequency: s16BE(p, 66),
      cruiseTime: s16BE(p, 102),
      shutdownTime: s16BE(p, 104),
      lastServiceMileage: u32BE(p, 148),
      serviceMileage: s16BE(p, 152),
    };
  }

  return {
    UUID, OP, HEAD_ESC, HEAD_TRAN, END_TRAN, HEAD_MONITOR,
    crc16Modbus, appendCrc16, toHex,
    buildRead, READ, buildMonitor, encodeSwitchByte, buildBaseParamsFrame,
    buildRwParam, buildSetMaxSpeed, buildControl, sendTran, sendPack, sendStopTran, buildKeep, AT,
    parseCmd, parseData, parseMonitor, parseBaseParams, parseFullAdvParams, decodeSwitches,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = EPF;

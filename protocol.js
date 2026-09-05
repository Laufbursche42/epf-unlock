"use strict";

const EPF = (function () {

  const UUID = {
    DATA_SERVICE: "0000f1f0-0000-1000-8000-00805f9b34fb",
    DATA_TX:      "0000f1f1-0000-1000-8000-00805f9b34fb",
    DATA_RX:      "0000f1f2-0000-1000-8000-00805f9b34fb",
    CMD_SERVICE:  "0000f2f0-0000-1000-8000-00805f9b34fb",
    CMD_TX:       "0000f2f1-0000-1000-8000-00805f9b34fb",
    CMD_RX:       "0000f2f2-0000-1000-8000-00805f9b34fb",
    DEVINFO:      "0000180a-0000-1000-8000-00805f9b34fb",
    OTA_SERVICE:  "02f00000-0000-0000-0000-00000000fe00",
    OTA_TX:       "02f00000-0000-0000-0000-00000000ff01",
    OTA_RX:       "02f00000-0000-0000-0000-00000000ff02",
  };

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
  const HEAD_ESC = 0x01;
  const HEAD_TRAN = 0xA5;
  const END_TRAN = 0x5A;
  const HEAD_MONITOR = 0xAB;

  function u8(buf, i)  { return buf[i] & 0xff; }
  function s8(buf, i)  { return (buf[i] << 24) >> 24; }
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

  function crc16Modbus(buf, offset, length) {
    let crc = 0xFFFF;
    const end = offset + length;
    for (let i = offset; i < end && i < buf.length; i++) {
      crc ^= (buf[i] & 0xff);
      for (let b = 0; b < 8; b++) {
        if (crc & 1) crc = (crc >>> 1) ^ 0xA001;
        else crc >>>= 1;
      }
    }
    return crc & 0xFFFF;
  }
  function appendCrc16(bytes) {
    const crc = crc16Modbus(bytes, 0, bytes.length);
    return Uint8Array.from([...bytes, crc & 0xff, (crc >> 8) & 0xff]);
  }

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

  const READ = {
    escInfo:        () => buildRead(OP.ESC_INFO, 0, 4),
    batInfoSN:      () => buildRead(OP.BAT_INFO, 0, 7),
    parameters:     () => buildRead(OP.READ_PARAMETER, 0, 16),
    serviceMileage: () => buildRead(OP.READ_PARAMETER, 74, 4),
    limitedSpeed:   () => buildRead(OP.READ_PARAMETER, 0x20, 1),
  };

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

  function buildBaseParamsFrame(state, headMonitor) {
    const val = encodeSwitchByte(state);
    return buildMonitor(val, state.limitCruise, state.limitMode1, state.limitMode2, state.limitMode3, headMonitor);
  }

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

  function buildSetMaxSpeed(kmh, head) {
    const raw = Math.max(0, Math.min(0xffff, Math.round(kmh * 10)));
    const value = Uint8Array.from([(raw >> 8) & 0xff, raw & 0xff]);
    return buildRwParam(0x20, value, head);
  }

  function buildControl(command) {
    return Uint8Array.from([HEAD_TRAN, command & 0xff, (~command) & 0xff, 0, 0, 0, 0, END_TRAN]);
  }
  const sendTran      = () => buildControl(0x00);
  const sendPack      = () => buildControl(0x01);
  const sendStopTran  = () => buildControl(0xFF);

  function buildKeep() {
    return Uint8Array.from([HEAD_TRAN, OP.KEEP, 0xFD, END_TRAN]);
  }

  function at(str) { return new TextEncoder().encode(str); }
  const AT = {
    pwd:            (p) => at("AT+PWD[" + p + "]"),
    setPwd:         (p) => at("AT+PWDM[" + p + "]"),
    hasPwdQuery:    ()  => at("AT+TYPE?"),
    setHasPwdOn:    ()  => at("AT+TYPE[B"),
    setHasPwdOff:   ()  => at("AT+TYPE[A"),
    setName:        (n) => at("AT+NAME[" + n + "]"),
    deviceQuery:    ()  => at("AT+DEVICE?"),
    driveTypeQuery: ()  => at("AT+DRIVEMODE?"),
    setDriveType:   (t) => at("AT+DRIVEMODE[" + t + "]"),
    nfcQuery:       ()  => at("AT+NFC?"),
    setNfc:         (b) => at("AT+NFC[" + (b ? "1" : "0") + "]"),
    nfcDelete:      ()  => at("AT+DEL[1]"),
    tlVoiceQuery:   ()  => at("AT+TLVOICEOFF?"),
    setTlVoice:     (t) => at("AT+TLVOICEOFF[" + t + "]"),
    uid:            ()  => at("AT+UID"),
    ludoQuery:      ()  => at("AT+SETLUDO:?"),
    setLudo:        (b) => at("AT+SETLUDO[" + (b ? "1" : "0") + "]"),
    fingerprintInfo:(id)=> at("AT+FGP" + id),
  };

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

  const ESC_CMDS = [OP.READ_PARAMETER, OP.ESC_INFO, OP.BAT_INFO, OP.WRITER_PARAMETER, OP.RW_PARAMETER, 0x90, 0x97, 0x81];
  function isEscStart(h, c, state) {
    return (h === HEAD_ESC || (state && h === state.customHeadEsc)) && ESC_CMDS.indexOf(c) >= 0;
  }
  function isMonStart(h, c, state) {
    return (c === 0x00 || c === 0x01) && (h === HEAD_MONITOR || h === 0xAF || (state && h === state.customHeadMonitor));
  }

  function parseData(buf, state) {
    const h0 = buf[0] & 0xff, c0 = buf[1] & 0xff;
    if (!isEscStart(h0, c0, state) && !isMonStart(h0, c0, state)) {
      for (let i = 1; i + 6 <= buf.length; i++) {
        if (isEscStart(buf[i] & 0xff, buf[i + 1] & 0xff, state) || isMonStart(buf[i] & 0xff, buf[i + 1] & 0xff, state)) {
          const r = parseFrameInner(buf.slice(i), state);
          r.hex = toHex(buf);
          return r;
        }
      }
    }
    return parseFrameInner(buf, state);
  }

  function parseFrameInner(buf, state) {
    const hex = toHex(buf);
    const head = buf[0] & 0xff;
    const cmd = buf[1] & 0xff;

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

    if (cmd === 0x00 || cmd === 0x01) {
      if (state) state.customHeadMonitor = head;
      if (cmd === 0x00) return { type: "monitor", data: parseMonitor(buf, state), hex };
      return { type: "baseParams", data: parseBaseParams(buf), hex };
    }

    return { type: "unknown", hex };
  }

  function parseMonitor(buf, state) {
    const rawSpeed = Math.max(u16BE(buf, 6), u16BE(buf, 8));
    const thousand = state && state.thousandUnits;
    const speed = thousand ? rawSpeed / 10.0 : rawSpeed / 1000.0;
    const voltage = u16BE(buf, 10) / 10.0;
    const current = s16BE(buf, 12) / 64.0;
    const reg0 = u16BE(buf, 21);
    return {
      electricity: u8(buf, 5),
      gearPosition: u8(buf, 4),
      speedRaw6: u16BE(buf, 6), speedRaw8: u16BE(buf, 8),
      speed: Math.round(speed * 10) / 10,
      voltage: Math.round(voltage * 10) / 10,
      current: Math.round(current * 10) / 10,
      escTemperature: s8(buf, 14),
      motorTemperature: s8(buf, 15),
      mileage: Math.round(u16BE(buf, 16) / 10.0 * 10) / 10,
      totalMileage: Math.round(u24BE(buf, 18) / 10.0 * 10) / 10,
      power: Math.round(voltage * current * 10) / 10,
      registerZero: reg0,
      switches: decodeSwitches(reg0),
      faultCodeHex: toHex(buf.slice(2, 22)),
    };
  }

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

  function collectBatInfo(buf, state) {
    const off = u16BE(buf, 2);
    for (let i = 0; i < 8; i++) state.batInfoBuf[off + i] = buf[5 + i];
    if (off === 8) return { complete: true, info: asciiTrim(state.batInfoBuf, 0, 16) };
    return { complete: false, at: off };
  }

  function collectParams(buf, state) {
    const reg = u16BE(buf, 2);
    const words = (buf[4] & 0xff) >> 1;
    for (let i = 0; i < words * 2; i++) state.paramsBuf[reg * 2 + i] = buf[5 + i];
    return { at: reg, words: words, full: parseFullAdvParams(state.paramsBuf) };
  }

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

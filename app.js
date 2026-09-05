'use strict';

const BUILD = (function () {
  try {
    const s = document.currentScript || Array.prototype.slice.call(document.scripts).find(function (x) { return /app\.js/.test(x.src); });
    const m = s && s.src.match(/[?&]v=([^&]+)/);
    return m ? ('v' + m[1]) : 'dev';
  } catch (e) { return 'dev'; }
})();
const LS_THEME = 'epf_theme', LS_LANG = 'epf_lang';

const $ = (id) => document.getElementById(id);

const state = {
  device: null, server: null,
  dataTx: null, dataRx: null, cmdTx: null, cmdRx: null,
  connected: false, pollTimer: null,
  thousandUnits: false,
  escInfoBuf: new Uint8Array(96),
  batInfoBuf: new Uint8Array(32),
  paramsBuf: new Uint8Array(400),

  monitorSeen: false, baseParamsSeen: false, uiPrefilled: false,
  base: {
    gearPosition: 0,
    headLightSw: false, atmosphereLightSw: false, cruiseControlSw: false,
    bootMode: false, metricInchSw: false, lockSw: false,
    limitCruise: 3, limitMode1: 6, limitMode2: 10, limitMode3: 20,
  },
  monitor: null, escInfo: null, batInfo: null, fullAdv: null, displayVersion: null,
};

const logLines = [];
function ts() {
  const d = new Date(), p = (n, w) => String(n).padStart(w || 2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
}
function log(m, cls) {
  const line = '[' + ts() + '] ' + m;
  logLines.push(line);
  const el = $('log'); if (!el) return;
  const span = document.createElement('div');
  if (cls) span.className = cls;
  span.textContent = line;
  el.insertBefore(span, el.firstChild);
}
function clearLog() { logLines.length = 0; const el = $('log'); if (el) el.textContent = ''; logDiagnosticHeader(); log('log cleared'); }
function logDiagnosticHeader() {
  const nav = (typeof navigator !== 'undefined') ? navigator : {};
  log('=== epf-unlock diagnostic ===');
  log('build: ' + BUILD);
  log('time: ' + new Date().toISOString());
  log('userAgent: ' + (nav.userAgent || '(unknown)'));
  log('webBluetooth: ' + (nav.bluetooth ? 'yes' : 'no'));
  log('=============================');
}
async function copyLog() {
  const text = logLines.join('\n');
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) { ok = false; }
  if (!ok) ok = copyLogFallback(text);
  log(ok ? 'log copied (' + logLines.length + ' lines)' : 'log copy failed, select text manually', ok ? 'log-ok' : 'log-err');
}
function copyLogFallback(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'copy-offscreen';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta); return !!ok;
  } catch (e) { return false; }
}

let lang = 'de';
function table() { return (window.I18N && window.I18N[lang]) || {}; }
function t(key) { const v = table()[key]; return (typeof v === 'string') ? v : ''; }
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach(n => {
    const v = t(n.getAttribute('data-t'));
    if (/[<&]/.test(v)) n.innerHTML = v; else n.textContent = v;   // scan-ok: trusted
  });
  { const el = $('link-guide'); if (el) el.href = docFile('GUIDE'); }
  { const el = $('link-readme'); if (el) el.href = 'README.md'; }
  { const el = $('link-license'); if (el) el.href = docFile('LICENSE'); }
  { const el = $('link-privacy'); if (el) el.href = docFile('PRIVACY'); }
  { const el = $('link-trademarks'); if (el) el.href = docFile('TRADEMARKS'); }
  { const el = $('langs'); if (el) el.setAttribute('aria-label', t('langGroup')); }
  { const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const el = $('btn-theme'); if (el) { el.setAttribute('aria-label', t(dark ? 'themeToLight' : 'themeToDark')); el.title = el.getAttribute('aria-label'); } }
  { const el = $('build-ver'); if (el) el.textContent = t('buildLabel') + ' ' + BUILD; }
  document.querySelectorAll('#langs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  { const el = $('status'); setStatus(el ? el.dataset.state : 'disconnected'); }
  updateLockState();
  try { localStorage.setItem(LS_LANG, lang); } catch (e) {}
}
function initLangSwitch() {
  document.querySelectorAll('#langs button').forEach(b => b.addEventListener('click', () => { lang = b.dataset.lang; applyLang(); }));
}

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const b = $('btn-theme');
  if (b) { b.textContent = dark ? '☀' : '☾'; b.setAttribute('aria-label', t(dark ? 'themeToLight' : 'themeToDark')); b.title = b.getAttribute('aria-label'); }
  try { localStorage.setItem(LS_THEME, dark ? 'dark' : 'light'); } catch (e) {}
}
function initTheme() {
  let saved = null; try { saved = localStorage.getItem(LS_THEME); } catch (e) {}
  applyTheme(saved !== 'light');
  const b = $('btn-theme');
  if (b) b.addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'light'));
}

const DOC_TITLES = {
  'GUIDE.de.md': 'footGuide', 'GUIDE.en.md': 'footGuide',
  'PRIVACY.de.md': 'footPrivacy', 'PRIVACY.md': 'footPrivacy',
  'LICENSE.de.md': 'footLicense', 'LICENSE.md': 'footLicense',
  'TRADEMARKS.de.md': 'footTrademarks', 'TRADEMARKS.md': 'footTrademarks',
  'README.md': 'footReadme',
};
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = s => s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/ /g, '-');
function mdToHtml(src) {
  const inline = s => escHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, href) => {
      if (DOC_TITLES[href]) return `<a href="${href}" data-docfile="${href}">${text}</a>`;
      if (href.startsWith('#')) return `<a href="${href}" data-anchor="${href.slice(1)}">${text}</a>`;
      return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
    });
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = []; let listKind = null, li = null, para = [], inFence = false;
  const sink = () => (li ? li.parts : out);
  const flushPara = () => { if (para.length) { sink().push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const closeNested = () => { if (li && li.nested) { li.parts.push('</ul>'); li.nested = false; } };
  const closeLi = () => { if (!li) return; flushPara(); closeNested(); out.push('<li>' + li.parts.join('\n') + '</li>'); li = null; };
  const closeList = () => { closeLi(); if (listKind) { out.push('</' + listKind + '>'); listKind = null; } };
  const block = () => { flushPara(); closeList(); };
  const openList = kind => { flushPara(); if (listKind !== kind) { closeList(); out.push('<' + kind + '>'); listKind = kind; } else closeLi(); };
  const cells = l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], body = l.trim(), indented = /^ {2,}\S/.test(l);
    if (inFence) { if (body.startsWith('```')) { sink().push('</code></pre>'); inFence = false; } else sink().push(escHtml(l)); continue; }
    if (body.startsWith('```')) { if (li) { flushPara(); closeNested(); } else block(); sink().push('<pre><code>'); inFence = true; continue; }
    if (body === '') { if (li && /^ {2,}\S/.test(lines[i + 1] || '')) flushPara(); else block(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(body)) { block(); out.push('<hr>'); continue; }
    if (body.startsWith('|') && /^\|[\s:|-]+\|?\s*$/.test((lines[i + 1] || '').trim())) {
      if (li) { flushPara(); closeNested(); } else block();
      sink().push('<div class="doc-table"><table><thead><tr>' + cells(body).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>');
      i++;
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) sink().push('<tr>' + cells(lines[++i].trim()).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>');
      sink().push('</tbody></table></div>'); continue;
    }
    let m;
    if ((m = body.match(/^(#{1,4})\s+(.*)$/))) { block(); const n = m[1].length; out.push(`<h${n} id="${slug(m[2])}">${inline(m[2])}</h${n}>`); continue; }
    if ((m = body.match(/^>\s?(.*)$/))) { if (li) { flushPara(); closeNested(); } else block(); sink().push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
    if (indented && li && (m = body.match(/^[-*]\s+(.*)$/))) { flushPara(); if (!li.nested) { li.parts.push('<ul class="nested">'); li.nested = true; } li.parts.push('<li>' + inline(m[1]) + '</li>'); continue; }
    if ((m = body.match(/^[-*]\s+(.*)$/)) && !indented) { openList('ul'); li = { parts: [inline(m[1])], nested: false }; continue; }
    if ((m = body.match(/^\d+\.\s+(.*)$/)) && !indented) { openList('ol'); li = { parts: [inline(m[1])], nested: false }; continue; }
    if (li && !indented) closeList();
    if (li) closeNested();
    para.push(body);
  }
  if (inFence) sink().push('</code></pre>');
  block();
  return out.join('\n').replace(/<pre><code>\n/g, '<pre><code>');
}
const docCache = {};
const docFile = name => { if (name === 'GUIDE') return `GUIDE.${lang}.md`; if (name === 'README') return 'README.md'; return lang === 'de' ? `${name}.de.md` : `${name}.md`; };
function openDoc(name, anchor, titleKey) { openDocFile(docFile(name), anchor, titleKey); }
function openDocFile(file, anchor, titleKey) {
  const dlg = $('doc'), body = $('doc-body'); if (!dlg || !body) return;
  const mark = (lang === 'de' && !file.includes('.de.') && file !== 'README.md') ? ' ' + t('docEnglish') : '';
  $('doc-title').textContent = (t(titleKey || DOC_TITLES[file] || '') || file) + mark;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  const show = html => {
    body.innerHTML = html;   // scan-ok: trusted
    const h1 = body.querySelector('h1');
    if (h1) { $('doc-title').textContent = h1.textContent.trim() + mark; h1.remove(); }
    body.scrollTop = 0;
  };
  if (docCache[file]) { show(docCache[file]); return; }
  body.textContent = t('docLoading');
  fetch(file + '?v=' + BUILD)
    .then(r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.text(); })
    .then(txt => { docCache[file] = mdToHtml(txt); show(docCache[file]); })
    .catch(e => {
      body.textContent = '';
      const p = document.createElement('p'); p.textContent = t('docFail');
      const pre = document.createElement('pre'); pre.textContent = file + ': ' + (e && e.message ? e.message : e);
      body.appendChild(p); body.appendChild(pre);
    });
}
const HELP = {
  disclaimer: ['footDisclaimer', 'disclaimerText'],
  adv: ['advTitle', 'helpAdv'],

  hLs: ['lsTitle', 'hLs'], hMaxRow: ['lblMax', 'hMaxRow'],
  hEco: ['lblEco', 'hEco'], hComfort: ['lblComfort', 'hComfort'], hSport: ['lblSport', 'hSport'], hCruise: ['lblCruise', 'hCruise'],

  hGear: ['lblGear', 'hGear'], hHead: ['lblHead', 'hHead'], hAtmo: ['lblAtmo', 'hAtmo'], hCruiseSw: ['lblCruiseSw', 'hCruiseSw'],
  hBoot: ['lblBoot', 'hBoot'], hUnit: ['lblUnit', 'hUnit'], hLock: ['lblLock', 'hLock'],

  hName: ['lblName', 'hName'], hNewPwd: ['lblNewPwd', 'hNewPwd'], hPwdProt: ['lblPwdProt', 'hPwdProt'],
  hNfc: ['lblNfc', 'hNfc'], hBlinker: ['lblBlinker', 'hBlinker'], hDrive: ['lblDrive', 'hDrive'],
};
function openHelp(key) {
  const m = HELP[key]; if (!m) return;
  const dlg = $('help'); if (!dlg) return;
  const ti = $('help-title'); if (ti) ti.textContent = t(m[0]);
  const bo = $('help-body'); if (bo) bo.textContent = t(m[1]);
  if (dlg.showModal) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', '');
}
function wireDocViewer() {
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const disc = e.target.closest('[data-open-disclaimer]');
    if (disc) { e.preventDefault(); openHelp('disclaimer'); return; }
    const hb = e.target.closest('[data-help]');
    if (hb) { e.preventDefault(); openHelp(hb.getAttribute('data-help')); return; }
    const a = e.target.closest('[data-doc], [data-docfile]');
    if (!a) return;
    e.preventDefault();
    const file = a.getAttribute('data-docfile'), titleKey = a.getAttribute('data-t') || '';
    if (file) openDocFile(file, '', titleKey); else openDoc(a.getAttribute('data-doc'), '', titleKey);
  });
  ['doc-x', 'doc-close'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', () => { const d = $('doc'); if (d) d.close(); }); });
  ['help-x', 'help-close'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', () => { const d = $('help'); if (d) d.close(); }); });
}

function statusLabel(s) {
  const map = { disconnected: 'stDisconnected', connecting: 'stConnecting', linking: 'stLinking', connected: 'stConnected', 'no-service': 'stNoService', 'no-char': 'stNoChar' };
  return t(map[s] || 'stDisconnected') || s;
}
function setStatus(s) {
  const el = $('status'); if (el) { el.dataset.state = s; el.textContent = statusLabel(s); }
  const cb = $('btn-conn');
  if (cb) { const on = (s === 'connecting' || s === 'linking' || s === 'connected'); cb.textContent = on ? t('btnDisconnect') : t('btnConnect'); cb.dataset.act = on ? 'disconnect' : 'connect'; }
}
const CTRL_IDS = ['btn-lock-toggle', 'btn-write-gears', 'max-in', 'lm1-in', 'lm2-in', 'lm3-in', 'lc-in', 'btn-gear', 'btn-head', 'btn-atmo', 'btn-cruise',
  'btn-boot', 'btn-unit', 'btn-lock', 'name-in', 'btn-name', 'newpwd-in', 'btn-setpwd', 'btn-pwdprot',
  'btn-nfc', 'btn-blinker', 'drive-in', 'btn-drive', 'btn-delnfc', 'btn-resettrip',
  'btn-qdevice', 'btn-quid', 'btn-qtype'];
function setControlsEnabled(on) { CTRL_IDS.forEach(id => { const el = $(id); if (el) el.disabled = !on; }); }

async function connect() {
  if (!navigator.bluetooth) { log('web bluetooth unavailable, use chrome/edge over https or localhost', 'log-err'); return; }
  const U = EPF.UUID;
  const optionalServices = [U.DATA_SERVICE, U.CMD_SERVICE, U.OTA_SERVICE, U.DEVINFO, '00001800-0000-1000-8000-00805f9b34fb'];
  const opts = { acceptAllDevices: true, optionalServices };
  setStatus('connecting');
  try { state.device = await navigator.bluetooth.requestDevice(opts); }
  catch (e) { setStatus('disconnected'); log('device selection cancelled: ' + e.message, 'log-err'); return; }
  state.device.addEventListener('gattserverdisconnected', onDisconnected);
  { const di = $('devinfo'); if (di) di.textContent = t('devPrefix') + ' ' + (state.device.name || '(no name)'); }
  log('device: ' + (state.device.name || '(no name)') + ' (' + state.device.id + ')', 'log-tx');
  try {
    state.server = await state.device.gatt.connect();
    const dataSvc = await state.server.getPrimaryService(U.DATA_SERVICE);
    state.dataTx = await dataSvc.getCharacteristic(U.DATA_TX);
    state.dataRx = await dataSvc.getCharacteristic(U.DATA_RX);
    const cmdSvc = await state.server.getPrimaryService(U.CMD_SERVICE);
    state.cmdTx = await cmdSvc.getCharacteristic(U.CMD_TX);
    state.cmdRx = await cmdSvc.getCharacteristic(U.CMD_RX);
    await state.dataRx.startNotifications();
    state.dataRx.addEventListener('characteristicvaluechanged', onDataNotify);
    await state.cmdRx.startNotifications();
    state.cmdRx.addEventListener('characteristicvaluechanged', onCmdNotify);
  } catch (e) {
    setStatus('no-service'); log('connect/service failed: ' + e.message, 'log-err');
    log('scooter may only advertise F1F0/F2F0 when on and not linked to the manufacturer app', 'log-err');
    return;
  }
  state.connected = true; setStatus('linking'); setControlsEnabled(true);
  await initSequence();
  setStatus('connected');
}
async function initSequence() {
  log('connected, init sequence', 'log-ok');
  await writeCmd(EPF.AT.hasPwdQuery(), 'AT+TYPE?');
  const pwd = $('pwd-in').value;
  if (pwd) { await sleep(150); await writeCmd(EPF.AT.pwd(pwd), 'AT+PWD[***]'); }

  for (let i = 0; i < 5; i++) { await writeData(EPF.sendStopTran(), 'stop-tran'); await sleep(50); }
  for (let i = 0; i < 3; i++) { await writeData(EPF.buildKeep(), 'keep'); await sleep(50); }

  await readWithTran(EPF.READ.escInfo(), 'read esc-info');
  await readWithTran(EPF.READ.batInfoSN(), 'read sn');
  await readWithTran(EPF.READ.parameters(), 'read parameters');
  await readWithTran(EPF.READ.serviceMileage(), 'read service-km');
  await readWithTran(EPF.READ.limitedSpeed(), 'read maxspeed');

  if (state.device && state.device.name) $('name-in').value = state.device.name;
  await sleep(120); await writeCmd(EPF.AT.nfcQuery(), 'AT+NFC?');
  await sleep(150); await writeCmd(EPF.AT.tlVoiceQuery(), 'AT+TLVOICEOFF?');
  await sleep(150); await writeCmd(EPF.AT.driveTypeQuery(), 'AT+DRIVEMODE?');
  await backToMonitor();
  startPoll();
}

async function backToMonitor() {
  for (let i = 0; i < 5; i++) { await writeData(EPF.sendStopTran(), 'stop-tran'); await sleep(40); }
  for (let i = 0; i < 3; i++) { await writeData(EPF.buildKeep(), 'keep'); await sleep(40); }
}

async function readWithTran(frame, label) {
  await writeData(EPF.sendTran(), 'tran');
  await sleep(60);
  await writeData(frame, label);
  await sleep(220);
}
function onDisconnected() { log('disconnected', 'log-err'); stopPoll(); state.connected = false; state.monitorSeen = false; state.baseParamsSeen = false; state.uiPrefilled = false; state.monitor = null; setControlsEnabled(false); resetReadFields(); setStatus('disconnected'); }
function resetReadFields() {
  ['gear-in', 'head-in', 'atmo-in', 'cruise-in', 'boot-in', 'unit-in', 'lock-in', 'pwdprot-in', 'nfc-in', 'blinker-in', 'name-in', 'drive-in'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  ['t-speed', 't-mode', 't-batt', 't-lock', 't-volt', 't-curr', 't-power', 't-esctemp', 't-motortemp', 't-trip', 't-total', 't-fw'].forEach(id => setTile(id, null));
}
async function disconnect() { stopPoll(); if (state.device && state.device.gatt.connected) state.device.gatt.disconnect(); }
function startPoll() {
  stopPoll();

  state.pollTimer = setInterval(() => {
    if (state.connected) writeData(EPF.buildKeep(), 'keep').catch(() => {});
  }, 1500);
  log('poll started (nur keep-heartbeat, monitor-modus)');
}
function stopPoll() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function writeData(bytes, label) {
  if (!state.dataTx) { log('not connected', 'log-err'); return; }
  try {
    if (state.dataTx.properties.writeWithoutResponse) await state.dataTx.writeValueWithoutResponse(bytes);
    else await state.dataTx.writeValueWithResponse(bytes);
    log('TX ' + (label ? label + ' ' : '') + EPF.toHex(bytes), 'log-tx');
  } catch (e) { log('data write failed: ' + e.message, 'log-err'); }
}
async function writeCmd(bytes, label) {
  if (!state.cmdTx) { log('not connected', 'log-err'); return; }
  try {
    if (state.cmdTx.properties.writeWithoutResponse) await state.cmdTx.writeValueWithoutResponse(bytes);
    else await state.cmdTx.writeValueWithResponse(bytes);
    log('TX ' + (label ? label + ' ' : '') + new TextDecoder().decode(bytes), 'log-tx');
  } catch (e) { log('cmd write failed: ' + e.message, 'log-err'); }
}
function baseReady() { return state.monitorSeen && state.baseParamsSeen; }

async function sendBaseChange(changes) {
  if (!baseReady()) { log('abgebrochen: Geraetezustand noch nicht vollstaendig gelesen (Telemetrie plus Basiswerte), damit keine Default-Schalter geschrieben werden', 'log-err'); return; }
  const clone = Object.assign({}, state.base, changes);

  await writeData(EPF.buildBaseParamsFrame(clone, state.customHeadMonitor), 'setBaseParams');
}

function onDataNotify(ev) { const buf = new Uint8Array(ev.target.value.buffer); const r = EPF.parseData(buf, state); log('RX ' + r.type + ' ' + r.hex, 'log-rx'); applyData(r); }
function onCmdNotify(ev) { const buf = new Uint8Array(ev.target.value.buffer); const r = EPF.parseCmd(buf); log('RX cmd ' + r.kind + ': ' + r.raw, 'log-rx'); applyCmd(r); }
function applyData(r) {
  if (!r || !r.type) return;
  switch (r.type) {
    case 'monitor':

      state.monitor = r.data; Object.assign(state.base, r.data.switches);

      if (r.data.gearPosition != null) state.base.gearPosition = r.data.gearPosition;
      state.monitorSeen = true; renderTiles(); maybePrefillInputs(); break;
    case 'baseParams':
      state.baseParamsSeen = true;
      state.base.limitCruise = r.data.limitCruise; state.base.limitMode1 = r.data.limitMode1;
      state.base.limitMode2 = r.data.limitMode2; state.base.limitMode3 = r.data.limitMode3;
      state.thousandUnits = r.data.thousandUnits; state.displayVersion = r.data.displayVersion;
      renderInfo(); renderTiles(); maybePrefillInputs(); break;
    case 'params': if (r.data && r.data.full) { state.fullAdv = r.data.full; renderAdv(); syncMaxInput(); } break;
    case 'escInfo': if (r.data && r.data.complete) { state.escInfo = r.data; renderInfo(); renderTiles(); } break;
    case 'batInfo': if (r.data && r.data.complete) { state.batInfo = r.data; renderInfo(); } break;
    case 'writeAck': log('param write ack: ' + (r.ok ? 'ok' : 'FAIL'), r.ok ? 'log-ok' : 'log-err'); break;
    case 'rwAck': log('rw write ack: ' + (r.ok ? 'ok' : 'FAIL'), r.ok ? 'log-ok' : 'log-err'); break;
  }
}
function setSel(id, on) { const el = $(id); if (el) el.value = on ? '1' : '0'; }
function firstIsOne(v) { return String(v == null ? '' : v).trim().charAt(0) === '1'; }
function applyCmd(r) {
  switch (r.kind) {
    case 'pwdOk': log('password/handshake accepted', 'log-ok'); break;
    case 'pwdFailed': log('password wrong (OK+PWD:N)', 'log-err'); break;
    case 'hasPwd': setSel('pwdprot-in', r.value); log('password protection on device: ' + (r.value ? 'yes' : 'no')); break;
    case 'device': setInfoRow('infoDevType', r.value); break;
    case 'uid': setInfoRow('infoUidAt', r.value); break;
    case 'nfc': setSel('nfc-in', firstIsOne(r.value)); break;
    case 'tlVoice': setSel('blinker-in', firstIsOne(r.value)); break;
    case 'driveType': { const el = $('drive-in'); if (el) el.value = String(r.value).trim(); setInfoRow('infoDevType', 'drive ' + r.value); break; }
    case 'setName': log('set name: ' + (r.value ? 'ok' : 'fail'), r.value ? 'log-ok' : 'log-err'); break;
    case 'setPwd': log('set password: ' + (r.value ? 'ok' : 'fail'), r.value ? 'log-ok' : 'log-err'); break;
  }
}

function setTile(id, val) { const el = $(id); if (el) el.textContent = (val == null || val === '' ? '-' : val); }

const GEAR_NAMES = { 0: 'Eco', 1: 'Comfort', 2: 'Sport' };
function renderTiles() {
  const m = state.monitor;
  if (m) {
    setTile('t-speed', m.speed); setTile('t-mode', GEAR_NAMES[m.gearPosition] || m.gearPosition);
    setTile('t-batt', m.electricity + ' %'); setTile('t-lock', m.switches.lockSw ? t('valLocked') : t('valUnlocked'));
    setTile('t-volt', m.voltage + ' V'); setTile('t-curr', m.current + ' A'); setTile('t-power', m.power + ' W');
    setTile('t-esctemp', m.escTemperature); setTile('t-motortemp', m.motorTemperature);
    setTile('t-trip', m.mileage); setTile('t-total', m.totalMileage);
  }
  const fw = (state.escInfo && state.escInfo.firmware) || state.displayVersion;
  setTile('t-fw', fw || null);
}
const ADV_ROWS = [
  ['limitedSpeedValue', 'Geschwindigkeitsbegrenzung (gelesen)', ''],
  ['maxDischargeCurrent', 'Max. Entladestrom', 'A'], ['maxBrakingCurrent', 'Max. Bremsstrom', 'A'],
  ['voltageProtection', 'Spannungsschutz', 'V'], ['maxModulationDepth', 'Modulationstiefe', '%'],
  ['motorPolePairs', 'Motor-Polpaare', ''], ['acceleratedThrottleResponse', 'Gasansprechverhalten', '1-10'],
  ['acceleratorBrakeResponse', 'Bremsansprechverhalten', '1-10'], ['motorDiameter', 'Raddurchmesser', ''],
  ['pwmFrequency', 'PWM-Frequenz', ''], ['cruiseTime', 'Tempomat-Zeit', ''], ['shutdownTime', 'Abschaltzeit', ''],
  ['serviceMileage', 'Wartungsintervall', 'km'], ['lastServiceMileage', 'Letzte Wartung', 'km'],
];
function advRow(body, label, value) {
  const tr = document.createElement('tr');
  const td1 = document.createElement('td'); td1.textContent = label;
  const td2 = document.createElement('td'); td2.textContent = value;
  tr.appendChild(td1); tr.appendChild(td2); body.appendChild(tr);
}
function renderAdv() {
  const a = state.fullAdv, body = $('adv-body'); if (!a || !body) return;
  body.textContent = '';
  ADV_ROWS.forEach(([k, lbl, u]) => advRow(body, lbl, (a[k] !== undefined ? a[k] : '-') + (u ? ' ' + u : '')));
  advRow(body, 'Tempomat (Schalter)', a.cruiseSw ? 'an' : 'aus');
  advRow(body, 'Metrisch', a.isMetric ? 'km' : 'mph');
  advRow(body, 'Zero-Start', a.isZeroStart ? 'an' : 'aus');
}
function setInfoRow(key, value) {
  const body = $('info-body'); if (!body) return;
  let row = [...body.rows].find(r => r.dataset.k === key);
  if (!row) { row = body.insertRow(); row.dataset.k = key; row.insertCell(); row.insertCell(); }
  row.cells[0].textContent = t(key) || key; row.cells[1].textContent = value;
}
function renderInfo() {
  const e = state.escInfo;
  if (e) { setInfoRow('infoModel', e.model); setInfoRow('infoHw', e.hardware); setInfoRow('infoFw', e.firmware); setInfoRow('infoBoot', e.boot); setInfoRow('infoUid', e.uniquecode); }
  if (state.batInfo) setInfoRow('infoSn', state.batInfo.info);
  if (state.displayVersion) setInfoRow('infoVer', state.displayVersion);
}

function maybePrefillInputs() {
  if (state.uiPrefilled || !baseReady()) return;
  renderTuningInputs();
  syncSettingSelects();
  state.uiPrefilled = true;
}
function renderTuningInputs() {
  $('lm1-in').value = state.base.limitMode1; $('lm2-in').value = state.base.limitMode2;
  $('lm3-in').value = state.base.limitMode3; $('lc-in').value = state.base.limitCruise;
}
function syncSettingSelects() {
  const b = state.base;
  $('gear-in').value = String(b.gearPosition != null ? b.gearPosition : 0);
  $('head-in').value = b.headLightSw ? '1' : '0';
  $('atmo-in').value = b.atmosphereLightSw ? '1' : '0';
  $('cruise-in').value = b.cruiseControlSw ? '1' : '0';
  $('boot-in').value = b.bootMode ? '1' : '0';
  $('unit-in').value = b.metricInchSw ? '1' : '0';
  $('lock-in').value = b.lockSw ? '1' : '0';
}

function syncMaxInput() {
  const v = state.fullAdv && state.fullAdv.limitedSpeedValue;
  const el = $('max-in');
  if (el && typeof v === 'number' && v > 0 && !el.value) el.value = v;
  updateLockState();
}

function isUnlocked() {
  const v = state.fullAdv && state.fullAdv.limitedSpeedValue;
  return typeof v === 'number' && v > 22;
}

function updateLockState() {
  const btn = $('btn-lock-toggle'); if (!btn) return;
  const v = state.fullAdv && state.fullAdv.limitedSpeedValue;
  const st = $('ls-state');
  if (!state.connected || typeof v !== 'number' || v <= 0) {
    btn.textContent = t('btnUnlock');
    if (st) st.textContent = '';
    return;
  }
  const unlocked = v > 22;
  btn.textContent = unlocked ? t('btnLock') : t('btnUnlock');
  if (st) st.textContent = (unlocked ? t('lsStateUnlocked') : t('lsStateLocked')) + ' (' + v + ' km/h)';
}

function clampByte(v) { let n = parseInt(v, 10); if (isNaN(n)) n = 0; return Math.max(0, Math.min(255, n)); }

async function writeGears() {
  if (!baseReady()) { log('abgebrochen: Geraetezustand noch nicht vollstaendig gelesen', 'log-err'); return; }
  await sendBaseChange({
    limitMode1: clampByte($('lm1-in').value), limitMode2: clampByte($('lm2-in').value),
    limitMode3: clampByte($('lm3-in').value), limitCruise: clampByte($('lc-in').value),
  });
}

async function applyDrossel(maxKmh) {
  if (!baseReady()) { log('abgebrochen: Geraetezustand noch nicht vollstaendig gelesen', 'log-err'); return; }
  await sendBaseChange({ limitMode3: maxKmh });
  await sleep(160);
  await writeData(EPF.sendTran(), 'tran'); await sleep(40);
  await writeData(EPF.buildSetMaxSpeed(maxKmh, state.customHeadEsc), 'setMaxSpeed'); await sleep(220);
  await backToMonitor();
  await readWithTran(EPF.READ.limitedSpeed(), 'read maxspeed'); await backToMonitor();
}
function wireControls() {
  $('btn-conn').addEventListener('click', () => { if ($('btn-conn').dataset.act === 'disconnect') disconnect(); else connect(); });

  $('btn-write-gears').addEventListener('click', writeGears);

  $('btn-lock-toggle').addEventListener('click', async () => {
    if (isUnlocked()) {
      await applyDrossel(22);
    } else {
      const mx = parseInt($('max-in').value, 10);
      if (isNaN(mx) || mx < 1 || mx > 99) { log('Hoechstgeschwindigkeit: Wert 1 bis 99 km/h erwartet', 'log-err'); return; }
      await applyDrossel(mx);
    }
  });

  const sw = (btn, sel, key) => $(btn).addEventListener('click', () => sendBaseChange({ [key]: ($(sel).value === '1') }));
  $('btn-gear').addEventListener('click', () => { const g = parseInt($('gear-in').value, 10); if (!isNaN(g)) sendBaseChange({ gearPosition: g }); });
  sw('btn-head', 'head-in', 'headLightSw');
  sw('btn-atmo', 'atmo-in', 'atmosphereLightSw');
  sw('btn-cruise', 'cruise-in', 'cruiseControlSw');
  sw('btn-boot', 'boot-in', 'bootMode');
  sw('btn-unit', 'unit-in', 'metricInchSw');
  sw('btn-lock', 'lock-in', 'lockSw');

  $('btn-name').addEventListener('click', () => { const n = $('name-in').value.trim(); if (n) writeCmd(EPF.AT.setName(n), 'AT+NAME'); });
  $('btn-setpwd').addEventListener('click', () => { const p = $('newpwd-in').value; if (p) writeCmd(EPF.AT.setPwd(p), 'AT+PWDM'); });
  $('btn-pwdprot').addEventListener('click', () => writeCmd($('pwdprot-in').value === '1' ? EPF.AT.setHasPwdOn() : EPF.AT.setHasPwdOff(), 'AT+TYPE'));
  $('btn-nfc').addEventListener('click', () => writeCmd(EPF.AT.setNfc($('nfc-in').value === '1'), 'AT+NFC'));
  $('btn-blinker').addEventListener('click', () => writeCmd(EPF.AT.setTlVoice($('blinker-in').value === '1' ? 1 : 0), 'AT+TLVOICEOFF'));
  $('btn-drive').addEventListener('click', () => writeCmd(EPF.AT.setDriveType(parseInt($('drive-in').value, 10) || 0), 'AT+DRIVEMODE'));
  $('btn-delnfc').addEventListener('click', () => writeCmd(EPF.AT.nfcDelete(), 'AT+DEL'));
  $('btn-resettrip').addEventListener('click', () => log('note: trip reset is bound to setBaseParams(pos 2) in the app, not proven as its own frame; not sent', 'log-err'));

  $('btn-qdevice').addEventListener('click', () => writeCmd(EPF.AT.deviceQuery(), 'AT+DEVICE?'));
  $('btn-quid').addEventListener('click', () => writeCmd(EPF.AT.uid(), 'AT+UID'));
  $('btn-qtype').addEventListener('click', () => writeCmd(EPF.AT.hasPwdQuery(), 'AT+TYPE?'));

  $('btn-copy-log').addEventListener('click', copyLog);
  $('btn-clear-log').addEventListener('click', clearLog);
  $('btn-diag').addEventListener('click', diagnostic);
}
async function diagnostic() {
  logDiagnosticHeader();
  if (!navigator.bluetooth) { log('no web bluetooth', 'log-err'); return; }
  try {
    const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [EPF.UUID.DATA_SERVICE, EPF.UUID.CMD_SERVICE, EPF.UUID.OTA_SERVICE, EPF.UUID.DEVINFO, '00001800-0000-1000-8000-00805f9b34fb'] });
    log('diag device: ' + (dev.name || '(no name)') + ' (' + dev.id + ')');
    const srv = await dev.gatt.connect();
    const svcs = await srv.getPrimaryServices();
    for (const s of svcs) { log('  service ' + s.uuid); try { for (const c of await s.getCharacteristics()) log('    char ' + c.uuid); } catch (e) {} }
    dev.gatt.disconnect();
  } catch (e) { log('diag failed: ' + e.message, 'log-err'); }
}

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  try { const l = localStorage.getItem(LS_LANG); if (l === 'de' || l === 'en') lang = l; } catch (e) {}
  applyLang();
  initLangSwitch();
  wireDocViewer();
  wireControls();
  setControlsEnabled(false);
  setStatus('disconnected');
  logDiagnosticHeader();
  if (!navigator.bluetooth) log('navigator.bluetooth missing, use chrome/edge over https or localhost', 'log-err');
  log('ready');
});

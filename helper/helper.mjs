// Tiwari TV's helper at home: runs on the Mac (or any always-on computer on the home Wi-Fi).
//
// It listens to the phone channel and talks to the TV through LG's own remote-control connection (the one LG's
// ThinQ app uses), which works whatever is on screen, including while Tiwari TV is paused behind Netflix:
//   /vol up · /vol down · /vol 20 · /mute (toggles) · /key play|pause|home|back|ok|up|down|left|right
//   /tiwari (bring Tiwari TV to the front) · /open <app id> (when Tiwari TV isn't in front to do it)
//   /status (the phone asks; the helper answers with the volume and what's on screen)
//   notes, while another app is in front, show as a small TV notification; "Hey TV" brings Tiwari TV forward.
//   It also sends Tiwari TV the TV's apps with their own icons (newer TVs won't list them to a Developer Mode app).
//
//   node helper.mjs          # what macOS keeps running (scripts/tv.sh helper sets it up)
//   node helper.mjs --pair   # once: the TV asks to allow the connection
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import WebSocket from 'ws';
import * as Seal from './seal.mjs';

const STATE = process.env.TIWARI_STATE || path.join(os.homedir(), '.tiwari-tv');
const NTFY = process.env.TIWARI_NTFY || 'https://ntfy.sh/';
const APP_ID = 'com.tiwari.tv';
const KEYS = {play: 'PLAY', pause: 'PAUSE', home: 'HOME', back: 'BACK', ok: 'ENTER', up: 'UP', down: 'DOWN',
  left: 'LEFT', right: 'RIGHT', exit: 'EXIT'};
const ASK = /^\s*(hey[\s,]+tv|ok[\s,]+tv|tv)\s*[,:!.-]?\s+/i;

const settings = JSON.parse(fs.readFileSync(path.join(STATE, 'helper.json'), 'utf8'));   // {host, channel, secret}
// With the family's secret, everything on the channel is sealed (seal.mjs): only sealed messages are obeyed.
const KEY = Seal.keyFrom(settings.secret);
const pairing = process.argv.includes('--pair');
const listing = process.argv.includes('--apps');   // a check-up: what the TV says about its apps' icons

function log(...a) { console.log(new Date().toISOString().slice(0, 16).replace('T', ' '), ...a); }

// MARK: - The TV

// Newer LG firmware turns down the signed "LG Remote App" request lgtv2 makes first ("blacklisted certificate"), and
// the plain request lgtv2 falls back to leaves out READ_INSTALLED_APPS, which listing the apps and their icons needs
// (401 insufficient permissions). It is added to that request here. lgtv2 reads it from the same file, once.
const PERMISSIONS = ['READ_INSTALLED_APPS'];
const PERMS_FILE = path.join(STATE, 'lgtv-permissions'), KEY_FILE = path.join(STATE, 'lgtv-key');
try {
  const need = createRequire(import.meta.url);
  const request = need(path.join(path.dirname(need.resolve('lgtv2/package.json')), 'pairing.json'));
  for (const p of PERMISSIONS) if (request.manifest.permissions.indexOf(p) < 0) request.manifest.permissions.push(p);
} catch (e) { /* a different lgtv2: it asks for what it asks for */ }
// A TV paired before this was allowed less: pairing again asks the TV for the new permission (Accept on the TV).
if (pairing && fs.existsSync(KEY_FILE) && (!fs.existsSync(PERMS_FILE) || fs.readFileSync(PERMS_FILE, 'utf8') !== PERMISSIONS.join(','))) {
  fs.renameSync(KEY_FILE, KEY_FILE + '.old');
}
/** Pairing didn't happen: the key from before still works, for what it was allowed. */
function keepOldKey() {
  if (!fs.existsSync(KEY_FILE) && fs.existsSync(KEY_FILE + '.old')) fs.renameSync(KEY_FILE + '.old', KEY_FILE);
}

const LGTV = (await import(process.env.TIWARI_TV_MODULE || 'lgtv2')).default;
const tv = new LGTV({host: settings.host, keyFile: KEY_FILE, reconnect: 5000});
let connected = false, volume = null, muted = null, buttons = null;

tv.on('prompt', () => log('On the TV: accept the request to allow Tiwari TV Helper.'));
tv.on('error', (err) => {
  if (!pairing) { log('TV:', err.message || err); return; }
  if (/403|cancel|reject/i.test(String(err && err.message || err))) {
    keepOldKey();
    log('The TV said no (' + (err.message || err) + '). Run it again and press Accept on the TV.');
    process.exit(1);
  }
});
tv.on('close', () => { connected = false; buttons = null; });
tv.on('connect', () => {
  connected = true;
  log('Connected to the TV' + (listing ? '.' : ' at ' + settings.host));
  tv.subscribe('ssap://audio/getVolume', (err, res) => {
    if (err || !res) return;
    if (typeof res.volume === 'number') volume = res.volume;
    if (typeof res.muted === 'boolean') muted = res.muted;
    statusSoon();
  });
  if (pairing) {
    fs.writeFileSync(PERMS_FILE, PERMISSIONS.join(','));
    log('Paired. Tiwari TV Helper can now control the TV.');
    // Can it see the apps (for the logos)? If not, the reading pairing: one more Accept on the TV.
    launchPoints(true)
      .then((points) => log('It can see the TV\'s', points.length, 'apps too, for the logos.'))
      .catch((err) => log('It can\'t see the TV\'s apps, so no logos:', err.message || err))
      .then(() => setTimeout(() => process.exit(0), 500));
    return;
  }
  if (listing) { checkApps().then(() => process.exit(0)); return; }
  setTimeout(sendIcons, 3000);
});

// MARK: - The TV's apps and their icons, for Tiwari TV (a file on the channel, sent only when they change)

const ICONS_SENT = path.join(STATE, 'icons-sent');

/** The places an app's icon may be, as links the helper can fetch from the TV. */
function iconUrls(p) {
  const out = [];
  const add = (u) => { if (u && out.indexOf(u) < 0) out.push(u); };
  for (const f of ['largeIcon', 'mediumLargeIcon', 'icon', 'extraLargeIcon']) {
    let u = p[f];
    if (!u || typeof u !== 'string') continue;
    if (u[0] === '/') u = 'http://' + settings.host + ':3000' + u;   // a path on the TV: its web server may have it
    if (!/^https?:/.test(u)) continue;
    add(u);
    // Newer TVs only answer on the secure port (3001, with the TV's own certificate).
    const m = u.match(/^http:\/\/([^/:]+):3000(\/.*)$/);
    if (m) add('https://' + m[1] + ':3001' + m[2]);
  }
  return out;
}

/** What a picture is, from its first bytes (the TV sends icons without saying). */
function sniff(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
  if (b.length > 6 && b.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (/^\s*(<\?xml[^>]*>\s*)?<svg/i.test(b.subarray(0, 200).toString('utf8'))) return 'image/svg+xml';
  return '';
}

/** Whether the picture has all arrived (the TV's server may never say it is done). */
function whole(b, type) {
  if (type === 'image/png') return b.length > 20 && b.subarray(b.length - 12).toString('latin1').indexOf('IEND') >= 0;
  if (type === 'image/jpeg') return b.length > 4 && b[b.length - 2] === 0xFF && b[b.length - 1] === 0xD9;
  if (type === 'image/svg+xml') return /<\/svg>\s*$/i.test(b.subarray(Math.max(0, b.length - 40)).toString('utf8'));
  return false;
}

/** One picture from a link: {type, bytes} or throws. The TV's own secure port has a certificate of its own making. */
function getPicture(url) {
  const own = url.indexOf('https://' + settings.host + ':') === 0;
  const lib = url.indexOf('https:') === 0 ? https : http;
  return new Promise((resolve, reject) => {
    let finished = false, parts = [], size = 0, expected = -1, said = '';
    const bytes = () => Buffer.concat(parts, size);
    const finish = (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { q.destroy(); } catch (e) {}
      if (err) { reject(err); return; }
      const b = bytes(), type = /^image\//.test(said) ? said : sniff(b);
      if (!type) reject(new Error('not a picture (' + (said || 'no type') + ', ' + size + ' bytes, starts ' + b.subarray(0, 4).toString('hex') + ')'));
      else resolve({type, bytes: b});
    };
    const timer = setTimeout(() => {
      // Some of it came and it's a whole picture: keep it. Else, too slow.
      const b = bytes(), type = sniff(b);
      if (type && whole(b, type)) finish(); else finish(new Error('timed out after ' + Math.round(size / 1024) + ' KB'));
    }, 12000);
    const q = lib.get(url, {rejectUnauthorized: !own, agent: false, headers: {Connection: 'close', Accept: 'image/*'}}, (res) => {
      if (res.statusCode !== 200) { finish(new Error('HTTP ' + res.statusCode)); return; }
      said = String(res.headers['content-type'] || '').split(';')[0].trim();
      expected = Number(res.headers['content-length'] || -1);
      res.on('data', (d) => {
        parts.push(d);
        size += d.length;
        if (size > 4 * 1024 * 1024) { finish(new Error('too big')); return; }
        if (expected > 0 && size >= expected) { finish(); return; }
        if (expected < 0) { const b = bytes(), type = sniff(b); if (type && whole(b, type)) finish(); }
      });
      res.on('end', () => finish());
      res.on('error', (e) => finish(e));
    });
    q.on('error', (e) => finish(e));
  });
}

/** The first of those that answers with a picture: {icon (a data: URL), why}. */
/** A picture's size in pixels, from its header (PNG, JPEG, GIF, WebP); 0×0 if it can't tell. */
function pixels(b, type) {
  try {
    if (type === 'image/png') return {w: b.readUInt32BE(16), h: b.readUInt32BE(20)};
    if (type === 'image/gif') return {w: b.readUInt16LE(6), h: b.readUInt16LE(8)};
    if (type === 'image/jpeg') {
      for (let i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xFF) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return {w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5)};
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
    if (type === 'image/webp' && b.subarray(12, 16).toString('latin1') === 'VP8X') return {w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3)};
  } catch (e) {}
  return {w: 0, h: 0};
}

/** The biggest of the icon's pictures the TV hands out: {icon (a data: URL), size ('130×130'), why}. */
async function fetchIcon(p) {
  const any = ['largeIcon', 'mediumLargeIcon', 'icon', 'extraLargeIcon'].some((f) => p[f]);
  let why = any ? 'the TV gives no link to it' : 'the TV names no icon', best = null;
  for (const url of iconUrls(p)) {
    try {
      const got = await getPicture(url), px = pixels(got.bytes, got.type);
      const area = px.w * px.h || got.bytes.length / 4;   // no size from the header: the bigger file
      if (!best || area > best.area) best = {area, px, got};
    } catch (e) { why = e.name === 'TimeoutError' ? 'timed out' : (e.message || String(e)); }
  }
  if (!best) return {icon: '', size: '', why};
  return {icon: 'data:' + best.got.type + ';base64,' + best.got.bytes.toString('base64'), size: best.px.w ? best.px.w + '×' + best.px.h : '?', why: 'ok'};
}

/** Where the TV keeps the bigger icons as files: Tiwari TV, on the TV, may read them itself (sharper). */
function bigPaths(p) {
  return ['extraLargeIcon', 'mediumLargeIcon', 'largeIcon'].map((f) => p[f]).filter((u) => typeof u === 'string' && /^\/media\/|^\/usr\/|^file:\/\//.test(u));
}

function whyNot(err) {
  const m = String(err && err.message || err);
  return /401/.test(m) ? m + '. The TV hasn\'t let the helper see its apps: run  bash scripts/tv.sh helper  and press Accept on the TV.' : m;
}

// MARK: - A second pairing, only to read the TV's apps
//
// Some TVs still won't show lgtv2's pairing the apps (401 insufficient permissions). A plain, unsigned request
// that names READ_INSTALLED_APPS itself, as LG's phone app does on new firmware, is allowed: the helper pairs a
// second time for that alone (one more Accept on the TV), keeps that key in apps-key, and uses it only to read.

const APPS_KEY = path.join(STATE, 'apps-key');
const APPS_PERMISSIONS = [
  'LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CLOSE', 'TEST_OPEN', 'TEST_PROTECTED', 'CONTROL_AUDIO', 'CONTROL_DISPLAY',
  'CONTROL_INPUT_JOYSTICK', 'CONTROL_INPUT_MEDIA_RECORDING', 'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_TV',
  'CONTROL_POWER', 'READ_APP_STATUS', 'READ_CURRENT_CHANNEL', 'READ_INPUT_DEVICE_LIST', 'READ_NETWORK_STATE',
  'READ_RUNNING_APPS', 'READ_TV_CHANNEL_LIST', 'WRITE_NOTIFICATION_TOAST', 'READ_POWER_STATE', 'READ_COUNTRY_INFO',
  'READ_INSTALLED_APPS', 'READ_SETTINGS'];

/** Opens the reading pairing. prompt: may ask the TV (only when someone is there to press Accept). */
function appsSession(prompt, opts) {
  opts = opts || {};
  const said = opts.said || (() => {});   // the check-up hears each step
  return new Promise((resolve, reject) => {
    const key = opts.fresh ? '' : (fs.existsSync(APPS_KEY) ? fs.readFileSync(APPS_KEY, 'utf8').trim() : '');
    if (!key && !prompt) { reject(new Error('not paired for reading the apps yet')); return; }
    const port = process.env.TIWARI_SSAP_PORT || '3001';
    const ws = new WebSocket('wss://' + settings.host + ':' + port, {rejectUnauthorized: false, handshakeTimeout: 10000});
    const waiting = new Map();
    let n = 0, done = false;
    const fail = (err) => { if (!done) { done = true; clearTimeout(timer); reject(err); } try { ws.close(); } catch (e) {} };
    const timer = setTimeout(() => fail(new Error("the TV didn't answer (was Accept pressed?)")), 60000);
    ws.on('error', (err) => { said('connection: ' + (err.code || err.message || err)); fail(err); });
    ws.on('close', (code) => { if (!done) said('the TV closed the connection (' + code + ')'); fail(new Error('the TV closed the connection')); });
    ws.on('open', () => {
      said('connected; asking to pair' + (key ? ' with the saved key' : ' (new)') + (opts.fresh ? ', forced' : ''));
      const payload = {forcePairing: !!opts.fresh, pairingType: 'PROMPT', manifest: {manifestVersion: 1, appVersion: '1.1', permissions: APPS_PERMISSIONS}};
      if (key) payload['client-key'] = key;
      ws.send(JSON.stringify({type: 'register', id: 'register_0', payload}));
    });
    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(String(data)); } catch (e) { return; }
      if (m.id === 'register_0') {
        if (m.type === 'error') { said('the TV refused: ' + (m.error || '?')); fail(new Error(m.error || 'pairing refused')); return; }
        if (m.type === 'response' && m.payload && m.payload.pairingType === 'PROMPT') { said('the TV is asking'); log('On the TV: accept the request once more (it lets the helper see your apps).'); return; }
        if (m.type === 'response') { said('the TV answered: ' + JSON.stringify(m.payload || {}).slice(0, 120)); return; }
        if (m.type === 'registered' && !done) {
          said('paired' + (m.payload && m.payload['client-key'] === key ? ' (same key as before)' : ' (new key)'));
          const got = m.payload && m.payload['client-key'];
          if (got && got !== key) { fs.writeFileSync(APPS_KEY, got); fs.chmodSync(APPS_KEY, 0o600); }
          done = true;
          clearTimeout(timer);
          resolve({
            call(uri, body) {
              return new Promise((ok, no) => {
                const id = 'r' + (++n);
                waiting.set(id, (r) => (r.type === 'error' ? no(new Error(r.error || 'refused')) : ok(r.payload || {})));
                ws.send(JSON.stringify({type: 'request', id, uri, payload: body || {}}));
                setTimeout(() => { if (waiting.delete(id)) no(new Error('timed out')); }, 20000);
              });
            },
            close() { try { ws.close(); } catch (e) {} }
          });
        }
        return;
      }
      const w = waiting.get(m.id);
      if (w) { waiting.delete(m.id); w(m); }
    });
  });
}

/** The TV's launch points: through the helper's own pairing, or the reading pairing if that one isn't allowed. */
async function launchPoints(prompt) {
  let res;
  try {
    res = await req('ssap://com.webos.applicationManager/listLaunchPoints');
  } catch (err) {
    if (!/401/.test(String(err && err.message || err))) throw err;
    const read = async (fresh) => {
      const s = await appsSession(prompt, {fresh}).catch((e) => { throw new Error('401 insufficient permissions, and the reading pairing: ' + (e.message || e)); });
      try { return await s.call('ssap://com.webos.applicationManager/listLaunchPoints'); } finally { s.close(); }
    };
    try { res = await read(false); } catch (e) {
      // Paired without asking, and still not allowed: pair again, forced, so the TV asks (someone is there).
      if (!prompt || !/401/.test(String(e && e.message || e))) throw e;
      res = await read(true);
    }
  }
  return ((res && res.launchPoints) || []).filter((p) => p.id && p.id !== APP_ID);
}

/** node helper.mjs --apps: each app, which icon fields the TV gives, and whether the picture could be fetched. */
/** Each way of reading the apps, step by step: what the TV said to each (no addresses). */
async function diagnose() {
  const LIST = 'ssap://com.webos.applicationManager/listLaunchPoints', ALL = 'ssap://com.webos.applicationManager/listApps';
  const short = (e) => String(e && e.message || e).replace(/[0-9]{1,3}(\.[0-9]{1,3}){3}/g, '<tv>');
  const count = (r, k) => (r && r[k] ? r[k].length + ' ' + k : JSON.stringify(r || {}).slice(0, 80));
  console.log('1. The helper\'s own pairing');
  try { console.log('   apps list:', count(await req(LIST), 'launchPoints')); return null; } catch (e) { console.log('   apps list:', short(e)); }
  try { console.log('   all apps: ', count(await req(ALL), 'apps')); } catch (e) { console.log('   all apps: ', short(e)); }
  const tryReading = async (label, fresh) => {
    console.log(label);
    let asked = false;
    try {
      const sess = await appsSession(true, {fresh, said: (t) => { if (t === 'the TV is asking') asked = true; console.log('   ' + t); }});
      let points = null;
      try { const r = await sess.call(LIST); console.log('   apps list:', count(r, 'launchPoints')); points = r.launchPoints || null; } catch (e) { console.log('   apps list:', short(e)); }
      if (!points) { try { console.log('   all apps: ', count(await sess.call(ALL), 'apps')); } catch (e) { console.log('   all apps: ', short(e)); } }
      sess.close();
      return {points, asked};
    } catch (e) { console.log('   failed:', short(e)); return {points: null, asked}; }
  };
  let got = await tryReading('2. The reading pairing', false);
  if (!got.points && !got.asked) got = await tryReading('3. The reading pairing again, forced (the TV should ask now)', true);
  return got.points ? got.points.filter((p) => p.id && p.id !== APP_ID) : [];
}

async function checkApps() {
  try {
    let points = await diagnose();
    if (points === null) points = await launchPoints(false);
    if (!points.length) { log('No apps list from the TV, so no logos yet. Paste all of this to Claude.'); return; }
    console.log();
    log(points.length, 'apps on the TV:');
    for (const p of points) {
      const fields = ['largeIcon', 'mediumLargeIcon', 'icon', 'extraLargeIcon'].filter((f) => p[f]);
      const shown = fields.map((f) => f + '=' + String(p[f]).replace(/\/\/[0-9.]+(:\d+)?/, '//<tv>$1').slice(0, 70));
      const got = await fetchIcon(p);
      console.log('  ' + (p.title || p.id).padEnd(22), got.icon ? ('icon OK ' + got.size).padEnd(19) : 'no icon: ' + got.why, '|', shown.join('  ') || '(none)');
    }
  } catch (err) { log('Could not list the TV\'s apps:', whyNot(err)); }
}

async function sendIcons(force) {
  try {
    const apps = [];
    for (const p of await launchPoints()) {
      const got = await fetchIcon(p);
      apps.push({id: p.id, title: p.title || p.id, color: p.bgColor || '', icon: got.icon, paths: bigPaths(p)});
    }
    if (!apps.length) return;
    const json = JSON.stringify({apps});
    // What was sent, and how (sealed or not): sealing turned on means sending again.
    const sig = (KEY ? 'sealed:' : 'plain:') + json.length + ':' + apps.map((a) => a.id + (a.icon ? '+' : '')).join(',');
    if (!force && fs.existsSync(ICONS_SENT) && fs.readFileSync(ICONS_SENT, 'utf8') === sig && !process.env.TIWARI_FORCE_ICONS) return;
    const q = KEY
      ? new URLSearchParams({filename: 'sealed.bin', message: Seal.seal(KEY, {m: '/icons', f: 'Tiwari TV', g: [], k: 'icons'})})
      : new URLSearchParams({title: 'Tiwari TV', filename: 'apps.json', message: '/icons'});
    const body = KEY ? Seal.sealBytes(KEY, Buffer.from(json, 'utf8')) : json;
    const r = await fetch(NTFY + encodeURIComponent(settings.channel) + '?' + q, {method: 'POST', body});
    const withIcons = apps.filter((a) => a.icon).length;
    if (r.ok) {
      fs.writeFileSync(ICONS_SENT, sig);
      log('Sent Tiwari TV the TV\'s', apps.length, 'apps,', withIcons, 'with icons.' + (withIcons ? '' : ' (bash scripts/tv.sh apps shows why)'));
    }
  } catch (err) {
    log('Could not list the TV\'s apps:', whyNot(err));
  }
}
// Again every day (a new app installed): only sent when something changed.
setInterval(() => { if (connected) sendIcons(); }, 24 * 3600000);

function req(uri, payload) {
  return new Promise((resolve, reject) => {
    if (!connected) { reject(new Error('the TV is off or not reachable')); return; }
    tv.request(uri, payload || {}, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

async function press(name) {
  if (!buttons) buttons = await new Promise((resolve, reject) => {
    tv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (err, s) => (err ? reject(err) : resolve(s)));
  });
  buttons.send('button', {name});
}

async function foreground() {
  try { return (await req('ssap://com.webos.applicationManager/getForegroundAppInfo')).appId || ''; } catch (e) { return ''; }
}

// MARK: - The channel

function post(text, tags) {
  if (KEY) {
    const body = Seal.seal(KEY, {m: text, f: 'Tiwari TV', g: String(tags).split(','), k: ''});
    return fetch(NTFY + encodeURIComponent(settings.channel), {method: 'POST', body}).catch(() => {});
  }
  const q = new URLSearchParams({title: 'Tiwari TV', tags});
  return fetch(NTFY + encodeURIComponent(settings.channel) + '?' + q, {method: 'POST', body: text}).catch(() => {});
}

/** The message as the helper handles it (opened when sealed), or null when it isn't ours. */
function unseal(m) {
  if (!KEY) return m;
  const p = Seal.open(KEY, m.message);
  if (!p) return null;   // not sealed with the family's key: ignored, whoever sent it
  return Object.assign({}, m, {message: String(p.m || ''), title: p.f || '', tags: p.g || [], kind: p.k || ''});
}

let statusTimer = null;
function statusSoon() { clearTimeout(statusTimer); statusTimer = setTimeout(status, 800); }
async function status() {
  const app = connected ? await foreground() : '';
  post(JSON.stringify({helper: true, tv: connected, volume, muted, app, at: Date.now()}), 'tiwari-status');
}

async function handle(m) {
  const tags = m.tags || [];
  if (tags.some((t) => String(t).indexOf('tiwari-') === 0)) return;   // the TV's and our own messages
  const text = String(m.message || '').trim();
  const [name, ...rest] = text.split(/\s+/);
  const arg = rest.join(' ').toLowerCase();
  try {
    switch ((name || '').toLowerCase()) {
      case '/vol': case '/volume': {
        if (arg === 'up' || arg === 'down' || /^(up|down) \d+$/.test(arg)) {
          const [dir, n] = arg.split(' ');
          for (let i = 0; i < Math.min(10, Number(n) || 1); i++) await req('ssap://audio/volume' + (dir === 'up' ? 'Up' : 'Down'));
        } else if (/^\d+$/.test(arg)) {
          await req('ssap://audio/setVolume', {volume: Math.max(0, Math.min(100, Number(arg)))});
        }
        break;
      }
      case '/mute':
        await req('ssap://audio/setMute', {mute: arg === 'on' ? true : arg === 'off' ? false : !muted});
        break;
      case '/key':
        if (KEYS[arg]) await press(KEYS[arg]);
        break;
      case '/tiwari':
        await req('ssap://system.launcher/launch', {id: APP_ID});
        break;
      case '/open':
        // Tiwari TV opens apps itself when it's in front; behind another app, it's paused, so the helper does it.
        if (rest[0] && await foreground() !== APP_ID) await req('ssap://system.launcher/launch', {id: rest[0]});
        break;
      case '/status':
        await status();
        break;
      case '/icons?':
        await sendIcons(true);   // Tiwari TV has no icons yet: it asks
        break;
      default:
        // "Hey TV" while another app is in front: Tiwari TV is paused there, so it's brought forward to answer
        // (it picks the question up as it wakes).
        if (ASK.test(text) && await foreground() !== APP_ID) {
          await req('ssap://system.launcher/launch', {id: APP_ID});
          break;
        }
        // A note while someone's watching something else: a small notification on top of it.
        if (text && text[0] !== '/' && !ASK.test(text) && !m.attachment && await foreground() !== APP_ID) {
          const from = m.title && String(m.title).indexOf('ntfy.sh/') !== 0 ? m.title + ': ' : '';
          await req('ssap://system.notifications/createToast', {message: (from + text.replace(/​/g, '')).slice(0, 120)});
        }
    }
  } catch (err) {
    log('Could not do', JSON.stringify(text), '-', err.message || err);
    if (name && name[0] === '/' && name !== '/status') status();
  }
}

// One long request that ntfy answers line by line; only what's sent from now on (never old commands).
async function listen() {
  let since = '';
  for (;;) {
    try {
      const res = await fetch(NTFY + encodeURIComponent(settings.channel) + '/json' + (since ? '?since=' + since : ''));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        buf += dec.decode(value, {stream: true});
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          let m;
          try { m = JSON.parse(line); } catch (e) { continue; }
          if (m.event !== 'message') continue;
          since = m.id;
          const mine = unseal(m);
          if (mine) await handle(mine);
        }
      }
    } catch (err) {
      log('Channel:', err.message || err);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

if (pairing || listing) {
  log(listing ? 'Connecting to the TV ...' : 'Connecting to the TV at ' + settings.host + ' ...');
  setTimeout(() => { if (pairing) keepOldKey(); log("The TV didn't answer. Is it on, and on the same Wi-Fi?"); process.exit(1); }, 150000);
} else {
  log('Tiwari TV Helper is listening.');
  listen();
}

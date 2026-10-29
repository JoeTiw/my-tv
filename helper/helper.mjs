// Tiwari TV's helper at home: runs on the Mac (or any always-on computer on the home Wi-Fi).
//
// It listens to the phone channel and talks to the TV through LG's own remote-control connection (the one LG's
// ThinQ app uses), which works whatever is on screen, including while Tiwari TV is paused behind Netflix:
//   /vol up · /vol down · /vol 20 · /mute (toggles) · /key play|pause|home|back|ok|up|down|left|right
//   /tiwari (bring Tiwari TV to the front) · /open <app id> (when Tiwari TV isn't in front to do it)
//   /status (the phone asks; the helper answers with the volume and what's on screen)
//   notes, while another app is in front, show as a small TV notification; "Hey TV" brings Tiwari TV forward.
//
//   node helper.mjs          # what macOS keeps running (scripts/tv.sh helper sets it up)
//   node helper.mjs --pair   # once: the TV asks to allow the connection
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATE = process.env.TIWARI_STATE || path.join(os.homedir(), '.tiwari-tv');
const NTFY = process.env.TIWARI_NTFY || 'https://ntfy.sh/';
const APP_ID = 'com.tiwari.tv';
const KEYS = {play: 'PLAY', pause: 'PAUSE', home: 'HOME', back: 'BACK', ok: 'ENTER', up: 'UP', down: 'DOWN',
  left: 'LEFT', right: 'RIGHT', exit: 'EXIT'};
const ASK = /^\s*(hey[\s,]+tv|ok[\s,]+tv|tv)\s*[,:!.-]?\s+/i;

const settings = JSON.parse(fs.readFileSync(path.join(STATE, 'helper.json'), 'utf8'));   // {host, channel}
const pairing = process.argv.includes('--pair');

function log(...a) { console.log(new Date().toISOString().slice(0, 16).replace('T', ' '), ...a); }

// MARK: - The TV

const LGTV = (await import(process.env.TIWARI_TV_MODULE || 'lgtv2')).default;
const tv = new LGTV({host: settings.host, keyFile: path.join(STATE, 'lgtv-key'), reconnect: 5000});
let connected = false, volume = null, muted = null, buttons = null;

tv.on('prompt', () => log('On the TV: accept the request to allow Tiwari TV Helper.'));
tv.on('error', (err) => { if (!pairing) log('TV:', err.message || err); });
tv.on('close', () => { connected = false; buttons = null; });
tv.on('connect', () => {
  connected = true;
  log('Connected to the TV at', settings.host);
  tv.subscribe('ssap://audio/getVolume', (err, res) => {
    if (err || !res) return;
    if (typeof res.volume === 'number') volume = res.volume;
    if (typeof res.muted === 'boolean') muted = res.muted;
    statusSoon();
  });
  if (pairing) { log('Paired. Tiwari TV Helper can now control the TV.'); setTimeout(() => process.exit(0), 1500); }
});

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
  const q = new URLSearchParams({title: 'Tiwari TV', tags});
  return fetch(NTFY + encodeURIComponent(settings.channel) + '?' + q, {method: 'POST', body: text}).catch(() => {});
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
          await handle(m);
        }
      }
    } catch (err) {
      log('Channel:', err.message || err);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

if (pairing) {
  log('Connecting to the TV at', settings.host, '...');
  setTimeout(() => { log("The TV didn't answer. Is it on, and on the same Wi-Fi?"); process.exit(1); }, 60000);
} else {
  log('Tiwari TV Helper is listening.');
  listen();
}

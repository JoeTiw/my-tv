/*
 * The inbox: what the phone sends, through a private channel on ntfy.sh (a free relay, no account).
 * The TV checks every 15 seconds while Tiwari TV is open.
 *
 *  - "Hey TV, ..." or "TV, ..."   → the assistant (its answer comes back to the phone too)
 *  - a photo                      → the background (kept on the TV)
 *  - /bg <link> · /bg #ffb3c6 · /bg off
 *  - /theme dark · light · auto
 *  - /clear                       → takes the notes away
 *  - /open <app id or name>       → opens that app (only when sent just now, never from a replay)
 *  - a photo with "/frame"        → into the photo frame (shown after a few quiet minutes)
 *  - /frame start · stop · clear  → the frame now, back to home, or no more photos in it
 *  - a file with "/icons"         → the TV's apps and their icons, from the helper at home
 *  - anything else                → a note: big for a moment, then small in the corner for a day
 */
var Inbox = (function () {
  'use strict';

  var C = window.TIWARI || {};
  var CH = String(C.channel || '').replace(/^\s+|\s+$/g, '');
  var BASE = 'https://ntfy.sh/' + encodeURIComponent(CH);
  var POLL_MS = 15000, BIG_MS = 90000, KEEP_MS = 24 * 3600000, MAX_NOTES = 3, REPLY_TAG = 'tiwari-reply';
  var HEART = '<svg class="heart" viewBox="0 0 30 30"><path d="M15 26S3 18.6 3 10.6A6.3 6.3 0 0 1 15 7.4a6.3 6.3 0 0 1 12 3.2C27 18.6 15 26 15 26z" fill="#FF7AA8"/></svg>';

  // MARK: - Notes

  var notes = U.load('notes') || [], big = null, bigTimer = 0;

  function render() {
    var box = U.$('notes'), now = Date.now();
    notes = notes.filter(function (n) { return now - n.at < KEEP_MS; }).slice(-MAX_NOTES);
    box.innerHTML = '';
    var stage = U.$('stage'), old = stage.querySelector('.note.big');
    if (old) old.parentNode.removeChild(old);
    U.cls(stage, 'dim', !!big);
    for (var i = notes.length - 1; i >= 0; i--) {
      var n = notes[i], isBig = big === n;
      var card = U.el('div', 'note glass' + (isBig ? ' big' : ''), isBig ? stage : box);
      card.innerHTML = HEART;
      U.el('div', 'text', card, n.text);
      var t = U.time(new Date(n.at));
      U.el('div', 'meta', card, (n.from ? n.from + ' · ' : '') + t.hm + ' ' + t.ampm);   // U.time speaks the TV's language
      (function (card) { setTimeout(function () { U.cls(card, 'on', true); }, 30); })(card);
    }
  }

  function add(text, from, at, fresh) {
    var n = {text: text, from: from, at: at};
    notes.push(n);
    U.save('notes', notes.slice(-MAX_NOTES));
    clearTimeout(bigTimer);
    big = fresh ? n : null;
    if (fresh) bigTimer = setTimeout(shrink, BIG_MS);
    render();
  }

  function shrink() { clearTimeout(bigTimer); if (big) { big = null; render(); } }

  /** Back on the home screen: the newest note goes away. True when there was one. */
  function dismiss() {
    if (!notes.length) return false;
    notes.pop();
    U.save('notes', notes);
    render();
    return true;
  }

  // MARK: - Photos

  /** Shown at once from its link; then kept on the TV as a 1280×720 JPEG, since ntfy deletes files after a few hours. */
  function keepPhoto(url) {
    Home.setWall({kind: 'image', src: url});
    U.http(url, {type: 'blob', timeout: 60000}, function (err, blob) {
      if (err || !blob) return;
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var c = document.createElement('canvas'), W = 1280, H = 720;
            c.width = W;
            c.height = H;
            var s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
            c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
            var now = U.load('wall');
            if (now && now.src === url) Home.setWall({kind: 'image', src: c.toDataURL('image/jpeg', 0.84)});
          } catch (e) {}   // no room, or the browser won't let us read it: the link stays
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(blob);
    });
  }

  // MARK: - Messages

  var ASK = /^\s*(hey[\s,]+tv|ok[\s,]+tv|tv)\s*[,:!.-]?\s+/i;

  /** An app on the TV by id, or by name (part of it, any case). */
  function findApp(q) {
    var list = Home.apps(), low = q.toLowerCase(), i;
    for (i = 0; i < list.length; i++) if (list[i].id === q) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].title.toLowerCase() === low) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].title.toLowerCase().indexOf(low) >= 0) return list[i];
    return null;
  }

  function command(text, fresh) {
    var parts = text.replace(/^\s+|\s+$/g, '').split(/\s+/), name = parts[0].toLowerCase(), arg = parts.slice(1).join(' ');
    if (name === '/clear') { notes = []; big = null; U.save('notes', notes); render(); }
    else if (name === '/theme') { if (Home.setTheme(arg.toLowerCase())) Home.toast(L.t('Theme: {name}', {name: L.t(arg.toLowerCase())})); }
    else if (name === '/lang' && (arg === 'ne' || arg === 'en')) {
      // Only when it changes: a page load replays the message, and it must not reload again.
      if (arg !== L.lang) { U.save('lang', arg); setTimeout(function () { location.reload(); }, 400); }
    }
    else if (name === '/bg' || name === '/background') {
      if (/^(off|none|reset)$/i.test(arg)) Home.setWall(null);
      else if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(arg)) Home.setWall({kind: 'color', color: arg});
      else if (/^https?:\/\/\S+$/i.test(arg)) keepPhoto(arg);
    }
    else if (name === '/frame') {
      if (arg === 'clear') { Frame.clear(); reply(L.t('The photo frame is empty now.')); }
      else if (arg === 'stop') Frame.stop();
      else if (arg === 'start' && fresh && !Frame.start()) reply(L.t('There are no photos in the frame yet.'));
    }
    else if (name === '/open' && fresh) {
      var app = findApp(arg);
      if (app) Home.open(app); else Home.toast(L.t('No app called {name} on this TV', {name: arg}));
    }
  }

  /** One message. fresh: sent just now (not something replayed from while the TV was off). */
  function handle(m, fresh) {
    for (var t = 0; m.tags && t < m.tags.length; t++) if (String(m.tags[t]).indexOf('tiwari-') === 0) return;   // the TV's own
    var text = String(m.message || ''), a = m.attachment;
    if (a && a.url && /^\s*\/icons\s*$/i.test(text)) { takeIcons(a.url); return; }
    if (a && a.url && /^image\//.test(a.type || '') && /^\s*\/frame\b/i.test(text)) {
      framePhoto(a.url, m);
      return;
    }
    if (a && a.url && /^image\//.test(a.type || '')) {
      keepPhoto(a.url);
      if (!text || text.indexOf('You received a file') === 0) return;   // what ntfy writes for a photo alone
    }
    if (text.charAt(0) === '/') { command(text, fresh); return; }
    if (ASK.test(text)) { if (fresh) Assistant.ask(text.replace(ASK, '')); return; }
    if (!text) return;
    var from = m.title && String(m.title).indexOf('ntfy.sh/') !== 0 ? String(m.title) : '';
    add(text, from, (m.time || 0) * 1000 || Date.now(), fresh);
  }

  var lastId = U.load('lastId'), primed = !!lastId, polling = false;

  function poll() {
    if (!CH || polling || document.hidden) return;
    polling = true;
    // The first time, the last 12 hours; after that only what's new.
    U.http(BASE + '/json?poll=1&since=' + encodeURIComponent(lastId || '12h'), {timeout: 20000}, function (err, text) {
      polling = false;
      if (err) return;
      take(String(text || '').split('\n'));
      primed = true;
    });
  }

  /** ntfy's lines (one JSON message each): handled in order, and the newest remembered. */
  var seenIds = {}, seenOrder = [];   // the check and the live connection can both bring a message: once is enough

  function take(lines) {
    var got = false;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      var m;
      try { m = JSON.parse(lines[i]); } catch (e) { continue; }
      if (m.event !== 'message' || seenIds[m.id]) continue;
      seenIds[m.id] = true;
      seenOrder.push(m.id);
      if (seenOrder.length > 200) delete seenIds[seenOrder.shift()];
      handle(m, primed && Date.now() - m.time * 1000 < 10 * 60000);
      lastId = m.id;
      got = true;
    }
    if (got) U.save('lastId', lastId);
  }

  // MARK: - The live connection: messages arrive the moment they're sent

  var STREAM_MS = 10 * 60000, streamFails = 0, streamXhr = null;

  /**
   * One long request that ntfy answers line by line as messages come. Opened again every 10 minutes (so the text
   * it collects stays small) and after a drop; after 3 drops in a row the TV falls back to checking every 15 seconds.
   */
  function stream() {
    if (!CH || document.hidden || streamXhr) return;
    var xhr = new XMLHttpRequest(), seen = 0, opened = Date.now();
    streamXhr = xhr;
    xhr.open('GET', BASE + '/json?since=' + encodeURIComponent(lastId || '12h'));
    xhr.onprogress = function () {
      var text = xhr.responseText, end = text.lastIndexOf('\n');
      if (end < seen) return;
      take(text.slice(seen, end).split('\n'));
      seen = end + 1;
      primed = true;
      streamFails = 0;
    };
    xhr.onloadend = function () {
      streamXhr = null;
      if (Date.now() - opened < 5000) streamFails++;
      setTimeout(stream, streamFails ? Math.min(60000, 2000 * streamFails) : 500);
    };
    setTimeout(function () { if (streamXhr === xhr) xhr.abort(); }, STREAM_MS);
    xhr.send();
  }

  /** Tells the phone page which apps this TV has (tagged, so the TV skips it). */
  function announce() {
    if (!CH) return;
    var list = Home.apps().map(function (a) { return {id: a.id, title: a.title, color: a.color}; });
    U.http(BASE + '?title=' + encodeURIComponent('Tiwari TV') + '&tags=tiwari-apps',
      {method: 'POST', body: JSON.stringify(list), headers: {'Content-Type': 'text/plain'}}, function () {});
  }

  /** The helper's {apps: [{id, title, color, icon (a data: URL)}]}: kept, and the dock drawn again with them. */
  function takeIcons(url) {
    U.http(url, {type: 'json', timeout: 60000}, function (err, data) {
      if (err || !data || !data.apps || !data.apps.length) return;
      var icons = {}, list = [];
      data.apps.forEach(function (x) {
        if (!x || !x.id) return;
        list.push({id: String(x.id), title: String(x.title || x.id), color: /^#[0-9a-f]{6}$/i.test(x.color || '') ? x.color : ''});
        if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(x.icon || '')) icons[x.id] = x.icon;
      });
      U.save('tvApps', list);
      U.save('icons', icons);
      Home.loadApps();
    });
  }

  // Photos for the frame: kept one by one; one answer to the phone when a batch is in.
  var added = 0, missed = 0, addedTimer = 0;
  function framePhoto(url, m) {
    var from = m.title && String(m.title).indexOf('ntfy.sh/') !== 0 ? String(m.title) : '';
    Frame.add(url, from, (m.time || 0) * 1000 || Date.now(), function (ok) {
      if (ok) added++; else missed++;
      clearTimeout(addedTimer);
      addedTimer = setTimeout(function () {
        var text = (added ? L.t('Added {n} photos to the frame ({total} in it).', {n: added, total: Frame.count()}) : '')
          + (missed ? ' ' + L.t("{n} couldn't be picked up (ntfy keeps photos only a few hours).", {n: missed}) : '');
        if (!L.ne && added === 1) text = text.replace('1 photos', '1 photo');
        added = missed = 0;
        if (text) { reply(text.replace(/^ /, '')); Home.toast(text.replace(/^ /, '').split(' (')[0]); }
      }, 4000);
    });
  }

  /** Sends the TV's answer back to the phone (tagged, so the TV skips it). Plain POST: no CORS preflight. */
  function reply(text) {
    if (!CH || !text) return;
    U.http(BASE + '?title=' + encodeURIComponent('Tiwari TV') + '&tags=' + REPLY_TAG + ',tv',
      {method: 'POST', body: text, headers: {'Content-Type': 'text/plain'}}, function () {});
  }

  function start() {
    render();
    if (!CH) return;
    poll();
    stream();
    setInterval(function () { if (streamFails >= 3) poll(); }, POLL_MS);   // the fallback
    setInterval(render, 10 * 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { poll(); stream(); } });
  }

  return {
    start: start, poll: poll, handle: handle, reply: reply, announce: announce, dismiss: dismiss, shrink: shrink,
    bigShowing: function () { return !!big; }
  };
})();

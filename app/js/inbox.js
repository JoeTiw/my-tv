/*
 * The inbox: what the phone sends, through a private channel on ntfy.sh (a free relay, no account).
 * The TV checks every 15 seconds while Tiwari TV is open.
 *
 *  - "Hey TV, ..." or "TV, ..."   → the assistant (its answer comes back to the phone too)
 *  - a photo                      → the background (kept on the TV)
 *  - /bg <link> · /bg #ffb3c6 · /bg off
 *  - /theme dark · light · auto
 *  - /clear                       → takes the notes away
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
      U.el('div', 'meta', card, (n.from ? n.from + ' · ' : '') + t.hm + ' ' + t.ampm);
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

  function command(text) {
    var parts = text.replace(/^\s+|\s+$/g, '').split(/\s+/), name = parts[0].toLowerCase(), arg = parts.slice(1).join(' ');
    if (name === '/clear') { notes = []; big = null; U.save('notes', notes); render(); }
    else if (name === '/theme') { if (Home.setTheme(arg.toLowerCase())) Home.toast('Theme: ' + arg.toLowerCase()); }
    else if (name === '/bg' || name === '/background') {
      if (/^(off|none|reset)$/i.test(arg)) Home.setWall(null);
      else if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(arg)) Home.setWall({kind: 'color', color: arg});
      else if (/^https?:\/\/\S+$/i.test(arg)) keepPhoto(arg);
    }
  }

  /** One message. fresh: sent just now (not something replayed from while the TV was off). */
  function handle(m, fresh) {
    if (m.tags && m.tags.indexOf(REPLY_TAG) >= 0) return;   // the TV's own answers
    var text = String(m.message || ''), a = m.attachment;
    if (a && a.url && /^image\//.test(a.type || '')) {
      keepPhoto(a.url);
      if (!text || text.indexOf('You received a file') === 0) return;   // what ntfy writes for a photo alone
    }
    if (text.charAt(0) === '/') { command(text); return; }
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
      var lines = String(text || '').split('\n'), msgs = [];
      for (var i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        try { var m = JSON.parse(lines[i]); if (m.event === 'message') msgs.push(m); } catch (e) {}
      }
      for (var j = 0; j < msgs.length; j++) {
        handle(msgs[j], primed && Date.now() - msgs[j].time * 1000 < 10 * 60000);
        lastId = msgs[j].id;
      }
      if (msgs.length) U.save('lastId', lastId);
      primed = true;
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
    setInterval(poll, POLL_MS);
    setInterval(render, 10 * 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  }

  return {
    start: start, poll: poll, handle: handle, reply: reply, dismiss: dismiss, shrink: shrink,
    bigShowing: function () { return !!big; }
  };
})();

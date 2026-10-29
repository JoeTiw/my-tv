/*
 * The home screen: the clock and weather, the dock of apps, the look (day, night, a photo from the phone), the
 * remote's keys and a toast. The inbox and the assistant use Home's functions to change what's on screen.
 */
var Home = (function () {
  'use strict';

  var C = window.TIWARI || {};
  var $ = U.$, body = document.body, stage = $('stage');
  var TILE_W = 196, GAP = 44, SIDE = 96;

  // MARK: - Fit: the 1920×1080 stage fills any window (on the TV it already is 1920×1080)

  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  // MARK: - Clock and weather

  function tick() {
    var now = U.now(), t = U.time(now);
    $('greet').textContent = L.greeting(now) + (C.familyName ? ', ' + (L.ne && C.familyNameNe ? C.familyNameNe : C.familyName) : '');
    $('clock').innerHTML = t.hm + '<span class="ampm">' + t.ampm + '</span>';
    $('date').textContent = U.longDate(now);
    Calendar.render();
    look();
  }

  function weather() { Weather.refresh(function () { Weather.render($('weather')); look(); }); }

  // MARK: - The look: night from sunset (or dark/light from the phone), and the background

  function theme() { return U.load('theme') || 'auto'; }

  function look() {
    var t = theme(), night = t === 'dark' ? true : t === 'light' ? false : Weather.isNight(U.now());
    U.cls(body, 'night', night);
  }

  function setTheme(t) {
    if (t !== 'dark' && t !== 'light' && t !== 'auto') return false;
    U.save('theme', t);
    look();
    return true;
  }

  /** w: {kind: 'image', src} or {kind: 'color', color}, or null for the sky. */
  function showWall(w) {
    var photo = $('photo');
    photo.style.backgroundImage = w && w.kind === 'image' ? 'url("' + String(w.src).replace(/"/g, '%22') + '")' : '';
    photo.style.backgroundColor = w && w.kind === 'color' ? w.color : '';
    U.cls(body, 'has-photo', !!w);
  }

  function setWall(w) { U.save('wall', w); showWall(w); }

  // MARK: - The dock

  var apps = [], focus = 0, first = 0;

  function rgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /** The app's color, glowing up from the bottom of smoky glass. */
  function glow(tint, color) {
    var c = rgb(color) || [150, 150, 170];
    var light = rgba(c, 0.95) + ', ' + rgba(c, 0.4) + ' 42%, ' + rgba(c, 0) + ' 76%';
    var smoke = 'rgba(20,20,26,0.26), rgba(10,10,14,0.38)';
    tint.style.background = '-webkit-radial-gradient(50% 118%, ellipse, ' + light + '), -webkit-linear-gradient(top, ' + smoke + ')';
    tint.style.background = 'radial-gradient(ellipse 100% 88% at 50% 118%, ' + light + '), linear-gradient(' + smoke + ')';
  }

  // MARK: - Lifting a mark off its icon

  var lifted = {};   // icon → {src, dark} or false (keep the icon as it is), worked out once

  /**
   * An icon is usually a mark on one plain color (a red N on black). The plain color, found around the edges, turns
   * see-through (gradually, so the edges stay smooth), and what's left is cropped to the mark. done(null) for a
   * picture (nothing taken away), or an icon the TV won't let the page read.
   */
  function lift(src, done) {
    if (lifted[src] !== undefined) { done(lifted[src] || null); return; }
    var img = new Image();
    img.onload = function () {
      var out = null;
      try { out = liftNow(img); } catch (e) { out = null; }
      lifted[src] = out || false;
      done(out);
    };
    img.onerror = function () { lifted[src] = false; done(null); };
    img.src = src;
  }

  function liftNow(img) {
    var w = Math.min(256, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
    if (!w || !h) return null;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    var data = g.getImageData(0, 0, w, h), px = data.data;
    // The background: the most common color along a border set a little inside (icons often have round corners).
    var count = {}, best = null, bestN = 0, inset = Math.round(Math.min(w, h) * 0.06), n = 0;
    function vote(x, y) {
      var i = (y * w + x) * 4;
      var key = px[i + 3] < 128 ? 'clear' : (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);
      count[key] = (count[key] || 0) + 1;
      n++;
      if (count[key] > bestN) { bestN = count[key]; best = key === 'clear' ? null : [px[i], px[i + 1], px[i + 2]]; }
    }
    for (var k = 0; k < 40; k++) {
      var f = k / 40;
      vote(Math.round(inset + f * (w - 2 * inset - 1)), inset);
      vote(Math.round(inset + f * (w - 2 * inset - 1)), h - 1 - inset);
      vote(inset, Math.round(inset + f * (h - 2 * inset - 1)));
      vote(w - 1 - inset, Math.round(inset + f * (h - 2 * inset - 1)));
    }
    if (bestN < n * 0.5) return null;   // no one background color: a picture
    var minX = w, minY = h, maxX = -1, maxY = -1, ink = 0, hue = 0, inkN = 0;
    for (var p = 0; p < w * h; p++) {
      var j = p * 4, a = px[j + 3] / 255;
      if (best) {
        var d = Math.max(Math.abs(px[j] - best[0]), Math.abs(px[j + 1] - best[1]), Math.abs(px[j + 2] - best[2])) / 255;
        a *= Math.max(0, Math.min(1, (d - 0.1) / 0.22));
        px[j + 3] = Math.round(a * 255);
      }
      if (a > 0.35) {
        var x = p % w, y = (p / w) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        ink += (0.2126 * px[j] + 0.7152 * px[j + 1] + 0.0722 * px[j + 2]) / 255;
        hue += (Math.max(px[j], px[j + 1], px[j + 2]) - Math.min(px[j], px[j + 1], px[j + 2])) / 255;
        inkN++;
      }
    }
    if (maxX < 0 || (maxX - minX > w * 0.95 && maxY - minY > h * 0.95)) return null;   // nothing left, or nothing taken
    g.putImageData(data, 0, 0);
    var crop = document.createElement('canvas');
    crop.width = maxX - minX + 1;
    crop.height = maxY - minY + 1;
    crop.getContext('2d').drawImage(c, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    // A black or gray mark would vanish on smoky glass: it's shown white. A colored one (red letters) stays.
    var bgHex = best ? '#' + ((1 << 24) | (best[0] << 16) | (best[1] << 8) | best[2]).toString(16).slice(1) : '';
    return {src: crop.toDataURL('image/png'), dark: inkN && ink / inkN < 0.25 && hue / inkN < 0.2, bg: bgHex};
  }

  function colorfulHex(hex) {
    var c = rgb(hex);
    return !!c && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) >= 60;
  }
  var knownColors = {};
  TV.known().forEach(function (k) { knownColors[k.id] = k.color; });

  function visible() { return Math.max(1, Math.floor((1920 - 2 * SIDE + GAP) / (TILE_W + GAP))); }

  function renderDock() {
    var row = $('apps');
    row.innerHTML = '';
    var n = Math.min(apps.length, visible()), width = n * TILE_W + (n - 1) * GAP;
    var left = Math.max(SIDE, (1920 - width) / 2);
    for (var i = 0; i < apps.length; i++) {
      var a = apps[i], t = U.el('div', 'tile glass', row);
      t.style.left = (left + i * (TILE_W + GAP)) + 'px';
      var tint = U.el('div', 'tint', t);
      glow(tint, a.color);
      U.el('div', 'sheen', t);
      var word = U.el('div', 'word', t, a.title);
      word.style.fontSize = Math.max(20, Math.min(34, Math.floor(TILE_W * 0.82 / (Math.max(5, a.title.length) * 0.55)))) + 'px';
      // The app's own icon from the TV, its mark lifted off its background onto the glass (the name stays if it
      // doesn't load; the icon as it is if it's a picture rather than a mark on a plain color).
      if (a.icon) {
        (function (t, word, src, tint, known) {
          word.style.visibility = 'hidden';
          function plain() {
            var img = U.el('img', 'icon', t);
            img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); word.style.visibility = ''; };
            img.src = src;
          }
          lift(src, function (mark) {
            if (!mark) { plain(); return; }
            var img = U.el('img', 'logo' + (mark.dark ? ' white' : ''), t);
            img.src = mark.src;
            // An app we don't know: its icon's own color glows (Hulu's green), unless that's black or white.
            if (!known && mark.bg && colorfulHex(mark.bg)) glow(tint, mark.bg);
          });
        })(t, word, a.icon, tint, !!knownColors[a.id]);
      }
      U.el('div', 'label', t, a.title);
      (function (i) {
        t.addEventListener('mouseover', function () { zone = 'apps'; focus = i; show(); });
        t.addEventListener('click', function () { zone = 'apps'; focus = i; ok(); });
      })(i);
    }
    focus = Math.min(focus, Math.max(0, apps.length - 1));
    show();
  }

  function scrollDock() {
    var n = visible();
    if (focus < first) first = focus;
    if (focus >= first + n) first = focus - n + 1;
    first = Math.max(0, Math.min(first, Math.max(0, apps.length - n)));
    var row = $('apps'), tiles = row.children;
    row.style.webkitTransform = row.style.transform = 'translateX(' + (-first * (TILE_W + GAP)) + 'px)';
    // Apps past the edges wait, faded out, until the focus scrolls to them.
    for (var i = 0; i < tiles.length; i++) tiles[i].style.opacity = i >= first && i < first + n ? '' : '0';
  }

  function open(app) {
    toast(L.t('Opening {app}', {app: app.title}));
    TV.launch(app.id, function (err) { if (err) toast(L.t("{app} didn't open", {app: app.title})); });
  }

  // MARK: - Focus: the dock, tonight's picks above it, or the assistant's cards when they show

  var zone = 'apps', recs = null, picks = null;   // {nodes, ok(i), back()} from the assistant and from Picks

  function show() {
    var tiles = $('apps').children;
    for (var i = 0; i < tiles.length; i++) U.cls(tiles[i], 'focus', zone === 'apps' && i === focus);
    if (recs) for (var j = 0; j < recs.nodes.length; j++) U.cls(recs.nodes[j], 'focus', zone === 'recs' && j === recs.at);
    if (picks) for (var p = 0; p < picks.nodes.length; p++) U.cls(picks.nodes[p], 'focus', zone === 'picks' && p === picks.at);
    scrollDock();
  }

  function row() { return zone === 'recs' ? recs : zone === 'picks' ? picks : null; }

  function move(dx, dy) {
    var r = row();
    if (dy < 0 && recs && recs.nodes.length) zone = 'recs';
    else if (dy < 0 && picks && picks.nodes.length) zone = 'picks';
    else if (dy > 0) zone = 'apps';
    else if (r) r.at = Math.max(0, Math.min(r.nodes.length - 1, r.at + dx));
    else focus = Math.max(0, Math.min(apps.length - 1, focus + dx));
    show();
  }

  function ok() {
    var r = row();
    if (r) r.ok(r.at);
    else if (apps[focus]) open(apps[focus]);
  }

  function back() {
    if (recs) { recs.back(); return; }
    if (zone === 'picks') { zone = 'apps'; show(); return; }
    if (Inbox.dismiss()) return;
  }

  /** Tonight's picks (or none, with null). */
  function setPicks(r) {
    picks = r;
    if (r) r.at = 0;
    if (!r && zone === 'picks') zone = 'apps';
    show();
  }

  /** The assistant's cards take the focus (or give it back, with null). */
  function setRecs(r) {
    recs = r;
    if (r) { r.at = 0; zone = r.nodes.length ? 'recs' : 'apps'; } else zone = 'apps';
    show();
  }

  // The first key while a big note shows only puts it away.
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode, K = TV.keys;
    if (Inbox.bigShowing()) { Inbox.shrink(); e.preventDefault(); return; }
    if (k === K.left) move(-1, 0);
    else if (k === K.right) move(1, 0);
    else if (k === K.up) move(0, -1);
    else if (k === K.down) move(0, 1);
    else if (k === K.ok) ok();
    else if (k === K.back || k === 27 || k === 8) back();
    else return;
    e.preventDefault();
  });

  // MARK: - Toast

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    U.cls(t, 'on', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { U.cls(t, 'on', false); }, 3500);
  }

  // MARK: - Start

  function loadApps(done) {
    TV.apps(function (list) {
      // A TV that won't list its apps to Tiwari TV (newer webOS): the list the helper sent, if it has.
      var fromHelper = U.load('tvApps');
      if (list.fallback && fromHelper && fromHelper.length) list = fromHelper;
      var icons = U.load('icons') || {};
      var wanted = C.apps && C.apps.length ? C.apps : null;
      if (wanted) {
        var byId = {};
        for (var i = 0; i < list.length; i++) byId[list[i].id] = list[i];
        var known = TV.known(), k;
        for (k = 0; k < known.length; k++) if (!byId[known[k].id]) byId[known[k].id] = known[k];
        list = [];
        for (k = 0; k < wanted.length; k++) if (byId[wanted[k]]) list.push(byId[wanted[k]]);
      }
      // A brand color for the TV's apps that carry none.
      var colors = {};
      TV.known().forEach(function (a) { colors[a.id] = a.color; });
      // The glow: the brand's color where we know it, else the TV's (not a black or white icon background).
      function colorful(hex) {
        var c = rgb(hex);
        return !!c && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) >= 60;
      }
      apps = list.map(function (a) {
        var color = colors[a.id] || (colorful(a.color) ? a.color : '#9A8CFF');
        return {id: a.id, title: a.title, color: color, icon: icons[a.id] || a.icon || ''};
      });
      renderDock();
      Inbox.announce();   // the phone page shows this TV's own apps
      if (done) done();
    });
  }

  function start() {
    fit();
    window.addEventListener('resize', fit);
    showWall(U.load('wall'));
    tick();
    setInterval(tick, 10000);
    weather();
    setInterval(weather, 30 * 60000);
    loadApps();
    document.addEventListener('webOSRelaunch', function () {
      if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
    });
  }

  return {
    start: start, toast: toast, setTheme: setTheme, setWall: setWall, setRecs: setRecs, setPicks: setPicks, loadApps: loadApps,
    apps: function () { return apps; }, open: open
  };
})();

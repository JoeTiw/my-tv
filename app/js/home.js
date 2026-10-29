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
    var now = new Date(), t = U.time(now);
    $('clock').innerHTML = t.hm + '<span class="ampm">' + t.ampm + '</span>';
    $('date').textContent = U.longDate(now);
    look();
  }

  function weather() { Weather.refresh(function () { Weather.render($('weather')); look(); }); }

  // MARK: - The look: night from sunset (or dark/light from the phone), and the background

  function theme() { return U.load('theme') || 'auto'; }

  function look() {
    var t = theme(), night = t === 'dark' ? true : t === 'light' ? false : Weather.isNight(new Date());
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

  function visible() { return Math.max(1, Math.floor((1920 - 2 * SIDE + GAP) / (TILE_W + GAP))); }

  function renderDock() {
    var row = $('apps');
    row.innerHTML = '';
    var n = Math.min(apps.length, visible()), width = n * TILE_W + (n - 1) * GAP;
    var left = Math.max(SIDE, (1920 - width) / 2);
    for (var i = 0; i < apps.length; i++) {
      var a = apps[i], t = U.el('div', 'tile glass', row);
      t.style.left = (left + i * (TILE_W + GAP)) + 'px';
      glow(U.el('div', 'tint', t), a.color);
      U.el('div', 'sheen', t);
      var word = U.el('div', 'word', t, a.title);
      word.style.fontSize = Math.max(20, Math.min(34, Math.floor(TILE_W * 0.82 / (Math.max(5, a.title.length) * 0.55)))) + 'px';
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
    toast('Opening ' + app.title);
    TV.launch(app.id, function (err) { if (err) toast(app.title + " didn't open"); });
  }

  // MARK: - Focus: the dock, or the assistant's cards when they show

  var zone = 'apps', recs = null;   // recs: {nodes, ok(i), back()} from the assistant

  function show() {
    var tiles = $('apps').children;
    for (var i = 0; i < tiles.length; i++) U.cls(tiles[i], 'focus', zone === 'apps' && i === focus);
    if (recs) for (var j = 0; j < recs.nodes.length; j++) U.cls(recs.nodes[j], 'focus', zone === 'recs' && j === recs.at);
    scrollDock();
  }

  function move(dx, dy) {
    if (dy < 0 && recs && recs.nodes.length) zone = 'recs';
    else if (dy > 0) zone = 'apps';
    else if (zone === 'recs') recs.at = Math.max(0, Math.min(recs.nodes.length - 1, recs.at + dx));
    else focus = Math.max(0, Math.min(apps.length - 1, focus + dx));
    show();
  }

  function ok() {
    if (zone === 'recs' && recs) recs.ok(recs.at);
    else if (apps[focus]) open(apps[focus]);
  }

  function back() {
    if (recs) { recs.back(); return; }
    if (Inbox.dismiss()) return;
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
      apps = list.map(function (a) { return {id: a.id, title: a.title, color: a.color || colors[a.id] || '#9A8CFF'}; });
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
    start: start, toast: toast, setTheme: setTheme, setWall: setWall, setRecs: setRecs, loadApps: loadApps,
    apps: function () { return apps; }, open: open
  };
})();

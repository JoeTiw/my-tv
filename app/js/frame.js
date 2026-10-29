/*
 * The family photo frame: photos sent from the phone ("/frame" with a photo), kept on the TV, shown full screen
 * after a few quiet minutes (frameAfter in config.js), one after another with a slow drift, the clock and the
 * Nepali date on top. Any button goes back to the home screen.
 *
 * The photos live in the TV's own storage (IndexedDB), made 1920 wide, at most MAX of them; the oldest go first.
 * ntfy deletes files after a few hours, so the TV has to be on, with Tiwari TV open, to pick them up in time.
 */
var Frame = (function () {
  'use strict';

  var C = window.TIWARI || {};
  var AFTER_MS = Math.max(1, Number(C.frameAfter) || 3) * 60000, SLIDE_MS = 12000, MAX = 60, W = 1920, H = 1080;
  var stage = U.$('stage'), photos = [], on = false, index = 0, slideTimer = 0, lastInput = Date.now();

  // MARK: - The album (IndexedDB; in memory only if the TV has none)

  var db = null;
  function open(done) {
    if (db || !window.indexedDB) { done(); return; }
    var req = indexedDB.open('tiwari', 1);
    req.onupgradeneeded = function () { req.result.createObjectStore('photos', {keyPath: 'id'}); };
    req.onsuccess = function () { db = req.result; done(); };
    req.onerror = function () { done(); };
  }

  function store(mode) { return db.transaction('photos', mode).objectStore('photos'); }

  function load(done) {
    open(function () {
      if (!db) { done(); return; }
      var list = [], cur = store('readonly').openCursor();
      cur.onsuccess = function () {
        var c = cur.result;
        if (c) { list.push(c.value); c['continue'](); return; }
        photos = list.sort(function (a, b) { return a.at - b.at; });
        done();
      };
      cur.onerror = function () { done(); };
    });
  }

  function save(p) {
    photos.push(p);
    while (photos.length > MAX) {
      var old = photos.shift();
      if (db) store('readwrite')['delete'](old.id);
    }
    if (db) store('readwrite').put(p);
  }

  function clear() {
    photos = [];
    if (db) store('readwrite').clear();
    stop();
  }

  /** A photo (its link, or the photo itself as a Blob): made at most 1920×1080, its own shape kept, and kept. done(ok). */
  function add(src, from, at, done) {
    done = done || function () {};
    if (typeof src !== 'string') { take(null, src); return; }
    U.http(src, {type: 'blob', timeout: 90000}, take);
    function take(err, blob) {
      if (err || !blob) { done(false); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var s = Math.min(1, W / img.width, H / img.height), c = document.createElement('canvas');
            c.width = Math.round(img.width * s);
            c.height = Math.round(img.height * s);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            save({id: at + '-' + Math.random().toString(36).slice(2, 7), at: at, from: from || '', data: c.toDataURL('image/jpeg', 0.85)});
            done(true);
          } catch (e) { done(false); }
        };
        img.onerror = function () { done(false); };
        img.src = reader.result;
      };
      reader.readAsDataURL(blob);
    }
  }

  // MARK: - On screen

  var box = U.el('div', '', stage), slides = [U.el('div', 'slide', box), U.el('div', 'slide', box)], front = 0;
  box.id = 'frame';
  var info = U.el('div', 'glass info', box), clock = U.el('div', 'clock', info), date = U.el('div', 'date', info);
  var caption = U.el('div', 'caption', box);

  function tick() {
    var now = U.now(), t = U.time(now), bs = Calendar.today(now);
    clock.innerHTML = t.hm + '<span>' + t.ampm + '</span>';
    date.textContent = U.longDate(now) + (bs ? ' · ' + (L.ne ? bs.ne : bs.en) : '');
  }

  function show() {
    if (!photos.length) { stop(); return; }
    var p = photos[index % photos.length], next = slides[1 - front];
    index++;
    next.style.backgroundImage = 'url("' + p.data + '")';
    next.className = 'slide on drift' + (index % 4);   // four slow drifts, in turn
    slides[front].className = 'slide off';
    front = 1 - front;
    var d = U.at(p.at);
    caption.textContent = (p.from ? L.t('From {name}', {name: p.from}) + ' · ' : '') + U.longDate(d).replace(/^[^,]+, /, '');
    tick();
  }

  function start() {
    if (on || !photos.length) return false;
    on = true;
    index = Math.floor(Math.random() * photos.length);
    U.cls(document.body, 'framing', true);
    TV.holdScreenSaver(true);
    show();
    slideTimer = setInterval(show, SLIDE_MS);
    return true;
  }

  function stop() {
    if (!on) return;
    on = false;
    clearInterval(slideTimer);
    U.cls(document.body, 'framing', false);
    TV.holdScreenSaver(false);
    lastInput = Date.now();
  }

  // The first button while the frame shows only goes back to the home screen.
  document.addEventListener('keydown', function (e) {
    lastInput = Date.now();
    if (on) { stop(); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('mousemove', function () { lastInput = Date.now(); if (on) stop(); }, true);

  setInterval(function () {
    if (on) { tick(); return; }
    var busy = U.has(document.body, 'assistant-on') || document.hidden || Inbox.bigShowing();
    if (!busy && photos.length && Date.now() - lastInput >= AFTER_MS) start();
  }, 15000);

  load(function () {});

  return {
    add: add, clear: clear, start: start, stop: stop,
    count: function () { return photos.length; }, showing: function () { return on; }
  };
})();

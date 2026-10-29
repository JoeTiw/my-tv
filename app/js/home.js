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

  // A full-size photo (a megabyte or so) lives in the TV's own database, not with the settings, which have little room.
  var wallDb = null;
  function wallStore(done) {
    if (wallDb || !window.indexedDB) { done(wallDb); return; }
    try {
      var req = indexedDB.open('tiwari-wall', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('wall'); };
      req.onsuccess = function () { wallDb = req.result; done(wallDb); };
      req.onerror = function () { done(null); };
    } catch (e) { done(null); }
  }

  function setWall(w) {
    showWall(w);
    if (w && w.kind === 'image' && /^data:/.test(w.src)) {
      var at = Date.now();
      wallStore(function (db) {
        if (!db) { U.save('wall', w); return; }   // no database: the settings, if there's room
        db.transaction('wall', 'readwrite').objectStore('wall').put(w.src, 'photo');
        U.save('wall', {kind: 'image', kept: at});
      });
      return;
    }
    U.save('wall', w);
  }

  /** The background kept: from the settings, or the photo from the database. */
  function loadWall() {
    var w = U.load('wall');
    if (!w || !w.kept) { showWall(w); return; }
    wallStore(function (db) {
      if (!db) return;
      var get = db.transaction('wall', 'readonly').objectStore('wall').get('photo');
      get.onsuccess = function () { if (get.result) showWall({kind: 'image', src: get.result}); };
    });
  }

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
  // Lifting (and enlarging) takes the TV a moment: what came out is kept, by a short fingerprint of the icon.
  var LIFT_VERSION = 7, kept = U.load('lifted');
  if (!kept || kept.v !== LIFT_VERSION) kept = {v: LIFT_VERSION, marks: {}};
  function print(src) {
    var h = 0;
    for (var i = 0; i < src.length; i += 7) h = (h * 31 + src.charCodeAt(i)) | 0;
    return src.length + ':' + h;
  }
  function keepMark(key, out) {
    kept.marks[key] = out || false;
    var keys = Object.keys(kept.marks);
    if (keys.length > 40) delete kept.marks[keys[0]];
    try { U.save('lifted', kept); } catch (e) { kept.marks = {}; }
  }

  function lift(src, done) {
    if (lifted[src] !== undefined) { done(lifted[src] || null); return; }
    var key = print(src);
    if (kept.marks[key] !== undefined) { lifted[src] = kept.marks[key]; done(lifted[src] || null); return; }
    var img = new Image();
    img.onload = function () {
      var out = null;
      try { out = liftNow(img); } catch (e) { out = null; }
      lifted[src] = out || false;
      if (src.indexOf('data:') === 0) keepMark(key, out);   // the TV's own files may change; the helper's don't
      done(out);
    };
    img.onerror = function () { lifted[src] = false; done(null); };
    img.src = src;
  }

  function liftNow(img) {
    var w = Math.min(512, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
    if (!w || !h) return null;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    g.drawImage(w === img.naturalWidth ? img : toSize(img, w, h), 0, 0, w, h);   // a big icon: halved in steps
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
    // Only the background around the mark goes: what's like it but enclosed by the mark (a white play sign on a
    // white icon) stays. The background is followed in from the edges, through pixels like it.
    var keeps = new Float32Array(w * h), outside = new Uint8Array(w * h), q, p;
    if (best) {
      var dist = new Float32Array(w * h);
      for (p = 0; p < w * h; p++) {
        q = p * 4;
        dist[p] = px[q + 3] < 8 ? 0 : Math.max(Math.abs(px[q] - best[0]), Math.abs(px[q + 1] - best[1]), Math.abs(px[q + 2] - best[2])) / 255;
      }
      // How much of a pixel is mark: its difference from the background against its neighbors' biggest (an edge
      // pixel half red, half white is half the way to the red beside it), and nothing for what's nearly background.
      for (p = 0; p < w * h; p++) {
        var dd = dist[p], top = dd, cx0 = p % w, cy0 = (p / w) | 0;
        for (var ny0 = Math.max(0, cy0 - 1); ny0 <= Math.min(h - 1, cy0 + 1); ny0++) {
          for (var nx0 = Math.max(0, cx0 - 1); nx0 <= Math.min(w - 1, cx0 + 1); nx0++) if (dist[ny0 * w + nx0] > top) top = dist[ny0 * w + nx0];
        }
        keeps[p] = Math.max(0, Math.min(1, (dd - 0.1) / 0.22, top > 0 ? dd / (top * 0.92) : 0));
      }
      var stack = [];
      for (var e = 0; e < w; e++) { stack.push(e); stack.push((h - 1) * w + e); }
      for (e = 0; e < h; e++) { stack.push(e * w); stack.push(e * w + w - 1); }
      while (stack.length) {
        p = stack.pop();
        if (outside[p] || keeps[p] >= 1) continue;
        outside[p] = 1;
        var px0 = p % w;
        if (px0 > 0) stack.push(p - 1);
        if (px0 < w - 1) stack.push(p + 1);
        if (p >= w) stack.push(p - w);
        if (p < w * (h - 1)) stack.push(p + w);
      }
      // Edge pixels touching the background only at a corner belong to it too.
      var near = new Uint8Array(outside);
      for (p = 0; p < w * h; p++) {
        if (outside[p] || keeps[p] >= 1) continue;
        var cx = p % w, cy = (p / w) | 0;
        for (var oy = -1; oy <= 1 && !near[p]; oy++) for (var ox = -1; ox <= 1; ox++) {
          var nx = cx + ox, ny = cy + oy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && outside[ny * w + nx]) { near[p] = 1; break; }
        }
      }
      outside = near;
      // What's enclosed: kept only when color surrounds it (a white play sign in a red button). Enclosed by plain
      // dark or gray strokes (the holes in o, b, e of a name), it's background too.
      var seen = new Uint8Array(w * h);
      for (p = 0; p < w * h; p++) {
        if (outside[p] || seen[p] || keeps[p] >= 1) continue;
        var part = [], ring = 0, ringN = 0, todo = [p];
        seen[p] = 1;
        while (todo.length) {
          var u = todo.pop(), ux = u % w, nb = [ux > 0 ? u - 1 : -1, ux < w - 1 ? u + 1 : -1, u >= w ? u - w : -1, u < w * (h - 1) ? u + w : -1];
          part.push(u);
          for (var z = 0; z < 4; z++) {
            var v = nb[z];
            if (v < 0 || seen[v]) continue;
            if (keeps[v] < 1 && !outside[v]) { seen[v] = 1; todo.push(v); }
            else if (keeps[v] >= 1) { var vq = v * 4; ring += (Math.max(px[vq], px[vq + 1], px[vq + 2]) - Math.min(px[vq], px[vq + 1], px[vq + 2])) / 255; ringN++; }
          }
        }
        if (!ringN || ring / ringN < 0.3) for (z = 0; z < part.length; z++) outside[part[z]] = 1;
      }
    }
    var minX = w, minY = h, maxX = -1, maxY = -1, ink = 0, hue = 0, inkN = 0;
    for (p = 0; p < w * h; p++) {
      var j = p * 4, a = px[j + 3] / 255;
      if (best && outside[p]) {
        var keep = keeps[p];
        // An edge pixel is part mark, part background: take the background out of its color too, so the edge stays
        // clean instead of a dark (or light) fringe that looks jagged on the glass.
        if (keep > 0 && keep < 1) {
          for (var ch = 0; ch < 3; ch++) px[j + ch] = Math.max(0, Math.min(255, Math.round((px[j + ch] - best[ch] * (1 - keep)) / keep)));
        }
        a *= keep;
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
    // A colored symbol beside a plain name in black or gray (a red play button, then the word): just the symbol.
    // The name is under the tile anyway, and from a small icon its letters only come out as a smudge.
    var sym = symbolOnly(px, w, minX, minY, maxX, maxY);
    if (sym) {
      minX = sym.minX; maxX = sym.maxX; minY = sym.minY; maxY = sym.maxY;
      ink = sym.ink; hue = sym.hue; inkN = sym.n;
    }
    g.putImageData(data, 0, 0);
    var crop = document.createElement('canvas');
    crop.width = maxX - minX + 1;
    crop.height = maxY - minY + 1;
    crop.getContext('2d').drawImage(c, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    // A black or gray mark would vanish on smoky glass: it's shown white. A colored one (red letters) stays.
    var bgHex = best ? '#' + ((1 << 24) | (best[0] << 16) | (best[1] << 8) | best[2]).toString(16).slice(1) : '';
    // Made exactly the size it shows at on a focused tile (a small one enlarged first, edges crisp): the TV then
    // never scales it itself, which on the TV skips rows and leaves lines through the letters.
    var s = Math.min(LOGO_W * DENSITY / crop.width, LOGO_H * DENSITY / crop.height);
    var tw = Math.max(1, Math.round(crop.width * s)), th = Math.max(1, Math.round(crop.height * s));
    var out = toSize(enlarge(crop, tw, th, true), tw, th);
    return {src: out.toDataURL('image/png'), w: crop.width, pw: tw, dark: inkN && ink / inkN < 0.25 && hue / inkN < 0.2, bg: bgHex};
  }

  // The logo's room on a focused tile (224 × 192): 66% of its width, 44% of its height.
  var LOGO_W = 148, LOGO_H = 84, FOCUS_W = 224;
  // Screen pixels for one of the layout's (1 on the TV; more if it draws finer): logos are made at that many.
  var DENSITY = Math.max(1, Math.min(2, (window.devicePixelRatio || 1) * Math.min(window.innerWidth / 1920, window.innerHeight / 1080) || 1));

  /** A picture made tw × th in steps of halves (each step averages 2 × 2 pixels), so nothing is skipped. */
  function toSize(src, tw, th) {
    var cur = src, w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    if (w === tw && h === th && cur.getContext) return cur;
    while (w / 2 >= tw && h / 2 >= th) {
      var half = document.createElement('canvas');
      half.width = Math.ceil(w / 2);
      half.height = Math.ceil(h / 2);
      var hg = half.getContext('2d');
      hg.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in hg) hg.imageSmoothingQuality = 'high';
      hg.drawImage(cur, 0, 0, w, h, 0, 0, half.width, half.height);
      cur = half; w = half.width; h = half.height;
    }
    var c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, w, h, 0, 0, tw, th);
    return c;
  }

  /** The logo's width on the tile, as a share of it: one pixel for one pixel when focused. */
  function sizeLogo(img, mark) {
    if (!mark.pw) return;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.width = (mark.pw / DENSITY / FOCUS_W * 100).toFixed(2) + '%';
  }

  /** The symbol's box, when a wide mark is a colored symbol, a gap, then plain dark or gray letters; else null. */
  function symbolOnly(px, w, minX, minY, maxX, maxY) {
    if ((maxX - minX + 1) < 2.2 * (maxY - minY + 1)) return null;
    function stats(x0, x1) {
      var o = {minX: x1, maxX: x0, minY: maxY, maxY: minY, ink: 0, hue: 0, n: 0};
      for (var y = minY; y <= maxY; y++) for (var x = x0; x <= x1; x++) {
        var j = (y * w + x) * 4;
        if (px[j + 3] < 90) continue;
        if (x < o.minX) o.minX = x;
        if (x > o.maxX) o.maxX = x;
        if (y < o.minY) o.minY = y;
        if (y > o.maxY) o.maxY = y;
        o.ink += (0.2126 * px[j] + 0.7152 * px[j + 1] + 0.0722 * px[j + 2]) / 255;
        o.hue += (Math.max(px[j], px[j + 1], px[j + 2]) - Math.min(px[j], px[j + 1], px[j + 2])) / 255;
        o.n++;
      }
      return o;
    }
    // The first gap: empty columns, at least 3% of the width.
    var need = Math.max(1, Math.round((maxX - minX) * 0.012)), run = 0, cut = -1;
    for (var x = minX; x <= maxX && cut < 0; x++) {
      var empty = true;
      for (var y = minY; y <= maxY && empty; y++) if (px[(y * w + x) * 4 + 3] >= 90) empty = false;
      run = empty ? run + 1 : 0;
      if (run >= need) cut = x - run;
    }
    if (cut < minX) return null;
    var left = stats(minX, cut), right = stats(cut + run + 1, maxX);
    if (!left.n || !right.n) return null;
    var colored = left.hue / left.n > 0.35, plain = right.hue / right.n < 0.15;
    var symbolish = (left.maxX - left.minX + 1) < 1.9 * (left.maxY - left.minY + 1);
    return colored && plain && symbolish ? left : null;
  }

  /**
   * A small picture made big enough to show without the TV stretching it. Smoothly enlarged, then sharpened (its
   * colors against a blur of themselves) and, for a lifted mark, its soft edges tightened: a logo is flat shapes
   * with hard edges, so this gets close to how it was drawn. A picture that's big enough is left as it is.
   */
  function enlarge(src, wantW, wantH, crispEdges) {
    var sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    var f = Math.min(4, Math.ceil(Math.max(wantW / sw, wantH / sh) - 0.15));
    if (f < 2) return src;
    // A margin of two of the small picture's pixels all round, so the smoothing can round the outline there too.
    var m = crispEdges ? 2 * f : 0, W = sw * f + 2 * m, H = sh * f + 2 * m, c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
    g.drawImage(src, m, m, sw * f, sh * f);
    var data = g.getImageData(0, 0, W, H), px = data.data, n = W * H, i, k, j;
    // How covered each spot is, smoothed over about one pixel of the small picture: its outline, without the steps.
    var cover = new Float32Array(n);
    for (i = 0; i < n; i++) cover[i] = px[i * 4 + 3] / 255;
    var raw = new Float32Array(cover);
    var rc = Math.max(1, Math.round(f * 0.6));
    boxBlur(cover, W, H, rc); boxBlur(cover, W, H, rc);
    // The mark's colors from well inside it: the edge pixels (part background) take them instead of their own.
    var inner = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (i = 0; i < n; i++) {
      var w = raw[i] > 0.99 && cover[i] > 0.99 ? 1 : 0;
      inner[0][i] = px[i * 4] * w; inner[1][i] = px[i * 4 + 1] * w; inner[2][i] = px[i * 4 + 2] * w; inner[3][i] = w;
    }
    var r = 2 * f;   // far enough to reach inside from the outermost edge
    for (k = 0; k < 4; k++) { boxBlur(inner[k], W, H, r); boxBlur(inner[k], W, H, r); }
    for (i = 0; i < n; i++) {
      j = i * 4;
      var wi = inner[3][i], deep = raw[i] > 0.99 && cover[i] > 0.99;
      if (wi > 0.02) {
        for (k = 0; k < 3; k++) {
          var near = inner[k][i] / wi;
          // Inside: sharpened against its surroundings. At the edge: the color from inside.
          px[j + k] = Math.max(0, Math.min(255, Math.round(deep ? px[j + k] + 0.5 * (px[j + k] - near) : near)));
        }
      }
      if (crispEdges) {
        var t = Math.max(0, Math.min(1, (cover[i] - 0.41) / 0.18));
        px[j + 3] = Math.round(t * t * (3 - 2 * t) * 255);
      }
    }
    if (crispEdges) flatColors(px, n);
    g.putImageData(data, 0, 0);
    return c;
  }

  /**
   * A logo is a few flat colors (red, and white for the play sign). When that's so, a pixel between two of them
   * (where enlarging blurred the line) is moved to the nearer one, gradually, so the line inside is crisp too.
   */
  function flatColors(px, n) {
    var bins = {}, total = 0, i, j, key, b;
    for (i = 0; i < n; i++) {
      j = i * 4;
      if (px[j + 3] < 250) continue;
      key = (px[j] >> 4) * 256 + (px[j + 1] >> 4) * 16 + (px[j + 2] >> 4);
      b = bins[key] || (bins[key] = {n: 0, r: 0, g: 0, b: 0});
      b.n++; b.r += px[j]; b.g += px[j + 1]; b.b += px[j + 2];
      total++;
    }
    if (total < 50) return;
    var list = [];
    for (key in bins) if (bins.hasOwnProperty(key)) list.push(bins[key]);
    list.sort(function (x, y) { return y.n - x.n; });
    var pal = [], got = 0;
    for (i = 0; i < list.length && pal.length < 4; i++) {
      var c = [list[i].r / list[i].n, list[i].g / list[i].n, list[i].b / list[i].n], same = false;
      for (var q = 0; q < pal.length; q++) if (Math.abs(pal[q][0] - c[0]) + Math.abs(pal[q][1] - c[1]) + Math.abs(pal[q][2] - c[2]) < 40) same = true;
      got += list[i].n;
      if (!same) pal.push(c);
      if (got >= total * 0.88) break;
    }
    if (got < total * 0.88 || pal.length < 2) return;   // shaded, or one color: nothing to tighten
    for (i = 0; i < n; i++) {
      j = i * 4;
      if (!px[j + 3]) continue;
      // The two nearest of the colors, and how far along from one to the other this pixel is.
      var a = -1, a2 = -1, da = 1e9, da2 = 1e9;
      for (q = 0; q < pal.length; q++) {
        var d = (px[j] - pal[q][0]) * (px[j] - pal[q][0]) + (px[j + 1] - pal[q][1]) * (px[j + 1] - pal[q][1]) + (px[j + 2] - pal[q][2]) * (px[j + 2] - pal[q][2]);
        if (d < da) { a2 = a; da2 = da; a = q; da = d; } else if (d < da2) { a2 = q; da2 = d; }
      }
      if (a2 < 0) continue;
      var c1 = pal[a], c2 = pal[a2], vx = c2[0] - c1[0], vy = c2[1] - c1[1], vz = c2[2] - c1[2], len = vx * vx + vy * vy + vz * vz;
      if (len < 1) continue;
      var t = ((px[j] - c1[0]) * vx + (px[j + 1] - c1[1]) * vy + (px[j + 2] - c1[2]) * vz) / len;
      // Far off the line between them: a color of its own (a small detail): left alone.
      var ox = px[j] - c1[0] - t * vx, oy = px[j + 1] - c1[1] - t * vy, oz = px[j + 2] - c1[2] - t * vz;
      if (ox * ox + oy * oy + oz * oz > len * 0.12) continue;
      t = Math.max(0, Math.min(1, (t - 0.3) / 0.4));
      t = t * t * (3 - 2 * t);
      px[j] = Math.round(c1[0] + vx * t); px[j + 1] = Math.round(c1[1] + vy * t); px[j + 2] = Math.round(c1[2] + vz * t);
    }
  }

  /** A box blur of radius r over a W×H channel, in place (across, then down). */
  function boxBlur(v, W, H, r) {
    var tmp = new Float32Array(Math.max(W, H)), x, y, sum, cnt, span = 2 * r + 1;
    for (y = 0; y < H; y++) {
      var row = y * W;
      sum = 0; cnt = 0;
      for (x = -r; x <= r; x++) if (x >= 0 && x < W) { sum += v[row + x]; cnt++; }
      for (x = 0; x < W; x++) {
        tmp[x] = sum / cnt;
        var out = x - r, inn = x + r + 1;
        if (out >= 0) { sum -= v[row + out]; cnt--; }
        if (inn < W) { sum += v[row + inn]; cnt++; }
      }
      for (x = 0; x < W; x++) v[row + x] = tmp[x];
    }
    for (x = 0; x < W; x++) {
      sum = 0; cnt = 0;
      for (y = -r; y <= r; y++) if (y >= 0 && y < H) { sum += v[y * W + x]; cnt++; }
      for (y = 0; y < H; y++) {
        tmp[y] = sum / cnt;
        var o = y - r, ii = y + r + 1;
        if (o >= 0) { sum -= v[o * W + x]; cnt--; }
        if (ii < H) { sum += v[ii * W + x]; cnt++; }
      }
      for (y = 0; y < H; y++) v[y * W + x] = tmp[y];
    }
    return span;
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
    for (var i = 0; i < apps.length; i++) {
      var a = apps[i], t = U.el('div', 'tile glass', row);
      var tint = U.el('div', 'tint', t);
      glow(tint, a.color);
      U.el('div', 'sheen', t);
      var word = U.el('div', 'word', t, a.title);
      word.style.fontSize = Math.max(20, Math.min(34, Math.floor(TILE_W * 0.82 / (Math.max(5, a.title.length) * 0.55)))) + 'px';
      // The app's own icon from the TV, its mark lifted off its background onto the glass (the name stays if it
      // doesn't load; the icon as it is if it's a picture rather than a mark on a plain color).
      if (a.icon) {
        (function (t, word, src, tint, known, paths) {
          word.style.visibility = 'hidden';
          function plain() {
            var img = U.el('img', 'icon', t), done = false;
            img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); word.style.visibility = ''; };
            // A small picture: made big enough for its 100 px place first, so the TV doesn't stretch it.
            img.onload = function () {
              if (done) return;
              done = true;
              if (img.naturalWidth === 100) return;
              // Exactly its 100 px place: a small one enlarged, a big one made smaller here rather than by the TV.
              try { img.src = toSize(enlarge(img, 100, 100, false), 100, Math.round(100 * img.naturalHeight / img.naturalWidth)).toDataURL('image/png'); } catch (e) {}
            };
            img.src = src;
          }
          lift(src, function (mark) {
            if (!mark) { plain(); return; }
            var img = U.el('img', 'logo' + (mark.dark ? ' white' : ''), t);
            sizeLogo(img, mark);
            img.src = mark.src;
            // An app we don't know: its icon's own color glows (Hulu's green), unless that's black or white.
            if (!known && mark.bg && colorfulHex(mark.bg)) glow(tint, mark.bg);
            // Sharper: the TV's own bigger icon file, if Tiwari TV may read it.
            sharper(paths, mark.w, function (big) { img.className = 'logo' + (big.dark ? ' white' : ''); sizeLogo(img, big); img.src = big.src; });
          });
        })(t, word, a.icon, tint, !!knownColors[a.id], a.paths);
      }
      U.el('div', 'label', t, a.title);
      (function (t) {
        // Where the tile is now (moving one changes it).
        function at() { return Array.prototype.indexOf.call(t.parentNode.children, t); }
        t.addEventListener('mouseover', function () { if (moving) return; zone = 'apps'; focus = at(); show(); });
        t.addEventListener('click', function () { if (moving) { stopMoving(); return; } zone = 'apps'; focus = at(); ok(); });
      })(t);
    }
    focus = Math.min(focus, Math.max(0, apps.length - 1));
    place();
    show();
  }

  /** The tiles' places, in order. */
  function place() {
    var tiles = $('apps').children, n = Math.min(apps.length, visible()), width = n * TILE_W + (n - 1) * GAP;
    var left = Math.max(SIDE, (1920 - width) / 2);
    for (var i = 0; i < tiles.length; i++) tiles[i].style.left = (left + i * (TILE_W + GAP)) + 'px';
  }

  /** The first of the TV's own icon files that is bigger than what the helper sent, lifted the same way. */
  function sharper(paths, than, done) {
    var i = 0;
    (function next() {
      if (!paths || i >= paths.length) return;
      var p = paths[i++], src = p.indexOf('file://') === 0 ? p : 'file://' + p;
      lift(src, function (mark) { if (mark && mark.w > than * 1.2) done(mark); else next(); });
    })();
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
    if (moving) {
      if (k === K.left) carry(-1);
      else if (k === K.right) carry(1);
      else if ((k === K.ok && !okHeld) || k === K.back || k === 27 || k === 8) stopMoving();
      e.preventDefault();
      return;
    }
    if (k === K.ok && zone === 'apps' && !row()) {
      // In the dock OK opens the app when let go; held for a moment, it picks the tile up instead.
      if (!okHeld) { okLong = false; okHeld = setTimeout(function () { okLong = true; startMoving(); }, 700); }
      e.preventDefault();
      return;
    }
    if (k === K.left) move(-1, 0);
    else if (k === K.right) move(1, 0);
    else if (k === K.up) move(0, -1);
    else if (k === K.down) move(0, 1);
    else if (k === K.ok) ok();
    else if (k === K.back || k === 27 || k === 8) back();
    else return;
    e.preventDefault();
  });

  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== TV.keys.ok || !okHeld) return;
    clearTimeout(okHeld);
    okHeld = 0;
    if (!okLong && !moving) ok();
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
      // The list the helper sent (LG's own launcher list, with icons) wins; the TV's own answer, or a stand-in, else.
      var fromHelper = U.load('tvApps');
      if (fromHelper && fromHelper.length) list = fromHelper;
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
      apps = arrange(list.map(function (a) {
        var color = colors[a.id] || (colorful(a.color) ? a.color : '#9A8CFF');
        return {id: a.id, title: a.title, color: color, icon: icons[a.id] || a.icon || '', paths: a.paths || []};
      }));
      renderDock();
      Inbox.announce();   // the phone page shows this TV's own apps
      if (!U.load('tvApps')) Inbox.askIcons();   // no icons yet: the helper at home sends them
      if (done) done();
    });
  }

  // MARK: - The family's order for the dock (held OK on a tile, or Arrange on the phone)

  /** The apps in the kept order; apps it doesn't name yet (new ones) after them, as the TV lists them. */
  function arrange(list) {
    var kept = U.load('order'), ids = kept && kept.ids || [], at = {}, i;
    for (i = 0; i < ids.length; i++) at[ids[i]] = i;
    return list.map(function (a, n) { return {a: a, k: a.id in at ? at[a.id] : ids.length + n}; })
      .sort(function (x, y) { return x.k - y.k; }).map(function (x) { return x.a; });
  }

  function keepOrder(at) {
    U.save('order', {ids: apps.map(function (a) { return a.id; }), at: at || Date.now()});
    Inbox.announce();   // the phone shows the same order
  }

  /** From the phone: the order, by app id. */
  function setOrder(ids, at) {
    U.save('order', {ids: ids, at: at || Date.now()});
    var id = apps[focus] && apps[focus].id;
    apps = arrange(apps);
    for (var i = 0; i < apps.length; i++) if (apps[i].id === id) focus = i;
    renderDock();
    Inbox.announce();
  }

  // Moving a tile: OK held on it picks it up; ◀ ▶ carry it; OK or Back puts it down.
  var moving = false, okHeld = 0, okLong = false;

  function startMoving() {
    if (zone !== 'apps' || !apps[focus] || row()) return;
    moving = true;
    U.cls(document.body, 'arranging', true);
    toast(L.t('Moving {app}: ◀ ▶ to move it, OK to put it down', {app: apps[focus].title}));
    show();
  }

  function carry(dx) {
    var to = focus + dx;
    if (to < 0 || to >= apps.length) return;
    var a = apps[focus];
    apps[focus] = apps[to];
    apps[to] = a;
    focus = to;
    // The tiles keep their pictures: only their places change.
    var row = $('apps'), tiles = row.children, t = tiles[focus - dx], other = tiles[focus];
    if (dx > 0) row.insertBefore(other, t); else row.insertBefore(t, other);
    place();
    show();
  }

  function stopMoving() {
    moving = false;
    U.cls(document.body, 'arranging', false);
    keepOrder();
    toast(L.t('Done. The apps stay in this order.'));
    show();
  }

  function start() {
    fit();
    window.addEventListener('resize', fit);
    loadWall();
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
    start: start, toast: toast, setTheme: setTheme, setWall: setWall, setRecs: setRecs, setPicks: setPicks, loadApps: loadApps, setOrder: setOrder,
    apps: function () { return apps; }, open: open
  };
})();

/* Small helpers shared by the rest. Plain ES5: older LG TVs run a Chromium from 2015-2017. */
var U = (function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function has(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function cls(e, c, on) {
    if (!e) return;
    if (on && !has(e, c)) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && has(e, c)) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  function save(key, value) { try { localStorage.setItem('tiwari.' + key, JSON.stringify(value)); } catch (e) {} }
  function load(key) { try { return JSON.parse(localStorage.getItem('tiwari.' + key)); } catch (e) { return null; } }

  /**
   * An HTTP request: opts {method, headers, body, timeout, type ('json', 'text' or 'blob')}; done(err, value, xhr).
   */
  function http(url, opts, done) {
    opts = opts || {};
    var xhr = new XMLHttpRequest(), finished = false;
    xhr.open(opts.method || 'GET', url);
    if (opts.type === 'blob' || opts.type === 'arraybuffer') xhr.responseType = opts.type;
    xhr.timeout = opts.timeout || 20000;
    var h = opts.headers || {};
    for (var k in h) if (h.hasOwnProperty(k)) xhr.setRequestHeader(k, h[k]);
    function finish(err, value) {
      if (finished) return;
      finished = true;
      done(err, value, xhr);
    }
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new Error('HTTP ' + xhr.status + (opts.type === 'blob' || opts.type === 'arraybuffer' ? '' : ': ' + String(xhr.responseText).slice(0, 300))));
        return;
      }
      if (opts.type === 'blob' || opts.type === 'arraybuffer') { finish(null, xhr.response); return; }
      if (opts.type === 'json') {
        var v;
        try { v = JSON.parse(xhr.responseText); } catch (e) { finish(e); return; }
        finish(null, v);
        return;
      }
      finish(null, xhr.responseText);
    };
    xhr.onerror = function () { finish(new Error('network')); };
    xhr.ontimeout = function () { finish(new Error('timeout')); };
    xhr.send(opts.body === undefined ? null : opts.body);
    return xhr;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'];

  /** "9:41" and "PM" (12-hour, as most people in Nepal read a clock). */
  function time(d) {
    var h = d.getHours() % 12 || 12;
    return {hm: h + ':' + pad(d.getMinutes()), ampm: d.getHours() < 12 ? 'AM' : 'PM'};
  }
  function longDate(d) { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }

  return {$: $, el: el, has: has, cls: cls, save: save, load: load, http: http, time: time, longDate: longDate, DAYS: DAYS};
})();

/*
 * Sealed messages: everything on the phone channel is encrypted with the family's secret key (config.js `secret`,
 * 64 hex letters), so ntfy.sh only carries what nobody else can read, and the TV takes nothing that wasn't sealed
 * with the key. TweetNaCl's secretbox (XSalsa20 and Poly1305; public domain, js/vendor) does the work.
 *
 *   text:  "TT1." + base64(24-byte nonce + box of the UTF-8 JSON {m: message, f: from, g: tags, k: kind})
 *   files: 24-byte nonce + box of the bytes
 *
 * The same file runs on the TV (ES5) and on the phone page; helper/seal.mjs is the helper's copy of the format.
 */
var Seal = (function () {
  'use strict';

  var C = window.TIWARI || {}, PREFIX = 'TT1.', key = null;

  function fromHex(h) {
    if (!/^[0-9a-f]{64}$/i.test(h || '')) return null;
    var out = new Uint8Array(32);
    for (var i = 0; i < 32; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }

  function utf8(s) {
    var bin = unescape(encodeURIComponent(s)), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function fromUtf8(b) {
    var bin = '';
    for (var i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, Array.prototype.slice.call(b.subarray(i, i + 8192)));
    return decodeURIComponent(escape(bin));
  }
  function b64(b) {
    var bin = '';
    for (var i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, Array.prototype.slice.call(b.subarray(i, i + 8192)));
    return btoa(bin);
  }
  function unb64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function sealBytes(bytes) {
    var nonce = nacl.randomBytes(24), box = nacl.secretbox(bytes, nonce, key), out = new Uint8Array(24 + box.length);
    out.set(nonce, 0);
    out.set(box, 24);
    return out;
  }
  /** The bytes, or null when they weren't sealed with our key. */
  function openBytes(sealed) {
    if (!key || !sealed || sealed.length < 24 + 16) return null;
    return nacl.secretbox.open(sealed.subarray(24), sealed.subarray(0, 24), key) || null;
  }

  /** {m, f, g, k} → the text to send. */
  function seal(payload) { return PREFIX + b64(sealBytes(utf8(JSON.stringify(payload)))); }

  /** The text from the channel → {m, f, g, k}, or null when it isn't ours. */
  function open(text) {
    if (!key || typeof text !== 'string' || text.indexOf(PREFIX) !== 0) return null;
    try {
      var bytes = openBytes(unb64(text.slice(PREFIX.length)));
      return bytes ? JSON.parse(fromUtf8(bytes)) : null;
    } catch (e) { return null; }
  }

  function setKey(hex) { key = fromHex(hex); return !!key; }
  setKey(C.secret);

  return {
    on: function () { return !!key; }, setKey: setKey, seal: seal, open: open, sealBytes: sealBytes, openBytes: openBytes,
    PREFIX: PREFIX
  };
})();

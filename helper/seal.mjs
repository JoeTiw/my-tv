// The helper's copy of js/seal.js's format: "TT1." + base64(nonce + secretbox of the JSON), and nonce + box for files.
import nacl from 'tweetnacl';

const PREFIX = 'TT1.';

export function keyFrom(hex) { return /^[0-9a-f]{64}$/i.test(hex || '') ? new Uint8Array(Buffer.from(hex, 'hex')) : null; }

export function sealBytes(key, bytes) {
  const nonce = nacl.randomBytes(24);
  return Buffer.concat([Buffer.from(nonce), Buffer.from(nacl.secretbox(new Uint8Array(bytes), nonce, key))]);
}

export function openBytes(key, sealed) {
  const b = new Uint8Array(sealed);
  if (!key || b.length < 40) return null;
  return nacl.secretbox.open(b.subarray(24), b.subarray(0, 24), key) || null;
}

export function seal(key, payload) { return PREFIX + sealBytes(key, Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64'); }

export function open(key, text) {
  if (!key || typeof text !== 'string' || !text.startsWith(PREFIX)) return null;
  try {
    const b = openBytes(key, Buffer.from(text.slice(PREFIX.length), 'base64'));
    return b ? JSON.parse(Buffer.from(b).toString('utf8')) : null;
  } catch (e) { return null; }
}

'use strict';

const crypto = require('crypto');

/**
 * SkTechCrypto
 *
 * Implements the complete two-tier cryptographic algorithm used by SK Tech TV:
 * - Tier 1: Bijective English alphabet substitution map + Base64 decode.
 * - Tier 2: String inversion (reverse) + Base64 decode + AES-128-CBC decryption.
 * - Secondary AES: Additional AES-128-CBC cipher for tokenApi payloads.
 *
 * Runs on pure Node.js native crypto with zero external dependencies.
 */
class SkTechCrypto {
  constructor() {
    this.primaryKey = Buffer.from('l2l5kB7xC5qP1rK1', 'utf8');
    this.primaryIv = Buffer.from('p1K5nP7uB8hH1l19', 'utf8');

    this.secondaryKey = Buffer.from('l2K5wB8xC1wP7rK1', 'utf8');
    this.secondaryIv = Buffer.from('n0K4nP8uB8hH1l18', 'utf8');

    this._initSubstitutionMap();
  }

  _initSubstitutionMap() {
    const srcChars = [];
    for (let c = 'a'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
      srcChars.push(String.fromCharCode(c));
      srcChars.push(String.fromCharCode(c).toUpperCase());
    }

    const dstPairs = [
      ['f', 'F'], ['g', 'G'], ['j', 'J'], ['k', 'K'],
      ['a', 'A'], ['p', 'P'], ['b', 'B'], ['m', 'M'],
      ['o', 'O'], ['z', 'Z'], ['e', 'E'], ['n', 'N'],
      ['c', 'C'], ['d', 'D'], ['r', 'R'], ['q', 'Q'],
      ['t', 'T'], ['v', 'V'], ['u', 'U'], ['x', 'X'],
      ['h', 'H'], ['i', 'I'], ['w', 'W'], ['y', 'Y'],
      ['l', 'L'], ['s', 'S']
    ];

    const dstChars = [];
    for (const [lower, upper] of dstPairs) {
      dstChars.push(lower, upper);
    }

    this.dMap = new Map();
    for (let i = 0; i < srcChars.length; i++) {
      this.dMap.set(dstChars[i], srcChars[i]);
    }
  }

  /**
   * Decrypt primary SK Tech payload (events.txt, categories.txt, pro/*.txt, app.txt)
   * @param {string} rawText - Ciphertext from Cloudflare Pages backend
   * @returns {string} Plaintext UTF-8 string
   */
  decryptPrimary(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    const trimmed = rawText.trim();
    if (!trimmed) return '';

    // Tier 1: Bijective alphabet substitution
    let subbed = '';
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      subbed += this.dMap.get(ch) || ch;
    }

    const rem = subbed.length % 4;
    if (rem > 0) {
      subbed += '='.repeat(4 - rem);
    }

    const tier1Decoded = Buffer.from(subbed, 'base64').toString('utf8');

    // Tier 2: String inversion + Base64 + AES-128-CBC
    const reversed = tier1Decoded.split('').reverse().join('');
    const aesData = Buffer.from(reversed, 'base64');
    if (!aesData || aesData.length === 0) return '';

    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', this.primaryKey, this.primaryIv);
      let decrypted = decipher.update(aesData, null, 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (_) {
      try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', this.primaryKey, this.primaryIv);
        decipher.setAutoPadding(false);
        const ptBuf = Buffer.concat([decipher.update(aesData), decipher.final()]);
        const pad = ptBuf[ptBuf.length - 1];
        const trimmed = (pad && pad <= 16) ? ptBuf.subarray(0, ptBuf.length - pad) : ptBuf;
        return trimmed.toString('utf8');
      } catch (err) {
        throw new Error(`Failed to decrypt SK Tech payload: ${err.message}`);
      }
    }
  }

  /**
   * Decrypt secondary payload (used for encrypted tokenApi payloads)
   * @param {string|Buffer} cipherData - Base64 or binary ciphertext
   * @returns {string} Plaintext UTF-8 string
   */
  decryptSecondary(cipherData) {
    if (!cipherData) return '';
    const buf = Buffer.isBuffer(cipherData) ? cipherData : Buffer.from(cipherData, 'base64');
    const decipher = crypto.createDecipheriv('aes-128-cbc', this.secondaryKey, this.secondaryIv);
    let decrypted = decipher.update(buf, null, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Decrypt dynamic encrypted M3U playlists (e.g. BIG BOSS worker payloads)
   * Reversed from Dalvik method `Lua/t1;->h`:
   * - Head: substring(0, 10)
   * - IV: substring(10, 34) (Base64 decode -> 16 bytes IV)
   * - Body: substring(34, len - 54)
   * - Key: substring(len - 54, len - 10) (Base64 decode -> 32 bytes AES-256 key)
   * - Tail: substring(len - 10)
   * - Ciphertext: Head + Body + Tail (Base64 decode -> AES-256-CBC cipher bytes)
   *
   * @param {string} rawText - Response text from worker endpoint
   * @returns {string} Plaintext M3U or original string if not encrypted
   */
  decryptM3u(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    const trimmed = rawText.trim();
    if (trimmed.length < 60) return trimmed;

    // Check if payload matches encrypted structure (IV ends with == at char 32-34)
    if (!trimmed.substring(10, 34).includes('==')) {
      return trimmed;
    }

    const len = trimmed.length;
    const v2 = trimmed.substring(0, 10);
    const v4_iv = trimmed.substring(10, 34);
    const v3 = trimmed.substring(34, len - 54);
    const v5_key = trimmed.substring(len - 54, len - 10);
    const v7_tail = trimmed.substring(len - 10);

    const cipherTextB64 = v2 + v3 + v7_tail;

    try {
      const iv = Buffer.from(v4_iv, 'base64');
      const key = Buffer.from(v5_key, 'base64');
      const cipherBytes = Buffer.from(cipherTextB64, 'base64');

      if (iv.length !== 16 || (key.length !== 16 && key.length !== 32) || cipherBytes.length % 16 !== 0) {
        return trimmed;
      }

      const algo = key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';
      const decipher = crypto.createDecipheriv(algo, key, iv);
      return Buffer.concat([decipher.update(cipherBytes), decipher.final()]).toString('utf8');
    } catch (_) {
      return trimmed;
    }
  }

  /**
   * Normalizes ClearKey license strings (hex colon pairs, comma-separated pairs, or JSON)
   * into W3C base64url key objects.
   * @param {string|Object} license - e.g. "6752015acf084572a08dfe21796f8b45:ff823ddbe5625c35d3e93f0ed4520115"
   * @returns {{ keyId: string, key: string, keys?: Array<{ keyId: string, key: string }> }|undefined}
   */
  formatClearKey(license) {
    if (!license) return undefined;

    const isHex = (str) => typeof str === 'string' && /^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0;
    const toB64Url = (str) => {
      if (!str || typeof str !== 'string') return '';
      const trimmed = str.trim();
      return isHex(trimmed) ? Buffer.from(trimmed, 'hex').toString('base64url') : trimmed;
    };

    if (typeof license === 'object') {
      if (license.keyId && license.key) {
        const keys = Array.isArray(license.keys) ? license.keys : [{ keyId: license.keyId, key: license.key }];
        return { keyId: license.keyId, key: license.key, keys };
      }
      if (license.keys && Array.isArray(license.keys) && license.keys.length > 0) {
        const mapped = license.keys.map(k => ({
          keyId: toB64Url(k.kid || k.keyId),
          key: toB64Url(k.k || k.key)
        }));
        return { keyId: mapped[0].keyId, key: mapped[0].key, keys: mapped };
      }
      return license;
    }

    if (typeof license === 'string') {
      const trimmed = license.trim();

      // Check for JSON first before splitting on colons
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.keys && Array.isArray(parsed.keys) && parsed.keys.length > 0) {
            const mapped = parsed.keys.map(k => ({
              keyId: toB64Url(k.kid || k.keyId),
              key: toB64Url(k.k || k.key)
            }));
            return { keyId: mapped[0].keyId, key: mapped[0].key, keys: mapped };
          }
          if (parsed.keyId && parsed.key) {
            return { keyId: toB64Url(parsed.keyId), key: toB64Url(parsed.key), keys: [{ keyId: toB64Url(parsed.keyId), key: toB64Url(parsed.key) }] };
          }
        } catch (_) {}
      }

      // Check for comma-separated multiple key pairs: e.g. key1:val1,key2:val2
      if (trimmed.includes(',')) {
        const pairs = trimmed.split(',').map(p => p.trim()).filter(Boolean);
        const parsedKeys = [];
        for (const pair of pairs) {
          if (pair.includes(':')) {
            const [kId, kVal] = pair.split(':');
            parsedKeys.push({ keyId: toB64Url(kId), key: toB64Url(kVal) });
          }
        }
        if (parsedKeys.length > 1) {
          return { keyId: parsedKeys[0].keyId, key: parsedKeys[0].key, keys: parsedKeys };
        }
        if (parsedKeys.length === 1) {
          return { keyId: parsedKeys[0].keyId, key: parsedKeys[0].key };
        }
      }

      // Single key:val colon pair
      if (trimmed.includes(':')) {
        const [rawKeyId, rawKey] = trimmed.split(':');
        const keyId = toB64Url(rawKeyId);
        const key = toB64Url(rawKey);
        return { keyId, key };
      }
    }

    return undefined;
  }

  /**
   * Constructs an in-addon DASH manifest proxy URL that injects BaseURL and ClearKey DRM ContentProtection
   * tags so standard ExoPlayer clients (like Nuvio) can resolve keys and decrypt seamlessly.
   *
   * @param {string} streamUrl - Upstream .mpd URL
   * @param {Object} [clearkeyObj] - Normalized ClearKey object with keyId and key
   * @param {Object} [headers] - Upstream request headers (Cookie, Referer, User-Agent, Origin)
   * @returns {string} Relative proxy URL (/api/manifest.mpd?...)
   */
  buildDashManifestUrl(streamUrl, clearkeyObj, headers = {}) {
    if (!streamUrl) return '';
    const token = clearkeyObj ? Buffer.from(JSON.stringify(clearkeyObj)).toString('base64url') : '';
    const cookie = headers['Cookie'] || headers['cookie'] || '';
    const referer = headers['Referer'] || headers['referer'] || '';
    const origin = headers['Origin'] || headers['origin'] || '';
    const ua = headers['User-Agent'] || headers['user-agent'] || '';

    let manifestUrl = `/api/manifest.mpd?url=${encodeURIComponent(streamUrl)}`;
    if (token) manifestUrl += `&token=${encodeURIComponent(token)}`;
    if (cookie) manifestUrl += `&cookie=${encodeURIComponent(cookie)}`;
    if (referer) manifestUrl += `&referer=${encodeURIComponent(referer)}`;
    if (origin) manifestUrl += `&origin=${encodeURIComponent(origin)}`;
    if (ua) manifestUrl += `&ua=${encodeURIComponent(ua)}`;
    return manifestUrl;
  }
}

module.exports = new SkTechCrypto();

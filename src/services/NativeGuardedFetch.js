'use strict';

// Buffered transport for the local guarded-fetch integration candidate. No retry/fallback
// policy, cookie jar, provider defaults or public media relay is added here.
const { threadId } = require('node:worker_threads');
const { randomBytes } = require('node:crypto');
const { createNativeGuardedSlot } = require('./NativeGuardedSlot');
const { readLimitedBody } = require('../impitClient');
const { OutboundBlockedError, assertOutboundUrl } = require('./GuardedOutbound');
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const DEFAULT_BODY_LIMIT = 1024 * 1024;
const HARD_BODY_LIMIT = 8 * 1024 * 1024;
const error = (code, message) => Object.assign(new Error(message), { code });
const isDamitv = host => host === 'damitv.st' || host.endsWith('.damitv.st');

async function withSignal(operation, signal) {
  let abort;
  try {
    signal.throwIfAborted();
    return await Promise.race([operation, new Promise((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    })]);
  } finally { if (abort) signal.removeEventListener('abort', abort); }
}

function filteredHeaders(value) {
  const headers = new Headers(value);
  const blocked = ['host', 'connection', 'proxy-connection', 'keep-alive', 'proxy-authorization',
    'proxy-authenticate', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'expect'];
  for (const token of (headers.get('connection') || '').split(',')) blocked.push(token.trim());
  for (const name of blocked) if (name) headers.delete(name);
  return Object.fromEntries(headers);
}

function createNativeGuardedFetch({ maxSlots = 4, slotOptions = {}, createSlot = createNativeGuardedSlot,
  recycleMs = Math.max(600000, Number(process.env.IMPIT_RECYCLE_MS) || 5400000), now = Date.now } = {}) {
  if (!Number.isInteger(maxSlots) || maxSlots < 1 || maxSlots > 4) throw new RangeError('Native pool supports 1–4 slots');
  if (!Number.isFinite(recycleMs) || recycleMs < 600000) throw new RangeError('Invalid native recycle interval');
  const records = [], shutdown = new AbortController();
  const poolId = randomBytes(4).toString('hex');
  let nextKeyId = 1;
  let closed = false, closing;
  async function acquire(key, configuration, signal, owner) {
    if (closed) throw error('ERR_NATIVE_POOL_CLOSED', 'Native pool closed');
    let record = records.find(item => item.key === key && item.slot && !item.reserved && !item.slot.busy);
    if (record) {
      record.reserved = true; record.owner = owner;
      if (now() - record.bornAt > recycleMs) {
        // Match the existing recycle policy, but retire only idle clients and
        // never force GC underneath an active native operation.
        const retiring = record.slot.close().finally(() => {
          const index = records.indexOf(record);
          if (index !== -1) records.splice(index, 1);
        });
        await withSignal(retiring, signal);
        return acquire(key, configuration, signal, owner);
      }
      return record;
    }
    // The cap is pool-wide. A different key may reclaim an idle slot;
    // active or initializing slots are never interrupted.
    const keyId = records.find(r => r.key === key)?.keyId || nextKeyId;
    const diagnostic = () => ({ threadId, poolId, requested: { keyId, profile: configuration.profile, egress: configuration.proxyUrl ? 'proxy' : 'direct', owner }, limit: maxSlots, slots: records.map(r => ({ keyId: r.keyId, profile: r.profile, egress: r.egress, owner: r.owner || 'idle', state: !r.slot ? 'creating' : r.reserved ? 'reserved' : r.slot.busy ? 'busy' : 'idle' })) });
    if (records.length >= maxSlots) {
      const idle = records.find(item => item.key !== key && item.slot && !item.reserved && !item.slot.busy);
      if (!idle) throw Object.assign(error('ERR_NATIVE_POOL_BUSY', 'Native pool capacity reached'), { capacityDiagnostic: diagnostic() });
      // Reserve synchronously, before awaiting closure, so another request cannot
      // reuse or evict this slot while its native resources are being released.
      idle.reserved = true;
      const retiring = Promise.resolve().then(() => idle.slot.close()).then(() => {
        const index = records.indexOf(idle);
        if (index !== -1) records.splice(index, 1);
      }, failure => { idle.reserved = false; throw failure; });
      await withSignal(retiring, signal);
      return acquire(key, configuration, signal, owner);
    }
    if (!records.some(r => r.key === key)) nextKeyId++;
    record = { key, keyId, reserved: true, owner, profile: configuration.profile, egress: configuration.proxyUrl ? 'proxy' : 'direct' };
    records.push(record);
    record.ready = Promise.resolve().then(() => createSlot({ ...slotOptions, ...configuration })).then(async slot => {
      record.slot = slot;
      record.bornAt = now();
      if (closed) { await slot.close(); throw error('ERR_NATIVE_POOL_CLOSED', 'Native pool closed'); }
      return slot;
    }).catch(failure => {
      if (failure.code === 'ERR_NATIVE_SLOT_CAPACITY') failure.capacityDiagnostic = { ...diagnostic(), slotCount: failure.slotCount, slotLimit: failure.slotLimit };
      const index = records.indexOf(record);
      if (index !== -1) records.splice(index, 1);
      throw failure;
    });
    try {
      await withSignal(record.ready, signal);
      signal.throwIfAborted();
      return record;
    } catch (failure) { record.reserved = false; throw failure; }
  }

  return {
    get stats() { return { slots: records.length, busy: records.filter(record => record.reserved || record.slot?.busy).length }; },
    async fetch(rawUrl, options = {}) {
      if (closed) throw error('ERR_NATIVE_POOL_CLOSED', 'Native pool closed');
      const timeoutMs = options.timeoutMs ?? 15000;
      const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_BODY_LIMIT;
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) throw new RangeError('Invalid total timeout');
      if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > HARD_BODY_LIMIT) throw new RangeError('Invalid body limit');
      let url;
      try { url = new URL(rawUrl); } catch (_) { throw new OutboundBlockedError('invalid_url'); }
      url.hash = '';
      let headers = filteredHeaders(options.headers), method = String(options.method || 'GET').toUpperCase();
      let body = options.body;
      // Streaming/replayable uploads need a separate design. Small fixed
      // strings/byte buffers suffice for this metadata laboratory.
      if (body !== undefined && body !== null && typeof body !== 'string' && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
        throw new TypeError('Unsupported native laboratory request body');
      }
      if (body != null && Buffer.byteLength(body) > HARD_BODY_LIMIT) throw new RangeError('Request body exceeds laboratory cap');
      if (options.profile !== undefined && !['chrome', 'vanilla'].includes(options.profile)) throw new TypeError('Invalid native profile');
      if (options.redirect !== undefined && !['manual', 'follow', 'error'].includes(options.redirect)) throw new TypeError('Invalid redirect policy');
      // Preserve the selected egress/profile across CDN redirects, as one
      // existing native client does. A redirect must not silently leave WARP.
      const proxyUrl = Object.hasOwn(options, 'proxyUrl') ? options.proxyUrl :
        isDamitv(url.hostname) ? process.env.WARP_PROXY_URL || process.env.DAMITV_PROXY_URL : null;
      const profile = options.profile || (proxyUrl || isDamitv(url.hostname) ? 'vanilla' : 'chrome');
      const deadline = performance.now() + timeoutMs;
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(new DOMException('Native fetch deadline', 'TimeoutError')), timeoutMs);
      const signal = AbortSignal.any([shutdown.signal, timeout.signal, ...(options.signal ? [options.signal] : [])]);
      try {
        for (let hop = 0; ; hop++) {
          signal.throwIfAborted();
          if (!['http:', 'https:'].includes(url.protocol)) throw new OutboundBlockedError('unsupported_protocol');
          if (url.username || url.password) throw new OutboundBlockedError('url_credentials');
          // Reject before native module/client allocation. The slot and its
          // connector still validate independently at lease and dial time.
          await withSignal(assertOutboundUrl(url.href, { resolve: slotOptions.resolve }), signal);
          const owner = ['manifest', 'wasm'].includes(options.diagnosticOwner) ? options.diagnosticOwner : 'other';
          const record = await acquire(JSON.stringify([profile, proxyUrl || null]), { profile, proxyUrl: proxyUrl || null }, signal, owner);
          let received;
          try {
            signal.throwIfAborted();
            const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
            received = await record.slot.run(url.href, async client => {
              // Never pass the caller signal to the native wrapper. The slot
              // owns cancellation and waits for the underlying body operation.
              const response = await client.fetch(url.href, { method, headers,
                body, redirect: 'manual', timeout: remaining });
              const responseHeaders = new Headers(response.headers);
              const location = responseHeaders.get('location');
              if (REDIRECTS.has(response.status) && location) {
                if (response.body) await response.body.cancel();
                if (options.redirect === 'error') throw new TypeError('Redirect forbidden');
                if (options.redirect === 'manual') return { status: response.status, headers: responseHeaders,
                  bytes: Buffer.alloc(0), truncated: false };
                return { status: response.status, location };
              }
              const limited = response.body ? await readLimitedBody(response.body, maxBodyBytes) : { buffer: Buffer.alloc(0), truncated: false };
              return { status: response.status, headers: responseHeaders, bytes: Buffer.from(limited.buffer), truncated: limited.truncated };
            }, { signal, timeoutMs: remaining });
          } finally { record.reserved = false; if (!record.slot.busy) record.owner = null; }
          signal.throwIfAborted();
          if (!received.location) {
            const bytes = received.bytes;
            return { ok: received.status >= 200 && received.status < 300, status: received.status,
              url: url.href, headers: received.headers, bodyTruncated: received.truncated,
              text: async () => bytes.toString('utf8'), json: async () => JSON.parse(bytes.toString('utf8')),
              arrayBuffer: async () => Uint8Array.from(bytes).buffer };
          }
          if (hop >= 5) throw error('ERR_OUTBOUND_REDIRECT_LIMIT', 'Native redirect limit exceeded');
          let next;
          try { next = new URL(received.location, url); } catch (_) { throw new OutboundBlockedError('invalid_redirect'); }
          next.hash = '';
          if (next.origin !== url.origin) {
            for (const name of Object.keys(headers)) {
              if (['authorization', 'cookie', 'cookie2', 'proxy-authorization'].includes(name.toLowerCase())) delete headers[name];
            }
          }
          if ((received.status === 303 && method !== 'HEAD') || ([301, 302].includes(received.status) && method === 'POST')) {
            method = 'GET'; body = undefined;
            for (const name of Object.keys(headers)) if (['content-type', 'content-encoding'].includes(name.toLowerCase())) delete headers[name];
          }
          url = next;
        }
      } catch (failure) {
        if (signal.aborted) throw signal.reason;
        if (performance.now() >= deadline) throw new DOMException('Native fetch deadline', 'TimeoutError');
        throw failure;
      } finally { clearTimeout(timer); }
    },
    close() {
      if (closing) return closing;
      closed = true; shutdown.abort(new DOMException('Native fetch pool shutdown', 'AbortError'));
      closing = (async () => {
        await Promise.allSettled(records.map(async record => {
          const slot = record.slot || await record.ready; await slot.close();
        }));
        records.length = 0;
      })();
      return closing;
    }
  };
}

module.exports = { createNativeGuardedFetch };

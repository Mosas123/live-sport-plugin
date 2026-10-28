'use strict';

// Experimental, opt-in supervisor. A child owns one native request; capacity
// returns only after its exit is observed.
const { fork } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { threadId } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const error = (code, message) => Object.assign(new Error(message), { code });

function childScriptPath(base = __dirname, exists = fs.existsSync) {
  const local = path.join(base, 'isolated-native-child.cjs');
  const bundled = path.join(base, 'services', 'isolated-native-child.cjs');
  return exists(local) ? local : bundled;
}

function createIsolatedNativePoolCandidate({ maxSlots = 4, now = () => performance.now(), spawn = () => fork(
  childScriptPath(), [],
  { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced' }) } = {}) {
  if (!Number.isInteger(maxSlots) || maxSlots < 1 || maxSlots > 4) throw new RangeError('Invalid native pool size');
  const children = new Map(), poolId = randomBytes(4).toString('hex');
  let closed = false, closing, nextSlotId = 1;
  return {
    get occupied() { return children.size; },
    async fetch(url, options = {}) {
      if (closed) throw error('ERR_NATIVE_POOL_CLOSED', 'Native pool closed');
      const { signal, timeoutMs = 15000 } = options;
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) throw new RangeError('Invalid native deadline');
      signal?.throwIfAborted();
      if (children.size >= maxSlots) {
        const diagnostic = { threadId, poolId, limit: maxSlots, slots: [...children.values()].map(record => ({
          slotId: record.slotId, phase: record.phase, profile: record.profile, egress: record.egress,
          owner: record.owner, ageMs: Math.max(0, Math.round(now() - record.startedAt))
        })) };
        throw Object.assign(error('ERR_NATIVE_POOL_BUSY', 'Native pool capacity reached'), { capacityDiagnostic: diagnostic });
      }
      let child;
      try { child = spawn(); }
      catch (_) { throw error('ERR_NATIVE_UNAVAILABLE', 'Native child unavailable'); }
      const record = { slotId: nextSlotId++, startedAt: now(), phase: 'running',
        profile: ['chrome', 'vanilla'].includes(options.profile) ? options.profile : 'default',
        egress: options.proxyUrl ? 'proxy' : 'direct',
        owner: ['manifest', 'wasm'].includes(options.diagnosticOwner) ? options.diagnosticOwner : 'other' };
      children.set(child, record);
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (failure, response) => {
          if (settled) return;
          settled = true;
          record.phase = 'terminating';
          clearTimeout(timer);
          signal?.removeEventListener('abort', aborted);
          try { child.kill('SIGKILL'); } catch (_) { /* retain capacity until exit */ }
          if (failure) reject(failure); else resolve(response);
        };
        const aborted = () => finish(signal.reason);
        const timer = setTimeout(() => finish(new DOMException('Native fetch deadline', 'TimeoutError')), timeoutMs);
        signal?.addEventListener('abort', aborted, { once: true });
        const exited = () => {
          children.delete(child);
          finish(error('ERR_NATIVE_CHILD_EXIT', 'Native child exited before response'));
        };
        child.once('exit', exited);
        child.once('close', exited);
        child.once('error', () => finish(error(child.pid ? 'ERR_NATIVE_CHILD' : 'ERR_NATIVE_UNAVAILABLE', 'Native child failed')));
        child.once('message', message => {
          if (!message || message.type !== 'result') return finish(error('ERR_NATIVE_CHILD', 'Invalid native child response'));
          if (message.error) {
            const kind = message.error.kind;
            const failure = kind === 'TypeError' ? new TypeError('Native child request failed') :
              kind === 'RangeError' ? new RangeError('Native child request failed') : new Error('Native child request failed');
            failure.code = typeof message.error.code === 'string' && /^ERR_[A-Z0-9_]{1,80}$/.test(message.error.code)
              ? message.error.code : 'ERR_NATIVE_CHILD';
            if (message.error.isFatal === true) failure.isFatal = true;
            if (failure.code === 'ERR_OUTBOUND_BLOCKED') { failure.isFatal = true; failure.statusCode = 403; }
            return finish(failure);
          }
          try {
            const bytes = Buffer.from(message.bytes), headers = new Headers(message.headers);
            finish(null, { ok: message.status >= 200 && message.status < 300, status: message.status,
              url: message.url, headers, bodyTruncated: !!message.bodyTruncated,
              text: async () => bytes.toString('utf8'), json: async () => JSON.parse(bytes.toString('utf8')),
              arrayBuffer: async () => Uint8Array.from(bytes).buffer });
          } catch (_) { finish(error('ERR_NATIVE_CHILD', 'Invalid native child response')); }
        });
        if (signal?.aborted) return aborted();
        const requestOptions = { timeoutMs };
        for (const key of ['method', 'body', 'redirect', 'maxBodyBytes', 'profile', 'proxyUrl', 'diagnosticOwner']) {
          if (Object.hasOwn(options, key)) requestOptions[key] = options[key];
        }
        try {
          if (options.headers !== undefined) requestOptions.headers = [...new Headers(options.headers)];
          child.send({ url, options: requestOptions }, failure => {
          if (failure) finish(error('ERR_NATIVE_CHILD', 'Native child IPC failed'));
          });
        } catch (failure) { finish(failure instanceof TypeError ? failure : error('ERR_NATIVE_CHILD', 'Native child IPC failed')); }
      });
    },
    close() {
      if (closing) return closing;
      closed = true;
      closing = Promise.all([...children.keys()].map(child => new Promise(resolve => {
        children.get(child).phase = 'terminating';
        child.once('exit', resolve);
        child.once('close', resolve);
        try { child.kill('SIGKILL'); } catch (_) { /* wait for observed exit */ }
      })));
      return closing;
    }
  };
}

module.exports = { createIsolatedNativePoolCandidate, childScriptPath };

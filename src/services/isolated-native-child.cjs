'use strict';

// Experimental opt-in child entry point.
const { createNativeGuardedFetch } = require('./NativeGuardedFetch');
let started = false;
// If the supervisor dies, do not leave a native request orphaned.
process.once('disconnect', () => process.exit(1));
// Best effort only: these timers require the child's event loop to run.
if (typeof setInterval === 'function' && typeof setTimeout === 'function') {
  const parent = process.ppid;
  const stop = () => { try { process.kill(process.pid, 'SIGKILL'); } catch (_) { process.exit(1); } };
  setInterval(() => {
    if (process.ppid !== parent) return stop();
    try { process.kill(parent, 0); } catch (failure) { if (failure?.code !== 'EPERM') stop(); }
  }, 2000).unref();
  setTimeout(stop, 40000).unref();
}
process.once('message', async message => {
  if (started) return;
  started = true;
  const pool = createNativeGuardedFetch({ maxSlots: 1 });
  try {
    const response = await pool.fetch(message.url, message.options);
    const bytes = Buffer.from(await response.arrayBuffer());
    process.send?.({ type: 'result', status: response.status, url: response.url,
      headers: [...response.headers], bytes, bodyTruncated: response.bodyTruncated });
  } catch (failure) {
    // Never send upstream URLs, credentials or native exception messages.
    const code = typeof failure.code === 'string' && /^ERR_[A-Z0-9_]{1,80}$/.test(failure.code) ? failure.code : 'ERR_NATIVE_CHILD';
    const kind = failure instanceof TypeError ? 'TypeError' : failure instanceof RangeError ? 'RangeError' : 'Error';
    process.send?.({ type: 'result', error: { code, kind, isFatal: failure.isFatal === true } });
  }
});

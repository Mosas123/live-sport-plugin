'use strict';

// Experimental opt-in child entry point.
const { createNativeGuardedFetch } = require('./NativeGuardedFetch');
let started = false;
// If the supervisor dies, do not leave a native request orphaned.
process.once('disconnect', () => process.exit(1));
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

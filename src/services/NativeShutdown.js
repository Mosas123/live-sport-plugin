'use strict';

// Bound shutdown without starting native pools or contacting external services.
async function closeNativePool(close, timeoutMs = 3000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(close).then(() => true, () => false),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

module.exports = { closeNativePool };

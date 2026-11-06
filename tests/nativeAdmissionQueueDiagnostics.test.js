'use strict';

const { createNativeGuardedFetch } = require('../src/services/NativeGuardedFetch');

const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function until(fn) {
  for (let i = 0; i < 50 && !fn(); i++) await turn();
  expect(fn()).toBe(true);
}

function fixture(maxWaiters = 2) {
  let clock = 1000, runCount = 0, busy = false;
  const first = deferred();
  const pool = createNativeGuardedFetch({
    maxSlots: 1, maxWaiters, admissionWaitMs: 1000, now: () => clock,
    slotOptions: { resolve: async () => ['93.184.216.34'] },
    createSlot: async () => ({
      get busy() { return busy; },
      close: async () => {},
      run: async (_url, fn) => {
        busy = true;
        const index = ++runCount;
        try {
          return await fn({ fetch: async () => {
            if (index === 1) await first.promise;
            return new Response('fixture');
          } });
        } finally { busy = false; }
      }
    })
  });
  const fetch = (name, owner, signal) => pool.fetch(`https://cdn.example.org/${name}`, {
    diagnosticOwner: owner, ...(signal ? { signal } : {})
  });
  return { pool, first, fetch, clock: value => { clock = value; }, started: () => runCount };
}

test('queue-full diagnostic reports owner counts and oldest wait without exposing request URLs', async () => {
  const f = fixture(2);
  const a = f.fetch('first', 'catalog');
  let b, c;
  try {
    await until(() => f.started() === 1);
    b = f.fetch('second', 'manifest');
    await turn(); await turn();
    f.clock(1250);
    c = f.fetch('third', 'catalog');
    await turn(); await turn();
    f.clock(1450);
    let failure;
    try { await f.fetch('fourth', 'wasm'); } catch (e) { failure = e; }
    expect(failure).toMatchObject({
      code: 'ERR_NATIVE_POOL_BUSY',
      capacityDiagnostic: {
        requested: { owner: 'wasm' },
        queue: {
          waiting: 2, waking: false, maxWaiters: 2, oldestWaitMs: 450,
          byOwner: { catalog: 1, manifest: 1, wasm: 0, other: 0 }
        }
      }
    });
    const serialized = JSON.stringify(failure.capacityDiagnostic);
    expect(serialized).not.toContain('cdn.example.org');
    expect(serialized).not.toContain('/first');
    expect(serialized).not.toContain('/second');
  } finally {
    f.first.resolve();
    await Promise.allSettled([a, ...(b ? [b] : []), ...(c ? [c] : [])]);
    await f.pool.close();
  }
});

test('aborted catalog waiter is removed from the diagnostic snapshot', async () => {
  const f = fixture(1), controller = new AbortController();
  const a = f.fetch('first', 'other');
  let b, c;
  try {
    await until(() => f.started() === 1);
    b = f.fetch('second', 'catalog', controller.signal);
    const rejected = expect(b).rejects.toThrow('cancelled');
    await turn(); await turn();
    controller.abort(new Error('cancelled'));
    await rejected;
    c = f.fetch('third', 'manifest');
    await turn(); await turn();
    await expect(f.fetch('fourth', 'wasm')).rejects.toMatchObject({
      code: 'ERR_NATIVE_POOL_BUSY',
      capacityDiagnostic: { queue: { waiting: 1, byOwner: { catalog: 0, manifest: 1, wasm: 0, other: 0 } } }
    });
  } finally {
    f.first.resolve();
    await Promise.allSettled([a, ...(b ? [b] : []), ...(c ? [c] : [])]);
    await f.pool.close();
  }
});

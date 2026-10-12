/**
 * Shared resolve cache integration tests.
 *
 * Boots the REAL resolver server (ESM, child process) on an ephemeral port,
 * then drives two separate StreamResolveCache instances ("worker 0" and
 * "worker 1") against it and verifies the cross-worker behaviors:
 *   - worker 1 inherits worker 0's mint without re-minting
 *   - negative results (empty mints) are shared too
 *   - claim dedupe: a worker polling during another's mint inherits the result
 *   - graceful fallback: unreachable resolver degrades to local minting
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = 7099;
const BASE = `http://127.0.0.1:${PORT}`;

let resolverChild = null;

async function waitHealthy(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('resolver did not become healthy');
}

beforeAll(async () => {
  process.env.RESOLVER_PORT = String(PORT);
  delete process.env.RESOLVE_CACHE_SHARED; // default: shared enabled
  resolverChild = spawn(process.execPath, [path.join(__dirname, '..', 'resolver', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: 'ignore',
  });
  await waitHealthy();
});

afterAll(() => {
  if (resolverChild) resolverChild.kill('SIGKILL');
});

describe('Shared resolve cache (worker 0 + worker 1 via resolver)', () => {
  const StreamResolveCache = require('../src/services/StreamResolveCache');

  test('worker 1 inherits worker 0’s mint without re-minting', async () => {
    const worker0 = new StreamResolveCache();
    const worker1 = new StreamResolveCache();
    const streams = [{ url: 'https://cdn.example/live.m3u8', name: 'Feed 1' }];

    let w0Mints = 0;
    const r0 = await worker0.getOrCreate('daddylive:match_share:s1', async () => {
      w0Mints++;
      return streams;
    });
    expect(w0Mints).toBe(1);
    expect(r0[0].url).toBe('https://cdn.example/live.m3u8');

    // Worker 1 (fresh local cache) must get the streams from the shared layer.
    let w1Mints = 0;
    const r1 = await worker1.getOrCreate('daddylive:match_share:s1', async () => {
      w1Mints++;
      return [];
    });
    expect(w1Mints).toBe(0);
    expect(r1[0].url).toBe('https://cdn.example/live.m3u8');
  });

  test('negative results (empty mints) are shared across workers', async () => {
    const worker0 = new StreamResolveCache();
    const worker1 = new StreamResolveCache();

    let mints = 0;
    const r0 = await worker0.getOrCreate('timstreams:match_neg:s2', async () => {
      mints++;
      return [];
    });
    expect(r0).toEqual([]);

    const r1 = await worker1.getOrCreate('timstreams:match_neg:s2', async () => {
      mints++;
      return [];
    });
    expect(r1).toEqual([]);
    expect(mints).toBe(1); // worker 1 did not re-mint the negative result
  });

  test('claim dedupe: worker polling during another’s mint inherits the result', async () => {
    const worker1 = new StreamResolveCache();
    const key = 'watchfooty:match_claim:s3';

    // Worker "0" claims the key and is minting slowly.
    const claim = await (await fetch(`${BASE}/api/cache/${encodeURIComponent(key)}?claim=1`)).json();
    expect(claim.ok).toBe(true);

    const mintPromise = (async () => {
      await new Promise((r) => setTimeout(r, 1500)); // slow mint in flight
      await fetch(`${BASE}/api/cache/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streams: [{ url: 'https://cdn.example/claim.m3u8' }], ttlMs: 60000, status: 'ok' }),
      });
    })();

    let minted = false;
    const r = await worker1.getOrCreate(key, async () => {
      minted = true; // should NOT happen — the shared layer serves the result
      return [];
    });
    await mintPromise;

    expect(minted).toBe(false);
    expect(r[0].url).toBe('https://cdn.example/claim.m3u8');
  });

  test('empty active set clears shared match entries but keeps evergreen channels', async () => {
    const cache = new StreamResolveCache();
    const endedKey = 'provider:ended_prune:s1';
    const channelKey = 'provider:__channel__:s2';
    for (const key of [endedKey, channelKey]) {
      await cache.getOrCreate(key, async () => [{ url: 'https://cdn.example/prune.m3u8' }]);
    }
    cache.pruneEnded([]);
    // pruneEnded sends a best-effort asynchronous POST; poll its observable
    // result instead of depending on arbitrary network timing.
    const deadline = Date.now() + 2500;
    let ended;
    do {
      ended = await (await fetch(`${BASE}/api/cache/${encodeURIComponent(endedKey)}`)).json();
      if (ended.status === 'miss') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    expect(ended.status).toBe('miss');
    const channel = await (await fetch(`${BASE}/api/cache/${encodeURIComponent(channelKey)}`)).json();
    expect(channel.status).toBe('ok');
    const otherWorker = new StreamResolveCache();
    const mint = jest.fn(async () => [{ url: 'https://cdn.example/new.m3u8' }]);
    expect(await otherWorker.getOrCreate(endedKey, mint)).toEqual([{ url: 'https://cdn.example/new.m3u8' }]);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('a pending mint pruned before completion never publishes its late result to L2', async () => {
    const worker = new StreamResolveCache();
    const key = 'provider:pending_ended:s1';
    let finish;
    let markStarted;
    const started = new Promise(resolve => { markStarted = resolve; });
    const work = new Promise(resolve => { finish = resolve; });
    const response = worker.getOrCreate(key, () => { markStarted(); return work; });
    await started;
    worker.pruneEnded([]);
    finish([{ url: 'https://cdn.example/ended.m3u8' }]);
    expect(await response).toEqual([]);
    expect(worker.entries.has(key)).toBe(false);
    const remote = await (await fetch(`${BASE}/api/cache/${encodeURIComponent(key)}`)).json();
    // An existing mint claim may remain until its normal TTL, but no stream
    // payload (positive or negative) may be published by the pruned operation.
    expect(['miss', 'minting']).toContain(remote.status);
  });

  test('unreachable resolver falls back to local minting', async () => {
    process.env.RESOLVER_PORT = '7098'; // nothing listens here
    try {
      const worker = new StreamResolveCache();
      let mints = 0;
      const r = await worker.getOrCreate('cdnlive:match_fallback:s4', async () => {
        mints++;
        return [{ url: 'https://cdn.example/fallback.m3u8' }];
      });
      expect(mints).toBe(1);
      expect(r[0].url).toBe('https://cdn.example/fallback.m3u8');
    } finally {
      process.env.RESOLVER_PORT = String(PORT);
    }
  });
});

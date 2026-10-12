const { execFileSync } = require('child_process');
const path = require('path');

// The resolver is ESM. Execute its real cache module in a fresh Node process
// with a controlled clock, without enabling Jest's experimental ESM mode.
function run(body) {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import { cacheClaim, cacheGet, cacheSet, cachePrune, cacheStats } from './resolver/src/cache.js';
    let now = 100000;
    Date.now = () => now;
    ${body}
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 5000 });
  return JSON.parse(output);
}

describe('Shared resolver claim cleanup', () => {
  test('expired claims for keys that are never reused are reclaimed', () => {
    const result = run(`
      for (let i = 0; i < 2000; i++) cacheClaim('provider:old-' + i + ':source');
      now += 31000;
      console.log(JSON.stringify(cacheStats()));
    `);
    expect(result.claims).toBe(0);
  });

  test('new claim traffic reclaims expired reservations without replacing live ones', () => {
    const result = run(`
      cacheClaim('provider:old:source');
      now += 31000;
      cacheClaim('provider:new:source');
      console.log(JSON.stringify({ stats: cacheStats(), duplicate: cacheClaim('provider:new:source') }));
    `);
    expect(result.stats.claims).toBe(1);
    expect(result.duplicate.ok).toBe(false);
  });

  test('live cached streams remain available after expired claim cleanup', () => {
    const result = run(`
      cacheClaim('provider:old:source');
      cacheSet('provider:live:source', [{ url: 'live' }], 60000);
      now += 31000;
      const live = cacheGet('provider:live:source');
      console.log(JSON.stringify({ live, stats: cacheStats() }));
    `);
    expect(result.live.status).toBe('ok');
    expect(result.stats.claims).toBe(0);
  });

  test('cleanup preserves unexpired claims and their cross-worker exclusion', () => {
    const result = run(`
      cacheClaim('provider:old:source');
      now += 20000;
      cacheClaim('provider:active:source');
      now += 11000;
      console.log(JSON.stringify({ stats: cacheStats(), active: cacheGet('provider:active:source'),
        duplicate: cacheClaim('provider:active:source') }));
    `);
    expect(result.stats.claims).toBe(1);
    expect(result.active.status).toBe('minting');
    expect(result.duplicate.ok).toBe(false);
  });

  test('claims expire at their exact deadline and can be acquired again', () => {
    const result = run(`
      cacheClaim('provider:boundary:source', 5000);
      now += 5000;
      const before = cacheGet('provider:boundary:source');
      const stats = cacheStats();
      const retry = cacheClaim('provider:boundary:source', 5000);
      console.log(JSON.stringify({ before, stats, retry }));
    `);
    expect(result.before.status).toBe('miss');
    expect(result.stats.claims).toBe(0);
    expect(result.retry.ok).toBe(true);
  });

  test('a non-finite TTL cannot create an immortal reservation', () => {
    const result = run(`
      cacheClaim('provider:invalid:source', Infinity);
      now += 31000;
      console.log(JSON.stringify({ entry: cacheGet('provider:invalid:source'), stats: cacheStats() }));
    `);
    expect(result.entry.status).toBe('miss');
    expect(result.stats.claims).toBe(0);
  });
});

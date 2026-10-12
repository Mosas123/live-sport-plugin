const CacheService = require('../src/services/CacheService');
const StreamResolveCache = require('../src/services/StreamResolveCache');

function stream() {
  return { url: 'https://cdn.example/live.m3u8', behaviorHints: {
    bingeGroup: 'original', proxyHeaders: {
      request: { Referer: 'https://provider.example/' },
      response: { 'Access-Control-Allow-Origin': '*' },
    },
  } };
}

function mutate(s) {
  s.behaviorHints.bingeGroup = 'other-request';
  s.behaviorHints.proxyHeaders.request.Referer = 'https://other.example/';
  s.behaviorHints.proxyHeaders.response['Access-Control-Allow-Origin'] = 'other';
}

describe('Nested cache isolation', () => {
  const shared = process.env.RESOLVE_CACHE_SHARED;
  beforeEach(() => { process.env.RESOLVE_CACHE_SHARED = 'false'; });
  afterEach(() => {
    if (shared === undefined) delete process.env.RESOLVE_CACHE_SHARED;
    else process.env.RESOLVE_CACHE_SHARED = shared;
  });

  test('resolved streams isolate provider input, concurrent results, and cache-hit results', async () => {
    const cache = new StreamResolveCache();
    const input = stream();
    const mint = jest.fn(async () => [input]);
    const [first, second] = await Promise.all([
      cache.getOrCreate('provider:match:source', mint),
      cache.getOrCreate('provider:match:source', mint),
    ]);
    mutate(first[0]);
    expect(second[0]).toEqual(stream());
    expect(input).toEqual(stream());
    mutate(input);
    const hit = await cache.getOrCreate('provider:match:source', mint);
    expect(hit[0]).toEqual(stream());
    mutate(hit[0]);
    expect(cache.get('provider:match:source')[0]).toEqual(stream());
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('adopted shared streams have the same isolation as locally resolved streams', () => {
    const cache = new StreamResolveCache();
    const input = stream();
    cache._adoptRemote('provider:match:source', {
      status: 'ok', streams: [input], expiresAt: Date.now() + 60000,
    });
    mutate(input);
    expect(cache.get('provider:match:source')[0]).toEqual(stream());
    mutate(cache.get('provider:match:source')[0]);
    expect(cache.get('provider:match:source')[0]).toEqual(stream());
  });

  test('match sources isolate nested headers and aliases on write and read', () => {
    const cache = new CacheService();
    const input = { id: 'nested-isolation', aliasIds: ['original-alias'], sources: [stream()] };
    cache.setMatches([input]);
    mutate(input.sources[0]);
    input.aliasIds.push('provider-mutation');
    const first = cache.findMatch('nested-isolation');
    expect(first.sources[0]).toEqual(stream());
    expect(first.aliasIds).toEqual(['original-alias']);
    mutate(first.sources[0]);
    first.aliasIds.push('request-mutation');
    const second = cache.findMatch('nested-isolation');
    expect(second.sources[0]).toEqual(stream());
    expect(second.aliasIds).toEqual(['original-alias']);
    mutate(cache.getMatches()[0].sources[0]);
    expect(cache.findMatch('original-alias').sources[0]).toEqual(stream());
  });
});

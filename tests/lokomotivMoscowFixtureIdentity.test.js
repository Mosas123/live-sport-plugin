'use strict';

const MatchAggregator = require('../src/services/MatchAggregator');

const fixture = (id, title, date, source = id, extra = {}) => ({
  id, title, date: String(date), category: 'football', status: 'live',
  sources: [{ source, id: `${source}-feed` }], ...extra
});

describe('Lokomotiv Moskva / Moscow fixture identity', () => {
  const aggregator = new MatchAggregator({});
  const kickoff = Date.parse('2026-11-06T16:00:00Z');

  test.each([
    ['Lokomotiv Moscow vs Rubin Kazan', kickoff],
    ['Rubin Kazan vs Lokomotiv Moscow', kickoff],
    ['Lokomotiv vs Rubin Kazan', kickoff],
    ['Lokomotiv Moscow vs Rubin Kazan', kickoff + 75 * 60 * 1000]
  ])('matches known spelling and existing short-form variants in either order: %s', (title, date) => {
    const a = fixture('a', 'Lokomotiv Moskva vs Rubin Kazan', kickoff);
    const b = fixture('b', title, date);
    expect(aggregator.isSameEvent(a, b)).toBe(true);
    expect(aggregator.isSameEvent(b, a)).toBe(true);
  });

  test.each([
    ['Lokomotiv Plovdiv vs Rubin Kazan', kickoff, {}],
    ['Lokomotiv Tbilisi vs Rubin Kazan', kickoff, {}],
    ['Spartak Moscow vs Rubin Kazan', kickoff, {}],
    ['Dynamo Moscow vs Rubin Kazan', kickoff, {}],
    ['Lokomotiv Moscow vs Spartak Moscow', kickoff, {}],
    ['Lokomotiv Moscow Women vs Rubin Kazan Women', kickoff, {}],
    ['Lokomotiv Moscow U21 vs Rubin Kazan U21', kickoff, {}],
    ['Lokomotiv Moscow vs Rubin Kazan', kickoff, { category: 'basketball' }],
    ['Lokomotiv Moscow vs Rubin Kazan', kickoff + 25 * 60 * 60 * 1000, {}]
  ])('does not merge a different or ambiguous event: %s', (title, date, extra) => {
    const a = fixture('a', 'Lokomotiv Moskva vs Rubin Kazan', kickoff);
    const b = fixture('b', title, date, 'b', extra);
    expect(aggregator.isSameEvent(a, b)).toBe(false);
    expect(aggregator.isSameEvent(b, a)).toBe(false);
  });

  test.each([false, true])('sync produces one card with both sources (reverse=%s)', async reverse => {
    const now = Date.now();
    const first = fixture('first', 'Lokomotiv Moskva vs Rubin Kazan', now, 'source-a');
    const second = fixture('second', 'Lokomotiv Moscow vs Rubin Kazan', now, 'source-b');
    let saved;
    const rows = reverse ? [second, first] : [first, second];
    const agg = new MatchAggregator({
      cacheService: { getMatchesReadOnly: () => [], setMatches: result => { saved = result; } },
      yamlProviders: rows.map((row, i) => ({ sourceName: `fixture-${i}`, getMatches: async () => [row] }))
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try { await agg.syncMatches(); } finally { log.mockRestore(); }
    expect(saved).toHaveLength(1);
    expect(saved[0].sources.map(s => s.source).sort()).toEqual(['source-a', 'source-b']);
    expect(saved[0].aliasIds).toEqual(expect.arrayContaining([reverse ? 'first' : 'second']));
  });
});

'use strict';

const MatchAggregator = require('../src/services/MatchAggregator');

const fixture = (id, title, date, source = id, extra = {}) => ({
  id, title, date: String(date), category: 'football', status: 'live',
  sources: [{ source, id: `${source}-feed` }], ...extra
});

describe('Al-Hazem / Al Hazm fixture identity', () => {
  const aggregator = new MatchAggregator({});
  const kickoff = Date.parse('2026-11-06T16:00:00Z');

  test.each([0, 75 * 60 * 1000])('both spellings match in either order with a %d ms clock difference', difference => {
    const first = fixture('first', 'Al-Hazem vs Al-Nassr', kickoff);
    const second = fixture('second', 'Al Hazm vs Al Nassr', kickoff + difference);
    expect(aggregator.isSameEvent(first, second)).toBe(true);
    expect(aggregator.isSameEvent(second, first)).toBe(true);
  });

  test.each([
    ['Al Hazam vs Al Nassr', kickoff],
    ['Hazem vs Al Nassr', kickoff],
    ['Al Hazm vs Al Hilal', kickoff],
    ['Al Hazm Women vs Al Nassr Women', kickoff],
    ['Al Hazm U21 vs Al Nassr U21', kickoff],
    ['Al Hazm vs Al Nassr', kickoff + 25 * 60 * 60 * 1000]
  ])('does not merge a different or ambiguous fixture: %s', (title, date) => {
    const first = fixture('first', 'Al-Hazem vs Al-Nassr', kickoff);
    const second = fixture('second', title, date);
    expect(aggregator.isSameEvent(first, second)).toBe(false);
    expect(aggregator.isSameEvent(second, first)).toBe(false);
  });

  test.each([false, true])('full aggregation keeps one card and both sources regardless of order (reverse=%s)', async reverse => {
    const now = Date.now();
    const first = fixture('first', 'Al-Hazem vs Al-Nassr', now - 75 * 60 * 1000, 'source-a');
    const second = fixture('second', 'Al Hazm vs Al Nassr', now, 'source-b');
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

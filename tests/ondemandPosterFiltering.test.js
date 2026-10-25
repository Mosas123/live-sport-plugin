'use strict';

const { mapMatchToMetaPreview } = require('../src/catalog');
const MatchAggregator = require('../src/services/MatchAggregator');
const MatchEntity = require('../src/domain/MatchEntity');

describe('ondemand.st Poster Filtering and Fallback', () => {
  test('catalog presentation filters out ondemand.st and falls back to img/match with team badges', () => {
    const testMatch = {
      id: 'test_espanyol_atletico',
      title: 'Espanyol vs Atlético Madrid',
      category: 'football',
      date: String(Date.now()),
      status: 'live',
      league: 'Spain - La Liga',
      poster: 'https://ondemand.st/img/cards/esp.1/401882843.jpg?v=1',
      thumbnail_url: 'https://ondemand.st/img/cards/esp.1/401882843.jpg?v=1',
      team1: { name: 'Espanyol', logo: 'https://r2.thesportsdb.com/images/media/team/badge/867nzz1681703222.png' },
      team2: { name: 'Atlético Madrid', logo: 'https://r2.thesportsdb.com/images/media/team/badge/0ulh3q1719984315.png' }
    };

    const meta = mapMatchToMetaPreview(testMatch, {}, 'tv');

    expect(meta.poster).not.toContain('ondemand.st');
    expect(meta.poster).toContain('/img/match?');
    expect(meta.poster).toContain('b1=');
    expect(meta.poster).toContain('b2=');
    expect(meta.poster).toContain('Espanyol');
    expect(meta.poster).toContain('Atl%C3%A9tico+Madrid');
  });

  test('catalog presentation filters ondemand.st for Everton vs Chelsea', () => {
    const testMatch = {
      id: 'test_everton_chelsea',
      title: 'Everton vs Chelsea',
      category: 'football',
      date: String(Date.now()),
      status: 'live',
      league: 'England - Premier League',
      poster: 'https://ondemand.st/img/cards/eng.1/401878771.jpg?v=4',
      thumbnail_url: 'https://ondemand.st/img/cards/eng.1/401878771.jpg?v=4',
      team1: { name: 'Everton', logo: 'https://r2.thesportsdb.com/images/media/team/badge/eqayrf1523184794.png' },
      team2: { name: 'Chelsea', logo: 'https://r2.thesportsdb.com/images/media/team/badge/pbf4ul1782638263.png' }
    };

    const meta = mapMatchToMetaPreview(testMatch, {}, 'tv');

    expect(meta.poster).not.toContain('ondemand.st');
    expect(meta.poster).toContain('/img/match?');
    expect(meta.poster).toContain('b1=');
    expect(meta.poster).toContain('b2=');
    expect(meta.poster).toContain('Everton');
    expect(meta.poster).toContain('Chelsea');
  });

  test('MatchAggregator does not adopt ondemand.st into merged matches', async () => {
    const now = Date.now();
    const existing = new MatchEntity({
      id: 'match_1',
      title: 'Espanyol vs Atlético Madrid',
      category: 'football',
      date: String(now),
      status: 'live',
      poster: '',
      sources: [{ source: 'sktech', id: '1' }]
    });

    const incoming = new MatchEntity({
      id: 'match_2',
      title: 'Espanyol vs Atlético Madrid',
      category: 'football',
      date: String(now),
      status: 'live',
      poster: 'https://ondemand.st/img/cards/esp.1/401882843.jpg?v=1',
      sources: [{ source: 'streamedpk', id: '2' }]
    });

    const mockCacheService = {
      getMatches: () => [],
      setMatches: () => {}
    };

    const aggregator = new MatchAggregator({ cacheService: mockCacheService });
    aggregator.providers = [
      { name: 'sktech', getMatches: async () => [existing] },
      { name: 'streamedpk', getMatches: async () => [incoming] }
    ];

    const merged = await aggregator.syncMatches();

    expect(merged.length).toBe(1);
    expect(merged[0].poster || '').not.toContain('ondemand.st');
  });
});

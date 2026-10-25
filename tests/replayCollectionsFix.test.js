'use strict';

const { manifest } = require('../src/manifest');
const { isReplayMatch, handleReplayCatalog } = require('../src/catalog');
const MatchEntity = require('../src/domain/MatchEntity');
const MatchAggregator = require('../src/services/MatchAggregator');
const container = require('../src/container');

describe('Replay Collections & Provider Isolation Suite', () => {
  const sampleReplays = [
    {
      id: 'rz_match_fb_1',
      title: 'Arsenal vs Chelsea',
      category: 'football',
      league: 'Premier League',
      date: '2026-10-15T19:00:00Z',
      status: 'finished',
      sources: [{ source: 'replayzone', id: 'https://ok.ru/video/12345' }]
    },
    {
      id: 'fr_singapore_f1',
      title: 'F1 Singapore GP Full Race Replay',
      category: 'motorsport',
      league: 'Formula 1',
      date: '1791676800000',
      status: 'finished',
      sources: [{ source: 'fullraces', id: 'https://fullraces.com/f1-race' }]
    },
    {
      id: 'nfl_chiefs_bills',
      title: 'Kansas City Chiefs vs Buffalo Bills Full Game',
      category: 'american_football',
      league: 'NFL',
      date: '2026-10-14T20:00:00Z',
      status: 'finished',
      sources: [{ source: 'nflvideo', id: 'https://nflvideo.com/game1' }]
    },
    {
      id: 'bb_lakers_warriors',
      title: 'Los Angeles Lakers vs Golden State Warriors Full Game',
      category: 'basketball',
      league: 'NBA',
      date: '2026-10-14T19:30:00Z',
      status: 'finished',
      sources: [{ source: 'basketballvideo', id: 'https://basketballvideo.com/game1' }]
    }
  ];

  beforeAll(() => {
    container.resolve('matchAggregator').syncMatches = async () => [];
    container.resolve('cronService').syncing = true;
    container.resolve('cacheService').setMatches(sampleReplays);
  });

  it('keeps manifest.json strictly under Stremio 8KB limit and registers parent replay catalogs', () => {
    const rawJson = JSON.stringify(manifest);
    expect(rawJson.length).toBeLessThanOrEqual(8192);

    const catalogIds = manifest.catalogs.map(c => c.id);

    // Verify all parent replay catalogs exist
    expect(catalogIds).toContain('nuvio_sports_replays');
    expect(catalogIds).toContain('nuvio_sports_replays_football');
    expect(catalogIds).toContain('nuvio_sports_replays_motorsport');
    expect(catalogIds).toContain('nuvio_sports_replays_baseball');
    expect(catalogIds).toContain('nuvio_sports_replays_rugby');
    expect(catalogIds).toContain('nuvio_sports_replays_basketball');
    expect(catalogIds).toContain('nuvio_sports_replays_tennis');
    expect(catalogIds).toContain('nuvio_sports_replays_hockey');
    expect(catalogIds).toContain('nuvio_sports_replays_american_football');
  });

  it('strictly rejects non-replay sources from being categorized as replay', () => {
    const liveSktechMatch = new MatchEntity({
      id: 'sktech_123',
      title: 'Real Madrid vs Barcelona',
      category: 'football',
      date: '2026-10-15',
      status: 'finished',
      sources: [{ source: 'sktech', id: 'http://test.com/stream.m3u8' }]
    });

    expect(isReplayMatch(liveSktechMatch)).toBe(false);

    const emptySourceMatch = new MatchEntity({
      id: 'empty_123',
      title: 'Arsenal vs Chelsea',
      category: 'football',
      date: '2026-10-15',
      status: 'finished',
      sources: []
    });

    expect(isReplayMatch(emptySourceMatch)).toBe(false);

    const validReplayMatch = new MatchEntity({
      id: 'fr_singapore-gp',
      title: 'F1 Singapore GP Full Race Replay',
      category: 'motorsport',
      date: '1791676800000',
      status: 'finished',
      sources: [{ source: 'fullraces', id: 'https://fullraces.com/f1' }]
    });

    expect(isReplayMatch(validReplayMatch)).toBe(true);
  });

  it('prevents replay matches from merging with live fixtures in MatchAggregator', () => {
    const ma = new MatchAggregator({});
    const replayEvent = {
      id: 'livetv_argentina_bolivia',
      title: 'Argentina vs Bolivia',
      category: 'football',
      status: 'finished',
      date: '2026-10-01',
      sources: [{ source: 'livetv', id: '123' }]
    };
    const liveEvent = {
      id: 'sktech_live_argentina_bolivia',
      title: 'Argentina vs Bolivia',
      category: 'football',
      status: 'live',
      date: '2026-10-15',
      sources: [{ source: 'sktech', id: '456' }]
    };

    const p1 = ma._precompute(replayEvent);
    const p2 = ma._precompute(liveEvent);

    expect(ma._sameEventPre(p1, p2)).toBe(false);
  });

  it('normalizes legacy hyphenated american-football replay catalog ID', async () => {
    const res = await handleReplayCatalog('nuvio_sports_replays_american-football_recent', {}, {});
    expect(res).toBeDefined();
    expect(Array.isArray(res.metas)).toBe(true);
  });
});

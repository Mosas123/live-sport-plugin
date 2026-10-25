'use strict';

const { mapMatchToMetaPreview } = require('../src/catalog');

describe('F1 Replay Provider Thumbnail Suite', () => {
  test('F1 replay match uses provider thumbnail instead of channel logo or generic card', () => {
    const mockF1Replay = {
      id: 'rz_3rd-practice---f1-2026---azerbaijan-grand-prix---full-race-replay---september-25--2026---formula-1-323032362d30392d3235',
      title: '3rd Practice - F1 2026 - Azerbaijan Grand Prix - Full Race Replay - September 25, 2026 - Formula 1',
      category: 'motorsport',
      league: 'Formula 1',
      date: '2026-09-25',
      status: 'finished',
      thumbnail_url: 'https://fullraces.com/_pu/15/40683678.png',
      sources: [
        {
          source: 'replayzone',
          id: 'https://ok.ru/videoembed/16785926457912',
          name: 'Server 1 (OK)',
          type: 'iframe'
        }
      ]
    };

    const meta = mapMatchToMetaPreview(mockF1Replay);

    expect(meta).toBeDefined();
    expect(meta.posterShape).toBe('landscape');
    // Ensure the poster URL targets the provider thumbnail via the self-hosted image proxy
    expect(meta.poster).toContain('url=https%3A%2F%2Ffullraces.com%2F_pu%2F15%2F40683678.png');
    // Must NOT be overwritten by Sky Sports F1 channel logo
    expect(meta.poster).not.toContain('sky-sports-f1-uk.png');
    // Must NOT be embedded as a crest card
    expect(meta.poster).not.toContain('embed=1');
  });

  test('MotoGP and general motorsport replays also preserve provider thumbnail', () => {
    const mockMotoGpReplay = {
      id: 'rz_motogp---grand-prix-of-austria-2026---full-race-replay-323032362d30392d3138',
      title: 'MotoGP - Grand Prix of Austria 2026 - Full Race Replay',
      category: 'motorsport',
      league: 'MotoGP',
      date: '2026-09-18',
      status: 'finished',
      thumbnail_url: 'https://fullraces.com/_pu/15/81463436.png',
      sources: [
        {
          source: 'replayzone',
          id: 'https://ok.ru/videoembed/1234567890',
          name: 'Server 1 (OK)',
          type: 'iframe'
        }
      ]
    };

    const meta = mapMatchToMetaPreview(mockMotoGpReplay);

    expect(meta).toBeDefined();
    expect(meta.poster).toContain('url=https%3A%2F%2Ffullraces.com%2F_pu%2F15%2F81463436.png');
    expect(meta.poster).not.toContain('sky-sport-motogp-it.png');
  });
});

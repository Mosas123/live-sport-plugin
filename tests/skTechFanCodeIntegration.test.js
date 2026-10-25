'use strict';

const matchResolver = require('../src/resolver/sktech/SkTechMatchResolver');
const SkTechProvider = require('../src/providers/SkTechProvider');
const MatchAggregator = require('../src/services/MatchAggregator');
const MatchEntity = require('../src/domain/MatchEntity');

describe('SK Tech Dynamic M3U & FanCode Integration', () => {
  let provider;

  beforeEach(() => {
    provider = new SkTechProvider();
  });

  describe('cleanEventTitle', () => {
    it('strips language prefixes, emojis, and brackets', () => {
      expect(matchResolver.cleanEventTitle('ENG | Buriram United Vs Beijing Guoan', 'Buriram United Vs Beijing Guoan'))
        .toBe('Buriram United vs Beijing Guoan');

      expect(matchResolver.cleanEventTitle('🏏NAM vs UGA [LIVE] | 240p | ENG', 'Namibia Vs Uganda'))
        .toBe('Namibia vs Uganda');

      expect(matchResolver.cleanEventTitle('[AFC Champions League Elite] Al Ittihad vs Shabab Al Ahli 1 (STP)'))
        .toBe('Al Ittihad vs Shabab Al Ahli');

      expect(matchResolver.cleanEventTitle('ENG | Villarreal vs Napoli - 13 Oct 2026'))
        .toBe('Villarreal vs Napoli');

      expect(matchResolver.cleanEventTitle('ENG | Leipzig vs Eindhoven - MD 2 - 13 Oct 2026'))
        .toBe('Leipzig vs Eindhoven');
    });
  });

  describe('Direct Stream Resolution', () => {
    it('resolves fancode_direct source instantly with correct proxyHeaders and 1080p resolution', async () => {
      const src = {
        source: 'sktech',
        id: 'm3u_fancode_4248708_english',
        channelName: 'FanCode (English)',
        type: 'fancode_direct',
        streamUrl: 'https://dai-fancode.pages.dev/mumbai/4248708_english_hls_019a87d7c041638_1ta-di_h264/index.m3u8',
        streamHeaders: {
          'User-Agent': 'ReactNativeVideo/9.11.1 (Linux;Android 13) AndroidXMedia3/1.6.1',
          Referer: 'https://fancode.com/'
        },
        streamTitle: 'SK Tech (FanCode)'
      };

      const streams = await provider.resolveStream(src.id, 'football', 'Buriram United vs Beijing Guoan', src);

      expect(streams).toHaveLength(1);
      const stream = streams[0];
      expect(stream.name).toBe('SK Tech');
      expect(stream.title).toBe('SK Tech (FanCode)');
      expect(stream.url).toBe(src.streamUrl);
      expect(stream.resolution).toBe('1080p');
      expect(stream.behaviorHints.notWebReady).toBe(true);
      expect(stream.behaviorHints.proxyHeaders.request).toEqual({
        'User-Agent': 'ReactNativeVideo/9.11.1 (Linux;Android 13) AndroidXMedia3/1.6.1',
        Referer: 'https://fancode.com/'
      });
    });

    it('resolves stream via internal resolver cache when src is minimal', async () => {
      const srcId = 'm3u_fancode_test_123';
      matchResolver._eventStreamCache.set(srcId, {
        source: 'sktech',
        id: srcId,
        channelName: 'FanCode',
        type: 'fancode_direct',
        streamUrl: 'https://dai-fancode.pages.dev/test.m3u8',
        streamHeaders: { Referer: 'https://fancode.com/' },
        streamTitle: 'SK Tech (FanCode)'
      });
      provider.matchResolver = matchResolver;

      const streams = await provider.resolveStream(srcId, 'cricket', 'Test Match', { id: srcId });
      expect(streams).toHaveLength(1);
      expect(streams[0].url).toBe('https://dai-fancode.pages.dev/test.m3u8');
    });
  });

  describe('Match Merging with MatchAggregator', () => {
    it('seamlessly merges FanCode streams into DaddyLive and SK Tech Live fixtures under one single card', () => {
      const agg = new MatchAggregator({});

      const daddyliveMatch = new MatchEntity({
        id: 'dlv_123',
        title: 'Cong An Hanoi vs Kashima Antlers',
        category: 'football',
        date: String(Date.now()),
        sources: [{ source: 'daddylive', id: '123', channelName: 'DaddyLive' }]
      });

      const sktechLiveMatch = new MatchEntity({
        id: 'sktech_match_456',
        title: 'Cơng An Hà Nội vs Kashima Antlers',
        category: 'football',
        date: String(Date.now()),
        sources: [{ source: 'sktech', id: 'pro/789.txt', channelName: 'SK Tech Live', type: 'fixture' }]
      });

      const fancodeMatch = new MatchEntity({
        id: 'sktech_ev_fancode_4248709',
        title: 'Cong An Ha Noi vs Kashima Antlers',
        category: 'football',
        date: String(Date.now()),
        sources: [{
          source: 'sktech',
          id: 'm3u_fancode_4248709_english',
          channelName: 'FanCode (English)',
          type: 'fancode_direct',
          streamUrl: 'https://dai-fancode.pages.dev/mumbai/index.m3u8'
        }]
      });

      expect(agg.isSameEvent(daddyliveMatch, sktechLiveMatch)).toBe(true);
      expect(agg.isSameEvent(daddyliveMatch, fancodeMatch)).toBe(true);
      expect(agg.isSameEvent(sktechLiveMatch, fancodeMatch)).toBe(true);

      // Simulate aggregator source consolidation
      const existing = daddyliveMatch;
      for (const incoming of [sktechLiveMatch, fancodeMatch]) {
        for (const s of incoming.sources) {
          if (!existing.sources.find(x => x.id === s.id && x.source === s.source)) {
            existing.sources.push(s);
          }
        }
      }

      expect(existing.sources).toHaveLength(3);
      expect(existing.sources.map(s => s.channelName)).toEqual([
        'DaddyLive',
        'SK Tech Live',
        'FanCode (English)'
      ]);
    });
  });
});

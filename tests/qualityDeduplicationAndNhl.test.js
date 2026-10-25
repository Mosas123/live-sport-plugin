'use strict';

const LiveTVProvider = require('../src/providers/LiveTVProvider');
const skTechMatchResolver = require('../src/resolver/sktech/SkTechMatchResolver');
const { deduplicateResolutions } = require('../src/streams');

describe('Quality Deduplication & NHL Direct Streams Suite', () => {
  describe('NHL Direct Streams via Brightcove Edge Playback API', () => {
    let provider;

    beforeEach(() => {
      provider = new LiveTVProvider();
    });

    test('extracts direct HLS and MP4 streams from Brightcove player embeds with 0% server bandwidth', async () => {
      const mockBrightcoveData = {
        name: 'BOS at SJS | Recap',
        sources: [
          {
            type: 'application/x-mpegURL',
            src: 'https://manifest.prod.boltdns.net/manifest/v1/hls/v4/clear/6415718365001/test/master.m3u8?fastly_token=xyz'
          },
          {
            container: 'MP4',
            avg_bitrate: 4500000,
            src: 'https://fastly-signed-us-east-1-prod.brightcovecdn.com/media/v1/pmp4/static/clear/test/main.mp4?fastly_token=xyz'
          }
        ]
      };

      global.fetch = jest.fn().mockImplementation((url) => {
        if (url.includes('edge.api.brightcove.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBrightcoveData)
          });
        }
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<html></html>')
        });
      });

      const res = await provider._resolveBrightcove('6415718365001', '6406827636112');
      expect(res).toBeDefined();
      expect(res.hlsUrl).toContain('master.m3u8');
      expect(res.mp4Url).toContain('main.mp4');
    });
  });

  describe('SkTech Dynamic M3U Quality Deduplication', () => {
    test('preserves both 720p and 1080p FanCode entries while discarding sub-720p variants', () => {
      const resolver = skTechMatchResolver;
      const m3uContent = `
#EXTM3U
#EXTINF:-1 tvg-id="141449" tvg-name="FanCode" group-title="Cricket",Namibia vs Uganda (240p)
https://in-mc-flive.fancode.com/240p.m3u8
#EXTINF:-1 tvg-id="141449" tvg-name="FanCode" group-title="Cricket",Namibia vs Uganda (360p)
https://in-mc-flive.fancode.com/360p.m3u8
#EXTINF:-1 tvg-id="141449" tvg-name="FanCode" group-title="Cricket",Namibia vs Uganda (480p)
https://in-mc-flive.fancode.com/480p.m3u8
#EXTINF:-1 tvg-id="141449" tvg-name="FanCode" group-title="Cricket",Namibia vs Uganda (720p)
https://in-mc-flive.fancode.com/720p.m3u8
#EXTINF:-1 tvg-id="141449" tvg-name="FanCode" group-title="Cricket",Namibia vs Uganda (1080p)
https://in-mc-flive.fancode.com/1080p.m3u8
`;

      const matchMap = new Map();
      const matches = [];
      resolver.parseM3UContent(m3uContent, { label: 'FanCode', url: 'https://example.com/playlist.m3u' }, matchMap, matches);

      expect(matches).toHaveLength(1);
      expect(matches[0].title).toBe('Namibia vs Uganda');
      // Sources must contain both 720P and 1080P entries; 240p, 360p, 480p must be dropped
      expect(matches[0].sources).toHaveLength(2);
      expect(matches[0].sources.some(s => s.resolution === '1080P')).toBe(true);
      expect(matches[0].sources.some(s => s.resolution === '720P')).toBe(true);
      expect(matches[0].sources.some(s => s.resolution === '480P')).toBe(false);
    });
  });

  describe('streams.js Quality Deduplication', () => {
    test('preserves both 720p and 1080p for SKTech and filters out lower bitrates', () => {
      // Test the pure deduplicateResolutions function directly for SKTech streams
      const streams = [
        { name: 'SK Tech', title: 'SK Tech (240p) [FanCode]', url: 'https://example.com/240.m3u8', _source: 'sktech' },
        { name: 'SK Tech', title: 'SK Tech (360p) [FanCode]', url: 'https://example.com/360.m3u8', _source: 'sktech' },
        { name: 'SK Tech', title: 'SK Tech (480p) [FanCode]', url: 'https://example.com/480.m3u8', _source: 'sktech' },
        { name: 'SK Tech', title: 'SK Tech (720p) [FanCode]', url: 'https://example.com/720.m3u8', _source: 'sktech' },
        { name: 'SK Tech', title: 'SK Tech (1080p) [FanCode]', url: 'https://example.com/1080.m3u8', _source: 'sktech' },
        { name: 'SK Tech', title: 'SK Tech (Auto HLS) [FanCode]', url: 'https://example.com/master.m3u8', _source: 'sktech' }
      ];

      deduplicateResolutions(streams);

      // Should keep 1080p, 720p, and Auto HLS; 240p, 360p, 480p should be suppressed!
      expect(streams.some(s => s.title.includes('1080p'))).toBe(true);
      expect(streams.some(s => s.title.includes('720p'))).toBe(true);
      expect(streams.some(s => s.title.includes('Auto HLS'))).toBe(true);
      expect(streams.some(s => s.title.includes('240p'))).toBe(false);
      expect(streams.some(s => s.title.includes('360p'))).toBe(false);
      expect(streams.some(s => s.title.includes('480p'))).toBe(false);
      expect(streams).toHaveLength(3);
    });

    test('NEVER applies resolution deduplication to DaddyLive streams', () => {
      const streams = [
        { name: '⚡ Direct Stream', title: '🏀 DaddyLive | 📺 ESPN (720p)', url: 'https://example.com/720.m3u8', _source: 'daddylive' },
        { name: '⚡ Direct Stream', title: '🏀 DaddyLive | 📺 ESPN (1080p)', url: 'https://example.com/1080.m3u8', _source: 'daddylive' },
        { name: '⚡ Direct Stream', title: '🏀 DaddyLive | 📺 Spectrum SportsNet (720p)', url: 'https://example.com/spec.m3u8', _source: 'daddylive' }
      ];

      deduplicateResolutions(streams);

      // DaddyLive streams MUST be completely preserved!
      expect(streams).toHaveLength(3);
    });

    test('passes through streams with no resolution tag unchanged', () => {
      const streams = [
        { name: 'Sky Sports', title: 'Sky Sports F1 [HLS]', url: 'https://example.com/f1.m3u8' },
        { name: 'Daddy Live', title: 'Premier League Live', url: 'https://example.com/prem.m3u8' }
      ];

      deduplicateResolutions(streams);

      expect(streams).toHaveLength(2);
    });
  });
});

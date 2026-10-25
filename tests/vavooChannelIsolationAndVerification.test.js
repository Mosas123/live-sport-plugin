'use strict';

jest.mock('../src/impitClient', () => ({
  safeFetch: jest.fn(),
  isImpitAvailable: () => false,
  getImpit: () => null,
}));

const { safeFetch } = require('../src/impitClient');
const MatchAggregator = require('../src/services/MatchAggregator');
const { verifyStreams } = require('../src/streams');
const StreamEntity = require('../src/domain/StreamEntity');
const MatchEntity = require('../src/domain/MatchEntity');
const M3U8ParserService = require('../src/services/M3U8ParserService');

describe('Vavoo 24/7 Channel Isolation & Stream Verification', () => {
  let aggregator;

  beforeEach(() => {
    aggregator = new MatchAggregator();
    jest.clearAllMocks();
  });

  describe('Channel Identity & Universal Aggregation in MatchAggregator', () => {
    test('merges Cartoon Network channels across different countries into one universal card', () => {
      const franceChannel = new MatchEntity({
        id: 'vavoo_ch_france_cn',
        title: 'CARTOON NETWORK (France)',
        category: 'networks',
        date: '0',
        league: 'France',
        sources: [{ source: 'vavoo', group: 'France', type: 'channel' }]
      });

      const germanyChannel = new MatchEntity({
        id: 'vavoo_ch_germany_cn',
        title: 'CARTOON NETWORK (Germany)',
        category: 'networks',
        date: '0',
        league: 'Germany',
        sources: [{ source: 'vavoo', group: 'Germany', type: 'channel' }]
      });

      expect(aggregator.isSameEvent(franceChannel, germanyChannel)).toBe(true);
    });

    test('merges language variants into the same universal card (e.g. Cartoon Network and Cartoon Network Arabic)', () => {
      const baseChannel = new MatchEntity({
        id: 'dlv_ch_339_cartoon-network',
        title: 'Cartoon Network',
        category: 'networks',
        date: '0',
        league: 'Live TV',
        sources: [{ source: 'daddylive', id: '339', type: 'channel' }]
      });

      const arabicChannel = new MatchEntity({
        id: 'vavoo_ch_arabic_cn',
        title: 'Cartoon Network Arabic',
        category: 'networks',
        date: '0',
        league: 'Arabia',
        sources: [{ source: 'vavoo', group: 'Arabia', type: 'channel' }]
      });

      expect(aggregator.isSameEvent(baseChannel, arabicChannel)).toBe(true);
    });

    test('merges cross-provider matching 24/7 channels into one card', () => {
      const dlvFrance = new MatchEntity({
        id: 'dlv_ch_cn_fr',
        title: 'Cartoon Network',
        category: 'networks',
        date: '0',
        league: 'France',
        sources: [{ source: 'daddylive', country: 'France', type: 'channel' }]
      });

      const vavooFrance = new MatchEntity({
        id: 'vavoo_ch_cn_fr',
        title: 'Cartoon Network',
        category: 'networks',
        date: '0',
        league: 'France',
        sources: [{ source: 'vavoo', group: 'France', type: 'channel' }]
      });

      expect(aggregator.isSameEvent(dlvFrance, vavooFrance)).toBe(true);
    });

    test('strictly preserves channel numbers as separate cards (e.g. Astro Cricket 1 vs Astro Cricket 2)', () => {
      const astro1 = new MatchEntity({
        id: 'vavoo_ch_astro1',
        title: 'Astro Cricket 1',
        category: 'networks',
        date: '0',
        sources: [{ source: 'vavoo', type: 'channel' }]
      });

      const astro2 = new MatchEntity({
        id: 'vavoo_ch_astro2',
        title: 'Astro Cricket 2',
        category: 'networks',
        date: '0',
        sources: [{ source: 'vavoo', type: 'channel' }]
      });

      expect(aggregator.isSameEvent(astro1, astro2)).toBe(false);
    });

    test('prevents false merges between distinct networks (e.g. Cartoon Network vs Cartoonito)', () => {
      const cn = new MatchEntity({
        id: 'dlv_ch_cn',
        title: 'Cartoon Network',
        category: 'networks',
        date: '0',
        sources: [{ source: 'daddylive', type: 'channel' }]
      });

      const cartoonito = new MatchEntity({
        id: 'vavoo_ch_cartoonito',
        title: 'Cartoonito',
        category: 'networks',
        date: '0',
        sources: [{ source: 'vavoo', type: 'channel' }]
      });

      expect(aggregator.isSameEvent(cn, cartoonito)).toBe(false);
    });
  });

  describe('verifyStreams with Vavoo / Sunshine CDN Streams', () => {
    const parser = new M3U8ParserService();
    const makeCache = () => ({
      failures: 0,
      successes: 0,
      noteFailure() { this.failures++; },
      noteSuccess() { this.successes++; }
    });

    test('drops dead Sunshine CDN stream returning HTTP 502', async () => {
      safeFetch.mockResolvedValue({
        status: 502,
        text: async () => '502 Bad Gateway'
      });

      const deadStream = new StreamEntity({
        name: 'Vavoo',
        title: 'Vavoo (CARTOON NETWORK) [1080p]',
        url: 'http://37.49.225.28:8008/sunshine/dead-channel/hls/index.m3u8',
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: {
            request: {
              'User-Agent': 'MediaHubMX/2',
              'Referer': 'https://vavoo.to/'
            }
          }
        }
      });

      const cache = makeCache();
      const verified = await verifyStreams([deadStream], 'cacheKey1', parser, cache);
      expect(verified).toHaveLength(0);
      expect(cache.failures).toBe(1);
    });

    test('retains active Sunshine CDN stream returning HTTP 200 with #EXTM3U', async () => {
      safeFetch.mockResolvedValue({
        status: 200,
        text: async () => '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080\nchunklist.m3u8\n'
      });

      const liveStream = new StreamEntity({
        name: 'Vavoo',
        title: 'Vavoo (CARTOON NETWORK) [1080p]',
        url: 'http://93.123.109.95:8008/sunshine/live-channel/hls/index.m3u8',
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: {
            request: {
              'User-Agent': 'MediaHubMX/2',
              'Referer': 'https://vavoo.to/'
            }
          }
        }
      });

      const cache = makeCache();
      const verified = await verifyStreams([liveStream], 'cacheKey2', parser, cache);
      expect(verified).toHaveLength(1);
      expect(verified[0].url).toBe(liveStream.url);
      expect(verified[0].resolution).toBe('1920x1080');
    });
  });
});

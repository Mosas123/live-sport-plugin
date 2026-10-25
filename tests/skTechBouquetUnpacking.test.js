'use strict';

const SkTechCrypto = require('../src/resolver/sktech/SkTechCrypto');
const channelResolver = require('../src/resolver/sktech/SkTechChannelResolver');
const SkTechProvider = require('../src/providers/SkTechProvider');

describe('SK Tech Nested Bouquet Unpacking & DRM Resolution', () => {
  describe('SkTechCrypto.decryptM3u()', () => {
    test('returns unencrypted text unchanged if short or not matching format', () => {
      const plain = '#EXTM3U\n#EXTINF:-1,Channel 1\nhttp://example.com/live.m3u8';
      expect(SkTechCrypto.decryptM3u(plain)).toBe(plain);
      expect(SkTechCrypto.decryptM3u('')).toBe('');
      expect(SkTechCrypto.decryptM3u(null)).toBe('');
    });

    test('decrypts AES-256-CBC dynamic worker payload cleanly into valid M3U', () => {
      // Synthetic payload with reversed Dalvik Lua/t1;->h structure
      const crypto = require('crypto');
      const plainM3u = '#EXTM3U\n#EXTINF:-1 group-title="Cricket",IPL Live\nhttps://stream.example/live.m3u8\n#EXTINF:-1 group-title="Reality",Big Boss 24/7\nhttps://stream.example/bb.m3u8';
      
      const key = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const cipherBytes = Buffer.concat([cipher.update(Buffer.from(plainM3u, 'utf8')), cipher.final()]);
      const cipherB64 = cipherBytes.toString('base64');

      const v2 = cipherB64.substring(0, 10);
      const v4_iv = iv.toString('base64'); // 24 chars, ends with ==
      const v5_key = key.toString('base64'); // 44 chars
      const v7_tail = cipherB64.substring(cipherB64.length - 10);
      const v3_body = cipherB64.substring(10, cipherB64.length - 10);

      // Reconstruct synthetic ciphertext payload: v2 + v4_iv + v3_body + v5_key + v7_tail
      const syntheticPayload = v2 + v4_iv + v3_body + v5_key + v7_tail;

      const decrypted = SkTechCrypto.decryptM3u(syntheticPayload);
      expect(decrypted).toBe(plainM3u);
      expect(decrypted).toContain('group-title="Cricket"');
      expect(decrypted).toContain('group-title="Reality"');
    });
  });

  describe('SkTechChannelResolver.parseM3uBouquet()', () => {
    test('parses multi-channel M3U playlist with ClearKey DRM and group tags', () => {
      const sampleM3u = `
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=6752015acf084572a08dfe21796f8b45:ff823ddbe5625c35d3e93f0ed4520115
#EXTINF:-1 group-title="Sun NXT" tvg-id="194408" tvg-language="Tamil" tvg-logo="https://example.com/suntv.jpg",Sun TV
https://livestream1.sunnxt.com/suntv.mpd

#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=3891557f1cb14dedb7545bf52499d748:fb662f742e5f5e0c61a7c1c66d2b019a
#EXTINF:-1 group-title="Sun NXT" tvg-id="194403" tvg-language="Tamil" tvg-logo="https://example.com/suntvhd.jpg",Sun TV HD
https://livestream2.sunnxt.com/suntvhd.mpd

#EXTINF:-1 group-title="Cricket" tvg-logo="https://example.com/ipl.png",TATA IPL Live
https://livetv.example/ipl.m3u8|User-Agent=CustomUA/1.0&Referer=https://example.com/
`;

      const channels = channelResolver.parseM3uBouquet(sampleM3u, 'Fallback');
      expect(channels).toHaveLength(3);

      expect(channels[0].title).toBe('Sun TV');
      expect(channels[0].group).toBe('Sun NXT');
      expect(channels[0].url).toBe('https://livestream1.sunnxt.com/suntv.mpd');
      expect(channels[0].drmScheme).toBe('clearkey');
      expect(channels[0].drmLicense).toBe('6752015acf084572a08dfe21796f8b45:ff823ddbe5625c35d3e93f0ed4520115');

      expect(channels[1].title).toBe('Sun TV HD');
      expect(channels[1].group).toBe('Sun NXT');

      expect(channels[2].title).toBe('TATA IPL Live');
      expect(channels[2].group).toBe('Cricket');
      expect(channels[2].headers['User-Agent']).toBe('CustomUA/1.0');
      expect(channels[2].headers['Referer']).toBe('https://example.com/');
    });
  });

  describe('SkTechChannelResolver.resolveChannelStream()', () => {
    test('resolves pre-unpacked ClearKey DASH channel into StreamEntity with keyId and key', async () => {
      const channel = {
        id: 'sktech_sun_1',
        title: 'Sun TV HD',
        url: 'https://livestream.example/suntv.mpd',
        type: 'direct_m3u',
        drmScheme: 'clearkey',
        drmLicense: '6752015acf084572a08dfe21796f8b45:ff823ddbe5625c35d3e93f0ed4520115',
        group: 'Sun NXT',
        headers: { 'User-Agent': 'TestUA/1.0' }
      };

      const streams = await channelResolver.resolveChannelStream(channel);
      expect(streams).toHaveLength(1);
      expect(streams[0].url).toBe('https://livestream.example/suntv.mpd');
      expect(streams[0].clearkey).toEqual({
        keyId: 'Z1IBWs8IRXKgjf4heW-LRQ',
        key: '_4I92-ViXDXT6T8O1FIBFQ'
      });
      expect(streams[0].behaviorHints.proxyHeaders.request['User-Agent']).toBe('TestUA/1.0');
    });

    test('resolves direct stream from Big Boss with client-side headers', async () => {
      const channel = {
        id: 'sktech_bb_1',
        title: 'BBS20: 24 HRS Channel',
        url: 'https://livetv.example/bb24.m3u8',
        type: 'direct_m3u',
        group: 'Reality',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://www.hotstar.com/',
          Origin: 'https://www.hotstar.com'
        }
      };

      const streams = await channelResolver.resolveChannelStream(channel);
      expect(streams).toHaveLength(1);
      expect(streams[0].url).toBe('https://livetv.example/bb24.m3u8');
      expect(streams[0].title).toBe('SK Tech | BBS20: 24 HRS Channel (Reality)');
      expect(streams[0].behaviorHints.proxyHeaders.request.Referer).toBe('https://www.hotstar.com/');
    });
  });

  describe('SkTechProvider 24/7 Channel Ingestion & League Grouping', () => {
    test('tags MatchEntity league and sources with constituent bouquet group', async () => {
      const provider = new SkTechProvider();
      
      // Mock fetchChannels returning unpacked bouquet items
      jest.spyOn(provider.channelResolver, 'fetchChannels').mockResolvedValueOnce([
        {
          id: 'm3u_0_1',
          title: 'Sun TV HD',
          category: 'networks',
          type: 'direct_m3u',
          logo: 'https://logo.example/suntv.png',
          url: 'https://livestream.example/suntv.mpd',
          group: 'Sun NXT',
          drmScheme: 'clearkey',
          drmLicense: 'keyId:keyVal',
          headers: { 'User-Agent': 'TestUA' }
        },
        {
          id: 'm3u_0_2',
          title: 'Follow The Blues',
          category: 'networks',
          type: 'direct_m3u',
          logo: 'https://logo.example/blues.png',
          url: 'https://livestream.example/blues.m3u8',
          group: 'Cricket',
          headers: {}
        }
      ]);

      const matches = await provider.getMatches();
      const sunTv = matches.find(m => m.title === 'Sun TV' || m.title === 'Sun TV HD');
      expect(sunTv).toBeDefined();
      expect(sunTv.category).toBe('networks');
      expect(sunTv.league).toBe('Sun NXT');
      expect(sunTv.sources[0].drmScheme).toBe('clearkey');

      const cricket = matches.find(m => m.title === 'Follow The Blues');
      expect(cricket).toBeDefined();
      expect(cricket.league).toBe('Cricket');

      // Test stream resolution via SkTechProvider
      const resolved = await provider.resolveStream('https://livestream.example/suntv.mpd', 'networks', 'Sun TV HD', sunTv.sources[0]);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].url).toBe('https://livestream.example/suntv.mpd');
      expect(resolved[0].clearkey).toEqual({ keyId: 'keyId', key: 'keyVal' });
    });
  });
});

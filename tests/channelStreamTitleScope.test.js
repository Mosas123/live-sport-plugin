'use strict';

const container = require('../src/container');
const { handleStream, formatChannelStreamTitle } = require('../src/streams');

describe('Channel Card countryInfo scoping & formatting regression', () => {
  const channelMatches = [
    {
      id: 'daddylive_ch_123',
      title: 'Sky Sports Premier League',
      category: 'networks',
      isChannel: true,
      sources: [{ source: 'daddylive', id: '123', name: 'Sky Sports Premier League' }]
    },
    {
      id: 'vavoo_ch_456',
      title: 'Canal+ Sport FR',
      category: 'networks',
      date: '0',
      sources: [{ source: 'vavoo', id: '456', name: 'Canal+ Sport FR' }]
    }
  ];

  beforeAll(() => {
    container.resolve('matchAggregator').syncMatches = async () => [];
    container.resolve('cronService').syncing = true;
    container.resolve('cacheService').setMatches(channelMatches);
  });

  test('handleStream formats channel streams without ReferenceError: countryInfo is not defined', async () => {
    jest.spyOn(container.resolve('daddyLiveProvider'), 'resolveStream').mockResolvedValue([
      { name: 'Direct Stream', title: 'Stream 1', url: '/api/manifest.m3u8?url=test', behaviorHints: { notWebReady: false } }
    ]);

    const res = await handleStream('tv', 'nuvio_sport_daddylive_ch_123', {});
    expect(res).toBeDefined();
    expect(Array.isArray(res.streams)).toBe(true);
    const channelStream = res.streams.find(s => s.name === '⚡ Direct Stream');
    expect(channelStream).toBeDefined();
    expect(channelStream.title).toContain('Sky Sports');
  });

  test('formatChannelStreamTitle handles null or empty countryInfo gracefully', () => {
    const s = { title: 'Raw Feed', quality: '1080p', _source: 'vavoo' };
    const match = { title: 'TNT Sports 1 UK', category: 'networks' };
    const label = formatChannelStreamTitle(s, match, 'Vavoo', null, '1080p', '', 'Raw Feed');
    expect(label).toBeDefined();
    expect(typeof label).toBe('string');
  });
});

'use strict';

process.env.NODE_ENV = 'test';

const PpvStProvider = require('../src/providers/PpvStProvider');

describe('PpvStProvider 24/7 Channels and Artwork Policy', () => {
  let provider;

  beforeEach(() => {
    provider = new PpvStProvider();
  });

  test('routes 24/7 channels under sport categories into networks and suppresses thumbnails', async () => {
    const mockApiResponse = {
      success: true,
      streams: [
        {
          category: 'Cricket',
          streams: [
            {
              id: 'cricket-willow',
              name: 'Willow',
              tag: '24/7 channel',
              always_live: 1,
              starts_at: -3600,
              poster: 'https://static.ppvservices.st/assets/thumb/willow.jpg',
              iframe: 'https://taifood-blog.asia/embed/willow'
            },
            {
              id: 'cricket-fox',
              name: 'Fox Cricket',
              tag: '24/7 channel',
              always_live: 1,
              starts_at: 0,
              poster: 'https://static.ppvservices.st/assets/thumb/foxcricket.jpg',
              iframe: 'https://taifood-blog.asia/embed/foxcricket'
            },
            {
              id: 'cricket-match-1',
              name: 'India vs Australia',
              tag: 'T20',
              always_live: 0,
              starts_at: Math.floor((Date.now() + 3600000) / 1000),
              poster: 'https://static.ppvservices.st/assets/thumb/ind-aus.jpg',
              iframe: 'https://taifood-blog.asia/embed/ind-aus'
            }
          ]
        },
        {
          category: 'Ice Hockey',
          streams: [
            {
              id: 'nhl-network',
              name: 'NHL Network',
              tag: '24/7 channel',
              always_live: 1,
              starts_at: 0,
              poster: 'https://static.ppvservices.st/assets/thumb/nhlnet.jpg',
              iframe: 'https://taifood-blog.asia/embed/nhlnet'
            }
          ]
        },
        {
          category: '24/7 Streams',
          streams: [
            {
              id: 'south-park',
              name: '24/7 South Park',
              tag: '24/7 channel',
              always_live: 1,
              starts_at: 0,
              poster: 'https://thumbs.poocloud.in/southpark/preview.jpg',
              iframe: 'https://taifood-blog.asia/embed/southpark'
            }
          ]
        }
      ]
    };

    jest.spyOn(provider, 'proxyFetch').mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse
    });

    const matches = await provider.getMatches();
    expect(matches).toHaveLength(5);

    // 1. Willow Cricket
    const willow = matches.find(m => m.title === 'Willow');
    expect(willow).toBeDefined();
    expect(willow.category).toBe('networks');
    expect(willow.date).toBe('');
    expect(willow.status).toBe('');
    expect(willow.popular).toBe('1');
    expect(willow.league).toBe('Live TV');
    expect(willow.poster).toBe('');
    expect(willow.thumbnail_url).toBe('');
    expect(willow.logo).toBe('');
    expect(willow.team1).toBeNull();
    expect(willow.team2).toBeNull();

    // 2. Fox Cricket
    const foxCricket = matches.find(m => m.title === 'Fox Cricket');
    expect(foxCricket).toBeDefined();
    expect(foxCricket.category).toBe('networks');
    expect(foxCricket.date).toBe('');
    expect(foxCricket.status).toBe('');
    expect(foxCricket.popular).toBe('1');
    expect(foxCricket.poster).toBe('');
    expect(foxCricket.thumbnail_url).toBe('');

    // 3. NHL Network
    const nhl = matches.find(m => m.title === 'NHL Network');
    expect(nhl).toBeDefined();
    expect(nhl.category).toBe('networks');
    expect(nhl.poster).toBe('');
    expect(nhl.thumbnail_url).toBe('');

    // 4. General 24/7 South Park
    const southPark = matches.find(m => m.title === '24/7 South Park');
    expect(southPark).toBeDefined();
    expect(southPark.category).toBe('networks');
    expect(southPark.poster).toBe('');
    expect(southPark.thumbnail_url).toBe('');

    // 5. India vs Australia (Real fixture)
    const matchFixture = matches.find(m => m.title === 'India vs Australia');
    expect(matchFixture).toBeDefined();
    expect(matchFixture.category).toBe('cricket');
    expect(matchFixture.status).toBe('upcoming');
    expect(matchFixture.league).toBe('Cricket');
    expect(matchFixture.team1).toEqual({ name: 'India' });
    expect(matchFixture.team2).toEqual({ name: 'Australia' });
    // PPV.st static thumbnails are suppressed on real fixtures as well
    expect(matchFixture.poster).toBe('');
    expect(matchFixture.thumbnail_url).toBe('');
    expect(matchFixture.logo).toBe('');
  });
});

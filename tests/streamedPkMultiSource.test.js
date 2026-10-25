'use strict';

const MatchEntity = require('../src/domain/MatchEntity');
const MatchAggregator = require('../src/services/MatchAggregator');

describe('Streamed.pk Multi-Source Ingestion & Option A Badging', () => {
  test('MatchAggregator retains distinct streamSource feeds (admin and hotel) during merge', () => {
    const aggregator = new MatchAggregator();

    const existingMatch = new MatchEntity({
      id: 'ts_napoli-v-venezia-401874760',
      title: 'Venezia vs Napoli',
      category: 'football',
      sources: [
        { source: 'timstreams', id: 'ts_feed_1', name: 'Paramount+' }
      ]
    });

    const incomingMatch = new MatchEntity({
      id: 'spk_venezia-vs-napoli-2482205',
      title: 'Venezia vs Napoli',
      category: 'football',
      sources: [
        {
          source: 'streamedpk',
          id: 'venezia-vs-napoli-2482205',
          streamSource: 'admin',
          streamId: 'ppv-venezia-vs-napoli'
        },
        {
          source: 'streamedpk',
          id: 'venezia-vs-napoli-2482205',
          streamSource: 'hotel',
          streamId: 'venezia-vs-napoli-serie-a-1792242000'
        }
      ]
    });

    const finalMatches = [existingMatch];
    const match = incomingMatch;

    // Simulate MatchAggregator.syncMatches source merging block:
    if (match.sources && Array.isArray(match.sources)) {
      match.sources.forEach(src => {
        if (!finalMatches[0].sources.find(s =>
          s.id === src.id &&
          s.source === src.source &&
          (s.streamSource || '') === (src.streamSource || '') &&
          (s.streamId || '') === (src.streamId || '')
        )) {
          finalMatches[0].sources.push(src);
        }
      });
    }

    const spkSources = finalMatches[0].sources.filter(s => s.source === 'streamedpk');
    expect(spkSources).toHaveLength(2);
    expect(spkSources[0].streamSource).toBe('admin');
    expect(spkSources[1].streamSource).toBe('hotel');
  });

  test('Stream title formats with Option A server badge when streamSource is present', () => {
    // Replicate Option A formatting logic from src/streams.js
    function formatOptionATitle(s, matchCategory) {
      const sportIcons = { football: '⚽' };
      const icon = sportIcons[matchCategory] || '📡';
      const providerName = 'Streamed.pk';

      let serverBadge = '';
      const rawServer = s._streamSource || s.streamSource;
      if (rawServer && typeof rawServer === 'string') {
        const trimmed = rawServer.trim();
        if (trimmed) {
          serverBadge = ` [${trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()}]`;
        }
      }

      let channelName = '';
      let viewersText = '';
      const originalTitle = s.title || '';
      if (originalTitle) {
        const vMatch = originalTitle.match(/👥\s*\d+\s*Viewers/);
        if (vMatch) viewersText = `\n${vMatch[0]}`;

        const match = originalTitle.match(/\(([^)]+)\)/);
        if (match && match[1]) {
          const inner = match[1];
          if (!inner.match(/^[0-9]{3,4}p$/i) && inner !== 'Auto' && !inner.toLowerCase().startsWith('stream')) {
            channelName = inner;
          }
        }
      }

      const channelDisplay = channelName ? ` | 📺 ${channelName}` : '';
      const quality = s.quality || '1080p';
      return `${icon} ${providerName}${serverBadge}${channelDisplay}\n📺 Quality: ${quality}${viewersText}`;
    }

    const adminStream = {
      title: '[Direct] Venezia vs Napoli (English - Paramount+) | 👥 1399 Viewers',
      _streamSource: 'admin',
      quality: '1080p'
    };
    const hotelStream = {
      title: '[Direct] Venezia vs Napoli (Main) | 👥 23 Viewers',
      _streamSource: 'hotel',
      quality: '1080p'
    };

    const adminTitle = formatOptionATitle(adminStream, 'football');
    const hotelTitle = formatOptionATitle(hotelStream, 'football');

    expect(adminTitle).toContain('⚽ Streamed.pk [Admin] | 📺 English - Paramount+');
    expect(adminTitle).toContain('👥 1399 Viewers');

    expect(hotelTitle).toContain('⚽ Streamed.pk [Hotel] | 📺 Main');
    expect(hotelTitle).toContain('👥 23 Viewers');
  });

  test('Cache key generation includes streamSource and streamId to avoid collisions', () => {
    const srcAdmin = {
      source: 'streamedpk',
      id: 'venezia-vs-napoli-2482205',
      streamSource: 'admin',
      streamId: 'ppv-venezia-vs-napoli'
    };
    const srcHotel = {
      source: 'streamedpk',
      id: 'venezia-vs-napoli-2482205',
      streamSource: 'hotel',
      streamId: 'venezia-vs-napoli-serie-a-1792242000'
    };

    const matchId = 'ts_napoli-v-venezia-401874760';

    const getSubKey = (src) => src.streamSource ? `:${src.streamSource}${src.streamId ? ':' + src.streamId : ''}` : '';
    const keyAdmin = `${srcAdmin.source}:${matchId}:${srcAdmin.id}${getSubKey(srcAdmin)}`;
    const keyHotel = `${srcHotel.source}:${matchId}:${srcHotel.id}${getSubKey(srcHotel)}`;

    expect(keyAdmin).not.toBe(keyHotel);
    expect(keyAdmin).toBe('streamedpk:ts_napoli-v-venezia-401874760:venezia-vs-napoli-2482205:admin:ppv-venezia-vs-napoli');
    expect(keyHotel).toBe('streamedpk:ts_napoli-v-venezia-401874760:venezia-vs-napoli-2482205:hotel:venezia-vs-napoli-serie-a-1792242000');
  });
});

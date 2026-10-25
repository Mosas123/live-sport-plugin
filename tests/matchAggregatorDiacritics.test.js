'use strict';

const MatchAggregator = require('../src/services/MatchAggregator');

describe('MatchAggregator Diacritics and Club Prefix Normalization', () => {
  const agg = new MatchAggregator({});

  test('merges Lech Poznan across ASCII and Polish diacritics', () => {
    const e1 = { id: 'ts1', title: 'Lech Poznan vs. Bayer Leverkusen', category: 'football', date: '2026-10-15T16:45:00.000Z' };
    const e2 = { id: 'spk1', title: 'Lech Poznań vs Bayer Leverkusen', category: 'football', date: '2026-10-15T16:45:00.000Z' };
    expect(agg.isSameEvent(e1, e2)).toBe(true);
  });

  test('merges Ferencvaros vs Viktoria Plzen across Hungarian and Czech diacritics', () => {
    const e1 = { id: 'ts2', title: 'Ferencvaros vs. Viktoria Plzen', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    const e2 = { id: 'spk2', title: 'Ferencváros vs Viktoria Plzeň', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    expect(agg.isSameEvent(e1, e2)).toBe(true);
  });

  test('merges Turkish clubs with special characters (Besiktas, Fenerbahce)', () => {
    const e1 = { id: 'ts3', title: 'TSG Hoffenheim vs. Besiktas', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    const e2 = { id: 'spk3', title: 'Hoffenheim vs Beşiktaş', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    expect(agg.isSameEvent(e1, e2)).toBe(true);
  });

  test('merges Polish clubs with stroke L (Wisla Krakow)', () => {
    const e1 = { id: 'ts4', title: 'Wisla Krakow vs Legia Warszawa', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    const e2 = { id: 'spk4', title: 'Wisła Kraków vs Legia Warszawa', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    expect(agg.isSameEvent(e1, e2)).toBe(true);
  });

  test('merges Spanish and German clubs with accents and umlauts', () => {
    const e1 = { id: 'ts5', title: 'Atletico Madrid vs Bayern Munich', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    const e2 = { id: 'spk5', title: 'Atlético Madrid vs Bayern München', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    expect(agg.isSameEvent(e1, e2)).toBe(true);
  });

  test('merges Scandinavian clubs with slashed O and umlauts', () => {
    const e1 = { id: 'ts6', title: 'Bodo/Glimt vs Malmo FF', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    const e2 = { id: 'spk6', title: 'Bodø/Glimt vs Malmö FF', category: 'football', date: '2026-10-15T19:00:00.000Z' };
    expect(agg.isSameEvent(e1, e2)).toBe(true);
  });

  test('merges Tennis matches with accented player names', () => {
    const e1 = { id: 'ts7', title: 'Novak Djokovic vs Carlos Alcaraz', category: 'tennis', date: '2026-10-15T19:00:00.000Z' };
    const e2 = { id: 'spk7', title: 'Novak Đoković vs Carlos Alcaraz', category: 'tennis', date: '2026-10-15T19:00:00.000Z' };
    expect(agg.isSameEvent(e1, e2)).toBe(true);
  });
});

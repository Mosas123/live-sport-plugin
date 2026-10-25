'use strict';

const MatchAggregator = require('../src/services/MatchAggregator');

describe('Motorsport Session & Series Deduplication Isolation Suite', () => {
  let agg;

  beforeEach(() => {
    agg = new MatchAggregator({});
  });

  describe('Session Classifier (_extractMotorsportSession)', () => {
    test('correctly identifies practice sessions (FP1, FP2, FP3, FP4)', () => {
      expect(agg._extractMotorsportSession('1st Practice - F1 2026 - Singapore Grand Prix Full Race Replay')).toBe('p1');
      expect(agg._extractMotorsportSession('FP1 - Bahrain Grand Prix')).toBe('p1');
      expect(agg._extractMotorsportSession('Free Practice 1 - Monaco GP')).toBe('p1');

      expect(agg._extractMotorsportSession('2nd Practice - F1 2026 - Singapore Grand Prix Full Race Replay')).toBe('p2');
      expect(agg._extractMotorsportSession('FP2 - Bahrain Grand Prix')).toBe('p2');

      expect(agg._extractMotorsportSession('3rd Practice - F1 2026 - Azerbaijan Grand Prix - Full Race Replay')).toBe('p3');
      expect(agg._extractMotorsportSession('FP3 - Japanese Grand Prix')).toBe('p3');

      expect(agg._extractMotorsportSession('4th Practice - Indianapolis 500')).toBe('p4');
      expect(agg._extractMotorsportSession('FP4 - Indy 500')).toBe('p4');
    });

    test('correctly identifies qualifying and sprint sessions', () => {
      expect(agg._extractMotorsportSession('Qualifying - F1 2026 - Singapore Grand Prix Full Race Replay')).toBe('qualifying');
      expect(agg._extractMotorsportSession('F1 Shootout - Austrian Grand Prix')).toBe('qualifying');

      expect(agg._extractMotorsportSession('Sprint Qualifying - F1 2026 - Singapore Grand Prix Full Race Replay')).toBe('sprint_qualifying');
      expect(agg._extractMotorsportSession('Sprint Shootout - Qatar GP')).toBe('sprint_qualifying');

      expect(agg._extractMotorsportSession('SPRINT - F1 2026 - Singapore Grand Prix - Full Race Replay')).toBe('sprint');
      expect(agg._extractMotorsportSession('Sprint Race - Austrian Grand Prix')).toBe('sprint');
    });

    test('correctly identifies main race, testing days, reviews, and shows', () => {
      expect(agg._extractMotorsportSession('RACE - F1 2026 - Singapore Grand Prix - Full Race Replay')).toBe('race');
      expect(agg._extractMotorsportSession('Formula 1 Singapore Grand Prix 2026 Race Replay')).toBe('race');

      expect(agg._extractMotorsportSession('Barcelona Shakedown Day 4 - F1 2026 - Full Show Replay')).toBe('day_4');
      expect(agg._extractMotorsportSession('Bahrain Pre-Season 2nd Test - Day 3 - F1 2026')).toBe('day_3');
      expect(agg._extractMotorsportSession('Bahrain Pre-Season 1st Test - Day 2')).toBe('day_2');
      expect(agg._extractMotorsportSession('Bahrain Pre-Season 1st Test - Day 1')).toBe('day_1');

      expect(agg._extractMotorsportSession('F1 2025 Season Review - Sky Sports F1 Full Show Replay')).toBe('season_review');
      expect(agg._extractMotorsportSession('Pre Race - F1 2026 - Singapore Grand Prix - Full Replay')).toBe('pre_race');
      expect(agg._extractMotorsportSession('Post-Race Reaction - Singapore GP')).toBe('post_race');
    });
  });

  describe('Series Classifier (_extractMotorsportSeries)', () => {
    test('correctly disambiguates distinct motorsport series', () => {
      expect(agg._extractMotorsportSeries('RACE - F1 2026 - Singapore Grand Prix')).toBe('f1');
      expect(agg._extractMotorsportSeries('Formula 1 Bahrain Grand Prix 2026')).toBe('f1');

      expect(agg._extractMotorsportSeries('Formula 2 Italian Grand Prix - Full Race Replay 2026 - F2 Championship')).toBe('f2');
      expect(agg._extractMotorsportSeries('F2 Championship Monza Sprint')).toBe('f2');

      expect(agg._extractMotorsportSeries('Formula 3 British Grand Prix Full Race Replay 2026 F3 Championship')).toBe('f3');
      expect(agg._extractMotorsportSeries('F3 Championship Silverstone')).toBe('f3');

      expect(agg._extractMotorsportSeries('F1 Academy Dutch Grand Prix - Full Race Replay 2026 - Formula 4')).toBe('f4');
      expect(agg._extractMotorsportSeries('Formula 4 Italian Championship')).toBe('f4');

      expect(agg._extractMotorsportSeries('Monaco ePrix - Formula E Full Race Replay')).toBe('fe');
      expect(agg._extractMotorsportSeries('NASCAR Wurth 400 Full Race Replay - May 3, 2026')).toBe('nascar');
      expect(agg._extractMotorsportSeries('IndyCar The 110th Indianapolis 500 - Full Race Replay')).toBe('indycar');
      expect(agg._extractMotorsportSeries('MotoGP - Grand Prix of Austria 2026 - Full Race Replay')).toBe('motogp');
      expect(agg._extractMotorsportSeries('WSBK Australia Race One & Two Full Race Replay')).toBe('wsbk');
      expect(agg._extractMotorsportSeries('WRC Rally Finland - Full Race Replay')).toBe('wrc');
      expect(agg._extractMotorsportSeries('DTM Circuit Zandvoort - Full Race Replay')).toBe('dtm');
    });

    test('falls back to league metadata when title does not explicitly contain series name', () => {
      expect(agg._extractMotorsportSeries('Singapore Grand Prix - Race', 'Formula 1')).toBe('f1');
      expect(agg._extractMotorsportSeries('Grand Prix of Austria', 'MotoGP')).toBe('motogp');
      expect(agg._extractMotorsportSeries('Enjoy Illinois 300', 'NASCAR')).toBe('nascar');
    });
  });

  describe('Session Collision Guard (Different Sessions Never Merge)', () => {
    const venueDate = '2026-10-10';

    test('F1 Practice 1 vs Practice 2 never merges', () => {
      const p1 = { id: 'rz_fp1', title: '1st Practice - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '1' }] };
      const p2 = { id: 'rz_fp2', title: '2nd Practice - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '2' }] };
      expect(agg.isSameEvent(p1, p2)).toBe(false);
    });

    test('F1 Practice 2 vs Practice 3 never merges', () => {
      const p2 = { id: 'rz_fp2', title: '2nd Practice - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '2' }] };
      const p3 = { id: 'rz_fp3', title: '3rd Practice - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '3' }] };
      expect(agg.isSameEvent(p2, p3)).toBe(false);
    });

    test('F1 Practice 3 vs Qualifying never merges', () => {
      const p3 = { id: 'rz_fp3', title: '3rd Practice - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '3' }] };
      const q = { id: 'rz_quali', title: 'Qualifying - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '4' }] };
      expect(agg.isSameEvent(p3, q)).toBe(false);
    });

    test('F1 Qualifying vs Main Race never merges', () => {
      const q = { id: 'rz_quali', title: 'Qualifying - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '4' }] };
      const r = { id: 'rz_race', title: 'RACE - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '5' }] };
      expect(agg.isSameEvent(q, r)).toBe(false);
    });

    test('F1 Sprint vs Main Race never merges', () => {
      const s = { id: 'rz_sprint', title: 'Sprint - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '6' }] };
      const r = { id: 'rz_race', title: 'RACE - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '5' }] };
      expect(agg.isSameEvent(s, r)).toBe(false);
    });

    test('F1 Sprint Qualifying vs Sprint Race never merges', () => {
      const sq = { id: 'rz_sq', title: 'Sprint Qualifying - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '7' }] };
      const s = { id: 'rz_sprint', title: 'Sprint - F1 2026 - Singapore Grand Prix Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '6' }] };
      expect(agg.isSameEvent(sq, s)).toBe(false);
    });

    test('Testing Day 1 vs Testing Day 2 never merges', () => {
      const d1 = { id: 'rz_d1', title: 'Bahrain Pre-Season 1st Test - Day 1 - F1 2026', date: '2026-02-11', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '8' }] };
      const d2 = { id: 'rz_d2', title: 'Bahrain Pre-Season 1st Test - Day 2 - F1 2026', date: '2026-02-12', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '9' }] };
      expect(agg.isSameEvent(d1, d2)).toBe(false);
    });
  });

  describe('Series Collision Guard (Different Series Never Merge)', () => {
    const venueDate = '2026-09-06';

    test('F1 Italian Grand Prix vs F2 Italian Grand Prix at same venue/date never merges', () => {
      const f1 = { id: 'rz_f1_monza', title: 'RACE - F1 2026 - Italian Grand Prix - Full Race Replay', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '1' }] };
      const f2 = { id: 'rz_f2_monza', title: 'Formula 2 Italian Grand Prix - Full Race Replay 2026 - F2 Championship', date: venueDate, category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '2' }] };
      expect(agg.isSameEvent(f1, f2)).toBe(false);
    });

    test('F1 British Grand Prix vs F3 British Grand Prix never merges', () => {
      const f1 = { id: 'rz_f1_silverstone', title: 'RACE - F1 2026 - British Grand Prix - Full Race Replay', date: '2026-07-05', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '3' }] };
      const f3 = { id: 'rz_f3_silverstone', title: 'Formula 3 British Grand Prix Full Race Replay 2026 F3 Championship', date: '2026-07-05', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '4' }] };
      expect(agg.isSameEvent(f1, f3)).toBe(false);
    });

    test('F1 Dutch Grand Prix vs F1 Academy (F4) Dutch Grand Prix never merges', () => {
      const f1 = { id: 'rz_f1_zandvoort', title: 'RACE - F1 2026 - Dutch Grand Prix - Full Race Replay', date: '2026-08-23', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '5' }] };
      const f4 = { id: 'rz_f4_zandvoort', title: 'F1 Academy Dutch Grand Prix - Full Race Replay 2026 - Formula 4', date: '2026-08-23', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '6' }] };
      expect(agg.isSameEvent(f1, f4)).toBe(false);
    });

    test('F1 Grand Prix vs NASCAR race on same date never merges', () => {
      const f1 = { id: 'rz_f1_miami', title: 'RACE - F1 2026 - Miami Grand Prix - Full Race Replay', date: '2026-05-03', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '7' }] };
      const nascar = { id: 'rz_nascar_wurth', title: 'NASCAR Wurth 400 Full Race Replay - May 3, 2026', date: '2026-05-03', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '8' }] };
      expect(agg.isSameEvent(f1, nascar)).toBe(false);
    });

    test('MotoGP vs NASCAR never merges', () => {
      const motogp = { id: 'rz_motogp', title: 'MotoGP - Grand Prix of Austria 2026 - Full Race Replay', date: '2026-08-16', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '9' }] };
      const nascar = { id: 'rz_nascar', title: 'NASCAR Cook Out 400 - Full Race Replay - August 15, 2026', date: '2026-08-15', category: 'motorsport', status: 'finished', sources: [{ source: 'replayzone', id: '10' }] };
      expect(agg.isSameEvent(motogp, nascar)).toBe(false);
    });
  });

  describe('Legitimate Same-Session Multi-Provider Merging', () => {
    test('same F1 session from ReplayZone and FullRaces merges cleanly', () => {
      const rz = {
        id: 'rz_race---f1-2026---singapore-grand-prix-full-race-replay-october-11--2026-formula-1-323032362d31302d3131',
        title: 'RACE - F1 2026 - Singapore Grand Prix Full Race Replay October 11, 2026 Formula 1',
        category: 'motorsport',
        date: '2026-10-11',
        status: 'finished',
        sources: [{ source: 'replayzone', id: 'https://ok.ru/videoembed/12345', name: 'Server 1 (OK)', type: 'iframe' }]
      };
      const fr = {
        id: 'fr_race-f1-2026-singapore-grand-prix-full-race-replay-october-11-2026-formula-1',
        title: 'Formula 1 Singapore Grand Prix 2026 Race Replay',
        category: 'motorsport',
        date: '2026-10-11',
        status: 'finished',
        sources: [{ source: 'fullraces', id: 'https://fullraces.com/singapore', name: 'FullRaces', type: 'fullraces' }]
      };

      expect(agg.isSameEvent(rz, fr)).toBe(true);
      expect(agg.isSameEvent(fr, rz)).toBe(true);
    });

    test('same F1 Qualifying session from two providers within 24h merges cleanly', () => {
      const p1 = {
        id: 'rz_qualifying_bahrain',
        title: 'Qualifying - F1 2026 - Bahrain Grand Prix Full Race Replay',
        category: 'motorsport',
        date: '2026-10-03',
        status: 'finished',
        sources: [{ source: 'replayzone', id: 's1' }]
      };
      const p2 = {
        id: 'fr_qualifying_bahrain',
        title: 'Formula 1 Bahrain Grand Prix 2026 Qualifying Replay',
        category: 'motorsport',
        date: '2026-10-03',
        status: 'finished',
        sources: [{ source: 'fullraces', id: 's2' }]
      };

      expect(agg.isSameEvent(p1, p2)).toBe(true);
    });
  });

  describe('idIndex Candidate Verification Guard', () => {
    test('rejects idIndex candidate merge when alias belongs to a different session', async () => {
      // Simulates the corrupted disk cache where Barcelona shakedown had swallowed Singapore GP race ID
      const mockMatches = [
        {
          id: 'rz_barcelona_day_4',
          title: 'Barcelona Shakedown Day 4 - F1 2026 - Full Show Replay January 29, 2026',
          category: 'motorsport',
          date: '2026-01-29',
          status: 'finished',
          aliasIds: ['rz_singapore_race'],
          sources: [{ source: 'replayzone', id: 's1', url: 'u1' }]
        },
        {
          id: 'rz_singapore_race',
          title: 'RACE - F1 2026 - Singapore Grand Prix Full Race Replay October 11, 2026 Formula 1',
          category: 'motorsport',
          date: '2026-10-11',
          status: 'finished',
          sources: [{ source: 'replayzone', id: 's2', url: 'u2' }]
        }
      ];

      let saved = [];
      const mockCacheService = {
        getMatches: () => [],
        setMatches: (m) => { saved = m; }
      };

      agg = new MatchAggregator({ cacheService: mockCacheService });
      agg.providers = [{ sourceName: 'replayzone', getMatches: async () => mockMatches }];

      const results = await agg.syncMatches();
      // Must produce 2 separate events, NOT 1 swallowed event
      expect(results.length).toBe(2);
      const singapore = results.find(m => m.id === 'rz_singapore_race');
      expect(singapore).toBeDefined();
      expect(singapore.title).toContain('Singapore Grand Prix');
    });

    test('rejects idIndex candidate merge when date difference exceeds 48 hours', async () => {
      const mockMatches = [
        {
          id: 'rz_race_1',
          title: 'RACE - F1 2026 - Australian Grand Prix Full Race Replay',
          category: 'motorsport',
          date: '2026-03-15',
          status: 'finished',
          aliasIds: ['rz_race_2'],
          sources: [{ source: 'replayzone', id: 's1', url: 'u1' }]
        },
        {
          id: 'rz_race_2',
          title: 'RACE - F1 2026 - Australian Grand Prix Full Race Replay',
          category: 'motorsport',
          date: '2026-04-15', // 1 month later
          status: 'finished',
          sources: [{ source: 'replayzone', id: 's2', url: 'u2' }]
        }
      ];

      let saved = [];
      const mockCacheService = {
        getMatches: () => [],
        setMatches: (m) => { saved = m; }
      };

      agg = new MatchAggregator({ cacheService: mockCacheService });
      agg.providers = [{ sourceName: 'replayzone', getMatches: async () => mockMatches }];

      const results = await agg.syncMatches();
      expect(results.length).toBe(2);
    });
  });

  describe('Date-0 / Missing Date Safety Guard', () => {
    test('undated Season Review cannot merge with dated race session', () => {
      const review = {
        id: 'rz_review',
        title: 'F1 2025 Season Review - Sky Sports F1 Full Show Replay',
        category: 'motorsport',
        date: '', // date = 0
        status: 'finished',
        sources: [{ source: 'replayzone', id: 's1' }]
      };
      const race = {
        id: 'rz_singapore',
        title: 'RACE - F1 2025 - Singapore Grand Prix Full Race Replay October 5, 2025 Formula 1',
        category: 'motorsport',
        date: '2025-10-05',
        status: 'finished',
        sources: [{ source: 'replayzone', id: 's2' }]
      };

      expect(agg.isSameEvent(review, race)).toBe(false);
      expect(agg.isSameEvent(race, review)).toBe(false);
    });

    test('date-0 events only merge on exact normalized title match', () => {
      const a = {
        id: 'rz_1',
        title: 'Formula 1 Testing Day 1',
        category: 'motorsport',
        date: 0,
        status: 'finished',
        sources: [{ source: 'replayzone', id: 's1' }]
      };
      const b = {
        id: 'fr_1',
        title: 'Formula 1 Testing Day 1',
        category: 'motorsport',
        date: '',
        status: 'finished',
        sources: [{ source: 'fullraces', id: 's2' }]
      };
      const c = {
        id: 'rz_2',
        title: 'Formula 1 Testing Day 2',
        category: 'motorsport',
        date: 0,
        status: 'finished',
        sources: [{ source: 'replayzone', id: 's3' }]
      };

      expect(agg.isSameEvent(a, b)).toBe(true);
      expect(agg.isSameEvent(a, c)).toBe(false);
    });
  });

  describe('Dual-Team Extraction & Title Overwrite Guard', () => {
    test('motorsport titles are never parsed as dual-team fixtures', () => {
      const pre1 = agg._precompute({ title: 'NASCAR Wurth 400 Full Race Replay - May 3, 2026', category: 'motorsport' });
      expect(pre1.teams).toBeNull();

      const pre2 = agg._precompute({ title: 'RACE - F1 2026 - Miami Grand Prix - Full Race Replay', category: 'motorsport' });
      expect(pre2.teams).toBeNull();
    });

    test('incoming motorsport title cannot overwrite existing Grand Prix title', async () => {
      const mockMatches = [
        {
          id: 'rz_f1_miami',
          title: 'RACE - F1 2026 - Miami Grand Prix - Full Race Replay - May 3, 2026 - Formula 1',
          category: 'motorsport',
          date: '2026-05-03',
          status: 'finished',
          sources: [{ source: 'replayzone', id: 's1', url: 'u1' }]
        },
        {
          id: 'rz_f1_miami_mirror',
          title: 'Miami Grand Prix 2026 F1 Race Replay',
          category: 'motorsport',
          date: '2026-05-03',
          status: 'finished',
          sources: [{ source: 'fullraces', id: 's2', url: 'u2' }]
        }
      ];

      let saved = [];
      const mockCacheService = {
        getMatches: () => [],
        setMatches: (m) => { saved = m; }
      };

      agg = new MatchAggregator({ cacheService: mockCacheService });
      agg.providers = [{ sourceName: 'replayzone', getMatches: async () => mockMatches }];

      const results = await agg.syncMatches();
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('RACE - F1 2026 - Miami Grand Prix - Full Race Replay - May 3, 2026 - Formula 1');
      expect(results[0].sources.length).toBe(2);
    });
  });
});

'use strict';

const MatchAggregator = require('../src/services/MatchAggregator');

describe('Empirical Adversarial Motorsport Verification & Stress Test Suite', () => {
  let agg;

  beforeEach(() => {
    agg = new MatchAggregator({});
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Cross-Session Collisions: Exhaustive Pairwise Matrix
  // ──────────────────────────────────────────────────────────────────────────
  describe('Cross-Session Collisions: Exhaustive Pairwise Isolation', () => {
    const venueDate = '2026-05-24';
    const venue = 'Monaco Grand Prix';

    const sessionTemplates = [
      { name: 'p1', title: `1st Free Practice - F1 2026 - ${venue} Full Race Replay` },
      { name: 'p1_alt', title: `FP1 - ${venue}` },
      { name: 'p2', title: `2nd Free Practice - F1 2026 - ${venue} Full Race Replay` },
      { name: 'p2_alt', title: `FP2 - ${venue}` },
      { name: 'p3', title: `3rd Free Practice - F1 2026 - ${venue} Full Race Replay` },
      { name: 'p3_alt', title: `FP3 - ${venue}` },
      { name: 'p4', title: `4th Practice - ${venue}` },
      { name: 'qualifying', title: `Qualifying - F1 2026 - ${venue} Full Race Replay` },
      { name: 'qualifying_alt', title: `Pole Position Shootout - ${venue}` },
      { name: 'sprint_qualifying', title: `Sprint Qualifying - F1 2026 - ${venue} Full Race Replay` },
      { name: 'sprint_qualifying_alt', title: `Sprint Shootout - ${venue}` },
      { name: 'sprint', title: `Sprint - F1 2026 - ${venue} Full Race Replay` },
      { name: 'sprint_alt', title: `Sprint Race - ${venue}` },
      { name: 'race', title: `RACE - F1 2026 - ${venue} Full Race Replay` },
      { name: 'race_alt', title: `Formula 1 ${venue} 2026 Race Replay` },
      { name: 'day_1', title: `Pre-Season 1st Test - Day 1 - F1 2026 - ${venue}` },
      { name: 'day_2', title: `Pre-Season 1st Test - Day 2 - F1 2026 - ${venue}` },
      { name: 'day_3', title: `Pre-Season 1st Test - Day 3 - F1 2026 - ${venue}` },
      { name: 'day_4', title: `Pre-Season 1st Test - Day 4 - F1 2026 - ${venue}` },
      { name: 'pre_race', title: `The F1 Show - ${venue} Preview` },
      { name: 'post_race', title: `Post-Race Chequered Flag - ${venue}` },
      { name: 'season_review', title: `F1 2026 Season Review - Sky Sports F1` },
    ];

    test('verifies all session templates classify to their expected session enum', () => {
      const expectedMap = {
        p1: 'p1', p1_alt: 'p1',
        p2: 'p2', p2_alt: 'p2',
        p3: 'p3', p3_alt: 'p3',
        p4: 'p4',
        qualifying: 'qualifying', qualifying_alt: 'qualifying',
        sprint_qualifying: 'sprint_qualifying', sprint_qualifying_alt: 'sprint_qualifying',
        sprint: 'sprint', sprint_alt: 'sprint',
        race: 'race', race_alt: 'race',
        day_1: 'day_1', day_2: 'day_2', day_3: 'day_3', day_4: 'day_4',
        pre_race: 'pre_race', post_race: 'post_race', season_review: 'season_review'
      };

      for (const t of sessionTemplates) {
        const session = agg._extractMotorsportSession(t.title);
        expect(session).toBe(expectedMap[t.name]);
      }
    });

    test('pairwise collision test across all distinct sessions at same venue on same date', () => {
      // For every pair with different expected sessions, agg.isSameEvent MUST return false
      for (let i = 0; i < sessionTemplates.length; i++) {
        for (let j = i + 1; j < sessionTemplates.length; j++) {
          const t1 = sessionTemplates[i];
          const t2 = sessionTemplates[j];
          const s1 = agg._extractMotorsportSession(t1.title);
          const s2 = agg._extractMotorsportSession(t2.title);

          if (s1 !== s2) {
            const m1 = { id: `m_${i}`, title: t1.title, date: venueDate, category: 'motorsport', status: 'finished' };
            const m2 = { id: `m_${j}`, title: t2.title, date: venueDate, category: 'motorsport', status: 'finished' };
            const same = agg.isSameEvent(m1, m2);
            if (same) {
              throw new Error(`Collision detected between [${t1.title}] (${s1}) and [${t2.title}] (${s2})`);
            }
            expect(same).toBe(false);
          }
        }
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Cross-Series Collisions: Complete Series Matrix
  // ──────────────────────────────────────────────────────────────────────────
  describe('Cross-Series Collisions: Strict Series Isolation', () => {
    const venueDate = '2026-09-06';
    const seriesSamples = [
      { series: 'f1', title: 'RACE - F1 2026 - Italian Grand Prix - Full Race Replay' },
      { series: 'f2', title: 'Formula 2 Italian Grand Prix - Full Race Replay 2026 - F2 Championship' },
      { series: 'f3', title: 'Formula 3 Italian Grand Prix - Full Race Replay 2026 F3 Championship' },
      { series: 'f4', title: 'F1 Academy Monza - Full Race Replay 2026 - Formula 4' },
      { series: 'fe', title: 'Formula E Monza ePrix - Full Race Replay' },
      { series: 'nascar', title: 'NASCAR Cup Series Monza 400 - Full Race Replay' },
      { series: 'indycar', title: 'IndyCar Monza Grand Prix - Full Race Replay' },
      { series: 'motogp', title: 'MotoGP Italian Grand Prix Monza - Full Race Replay' },
      { series: 'wsbk', title: 'WSBK World Superbike Italian Round Monza - Full Race Replay' },
      { series: 'wrc', title: 'WRC Rally Monza - Full Race Replay' },
      { series: 'dtm', title: 'DTM Monza - Full Race Replay' },
    ];

    test('verifies each series sample classifies to expected series code', () => {
      for (const s of seriesSamples) {
        expect(agg._extractMotorsportSeries(s.title)).toBe(s.series);
      }
    });

    test('pairwise collision test across all distinct motorsport series on same date/circuit', () => {
      for (let i = 0; i < seriesSamples.length; i++) {
        for (let j = i + 1; j < seriesSamples.length; j++) {
          const s1 = seriesSamples[i];
          const s2 = seriesSamples[j];
          const m1 = { id: `series_${i}`, title: s1.title, date: venueDate, category: 'motorsport', status: 'finished' };
          const m2 = { id: `series_${j}`, title: s2.title, date: venueDate, category: 'motorsport', status: 'finished' };

          const same = agg.isSameEvent(m1, m2);
          if (same) {
            throw new Error(`Series cross-merge collision detected: [${s1.title}] (${s1.series}) vs [${s2.title}] (${s2.series})`);
          }
          expect(same).toBe(false);
        }
      }
    });

    test('MotoGP vs WSBK at Phillip Island on same day never merges', () => {
      const motogp = { id: 'moto_pi', title: 'MotoGP Australian Grand Prix Phillip Island Full Race Replay', date: '2026-10-18', category: 'motorsport', status: 'finished' };
      const wsbk = { id: 'wsbk_pi', title: 'WSBK Australian Round Phillip Island Race 1 Replay', date: '2026-10-18', category: 'motorsport', status: 'finished' };
      expect(agg.isSameEvent(motogp, wsbk)).toBe(false);
    });

    test('F1 Monaco Grand Prix vs Formula E Monaco ePrix never merges', () => {
      const f1 = { id: 'f1_monaco', title: 'Formula 1 Monaco Grand Prix 2026 Race Replay', date: '2026-05-24', category: 'motorsport', status: 'finished' };
      const fe = { id: 'fe_monaco', title: 'Formula E Monaco ePrix 2026 Race Replay', date: '2026-05-24', category: 'motorsport', status: 'finished' };
      expect(agg.isSameEvent(f1, fe)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Legitimate Multi-Provider Merges (ReplayZone + FullRaces + LiveTV)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Legitimate Multi-Provider Merging of Exact Same Session', () => {
    test('merges F1 Main Race across ReplayZone, FullRaces, and LiveTV with multiple sources', async () => {
      const date = '2026-08-30';
      const rz = {
        id: 'rz_belgium_race',
        title: 'RACE - F1 2026 - Belgian Grand Prix Full Race Replay August 30, 2026 Formula 1',
        category: 'motorsport',
        date,
        status: 'finished',
        sources: [{ source: 'replayzone', id: 'https://ok.ru/videoembed/rz1', name: 'ReplayZone Server 1' }]
      };
      const fr = {
        id: 'fr_belgium_race',
        title: 'Formula 1 Belgian Grand Prix 2026 Race Replay',
        category: 'motorsport',
        date,
        status: 'finished',
        sources: [{ source: 'fullraces', id: 'https://fullraces.com/spa', name: 'FullRaces Spa' }]
      };
      const ltv = {
        id: 'livetv_belgium_race',
        title: 'F1 Belgian Grand Prix Race 30.08.2026',
        category: 'motorsport',
        date,
        status: 'finished',
        sources: [{ source: 'livetv', id: 'https://livetv.sx/spa', name: 'LiveTV Spa' }]
      };

      // Pairwise direct comparisons
      expect(agg.isSameEvent(rz, fr)).toBe(true);
      expect(agg.isSameEvent(fr, rz)).toBe(true);
      expect(agg.isSameEvent(rz, ltv)).toBe(true);
      expect(agg.isSameEvent(fr, ltv)).toBe(true);

      // Aggregated syncMatches merge
      let saved = [];
      const mockCacheService = { getMatches: () => [], setMatches: (m) => { saved = m; } };
      agg = new MatchAggregator({ cacheService: mockCacheService });
      agg.providers = [
        { sourceName: 'replayzone', getMatches: async () => [rz] },
        { sourceName: 'fullraces', getMatches: async () => [fr] },
        { sourceName: 'livetv', getMatches: async () => [ltv] }
      ];

      const merged = await agg.syncMatches();
      expect(merged.length).toBe(1);
      expect(merged[0].sources.length).toBe(3);
      expect(merged[0].sources.map(s => s.source).sort()).toEqual(['fullraces', 'livetv', 'replayzone']);
      // Retains canonical fixture title
      expect(merged[0].title).toBe('RACE - F1 2026 - Belgian Grand Prix Full Race Replay August 30, 2026 Formula 1');
    });

    test('merges F1 Qualifying across providers while keeping Practice separate', async () => {
      const date = '2026-08-29';
      const fp3_rz = {
        id: 'rz_fp3',
        title: '3rd Practice - F1 2026 - Belgian Grand Prix Full Race Replay',
        category: 'motorsport',
        date,
        status: 'finished',
        sources: [{ source: 'replayzone', id: 's_fp3' }]
      };
      const quali_rz = {
        id: 'rz_quali',
        title: 'Qualifying - F1 2026 - Belgian Grand Prix Full Race Replay',
        category: 'motorsport',
        date,
        status: 'finished',
        sources: [{ source: 'replayzone', id: 's_quali_rz' }]
      };
      const quali_fr = {
        id: 'fr_quali',
        title: 'Formula 1 Belgian Grand Prix 2026 Qualifying Replay',
        category: 'motorsport',
        date,
        status: 'finished',
        sources: [{ source: 'fullraces', id: 's_quali_fr' }]
      };

      let saved = [];
      const mockCacheService = { getMatches: () => [], setMatches: (m) => { saved = m; } };
      agg = new MatchAggregator({ cacheService: mockCacheService });
      agg.providers = [
        { sourceName: 'replayzone', getMatches: async () => [fp3_rz, quali_rz] },
        { sourceName: 'fullraces', getMatches: async () => [quali_fr] }
      ];

      const merged = await agg.syncMatches();
      // Should result in 2 events: FP3 (1 source) and Qualifying (2 sources)
      expect(merged.length).toBe(2);

      const fp3 = merged.find(m => agg._extractMotorsportSession(m.title) === 'p3');
      const quali = merged.find(m => agg._extractMotorsportSession(m.title) === 'qualifying');

      expect(fp3).toBeDefined();
      expect(fp3.sources.length).toBe(1);

      expect(quali).toBeDefined();
      expect(quali.sources.length).toBe(2);
      expect(quali.sources.map(s => s.source).sort()).toEqual(['fullraces', 'replayzone']);
    });

    test('merges NASCAR Wurth 400 across providers', () => {
      const n1 = { id: 'rz_nascar', title: 'NASCAR Wurth 400 Full Race Replay - May 3, 2026', category: 'motorsport', date: '2026-05-03', status: 'finished' };
      const n2 = { id: 'fr_nascar', title: 'NASCAR Cup Series 2026 Wurth 400 Race Replay', category: 'motorsport', date: '2026-05-03', status: 'finished' };
      expect(agg.isSameEvent(n1, n2)).toBe(true);
    });

    test('merges MotoGP Austrian Grand Prix across providers when using canonical naming', () => {
      const m1 = { id: 'rz_mgp', title: 'MotoGP - Grand Prix of Austria 2026 - Full Race Replay', category: 'motorsport', date: '2026-08-16', status: 'finished' };
      const m2 = { id: 'fr_mgp', title: 'MotoGP Grand Prix of Austria 2026 Race Replay', category: 'motorsport', date: '2026-08-16', status: 'finished' };
      expect(agg.isSameEvent(m1, m2)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Hostile / Conflicting Alias Pairs in idIndex & Transitive Traps
  // ──────────────────────────────────────────────────────────────────────────
  describe('Hostile idIndex Alias Pairs & Transitive Cascade Traps', () => {
    test('adversarial cached event with 5 hostile aliases pointing to different sessions and series cannot swallow incoming events', async () => {
      // Shakedown event poisoned with aliases of 5 different events
      const poisonedCachedMatch = {
        id: 'rz_barcelona_poisoned',
        title: 'Barcelona Shakedown Day 4 - F1 2026 - Full Show Replay January 29, 2026',
        category: 'motorsport',
        date: '2026-01-29',
        status: 'finished',
        aliasIds: [
          'f1_singapore_race',
          'f1_monaco_p1',
          'nascar_daytona_500',
          'motogp_austria',
          'f1_bahrain_qualifying'
        ],
        sources: [{ source: 'replayzone', id: 'p0', url: 'u0' }]
      };

      const incomingMatches = [
        {
          id: 'f1_singapore_race',
          title: 'RACE - F1 2026 - Singapore Grand Prix Full Race Replay October 11, 2026 Formula 1',
          category: 'motorsport',
          date: '2026-10-11',
          status: 'finished',
          sources: [{ source: 'fullraces', id: 's1', url: 'u1' }]
        },
        {
          id: 'f1_monaco_p1',
          title: '1st Practice - F1 2026 - Monaco Grand Prix Full Race Replay May 22, 2026',
          category: 'motorsport',
          date: '2026-05-22',
          status: 'finished',
          sources: [{ source: 'fullraces', id: 's2', url: 'u2' }]
        },
        {
          id: 'nascar_daytona_500',
          title: 'NASCAR Daytona 500 Full Race Replay February 15, 2026',
          category: 'motorsport',
          date: '2026-02-15',
          status: 'finished',
          sources: [{ source: 'fullraces', id: 's3', url: 'u3' }]
        },
        {
          id: 'motogp_austria',
          title: 'MotoGP - Grand Prix of Austria 2026 - Full Race Replay August 16, 2026',
          category: 'motorsport',
          date: '2026-08-16',
          status: 'finished',
          sources: [{ source: 'fullraces', id: 's4', url: 'u4' }]
        },
        {
          id: 'f1_bahrain_qualifying',
          title: 'Qualifying - F1 2026 - Bahrain Grand Prix Full Race Replay March 28, 2026',
          category: 'motorsport',
          date: '2026-03-28',
          status: 'finished',
          sources: [{ source: 'fullraces', id: 's5', url: 'u5' }]
        }
      ];

      let saved = [];
      const mockCacheService = {
        getMatches: () => [],
        setMatches: (m) => { saved = m; }
      };

      agg = new MatchAggregator({ cacheService: mockCacheService });
      agg.providers = [
        { sourceName: 'replayzone', getMatches: async () => [poisonedCachedMatch] },
        { sourceName: 'fullraces', getMatches: async () => incomingMatches }
      ];

      const results = await agg.syncMatches();

      // ALL 6 events must exist independently — NONE swallowed into poisonedCachedMatch
      expect(results.length).toBe(6);

      const shakedown = results.find(m => m.id === 'rz_barcelona_poisoned');
      expect(shakedown.sources.length).toBe(1);

      for (const inc of incomingMatches) {
        const found = results.find(m => m.id === inc.id);
        expect(found).toBeDefined();
        expect(found.title).toBe(inc.title);
        expect(found.sources.length).toBe(1);
      }
    });

    test('hostile cyclic alias loop does not cause infinite recursion or erroneous merging', async () => {
      // Event A claims alias B, Event B claims alias A, but Event A is Race and Event B is Practice
      const matchA = {
        id: 'f1_event_a',
        aliasIds: ['f1_event_b'],
        title: 'RACE - F1 2026 - British Grand Prix Full Race Replay',
        category: 'motorsport',
        date: '2026-07-05',
        status: 'finished',
        sources: [{ source: 'replayzone', id: 'a' }]
      };
      const matchB = {
        id: 'f1_event_b',
        aliasIds: ['f1_event_a'],
        title: '1st Practice - F1 2026 - British Grand Prix Full Race Replay',
        category: 'motorsport',
        date: '2026-07-03',
        status: 'finished',
        sources: [{ source: 'replayzone', id: 'b' }]
      };

      let saved = [];
      const mockCacheService = { getMatches: () => [], setMatches: (m) => { saved = m; } };
      agg = new MatchAggregator({ cacheService: mockCacheService });
      agg.providers = [{ sourceName: 'replayzone', getMatches: async () => [matchA, matchB] }];

      const results = await agg.syncMatches();
      expect(results.length).toBe(2);
    });

    test('colliding synthetic alias key between unrelated football match and motorsport event', async () => {
      // Unrelated football and motorsport events that share an identical synthetic alias
      const nowIso = new Date().toISOString();
      const football = {
        id: 'fb_1',
        aliasIds: ['shared_conflict_id'],
        title: 'Arsenal vs Chelsea',
        category: 'football',
        date: nowIso,
        status: 'finished',
        sources: [{ source: 'streamedpk', id: 'fb' }]
      };
      const racing = {
        id: 'shared_conflict_id',
        title: 'RACE - F1 2026 - Miami Grand Prix Full Race Replay',
        category: 'motorsport',
        date: nowIso,
        status: 'finished',
        sources: [{ source: 'replayzone', id: 'f1' }]
      };

      let saved = [];
      const mockCacheService = { getMatches: () => [], setMatches: (m) => { saved = m; } };
      agg = new MatchAggregator({ cacheService: mockCacheService });
      agg.providers = [{ sourceName: 'mixed', getMatches: async () => [football, racing] }];

      const results = await agg.syncMatches();
      // Category barrier + sameEventPre verification MUST keep them 2 distinct items
      expect(results.length).toBe(2);
      expect(results.find(m => m.id === 'fb_1')).toBeDefined();
      expect(results.find(m => m.id === 'shared_conflict_id')).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Date Boundaries & Date-0 Edge Cases
  // ──────────────────────────────────────────────────────────────────────────
  describe('Date Boundaries & Date-0 Edge Cases', () => {
    test('events 47 hours apart can merge if same session & venue, but >48 hours cannot', () => {
      const baseEpoch = 1779840000000; // e.g. some base date
      const event1 = {
        id: 'e1',
        title: 'Formula 1 Monaco Grand Prix 2026 Race Replay',
        category: 'motorsport',
        date: baseEpoch,
        status: 'finished'
      };
      // 40 hours later (within 48h)
      const eventWithin48 = {
        id: 'e2',
        title: 'RACE - F1 2026 - Monaco Grand Prix Full Race Replay',
        category: 'motorsport',
        date: baseEpoch + (40 * 3600 * 1000),
        status: 'finished'
      };
      // 50 hours later (beyond 48h)
      const eventBeyond48 = {
        id: 'e3',
        title: 'RACE - F1 2026 - Monaco Grand Prix Full Race Replay',
        category: 'motorsport',
        date: baseEpoch + (50 * 3600 * 1000),
        status: 'finished'
      };

      expect(agg.isSameEvent(event1, eventWithin48)).toBe(true);
      expect(agg.isSameEvent(event1, eventBeyond48)).toBe(false);
    });

    test('missing date on one event cannot bypass session mismatch', () => {
      const eNoDate = {
        id: 'nd_1',
        title: 'Formula 1 Monaco Grand Prix Qualifying Replay',
        category: 'motorsport',
        date: null,
        status: 'finished'
      };
      const eDated = {
        id: 'd_1',
        title: 'RACE - F1 2026 - Monaco Grand Prix Full Race Replay',
        category: 'motorsport',
        date: '2026-05-24',
        status: 'finished'
      };

      expect(agg.isSameEvent(eNoDate, eDated)).toBe(false);
      expect(agg.isSameEvent(eDated, eNoDate)).toBe(false);
    });

    test('missing date on both events with different venues cannot merge', () => {
      const monaco = { id: 'm1', title: 'Formula 1 Monaco Grand Prix Race', category: 'motorsport', date: 0, status: 'finished' };
      const monza = { id: 'm2', title: 'Formula 1 Monza Grand Prix Race', category: 'motorsport', date: 0, status: 'finished' };

      expect(agg.isSameEvent(monaco, monza)).toBe(false);
    });

    test('identical normalized title with missing date merges cleanly', () => {
      const e1 = { id: 'm1', title: 'Formula 1 Monaco Grand Prix 2026 Race', category: 'motorsport', date: 0, status: 'finished' };
      const e2 = { id: 'm2', title: 'Formula 1 Monaco Grand Prix 2026 Race', category: 'motorsport', date: '', status: 'finished' };

      expect(agg.isSameEvent(e1, e2)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Advanced Edge-Cases: Compound Tokens, Years, Diacritics & Demonyms
  // ──────────────────────────────────────────────────────────────────────────
  describe('Advanced Edge Cases: Compound Tokens, Years, Diacritics & Demonyms', () => {
    test('F1 naming variants (F1 vs Formula 1 vs Formula One) merge seamlessly', () => {
      const v1 = { id: 'v1', title: 'F1 Miami Grand Prix Race Replay', category: 'motorsport', date: '2026-05-03', status: 'finished' };
      const v2 = { id: 'v2', title: 'Formula 1 Miami Grand Prix Race Replay', category: 'motorsport', date: '2026-05-03', status: 'finished' };
      const v3 = { id: 'v3', title: 'Formula One Miami Grand Prix Race Replay', category: 'motorsport', date: '2026-05-03', status: 'finished' };

      expect(agg.isSameEvent(v1, v2)).toBe(true);
      expect(agg.isSameEvent(v2, v3)).toBe(true);
      expect(agg.isSameEvent(v1, v3)).toBe(true);
    });

    test('Season year in title (2026 vs omitted) merges cleanly without stray digit collision', () => {
      const withYear = { id: 'y1', title: 'Formula 1 2026 Singapore Grand Prix Race Replay', category: 'motorsport', date: '2026-10-11', status: 'finished' };
      const withoutYear = { id: 'y2', title: 'Formula 1 Singapore Grand Prix Race Replay', category: 'motorsport', date: '2026-10-11', status: 'finished' };

      expect(agg.isSameEvent(withYear, withoutYear)).toBe(true);
    });

    test('Diacritic stripping handles Sao Paulo Grand Prix variants', () => {
      const accented = { id: 'd1', title: 'Formula 1 São Paulo Grand Prix 2026 Race Replay', category: 'motorsport', date: '2026-11-08', status: 'finished' };
      const unaccented = { id: 'd2', title: 'Formula 1 Sao Paulo Grand Prix 2026 Race Replay', category: 'motorsport', date: '2026-11-08', status: 'finished' };

      expect(agg.isSameEvent(accented, unaccented)).toBe(true);
    });

    test('Demonym asymmetry observation: country noun vs demonym adjective (Austria vs Austrian)', () => {
      const noun = { id: 'n1', title: 'MotoGP Grand Prix of Austria 2026 Race Replay', category: 'motorsport', date: '2026-08-16', status: 'finished' };
      const adj = { id: 'a1', title: 'MotoGP Austrian Grand Prix 2026 Race Replay', category: 'motorsport', date: '2026-08-16', status: 'finished' };

      // Currently, without an explicit demonym dictionary, 'austria' !== 'austrian'.
      // This is a documented conservative property: prevents accidental merges of different countries,
      // but keeps asymmetric titles separate unless both scrapers share the exact country or demonym token.
      expect(agg.isSameEvent(noun, adj)).toBe(false);
    });
  });
});

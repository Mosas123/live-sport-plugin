'use strict';

const MatchAggregator = require('../src/services/MatchAggregator');
const { extractTeamsFromTitle } = require('../src/services/TeamNameExtractor');
const { getMatchTier, TIER } = require('../src/services/MainstreamRankingService');
const LiveTVProvider = require('../src/providers/LiveTVProvider');
const BasketballVideoProvider = require('../src/providers/BasketballVideoProvider');

describe('Replay Normalization & Unified Merging Architecture', () => {
  test('TeamNameExtractor extracts clean team names from rich replay titles', () => {
    const title = 'Oklahoma City Thunder vs Houston Rockets - NBA Preseason - Full Game Replay - October 15, 2026';
    const teams = extractTeamsFromTitle(title);
    expect(teams).toEqual(['Oklahoma City Thunder', 'Houston Rockets']);

    const nhlTitle = 'Vegas Golden Knights vs Calgary Flames - NHL - Full Game Replay';
    const nhlTeams = extractTeamsFromTitle(nhlTitle);
    expect(nhlTeams).toEqual(['Vegas Golden Knights', 'Calgary Flames']);
  });

  test('LiveTVProvider normalizes NBA and NHL franchise names and formats clean titles', () => {
    const mockHtml = `
      <a class="main" href="/enx/videotourney/1/"><b>NHL</b></a>
      <table height=27>
        <tr>
          <td><b>Vegas&ndash;Calgary</b></td>
          <td><font color="#949494"><b>4:3</b></font></td>
          <td><span class="date">02:00</span></td>
          <td><a class="small" href="/enx/showvideo/123_vegas_calgary">Highlights</a></td>
        </tr>
      </table>
      <table height=27>
        <tr>
          <td><b>Edmonton&ndash;Utah Mammoth</b></td>
          <td><font color="#949494"><b>3:1</b></font></td>
          <td><span class="date">03:00</span></td>
          <td><a class="small" href="/enx/showvideo/124_edm_uta">Highlights</a></td>
        </tr>
      </table>
      <a class="main" href="/enx/videotourney/2/"><b>NBA Preseason</b></a>
      <table height=27>
        <tr>
          <td><b>Houston&ndash;Oklahoma</b></td>
          <td><font color="#949494"><b>118:111</b></font></td>
          <td><span class="date">02:00</span></td>
          <td><a class="small" href="/enx/showvideo/456_hou_okc">Highlights</a></td>
        </tr>
      </table>
    `;

    const items = LiveTVProvider.parseArchive(mockHtml, '20261016');
    expect(items.length).toBe(3);

    expect(items[0].title).toBe('Vegas Golden Knights vs Calgary Flames - NHL');
    expect(items[0].team1).toEqual({ name: 'Vegas Golden Knights' });
    expect(items[0].team2).toEqual({ name: 'Calgary Flames' });
    expect(items[0].date).toBe('2026-10-16T02:00:00.000Z');

    expect(items[1].title).toBe('Edmonton Oilers vs Utah Hockey Club - NHL');
    expect(items[1].team1).toEqual({ name: 'Edmonton Oilers' });
    expect(items[1].team2).toEqual({ name: 'Utah Hockey Club' });

    expect(items[2].title).toBe('Houston Rockets vs Oklahoma City Thunder - NBA Preseason');
    expect(items[2].team1).toEqual({ name: 'Houston Rockets' });
    expect(items[2].team2).toEqual({ name: 'Oklahoma City Thunder' });
  });

  test('MatchAggregator seamlessly merges BasketballVideo and normalized LiveTV replay events', () => {
    const ma = new MatchAggregator({ cacheService: { getMatches: () => [] } });

    const bvMatch = {
      id: 'bv_oklahoma-city-thunder-vs-houston-rockets-nba-preseason',
      title: 'Oklahoma City Thunder vs Houston Rockets - NBA Preseason - Full Game Replay - October 15, 2026',
      category: 'basketball',
      league: 'NBA Preseason',
      date: '2026-10-15T00:00:00.000Z',
      status: 'finished',
      sources: [{ source: 'basketballvideo', id: 'https://basketball-video.com/okc-hou', name: 'Full Game Replay' }]
    };

    const livetvMatch = {
      id: 'livetv_houston-oklahoma-20261016',
      title: 'Houston Rockets vs Oklahoma City Thunder - NBA Preseason',
      category: 'basketball',
      league: 'NBA Preseason',
      date: '2026-10-16T02:00:00.000Z',
      status: 'finished',
      team1: { name: 'Houston Rockets' },
      team2: { name: 'Oklahoma City Thunder' },
      sources: [{ source: 'livetv', id: '/enx/showvideo/123_clip', name: 'Highlights' }]
    };

    expect(ma.isSameEvent(bvMatch, livetvMatch)).toBe(true);
  });

  test('MainstreamRankingService tiers NHL as MAINSTREAM and demotes minor/junior foreign leagues', () => {
    const nhl = { title: 'Vegas Golden Knights vs Calgary Flames - NHL', league: 'NHL', category: 'hockey' };
    const mhl = { title: 'Tolpar vs SKA-1946 - MHL', league: 'MHL', category: 'hockey' };
    const del = { title: 'Grizzlys Wolfsburg vs Krefeld Pinguine - DEL', league: 'DEL', category: 'hockey' };
    const extraliga = { title: 'Vitebsk vs Yunost Minsk - Extraleague', league: 'Extraleague', category: 'hockey' };

    expect(getMatchTier(nhl)).toBe(TIER.MAINSTREAM);
    expect(getMatchTier(mhl)).toBe(TIER.MINOR);
    expect(getMatchTier(del)).toBe(TIER.MINOR);
    expect(getMatchTier(extraliga)).toBe(TIER.MINOR);
  });

  test('BasketballVideoProvider includes homepage in endpoints array', () => {
    const bv = new BasketballVideoProvider();
    expect(bv.baseUrl).toBe('https://basketball-video.com');
  });

  test('LiveTVProvider normalizes Euroleague and Eurocup matches as basketball, never football', () => {
    const mockHtml = `
      <a class="main" href="/enx/videotourney/10/"><b>Euroleague</b></a>
      <table height=27>
        <tr>
          <td><b>Barcelona&ndash;Olympiacos</b></td>
          <td><font color="#949494"><b>86:78</b></font></td>
          <td><span class="date">20:30</span></td>
          <td><a class="small" href="/enx/showvideo/1598719_barcelona_olympiacos">Highlights</a></td>
        </tr>
      </table>
      <table height=27>
        <tr>
          <td><b>Besiktas&ndash;Bayern Munich</b></td>
          <td><font color="#949494"><b>77:82</b></font></td>
          <td><span class="date">21:00</span></td>
          <td><a class="small" href="/enx/showvideo/1598722_besiktas_bayern_munich">Highlights</a></td>
        </tr>
      </table>
      <a class="main" href="/enx/videotourney/11/"><b>Eurocup</b></a>
      <table height=27>
        <tr>
          <td><b>London Lions&ndash;Skyliners</b></td>
          <td><font color="#949494"><b>91:80</b></font></td>
          <td><span class="date">19:30</span></td>
          <td><a class="small" href="/enx/showvideo/1598730_london_skyliners">Highlights</a></td>
        </tr>
      </table>
    `;

    const items = LiveTVProvider.parseArchive(mockHtml, '20261016');
    expect(items.length).toBe(3);

    expect(items[0].title).toBe('Barcelona vs Olympiacos - Euroleague');
    expect(items[0].category).toBe('basketball');

    expect(items[1].title).toBe('Besiktas vs Bayern Munich - Euroleague');
    expect(items[1].category).toBe('basketball');

    expect(items[2].title).toBe('London Lions vs Skyliners - Eurocup');
    expect(items[2].category).toBe('basketball');
  });
});

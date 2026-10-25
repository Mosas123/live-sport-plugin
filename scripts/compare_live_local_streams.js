'use strict';

const LOCAL_BASE = 'http://127.0.0.1:7000';
const LIVE_BASE = 'https://nuviosports.xyz';

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    return null;
  }
}

async function run() {
  console.log('Fetching Server Health & Catalogs...');

  const [localHealth, liveHealth] = await Promise.all([
    fetchJson(`${LOCAL_BASE}/health`),
    fetchJson(`${LIVE_BASE}/health`)
  ]);

  const [localLiveCat, liveLiveCat, localNetCat, liveNetCat] = await Promise.all([
    fetchJson(`${LOCAL_BASE}/catalog/tv/nuvio_sports_live.json`),
    fetchJson(`${LIVE_BASE}/catalog/tv/nuvio_sports_live.json`),
    fetchJson(`${LOCAL_BASE}/catalog/tv/nuvio_sports_networks.json`),
    fetchJson(`${LIVE_BASE}/catalog/tv/nuvio_sports_networks.json`)
  ]);

  console.log('\n======================================================');
  console.log('1. SERVER OVERVIEW');
  console.log('======================================================');
  console.log(`Local  (http://127.0.0.1:7000):`);
  console.log(`  - Uptime : ${localHealth ? localHealth.uptime : 'offline'}`);
  console.log(`  - Memory : ${localHealth && localHealth.memory ? localHealth.memory.rss : 'N/A'}`);
  console.log(`  - Cache  : ${localHealth && localHealth.streamResolveCache ? localHealth.streamResolveCache.entries : 0} stream entries`);
  console.log(`Live   (https://nuviosports.xyz):`);
  console.log(`  - Uptime : ${liveHealth ? liveHealth.uptime : 'offline'}`);
  console.log(`  - Memory : ${liveHealth && liveHealth.memory ? liveHealth.memory.rss : 'N/A'}`);
  console.log(`  - Cache  : ${liveHealth && liveHealth.streamResolveCache ? liveHealth.streamResolveCache.entries : 0} stream entries`);

  console.log('\n======================================================');
  console.log('2. CATALOG CARD COUNTS');
  console.log('======================================================');
  console.log(`Category                | Local Count | Live Count`);
  console.log(`------------------------------------------------------`);
  console.log(`Live Sports Fixtures    | ${(localLiveCat?.metas?.length ?? 0).toString().padEnd(11)} | ${(liveLiveCat?.metas?.length ?? 0).toString().padEnd(10)}`);
  console.log(`24/7 TV Networks        | ${(localNetCat?.metas?.length ?? 0).toString().padEnd(11)} | ${(liveNetCat?.metas?.length ?? 0).toString().padEnd(10)}`);

  console.log('\n======================================================');
  console.log('3. MAINSTREAM 24/7 CHANNELS STREAM COMPARISON');
  console.log('======================================================');

  const TARGET_CHANNELS = [
    { query: 'tnt 1', label: 'TNT Sports 1' },
    { query: 'sky sports f1', label: 'Sky Sports F1' },
    { query: 'astro cricket', label: 'Astro Cricket' },
    { query: 'cartoonito', label: 'Cartoonito' },
    { query: 'canal+ premier league', label: 'Canal+ Premier League' },
    { query: 'dazn ligue 1 live 1', label: 'DAZN Ligue 1 Live 1' }
  ];

  const localMetas = localNetCat?.metas || [];
  const liveMetas = liveNetCat?.metas || [];

  for (const target of TARGET_CHANNELS) {
    const tokens = target.query.toLowerCase().split(/\s+/);
    const findCardFromList = (list) => list.find(m => {
      const name = (m.name || '').toLowerCase();
      return tokens.every(t => name.includes(t));
    });

    let localCard = findCardFromList(localMetas);
    let liveCard = findCardFromList(liveMetas);

    // If not on page 1, query search endpoint
    if (!localCard) {
      const searchRes = await fetchJson(`${LOCAL_BASE}/catalog/tv/nuvio_sports_networks/search=${encodeURIComponent(target.query)}.json`);
      if (searchRes?.metas?.length) localCard = searchRes.metas[0];
    }
    if (!liveCard) {
      const searchRes = await fetchJson(`${LIVE_BASE}/catalog/tv/nuvio_sports_networks/search=${encodeURIComponent(target.query)}.json`);
      if (searchRes?.metas?.length) liveCard = searchRes.metas[0];
    }

    console.log(`\n📺 CHANNEL: ${target.label}`);
    console.log(`   - Local Card: ${localCard ? `${localCard.name} (${localCard.id})` : 'NOT FOUND'}`);
    console.log(`   - Live Card : ${liveCard ? `${liveCard.name} (${liveCard.id})` : 'NOT FOUND'}`);

    const [localStreamsRes, liveStreamsRes] = await Promise.all([
      localCard ? fetchJson(`${LOCAL_BASE}/stream/tv/${encodeURIComponent(localCard.id)}.json`, 15000) : null,
      liveCard ? fetchJson(`${LIVE_BASE}/stream/tv/${encodeURIComponent(liveCard.id)}.json`, 15000) : null
    ]);

    const localStreams = localStreamsRes?.streams || [];
    const liveStreams = liveStreamsRes?.streams || [];

    console.log(`   - Total Streams: Local = ${localStreams.length} | Live = ${liveStreams.length}`);

    const getProviderSummary = (streams) => {
      const counts = {};
      for (const s of streams) {
        let p = 'Other';
        const t = (s.title || s.name || '');
        if (/vavoo/i.test(t)) p = 'Vavoo';
        else if (/daddylive/i.test(t)) p = 'DaddyLive';
        else if (/cdnlive/i.test(t)) p = 'CDNLiveTV';
        else if (/sktech|sk tech/i.test(t)) p = 'SKTech';
        else if (/damitv/i.test(t)) p = 'DamiTV';
        else if (/streamed/i.test(t)) p = 'StreamedPk';
        counts[p] = (counts[p] || 0) + 1;
      }
      return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none';
    };

    console.log(`   - Local Providers: ${getProviderSummary(localStreams)}`);
    console.log(`   - Live Providers : ${getProviderSummary(liveStreams)}`);

    // Sample top stream title from each
    if (localStreams.length > 0) {
      console.log(`   - Local Top Stream: "${localStreams[0].title?.split('\n')[0]}"`);
    }
    if (liveStreams.length > 0) {
      console.log(`   - Live Top Stream : "${liveStreams[0].title?.split('\n')[0]}"`);
    }

    // Check for em-dash presence in titles
    const hasEmDashLocal = localStreams.some(s => (s.title || '').includes('—') || (s.title || '').includes('---'));
    const hasEmDashLive = liveStreams.some(s => (s.title || '').includes('—') || (s.title || '').includes('---'));
    console.log(`   - Em-Dash In Titles: Local = ${hasEmDashLocal ? 'YES' : 'NO'} | Live = ${hasEmDashLive ? 'YES' : 'NO'}`);
  }

  console.log('\n======================================================');
  console.log('COMPARISON COMPLETE');
  console.log('======================================================\n');
}

run().catch(console.error);

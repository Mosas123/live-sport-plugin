'use strict';

/**
 * scripts/deep-compare-live-vs-local.js
 *
 * Exhaustive comparison between:
 *  - REMOTE PRODUCTION: https://nuviosports.xyz
 *  - LOCAL DEVELOPMENT: http://localhost:7000
 */

const fs = require('fs');
const path = require('path');

const REMOTE = 'https://nuviosports.xyz';
const LOCAL = 'http://localhost:7000';

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const elapsed = Date.now() - started;
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, status: res.status, elapsed, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, status: res.status, elapsed, data };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, elapsed: Date.now() - started, error: err.message };
  }
}

async function run() {
  console.log('========================================================================');
  console.log('   DEEP BENCHMARK & COMPARISON: REMOTE vs LOCAL');
  console.log(`   Remote (Prod): ${REMOTE}`);
  console.log(`   Local (Dev)  : ${LOCAL}`);
  console.log('========================================================================\n');

  const report = {
    timestamp: new Date().toISOString(),
    catalogs: {},
    astroCricket: {},
    channelDeduplication: {},
    daddyLiveFixtures: {},
    streamComparison: []
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Catalogs Count & Latency Comparison
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Comparing Catalogs (Live, 24/7 TV, Upcoming, Sport Categories) ---');
  const catalogList = [
    { id: 'nuvio_sports_live', name: 'Live Now' },
    { id: 'nuvio_sports_networks', name: '24/7 TV Channels' },
    { id: 'nuvio_sports_upcoming', name: 'Upcoming Fixtures' },
    { id: 'nuvio_sports_football', name: 'Soccer / Football' },
    { id: 'nuvio_sports_cricket', name: 'Cricket' },
    { id: 'nuvio_sports_tennis', name: 'Tennis' },
    { id: 'nuvio_sports_motorsport', name: 'Motorsport' },
    { id: 'nuvio_sports_basketball', name: 'Basketball' },
    { id: 'nuvio_sports_other', name: 'Other Sports' }
  ];

  for (const cat of catalogList) {
    const remoteUrl = `${REMOTE}/catalog/tv/${cat.id}.json`;
    const localUrl = `${LOCAL}/catalog/tv/${cat.id}.json`;

    const [remoteRes, localRes] = await Promise.all([
      fetchJson(remoteUrl),
      fetchJson(localUrl)
    ]);

    const remoteCount = remoteRes.ok && remoteRes.data && Array.isArray(remoteRes.data.metas) ? remoteRes.data.metas.length : 0;
    const localCount = localRes.ok && localRes.data && Array.isArray(localRes.data.metas) ? localRes.data.metas.length : 0;

    report.catalogs[cat.name] = {
      remote: { count: remoteCount, elapsed: remoteRes.elapsed, ok: remoteRes.ok },
      local: { count: localCount, elapsed: localRes.elapsed, ok: localRes.ok }
    };

    console.log(`[${cat.name}]`);
    console.log(`  Remote: ${remoteCount} items (${remoteRes.elapsed}ms)`);
    console.log(`  Local : ${localCount} items (${localRes.elapsed}ms)`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Astro Cricket Duplicate Card Analysis
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Checking Astro Cricket Card Deduplication in 24/7 Networks ---');
  const searchAstroRemote = `${REMOTE}/catalog/tv/nuvio_sports_networks/search=Astro%20Cricket.json`;
  const searchAstroLocal = `${LOCAL}/catalog/tv/nuvio_sports_networks/search=Astro%20Cricket.json`;

  const [astroRemRes, astroLocRes] = await Promise.all([
    fetchJson(searchAstroRemote),
    fetchJson(searchAstroLocal)
  ]);

  const astroRemMetas = astroRemRes.ok && astroRemRes.data?.metas ? astroRemRes.data.metas : [];
  const astroLocMetas = astroLocRes.ok && astroLocRes.data?.metas ? astroLocRes.data.metas : [];

  report.astroCricket = {
    remoteCards: astroRemMetas.map(m => ({ id: m.id, name: m.name })),
    localCards: astroLocMetas.map(m => ({ id: m.id, name: m.name }))
  };

  console.log(`  Remote Astro Cricket cards count: ${astroRemMetas.length}`);
  astroRemMetas.forEach((m, i) => console.log(`    ${i + 1}. [${m.id}] ${m.name}`));

  console.log(`  Local Astro Cricket cards count : ${astroLocMetas.length}`);
  astroLocMetas.forEach((m, i) => console.log(`    ${i + 1}. [${m.id}] ${m.name}`));

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Channel Deduplication Samples (Cartoonito, Sky Sports, beIN)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Channel Deduplication Sample Checks (Cartoonito, Sky Sports, TNT) ---');
  const testChannels = ['Cartoonito', 'Sky Sports Premier League', 'TNT Sports 1'];
  for (const chName of testChannels) {
    const enc = encodeURIComponent(chName);
    const [rRes, lRes] = await Promise.all([
      fetchJson(`${REMOTE}/catalog/tv/nuvio_sports_networks/search=${enc}.json`),
      fetchJson(`${LOCAL}/catalog/tv/nuvio_sports_networks/search=${enc}.json`)
    ]);
    const rMetas = rRes.ok && rRes.data?.metas ? rRes.data.metas : [];
    const lMetas = lRes.ok && lRes.data?.metas ? lRes.data.metas : [];
    report.channelDeduplication[chName] = {
      remoteCount: rMetas.length,
      localCount: lMetas.length,
      remoteCards: rMetas.map(m => m.name),
      localCards: lMetas.map(m => m.name)
    };
    console.log(`[${chName}]`);
    console.log(`  Remote: ${rMetas.length} card(s) -> ${rMetas.map(m => m.name).join(' | ')}`);
    console.log(`  Local : ${lMetas.length} card(s) -> ${lMetas.map(m => m.name).join(' | ')}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. DaddyLive Fixture Population & Categorization Check
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. DaddyLive Fixtures & Category Allocation ---');
  // Check live catalog items for dlv sources or IDs
  const liveCatLocal = await fetchJson(`${LOCAL}/catalog/tv/nuvio_sports_live.json`);
  const upcomingCatLocal = await fetchJson(`${LOCAL}/catalog/tv/nuvio_sports_upcoming.json`);
  const liveCatRemote = await fetchJson(`${REMOTE}/catalog/tv/nuvio_sports_live.json`);
  const upcomingCatRemote = await fetchJson(`${REMOTE}/catalog/tv/nuvio_sports_upcoming.json`);

  const countDlv = (metas) => metas.filter(m => String(m.id || '').includes('dlv_')).length;

  const dlvLiveLocal = countDlv(liveCatLocal.data?.metas || []);
  const dlvLiveRemote = countDlv(liveCatRemote.data?.metas || []);
  const dlvUpLocal = countDlv(upcomingCatLocal.data?.metas || []);
  const dlvUpRemote = countDlv(upcomingCatRemote.data?.metas || []);

  report.daddyLiveFixtures = {
    live: { local: dlvLiveLocal, remote: dlvLiveRemote },
    upcoming: { local: dlvUpLocal, remote: dlvUpRemote }
  };
  console.log(`  Live DaddyLive-exclusive cards:   Local = ${dlvLiveLocal} | Remote = ${dlvLiveRemote}`);
  console.log(`  Upcoming DaddyLive-exclusive cards: Local = ${dlvUpLocal} | Remote = ${dlvUpRemote}`);

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Stream Resolution & Title Formatting Comparison
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Stream Resolution & Label Formatting Comparison ---');
  
  // Pick a few representative cards to resolve streams on both
  // 1. Astro Cricket
  // 2. ABC USA / CBS (popular 24/7 channel)
  // 3. First live match available on both
  const streamTargets = [];
  if (astroLocMetas.length > 0) {
    streamTargets.push({
      label: 'Astro Cricket',
      localId: astroLocMetas[0].id,
      remoteId: astroRemMetas[0]?.id || astroLocMetas[0].id
    });
  }

  // Find ABC USA or a DaddyLive channel
  const abcLocal = await fetchJson(`${LOCAL}/catalog/tv/nuvio_sports_networks/search=ABC%20USA.json`);
  const abcRemote = await fetchJson(`${REMOTE}/catalog/tv/nuvio_sports_networks/search=ABC%20USA.json`);
  if (abcLocal.ok && abcLocal.data?.metas?.length > 0) {
    streamTargets.push({
      label: 'ABC USA',
      localId: abcLocal.data.metas[0].id,
      remoteId: abcRemote.data?.metas?.[0]?.id || abcLocal.data.metas[0].id
    });
  }

  // Pick 2 live matches
  const liveLocalMetas = liveCatLocal.data?.metas || [];
  const liveRemoteMetas = liveCatRemote.data?.metas || [];
  if (liveLocalMetas.length > 0) {
    streamTargets.push({
      label: `Live Fixture: ${liveLocalMetas[0].name}`,
      localId: liveLocalMetas[0].id,
      remoteId: liveRemoteMetas.find(m => m.name === liveLocalMetas[0].name)?.id || liveLocalMetas[0].id
    });
  }
  if (liveLocalMetas.length > 1) {
    streamTargets.push({
      label: `Live Fixture: ${liveLocalMetas[1].name}`,
      localId: liveLocalMetas[1].id,
      remoteId: liveRemoteMetas.find(m => m.name === liveLocalMetas[1].name)?.id || liveLocalMetas[1].id
    });
  }

  for (const target of streamTargets) {
    console.log(`\nResolving streams for: ${target.label}`);
    console.log(`  Local ID:  ${target.localId}`);
    console.log(`  Remote ID: ${target.remoteId}`);

    const [remStreamRes, locStreamRes] = await Promise.all([
      fetchJson(`${REMOTE}/stream/tv/${target.remoteId}.json`),
      fetchJson(`${LOCAL}/stream/tv/${target.localId}.json`)
    ]);

    const remStreams = remStreamRes.ok && Array.isArray(remStreamRes.data?.streams) ? remStreamRes.data.streams : [];
    const locStreams = locStreamRes.ok && Array.isArray(locStreamRes.data?.streams) ? locStreamRes.data.streams : [];

    const streamComparisonEntry = {
      target: target.label,
      localId: target.localId,
      remoteId: target.remoteId,
      remote: { count: remStreams.length, elapsed: remStreamRes.elapsed, samples: remStreams.slice(0, 3).map(s => ({ name: s.name, title: s.title })) },
      local: { count: locStreams.length, elapsed: locStreamRes.elapsed, samples: locStreams.slice(0, 3).map(s => ({ name: s.name, title: s.title })) }
    };
    report.streamComparison.push(streamComparisonEntry);

    console.log(`  Remote Streams: ${remStreams.length} (${remStreamRes.elapsed}ms)`);
    remStreams.slice(0, 2).forEach((s, i) => {
      console.log(`    [Remote ${i + 1}] Name: ${s.name} | Title: ${JSON.stringify(s.title)}`);
    });

    console.log(`  Local Streams : ${locStreams.length} (${locStreamRes.elapsed}ms)`);
    locStreams.slice(0, 2).forEach((s, i) => {
      console.log(`    [Local ${i + 1}] Name: ${s.name} | Title: ${JSON.stringify(s.title)}`);
    });
  }

  // Save report to docs/deep_comparison_report.json
  const reportPath = path.resolve(__dirname, '../docs/deep_comparison_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n========================================================================`);
  console.log(`Detailed JSON report written to: ${reportPath}`);
  console.log(`========================================================================\n`);
}

run().catch(console.error);

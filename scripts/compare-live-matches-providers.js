#!/usr/bin/env node
'use strict';

/**
 * scripts/compare-live-matches-providers.js
 *
 * Fast comparison of ONLY LIVE MATCHES between Live Hosted and Local Host:
 *  - Live Hosted: https://nuviosports.xyz
 *  - Local Host:  http://localhost:7000
 *
 * Breaks down streams per match and provider-wise.
 */

const LIVE_HOST = (process.env.LIVE_HOST || 'https://nuviosports.xyz').replace(/\/+$/, '');
const LOCAL_HOST = (process.env.LOCAL_HOST || 'http://localhost:7000').replace(/\/+$/, '');
const LIMIT = parseInt(process.env.LIMIT || '15', 10); // test top 15 live matches by default

function detectProvider(s) {
  if (!s) return null;
  if (s.name && s.name.includes('Support Us')) return null;
  const combined = `${s.name || ''} ${s.title || ''}`.toLowerCase();
  
  if (combined.includes('vavoo') || (s.url && s.url.includes('/sunshine/'))) return 'Vavoo';
  if (combined.includes('daddylive') || combined.includes('dlhd')) return 'DaddyLive';
  if (combined.includes('streamed.pk') || combined.includes('streamed') || (s.url && s.url.includes('damitv'))) return 'Streamed';
  if (combined.includes('topembed')) return 'TopEmbed';
  if (combined.includes('watchfooty')) return 'WatchFooty';
  if (combined.includes('strikeout')) return 'StrikeOut';
  if (combined.includes('sktech') || combined.includes('fancode')) return 'SKTech';
  return 'Other';
}

function countProviders(streams) {
  const counts = {};
  for (const s of streams) {
    const prov = detectProvider(s);
    if (!prov) continue;
    counts[prov] = (counts[prov] || 0) + 1;
  }
  return counts;
}

function formatCounts(counts) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'None';
  return entries.map(([p, n]) => `${p}: ${n}`).join(', ');
}

async function run() {
  console.log('\n========================================================================================');
  console.log('       LIVE MATCHES PROVIDER-WISE COMPARISON: LIVE HOSTED vs LOCAL HOST');
  console.log(`       Live:  ${LIVE_HOST}`);
  console.log(`       Local: ${LOCAL_HOST}`);
  console.log('========================================================================================\n');

  console.log('1. Fetching live matches from /catalog/tv/nuvio_sports_live.json...');
  const [liveCatRes, localCatRes] = await Promise.all([
    fetch(`${LIVE_HOST}/catalog/tv/nuvio_sports_live.json`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => ({ metas: [] })),
    fetch(`${LOCAL_HOST}/catalog/tv/nuvio_sports_live.json`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => ({ metas: [] }))
  ]);

  const liveMetas = liveCatRes.metas || [];
  const localMetas = localCatRes.metas || [];

  console.log(`  Live Hosted: ${liveMetas.length} live matches`);
  console.log(`  Local Host:  ${localMetas.length} live matches\n`);

  if (localMetas.length === 0) {
    console.log('No live matches found on local host. Exiting.');
    return;
  }

  // Sample top matches
  const sampleMatches = localMetas.slice(0, LIMIT);
  console.log(`2. Evaluating top ${sampleMatches.length} live matches provider-wise...\n`);

  const summary = {
    live: { total: 0, byProvider: {} },
    local: { total: 0, byProvider: {} }
  };

  const rows = [];

  for (let i = 0; i < sampleMatches.length; i++) {
    const m = sampleMatches[i];
    const matchName = (m.name || m.title || m.id).replace('🔴 LIVE: ', '').trim();
    const streamPath = `/stream/tv/${encodeURIComponent(m.id)}.json`;

    // Fetch stream from both in parallel
    const [liveRes, localRes] = await Promise.all([
      fetch(`${LIVE_HOST}${streamPath}`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => ({ streams: [] })),
      fetch(`${LOCAL_HOST}${streamPath}`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => ({ streams: [] }))
    ]);

    const liveStreams = (liveRes.streams || []).filter(s => s && !s.name?.includes('Support Us'));
    const localStreams = (localRes.streams || []).filter(s => s && !s.name?.includes('Support Us'));

    const liveProvCounts = countProviders(liveStreams);
    const localProvCounts = countProviders(localStreams);

    // Update totals
    summary.live.total += liveStreams.length;
    for (const [p, c] of Object.entries(liveProvCounts)) {
      summary.live.byProvider[p] = (summary.live.byProvider[p] || 0) + c;
    }

    summary.local.total += localStreams.length;
    for (const [p, c] of Object.entries(localProvCounts)) {
      summary.local.byProvider[p] = (summary.local.byProvider[p] || 0) + c;
    }

    rows.push({
      index: i + 1,
      match: matchName.length > 38 ? matchName.slice(0, 35) + '...' : matchName,
      liveCount: liveStreams.length,
      liveProv: formatCounts(liveProvCounts),
      localCount: localStreams.length,
      localProv: formatCounts(localProvCounts)
    });
  }

  // Print Match by Match table
  console.log('┌────┬──────────────────────────────────────┬──────┬─────────────────────────────┬──────┬─────────────────────────────┐');
  console.log('│ #  │ Match                                │ Live │ Live Providers              │ Loc  │ Local Providers             │');
  console.log('├────┼──────────────────────────────────────┼──────┼─────────────────────────────┼──────┼─────────────────────────────┤');

  for (const r of rows) {
    const idx = String(r.index).padEnd(2);
    const match = r.match.padEnd(36);
    const lCnt = String(r.liveCount).padStart(4);
    const lPrv = r.liveProv.slice(0, 27).padEnd(27);
    const locCnt = String(r.localCount).padStart(4);
    const locPrv = r.localProv.slice(0, 27).padEnd(27);
    console.log(`│ ${idx} │ ${match} │ ${lCnt} │ ${lPrv} │ ${locCnt} │ ${locPrv} │`);
  }

  console.log('└────┴──────────────────────────────────────┴──────┴─────────────────────────────┴──────┴─────────────────────────────┘\n');

  // Print Aggregate Provider Summary
  console.log('========================================================================================');
  console.log('                            AGGREGATE PROVIDER SUMMARY                                 ');
  console.log('========================================================================================');

  const allProviders = new Set([
    ...Object.keys(summary.live.byProvider),
    ...Object.keys(summary.local.byProvider)
  ]);

  console.log('┌──────────────────────┬──────────────────────┬──────────────────────┬──────────────────┐');
  console.log('│ Provider             │ Live Hosted Streams  │ Local Host Streams   │ Difference       │');
  console.log('├──────────────────────┼──────────────────────┼──────────────────────┼──────────────────┤');

  for (const p of [...allProviders].sort()) {
    const liveCnt = summary.live.byProvider[p] || 0;
    const localCnt = summary.local.byProvider[p] || 0;
    const diff = localCnt - liveCnt;
    const diffStr = diff > 0 ? `+${diff} (more)` : (diff < 0 ? `${diff}` : 'Parity');
    console.log(`│ ${p.padEnd(20)} │ ${String(liveCnt).padStart(20)} │ ${String(localCnt).padStart(20)} │ ${diffStr.padStart(16)} │`);
  }

  console.log('├──────────────────────┼──────────────────────┼──────────────────────┼──────────────────┤');
  const totalDiff = summary.local.total - summary.live.total;
  const totalDiffStr = totalDiff > 0 ? `+${totalDiff} (more)` : (totalDiff < 0 ? `${totalDiff}` : 'Parity');
  console.log(`│ TOTAL STREAMS        │ ${String(summary.live.total).padStart(20)} │ ${String(summary.local.total).padStart(20)} │ ${totalDiffStr.padStart(16)} │`);
  console.log('└──────────────────────┴──────────────────────┴──────────────────────┴──────────────────┘\n');
}

run().catch(err => {
  console.error('Comparison error:', err.message);
});

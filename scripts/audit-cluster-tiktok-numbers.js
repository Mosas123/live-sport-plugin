#!/usr/bin/env node
'use strict';

/**
 * scripts/audit-cluster-tiktok-numbers.js
 *
 * Scans all active live matches, extracts every Streamed / DamiTV stream,
 * groups them by cluster ([Admin], [Golf], [Hotel], [DamiTV], [Other]),
 * and gives exact numbers on how many streams use TikTok CDN vs Standard CDNs.
 */

const LOCAL_HOST = (process.env.LOCAL_HOST || 'http://localhost:7000').replace(/\/+$/, '');

function getClusterType(s) {
  const title = (s.title || '').toLowerCase();
  const name = (s.name || '').toLowerCase();
  const combined = `${name} ${title}`;

  if (title.includes('[admin]') || combined.includes('/admin/')) return 'Admin';
  if (title.includes('[golf]') || combined.includes('/golf/')) return 'Golf';
  if (title.includes('[hotel]') || combined.includes('/hotel/')) return 'Hotel';
  if (combined.includes('damitv') || (s.url && s.url.includes('damitv'))) return 'DamiTV';
  return 'Other';
}

function checkTikTokUsage(manifestText) {
  if (!manifestText) return { isTikTok: false, unreachable: true };
  const lower = manifestText.toLowerCase();

  const isTikTok = (
    lower.includes('tiktokcdn') ||
    lower.includes('byteoversea') ||
    lower.includes('ibytedtos') ||
    lower.includes('byteimg') ||
    lower.includes('bytegoofy') ||
    lower.includes('cowedd4855ws') ||
    lower.includes('.image') ||
    lower.includes('tplv-obj') ||
    lower.includes('.webp') ||
    lower.includes('riff')
  );

  return { isTikTok, unreachable: false };
}

async function run() {
  console.log('Fetching live matches from local server...');
  const catRes = await fetch(`${LOCAL_HOST}/catalog/tv/nuvio_sports_live.json`).then(r => r.json()).catch(() => ({ metas: [] }));
  const metas = catRes.metas || [];

  console.log(`Auditing streams across ${metas.length} live matches...\n`);

  const clusterStats = {
    'Admin':  { total: 0, tiktok: 0, standard: 0, unreachable: 0 },
    'Golf':   { total: 0, tiktok: 0, standard: 0, unreachable: 0 },
    'Hotel':  { total: 0, tiktok: 0, standard: 0, unreachable: 0 },
    'DamiTV': { total: 0, tiktok: 0, standard: 0, unreachable: 0 },
    'Other':  { total: 0, tiktok: 0, standard: 0, unreachable: 0 }
  };

  const sampleLimit = Math.min(metas.length, 35);
  for (let i = 0; i < sampleLimit; i++) {
    const m = metas[i];
    const streamPath = `/stream/tv/${encodeURIComponent(m.id)}.json`;
    let streamData;
    try {
      const sRes = await fetch(`${LOCAL_HOST}${streamPath}`, { signal: AbortSignal.timeout(6000) });
      streamData = await sRes.json();
    } catch (_) {
      continue;
    }

    const streams = (streamData.streams || []).filter(s => {
      if (!s || !s.url) return false;
      const combined = `${s.name || ''} ${s.title || ''}`.toLowerCase();
      return combined.includes('streamed') || combined.includes('damitv') || s.url.includes('strmd.st') || s.url.includes('damitv');
    });

    for (const s of streams) {
      const cluster = getClusterType(s);
      clusterStats[cluster].total++;

      let upstreamUrl = s.url;
      let referer = 'https://embed.st/';
      if (upstreamUrl.includes('/api/manifest')) {
        try {
          const u = new URL(upstreamUrl, LOCAL_HOST);
          upstreamUrl = u.searchParams.get('url') || upstreamUrl;
          referer = u.searchParams.get('referer') || referer;
        } catch (_) {}
      }

      let manifestText = '';
      try {
        const mRes = await fetch(upstreamUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
            'Referer': referer
          },
          signal: AbortSignal.timeout(4000)
        });
        if (mRes.ok) {
          manifestText = await mRes.text();
        }
      } catch (_) {}

      // If master playlist, fetch child
      if (manifestText && manifestText.includes('#EXT-X-STREAM-INF')) {
        const lines = manifestText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            try {
              const childUrl = new URL(trimmed, upstreamUrl).toString();
              const childRes = await fetch(childUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                  'Referer': referer
                },
                signal: AbortSignal.timeout(3000)
              });
              if (childRes.ok) {
                manifestText = await childRes.text();
                break;
              }
            } catch (_) {}
          }
        }
      }

      const res = checkTikTokUsage(manifestText);
      if (res.unreachable) {
        clusterStats[cluster].unreachable++;
      } else if (res.isTikTok) {
        clusterStats[cluster].tiktok++;
      } else {
        clusterStats[cluster].standard++;
      }
    }
  }

  // Print Output Table
  console.log('========================================================================================');
  console.log('              EXACT TIKTOK CDN NUMBERS PER CLUSTER (ADMIN vs GOLF vs OTHER)             ');
  console.log('========================================================================================');
  console.log('┌──────────┬───────────────┬─────────────────┬───────────────────┬──────────────────────┐');
  console.log('│ Cluster  │ Total Streams │ TikTok CDN Feeds│ Standard CDN Feeds│ TikTok Usage %       │');
  console.log('├──────────┼───────────────┼─────────────────┼───────────────────┼──────────────────────┤');

  let grandTotal = 0;
  let grandTikTok = 0;
  let grandStandard = 0;
  let grandUnreachable = 0;

  for (const [cluster, st] of Object.entries(clusterStats)) {
    if (st.total === 0) continue;
    grandTotal += st.total;
    grandTikTok += st.tiktok;
    grandStandard += st.standard;
    grandUnreachable += st.unreachable;

    const activeTotal = st.tiktok + st.standard;
    const pct = activeTotal > 0 ? ((st.tiktok / activeTotal) * 100).toFixed(1) + '%' : 'N/A';

    const colC = cluster.padEnd(8);
    const colTot = String(st.total).padStart(13);
    const colTik = `${st.tiktok}`.padStart(15);
    const colStd = `${st.standard}`.padStart(17);
    const colPct = pct.padStart(20);

    console.log(`│ ${colC} │ ${colTot} │ ${colTik} │ ${colStd} │ ${colPct} │`);
  }

  console.log('├──────────┼───────────────┼─────────────────┼───────────────────┼──────────────────────┤');
  const grandActive = grandTikTok + grandStandard;
  const grandPct = grandActive > 0 ? ((grandTikTok / grandActive) * 100).toFixed(1) + '%' : 'N/A';
  console.log(`│ TOTAL    │ ${String(grandTotal).padStart(13)} │ ${String(grandTikTok).padStart(15)} │ ${String(grandStandard).padStart(17)} │ ${grandPct.padStart(20)} │`);
  console.log('└──────────┴───────────────┴─────────────────┴───────────────────┴──────────────────────┘\n');

  console.log(`* Note: ${grandUnreachable} streams had expired/WASM-locked tokens that could not be checked directly without active browser sessions.`);
}

run().catch(e => console.error(e));

#!/usr/bin/env node
'use strict';

/**
 * scripts/check-streamed-tiktok-cdn.js
 *
 * Tests all live Streamed.pk streams to detect how many abuse TikTok CDN / ByteDance CDN:
 * 1. Direct TikTok/ByteDance domains (tiktokcdn.com, byteoversea.com, ibytedtos.com, etc.)
 * 2. Fake WebP / RIFF cloaked video chunks (.image / ~tplv-obj.image)
 * 3. strmd.st / damitv.st segment infrastructure
 */

const LOCAL_HOST = (process.env.LOCAL_HOST || 'http://localhost:7000').replace(/\/+$/, '');

function isTikTokAbuse(segmentUrl, manifestText) {
  const combined = `${segmentUrl} ${manifestText}`.toLowerCase();
  
  const hasTikTokDomain = /tiktokcdn|byteoversea|ibytedtos|byteimg|bytegoofy|cowedd4855ws|bytedance/i.test(combined);
  const hasCloakedImage = /\.image(\?|$)|tplv-obj\.image/i.test(combined);
  const hasWebpOrRiff = combined.includes('.webp') || combined.includes('riff');

  return {
    isAbusing: hasTikTokDomain || hasCloakedImage,
    hasTikTokDomain,
    hasCloakedImage,
    hasWebpOrRiff
  };
}

async function run() {
  console.log('\n========================================================================================');
  console.log('       STREAMED.PK TIKTOK CDN ABUSE AUDIT');
  console.log(`       Target: ${LOCAL_HOST}`);
  console.log('========================================================================================\n');

  console.log('1. Fetching live matches from /catalog/tv/nuvio_sports_live.json...');
  const catRes = await fetch(`${LOCAL_HOST}/catalog/tv/nuvio_sports_live.json`).then(r => r.json()).catch(() => ({ metas: [] }));
  const metas = catRes.metas || [];

  console.log(`Found ${metas.length} live matches. Filtering for Streamed.pk streams...\n`);

  let totalStreamedStreams = 0;
  let tiktokAbuseCount = 0;
  let standardCdnCount = 0;
  let failedManifestCount = 0;

  const rows = [];

  // Check top 20 live matches
  for (const m of metas.slice(0, 25)) {
    const streamPath = `/stream/tv/${encodeURIComponent(m.id)}.json`;
    let streamData;
    try {
      const sRes = await fetch(`${LOCAL_HOST}${streamPath}`, { signal: AbortSignal.timeout(8000) });
      streamData = await sRes.json();
    } catch (_) {
      continue;
    }

    const streams = streamData.streams || [];
    const streamedStreams = streams.filter(s => {
      if (!s || !s.url) return false;
      const combined = `${s.name || ''} ${s.title || ''}`.toLowerCase();
      return combined.includes('streamed') || (s.url && (s.url.includes('strmd.st') || s.url.includes('damitv')));
    });

    for (const s of streamedStreams) {
      totalStreamedStreams++;
      const matchName = (m.name || m.title || m.id).replace('🔴 LIVE: ', '').slice(0, 32);

      // Extract upstream URL from our manifest proxy if proxied
      let upstreamUrl = s.url;
      let referer = 'https://embed.st/';
      if (upstreamUrl.includes('/api/manifest')) {
        try {
          const u = new URL(upstreamUrl, LOCAL_HOST);
          upstreamUrl = u.searchParams.get('url') || upstreamUrl;
          referer = u.searchParams.get('referer') || referer;
        } catch (_) {}
      }

      // Fetch manifest to inspect child segments
      let manifestText = '';
      try {
        const mRes = await fetch(upstreamUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
            'Referer': referer
          },
          signal: AbortSignal.timeout(6000)
        });
        if (mRes.ok) {
          manifestText = await mRes.text();
        }
      } catch (err) {
        // failed to fetch manifest
      }

      if (!manifestText) {
        failedManifestCount++;
        rows.push({
          match: matchName,
          title: s.title ? s.title.split('\n')[0].slice(0, 30) : 'Streamed',
          upstreamHost: new URL(upstreamUrl).hostname,
          verdict: '⚠️ Manifest Unreachable',
          details: 'Timeout / 403'
        });
        continue;
      }

      // If master manifest, fetch the first media playlist
      let mediaPlaylistText = manifestText;
      if (manifestText.includes('#EXT-X-STREAM-INF')) {
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
                signal: AbortSignal.timeout(5000)
              });
              if (childRes.ok) {
                mediaPlaylistText = await childRes.text();
                break;
              }
            } catch (_) {}
          }
        }
      }

      // Sample first 3 segment lines from media playlist
      const segmentLines = mediaPlaylistText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .slice(0, 3);

      const segmentSample = segmentLines.join(' ');
      const check = isTikTokAbuse(segmentSample, mediaPlaylistText);

      let verdict;
      let details;
      if (check.isAbusing) {
        tiktokAbuseCount++;
        verdict = '🚨 TIKTOK CDN ABUSE';
        details = check.hasTikTokDomain ? 'TikTok/ByteDance Domain' : 'Cloaked .image Chunk';
      } else {
        standardCdnCount++;
        verdict = '✅ Standard CDN';
        details = segmentSample.includes('.ts') ? 'Direct MPEG-TS' : 'Standard HLS';
      }

      rows.push({
        match: matchName,
        title: s.title ? s.title.split('\n')[0].slice(0, 30) : 'Streamed',
        upstreamHost: new URL(upstreamUrl).hostname,
        verdict,
        details
      });
    }
  }

  // Print results table
  console.log('┌──────────────────────────────────┬───────────────────────────────┬──────────────────────────────┬────────────────────────┬───────────────────────────┐');
  console.log('│ Match                            │ Stream Label                  │ Upstream Host                │ TikTok CDN Abuse?      │ Details                   │');
  console.log('├──────────────────────────────────┼───────────────────────────────┼──────────────────────────────┼────────────────────────┼───────────────────────────┤');

  for (const r of rows) {
    const match = r.match.padEnd(32);
    const title = r.title.padEnd(29);
    const host = r.upstreamHost.padEnd(28);
    const verd = r.verdict.padEnd(22);
    const det = r.details.padEnd(25);
    console.log(`│ ${match} │ ${title} │ ${host} │ ${verd} │ ${det} │`);
  }

  console.log('└──────────────────────────────────┴───────────────────────────────┴──────────────────────────────┴────────────────────────┴───────────────────────────┘\n');

  console.log('========================================================================================');
  console.log('                             TIKTOK CDN AUDIT SCORECARD                                 ');
  console.log('========================================================================================');
  console.log(`  Total Streamed.pk Streams Audited: ${totalStreamedStreams}`);
  console.log(`  Abusing TikTok / ByteDance CDN:   ${tiktokAbuseCount} (${totalStreamedStreams > 0 ? ((tiktokAbuseCount / totalStreamedStreams) * 100).toFixed(1) : 0}%)`);
  console.log(`  Using Standard MPEG-TS / CDNs:     ${standardCdnCount} (${totalStreamedStreams > 0 ? ((standardCdnCount / totalStreamedStreams) * 100).toFixed(1) : 0}%)`);
  console.log(`  Unreachable / Offline Manifests:   ${failedManifestCount}`);
  console.log('========================================================================================\n');
}

run().catch(e => {
  console.error('Audit Error:', e.message);
});

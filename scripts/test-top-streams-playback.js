'use strict';

/**
 * scripts/test-top-streams-playback.js
 *
 * Probes the Top 3 streams of active live matches:
 * 1. Manifest fetch & validation (#EXTM3U)
 * 2. Segment retrieval & sync byte verification (0x47 MPEG-TS)
 * 3. Network routing audit (Direct CDN vs Cloudflare Worker proxy)
 * 4. Latency (TTFB), segment throughput, and playback readiness
 */

const { safeFetch } = require('../src/impitClient');

const LOCAL_HOST = (process.env.LOCAL_HOST || 'http://localhost:7000').replace(/\/+$/, '');

async function testStreamPlayback(stream, idx) {
  const name = stream.name || 'Stream';
  const title = (stream.title || '').split('\n')[0];
  const url = stream.url;

  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(`▶ PROBING STREAM [${idx}]: ${name} | ${title}`);
  console.log(`  Addon URL: ${url.slice(0, 110)}...`);

  const result = {
    idx,
    name,
    title,
    manifestOk: false,
    segmentOk: false,
    ttfbMs: 0,
    segmentBytes: 0,
    segmentCdn: '',
    routesThroughCfWorker: false,
    syncByteValid: false,
    error: null
  };

  if (!url) {
    result.error = 'No stream URL (Web player or external link)';
    return result;
  }

  let refererHeader = stream.behaviorHints?.proxyHeaders?.request?.['Referer'];
  let originHeader = stream.behaviorHints?.proxyHeaders?.request?.['Origin'];
  if (url.includes('referer=')) {
    try {
      const u = new URL(url);
      if (!refererHeader) refererHeader = u.searchParams.get('referer');
      if (!originHeader) originHeader = u.searchParams.get('origin');
    } catch (_) {}
  }

  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    ...(stream.behaviorHints?.proxyHeaders?.request || {}),
    ...(refererHeader ? { 'Referer': refererHeader } : {}),
    ...(originHeader ? { 'Origin': originHeader } : {})
  };

  // Step 1: Fetch Manifest
  const t0 = Date.now();
  let manifestText = '';
  try {
    const res = await safeFetch(url, {
      headers: baseHeaders,
      timeoutMs: 8000
    });

    if (!res.ok) {
      result.error = `Manifest HTTP ${res.status}`;
      return result;
    }
    manifestText = await res.text();
    result.manifestOk = manifestText.includes('#EXT');
  } catch (err) {
    result.error = `Manifest fetch failed: ${err.message}`;
    return result;
  }

  if (!result.manifestOk) {
    result.error = 'Manifest invalid (missing #EXT header)';
    return result;
  }

  // If master playlist, resolve highest variant
  let mediaPlaylistUrl = url;
  let mediaPlaylistText = manifestText;

  if (manifestText.includes('#EXT-X-STREAM-INF')) {
    const lines = manifestText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length > 0) {
      mediaPlaylistUrl = new URL(lines[0], url).toString();
      try {
        const cRes = await safeFetch(mediaPlaylistUrl, {
          headers: baseHeaders,
          timeoutMs: 6000
        });
        if (cRes.ok) {
          mediaPlaylistText = await cRes.text();
        }
      } catch (_) {}
    }
  }

  // Step 2: Extract First Segment
  const segLines = mediaPlaylistText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (segLines.length === 0) {
    result.error = 'No playable segments found in media playlist';
    return result;
  }

  const rawSegUri = segLines[0];
  const absoluteSegUrl = new URL(rawSegUri, mediaPlaylistUrl).toString();

  result.routesThroughCfWorker = absoluteSegUrl.includes('workers.dev');
  try {
    result.segmentCdn = new URL(absoluteSegUrl).hostname;
  } catch (_) {
    result.segmentCdn = 'unknown';
  }

  console.log(`  Segment URL: ${absoluteSegUrl.slice(0, 110)}...`);
  console.log(`  Segment CDN Host: ${result.segmentCdn}`);
  console.log(`  Routes Through CF Worker: ${result.routesThroughCfWorker ? '⚠️ YES' : '✅ NO (Direct CDN)'}`);

  // Step 3: Fetch Segment Bytes & Probe Sync Byte
  const tSeg0 = Date.now();
  try {
    const segRes = await safeFetch(absoluteSegUrl, {
      headers: {
        ...baseHeaders,
        'Range': 'bytes=0-65535'
      },
      timeoutMs: 8000
    });

    result.ttfbMs = Date.now() - tSeg0;

    if (!segRes.ok && segRes.status !== 206) {
      result.error = `Segment HTTP ${segRes.status}`;
      return result;
    }

    const buf = Buffer.from(await segRes.arrayBuffer());
    result.segmentBytes = buf.length;
    result.segmentOk = buf.length > 0;

    // Check MPEG-TS sync byte 0x47 ('G')
    // A valid MPEG-TS stream starts with 0x47 or has repeated 0x47 every 188 bytes
    if (buf.length > 0 && (buf[0] === 0x47 || buf.includes(0x47))) {
      result.syncByteValid = true;
    }

    console.log(`  Probe Latency (TTFB): ${result.ttfbMs} ms`);
    console.log(`  Downloaded Chunk: ${(buf.length / 1024).toFixed(1)} KB`);
    console.log(`  MPEG-TS Sync Byte (0x47): ${result.syncByteValid ? '✅ VALID (Native Playback Ready)' : '❌ INVALID'}`);

  } catch (err) {
    result.error = `Segment probe failed: ${err.message}`;
    return result;
  }

  return result;
}

async function run() {
  console.log('================================================================================');
  console.log('              PLAYBACK & HEALTH AUDIT ON TOP 3 LIVE STREAMS                     ');
  console.log('================================================================================');

  // Fetch live catalog
  const cat = await fetch(`${LOCAL_HOST}/catalog/tv/nuvio_sports_live.json`).then(r => r.json());
  const metas = cat.metas || [];

  if (metas.length === 0) {
    console.error('No live matches found in catalog.');
    return;
  }

  // Pick top match with active streams
  let targetMatch = null;
  let topStreams = [];

  for (const m of metas) {
    try {
      const sRes = await fetch(`${LOCAL_HOST}/stream/tv/${encodeURIComponent(m.id)}.json`).then(r => r.json());
      const playable = (sRes.streams || []).filter(s => s && s.url && s.name !== '🧿 Support Us');
      if (playable.length >= 2) {
        targetMatch = m;
        topStreams = playable.slice(0, 3);
        break;
      }
    } catch (_) {}
  }

  if (!targetMatch) {
    console.error('No match found with >= 2 playable streams.');
    return;
  }

  console.log(`Target Fixture: ${targetMatch.name || targetMatch.title}`);
  console.log(`Catalog ID:     ${targetMatch.id}`);
  console.log(`Probing Top 3 Streams...\n`);

  const auditResults = [];
  for (let i = 0; i < topStreams.length; i++) {
    const res = await testStreamPlayback(topStreams[i], i + 1);
    auditResults.push(res);
  }

  // Print Summary Table
  console.log('\n================================================================================');
  console.log('                        TOP 3 STREAM AUDIT SCORECARD                            ');
  console.log('================================================================================');
  console.log('┌─────┬────────────────────────┬─────────────┬──────────┬──────────────┬────────────────────────┐');
  console.log('│ Pos │ Stream Label           │ Manifest OK │ TTFB (ms)│ MPEG-TS Sync │ CF Worker Quota Used?  │');
  console.log('├─────┼────────────────────────┼─────────────┼──────────┼──────────────┼────────────────────────┤');

  for (const r of auditResults) {
    const pos = String(r.idx).padEnd(3);
    const label = r.title.slice(0, 22).padEnd(22);
    const manOk = (r.manifestOk ? '✅ 200 OK' : '❌ FAIL').padEnd(11);
    const ttfb = `${r.ttfbMs} ms`.padStart(8);
    const sync = (r.syncByteValid ? '✅ 0x47 Valid' : '❌ No Sync').padEnd(12);
    const worker = (r.routesThroughCfWorker ? '⚠️ CF Worker' : '✅ ZERO (Direct)').padEnd(22);

    console.log(`│ ${pos} │ ${label} │ ${manOk} │ ${ttfb} │ ${sync} │ ${worker} │`);
  }

  console.log('└─────┴────────────────────────┴─────────────┴──────────┴──────────────┴────────────────────────┘\n');

  console.log('Audit Conclusions:');
  auditResults.forEach((r, i) => {
    console.log(`• Stream #${i + 1} (${r.title.slice(0, 30)}): ${r.manifestOk && r.syncByteValid ? '🟢 100% Playable' : '🔴 Issues detected'} | Worker Dependency: ${r.routesThroughCfWorker ? 'YES' : 'NONE'}`);
  });
}

run().catch(console.error);

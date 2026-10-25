#!/usr/bin/env node
'use strict';

/**
 * scripts/audit-all-live-tiktok-clusters.js
 *
 * Exhaustive audit of all live Streamed.pk matches across clusters:
 * [Admin] vs [Golf] vs [Hotel] vs [DamiTV] vs [Other].
 *
 * Unwraps rockyembed.st / iframe wrappers, executes native WASM decryption,
 * and fetches live M3U8 playlists via impit TLS to inspect segment CDNs.
 */

const path = require('path');
const { execFile } = require('child_process');
const { safeFetch } = require('../src/impitClient');

const STREAMED_API = 'https://streamed.pk/api';
const RUN_WASM_SCRIPT = path.join(__dirname, '../src/providers/run_wasm_native.js');

function isTikTokSegment(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('tiktokcdn') ||
    lower.includes('byteoversea') ||
    lower.includes('ibytedtos') ||
    lower.includes('byteimg') ||
    lower.includes('bytegoofy') ||
    lower.includes('cowedd4855ws') ||
    lower.includes('bytedance') ||
    lower.includes('.image') ||
    lower.includes('tplv-') ||
    lower.includes('riff')
  );
}

async function unwrapEmbedUrl(embedUrl) {
  try {
    const res = await safeFetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Referer': 'https://embed.st/'
      },
      timeoutMs: 6000
    });
    if (!res.ok) return embedUrl;
    const html = await res.text();

    const rockyMatch = html.match(/src="([^"]*rockyembed\.st[^"]*)"/i);
    if (rockyMatch) {
      const rockyRes = await safeFetch(rockyMatch[1], {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
          'Referer': embedUrl
        },
        timeoutMs: 6000
      });
      if (rockyRes.ok) {
        const rockyHtml = await rockyRes.text();
        const atobMatch = rockyHtml.match(/atob\((?:'|")([^'"]+)(?:'|")\)/);
        if (atobMatch) {
          const decoded = Buffer.from(atobMatch[1], 'base64').toString('utf8');
          return decoded.split('#')[0].replace(/\/+$/, '');
        }
      }
    }
  } catch (_) {}
  return embedUrl;
}

function decryptWasm(user, event, id, targetEmbedUrl) {
  return new Promise((resolve) => {
    execFile('node', [RUN_WASM_SCRIPT, user, event, id, targetEmbedUrl], { timeout: 12000 }, (error, stdout) => {
      if (error) return resolve(null);
      const urlMatch = stdout.match(/https:\/\/[^\s"]+\.m3u8/);
      resolve(urlMatch ? urlMatch[0] : null);
    });
  });
}

async function inspectPlaylist(m3u8Url) {
  try {
    const res = await safeFetch(m3u8Url, {
      headers: {
        'Referer': 'https://embed.st/',
        'Origin': 'https://embed.st',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
      },
      timeoutMs: 6000
    });
    if (!res.ok) return { unreachable: true };
    let text = await res.text();

    // If master playlist with multiple qualities, fetch highest quality child
    if (text.includes('#EXT-X-STREAM-INF')) {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      if (lines.length > 0) {
        const childUrl = new URL(lines[0], m3u8Url).toString();
        const cRes = await safeFetch(childUrl, {
          headers: {
            'Referer': 'https://embed.st/',
            'Origin': 'https://embed.st',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
          },
          timeoutMs: 6000
        });
        if (cRes.ok) text = await cRes.text();
      }
    }

    const isTikTok = isTikTokSegment(text);
    return { isTikTok, unreachable: false, sample: text.slice(0, 300) };
  } catch (_) {
    return { unreachable: true };
  }
}

async function audit() {
  console.log('Fetching active live matches from Streamed.pk API...');
  const liveMatches = await safeFetch(`${STREAMED_API}/matches/live`).then(r => r.json()).catch(() => []);
  console.log(`Found ${liveMatches.length} actively live matches.\n`);

  const clusterStats = {
    'Admin': { total: 0, tiktok: 0, standard: 0, unreachable: 0, streams: [] },
    'Golf': { total: 0, tiktok: 0, standard: 0, unreachable: 0, streams: [] },
    'Hotel': { total: 0, tiktok: 0, standard: 0, unreachable: 0, streams: [] },
    'Other': { total: 0, tiktok: 0, standard: 0, unreachable: 0, streams: [] }
  };

  const tasks = [];

  for (const match of liveMatches) {
    for (const src of (match.sources || [])) {
      const clusterRaw = (src.source || '').toLowerCase();
      let clusterKey = 'Other';
      if (clusterRaw === 'admin') clusterKey = 'Admin';
      else if (clusterRaw === 'golf') clusterKey = 'Golf';
      else if (clusterRaw === 'hotel') clusterKey = 'Hotel';

      tasks.push(async () => {
        try {
          const streamList = await safeFetch(`${STREAMED_API}/stream/${src.source}/${src.id}`).then(r => r.json()).catch(() => []);
          if (!Array.isArray(streamList)) return;

          for (const item of streamList) {
            if (!item.embedUrl) continue;
            clusterStats[clusterKey].total++;

            let targetUrl = item.embedUrl;
            if (clusterKey === 'Golf') {
              targetUrl = await unwrapEmbedUrl(item.embedUrl);
            }

            const parts = targetUrl.split('#')[0].replace(/\/+$/, '').split('/').filter(Boolean);
            const user = parts[parts.length - 3];
            const event = parts[parts.length - 2];
            const streamNo = parts[parts.length - 1];

            if (!user || !event || !streamNo) {
              clusterStats[clusterKey].unreachable++;
              continue;
            }

            const m3u8Url = await decryptWasm(user, event, streamNo, targetUrl);
            if (!m3u8Url) {
              clusterStats[clusterKey].unreachable++;
              continue;
            }

            const result = await inspectPlaylist(m3u8Url);
            if (result.unreachable) {
              clusterStats[clusterKey].unreachable++;
            } else if (result.isTikTok) {
              clusterStats[clusterKey].tiktok++;
              clusterStats[clusterKey].streams.push({
                match: match.title,
                cluster: clusterKey,
                cdn: 'TikTok/ByteDance CDN',
                url: m3u8Url.split('/')[2]
              });
            } else {
              clusterStats[clusterKey].standard++;
              clusterStats[clusterKey].streams.push({
                match: match.title,
                cluster: clusterKey,
                cdn: 'Standard MPEG-TS / strmd.st',
                url: m3u8Url.split('/')[2]
              });
            }
          }
        } catch (_) {}
      });
    }
  }

  // Run tasks in controlled concurrency (batch of 4 to avoid rate-limits)
  const BATCH_SIZE = 4;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    await Promise.all(tasks.slice(i, i + BATCH_SIZE).map(fn => fn()));
  }

  // Print scorecard
  console.log('====================================================================================================');
  console.log('                 STREAMED.PK TIKTOK CDN ABUSE AUDIT: ADMIN vs GOLF vs HOTEL vs OTHER               ');
  console.log('====================================================================================================');
  console.log('┌──────────┬───────────────┬───────────────────┬─────────────────────┬─────────────────────────────┐');
  console.log('│ Cluster  │ Total Streams │ TikTok CDN Feeds  │ Standard CDN Feeds  │ TikTok Usage % (Active)     │');
  console.log('├──────────┼───────────────┼───────────────────┼─────────────────────┼─────────────────────────────┤');

  let gTotal = 0, gTikTok = 0, gStd = 0, gUnreach = 0;

  for (const [name, st] of Object.entries(clusterStats)) {
    gTotal += st.total;
    gTikTok += st.tiktok;
    gStd += st.standard;
    gUnreach += st.unreachable;

    const active = st.tiktok + st.standard;
    const pct = active > 0 ? ((st.tiktok / active) * 100).toFixed(1) + '%' : 'N/A';

    console.log(`│ ${name.padEnd(8)} │ ${String(st.total).padStart(13)} │ ${String(st.tiktok).padStart(17)} │ ${String(st.standard).padStart(19)} │ ${pct.padStart(27)} │`);
  }

  console.log('├──────────┼───────────────┼───────────────────┼─────────────────────┼─────────────────────────────┤');
  const gActive = gTikTok + gStd;
  const gPct = gActive > 0 ? ((gTikTok / gActive) * 100).toFixed(1) + '%' : 'N/A';
  console.log(`│ TOTAL    │ ${String(gTotal).padStart(13)} │ ${String(gTikTok).padStart(17)} │ ${String(gStd).padStart(19)} │ ${gPct.padStart(27)} │`);
  console.log('└──────────┴───────────────┴───────────────────┴─────────────────────┴─────────────────────────────┘\n');

  console.log(`Summary Breakdown:`);
  console.log(`• Audited Streams: ${gTotal}`);
  console.log(`• TikTok CDN Abuse: ${gTikTok} (${gPct})`);
  console.log(`• Direct Standard MPEG-TS: ${gStd}`);
  console.log(`• Unreachable / Token Guarded: ${gUnreach}`);
}

audit().catch(e => console.error(e));

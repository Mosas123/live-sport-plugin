/**
 * Deep diagnostic on Sky Sports F1 and UK channels:
 * 1. Inspect all sources attached to the card in cache.
 * 2. Attempt resolution for each provider (Vavoo, DaddyLive, CDNLive).
 * 3. Probe the returned M3U8 playback URLs with HTTP requests to check if they actually stream video.
 * 4. Test other UK channels (Sky Sports Premier League, Sky Sports Main Event, TNT Sports 1).
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const LOCAL = 'http://localhost:7000';

function fetchJson(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;
    const start = Date.now();
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: timeoutMs }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json, elapsed: Date.now() - start });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, error: 'JSON_PARSE_ERROR', elapsed: Date.now() - start, raw: raw.slice(0, 100) });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT', elapsed: Date.now() - start }); });
    req.on('error', (err) => { resolve({ ok: false, error: err.message, elapsed: Date.now() - start }); });
  });
}

function probeUrl(streamUrl, headers = {}) {
  return new Promise((resolve) => {
    const isHttps = streamUrl.startsWith('https://');
    const client = isHttps ? https : http;
    const start = Date.now();
    try {
      const u = new URL(streamUrl);
      const reqHeaders = {
        'User-Agent': headers['User-Agent'] || headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': headers['Referer'] || headers['referer'] || `${u.protocol}//${u.host}/`,
        'Origin': headers['Origin'] || headers['origin'] || `${u.protocol}//${u.host}`
      };

      const req = client.get(streamUrl, { headers: reqHeaders, timeout: 8000 }, (res) => {
        let chunkHead = '';
        let bytes = 0;
        res.on('data', chunk => {
          bytes += chunk.length;
          if (chunkHead.length < 500) chunkHead += chunk.toString('utf8');
        });
        res.on('end', () => {
          const isHls = chunkHead.includes('#EXTM3U') || chunkHead.includes('#EXT-X-STREAM-INF') || chunkHead.includes('.ts') || chunkHead.includes('.m3u8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            isHls,
            bytes,
            sample: chunkHead.slice(0, 150).replace(/\r?\n/g, ' '),
            elapsed: Date.now() - start
          });
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT', elapsed: Date.now() - start }); });
      req.on('error', (err) => { resolve({ ok: false, error: err.message, elapsed: Date.now() - start }); });
    } catch (err) {
      resolve({ ok: false, error: `BAD_URL: ${err.message}`, elapsed: 0 });
    }
  });
}

async function testChannel(chName) {
  console.log(`\n========================================================================`);
  console.log(` DIAGNOSTIC FOR: ${chName}`);
  console.log(`========================================================================`);

  const searchRes = await fetchJson(`${LOCAL}/catalog/tv/nuvio_sports_networks/search=${encodeURIComponent(chName)}.json`);
  if (!searchRes.ok || !searchRes.data?.metas?.length) {
    console.log(`  ERROR: No card found for "${chName}" in local catalog!`);
    return;
  }

  const meta = searchRes.data.metas[0];
  console.log(`  Target Meta Card:`);
  console.log(`    ID   : ${meta.id}`);
  console.log(`    Name : ${meta.name}`);

  // Resolve streams
  console.log(`\n  Resolving streams from ${LOCAL}/stream/tv/${meta.id}.json ...`);
  const streamRes = await fetchJson(`${LOCAL}/stream/tv/${meta.id}.json`, 25000);
  if (!streamRes.ok) {
    console.log(`  Stream fetch failed: status ${streamRes.status}, error: ${streamRes.error}`);
    return;
  }

  const streams = (streamRes.data?.streams || []).filter(s => !s.name?.includes('Support Us') && !s.title?.includes('Support Us'));
  console.log(`  Total Playable Streams Resolved: ${streams.length} (in ${streamRes.elapsed}ms)`);

  for (let i = 0; i < streams.length; i++) {
    const s = streams[i];
    const lines = (s.title || s.name || '').split('\n');
    const header = lines[0] || '';
    const quality = lines[1] || '';
    const headers = s.behaviorHints?.notWebReady ? s.behaviorHints?.proxyHeaders?.request || {} : {};

    console.log(`\n  [Stream #${i + 1}]`);
    console.log(`    Title  : ${header}`);
    console.log(`    Info   : ${quality}`);
    console.log(`    URL    : ${s.url?.slice(0, 85)}...`);
    
    // Probe playback URL
    const probe = await probeUrl(s.url, headers);
    const probeStatus = probe.ok ? `[OK ${probe.status}]` : `[FAIL ${probe.status || probe.error}]`;
    console.log(`    Playback Test: ${probeStatus} (HLS: ${probe.isHls ? 'YES' : 'NO'}, Bytes: ${probe.bytes}, Time: ${probe.elapsed}ms)`);
    if (!probe.ok || !probe.isHls) {
      console.log(`    Response snippet: ${probe.sample || 'empty'}`);
    }
  }
}

async function main() {
  await testChannel('Sky Sports F1');
  await testChannel('Sky Sports Premier League');
  await testChannel('Sky Sports Main Event');
  await testChannel('TNT Sports 1');
}

main().catch(console.error);

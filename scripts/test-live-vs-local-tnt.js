/**
 * Comprehensive Comparative Benchmark: Remote (nuviosports.xyz) vs Local (localhost:7000)
 * Specifically targeting TNT 1, TNT family, and mainstream 24/7 channels
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const REMOTE = 'https://nuviosports.xyz';
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
        const elapsed = Date.now() - start;
        try {
          const json = JSON.parse(raw);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json, elapsed });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, error: 'JSON_PARSE_ERROR', elapsed, raw: raw.slice(0, 100) });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT', elapsed: Date.now() - start });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message, elapsed: Date.now() - start });
    });
  });
}

async function runTest() {
  console.log('='.repeat(80));
  console.log(' LIVE SERVER (nuviosports.xyz) vs LOCAL SERVER (localhost:7000)');
  console.log(' Forensic Channel Deduplication & Stream Comparison');
  console.log('='.repeat(80));

  const testChannels = [
    { query: 'TNT Sports 1', label: 'TNT Sports 1' },
    { query: 'TNT 1', label: 'TNT 1 (multi-token search)' },
    { query: 'TNT Sports 2', label: 'TNT Sports 2' },
    { query: 'TNT Sports 4', label: 'TNT Sports 4' },
    { query: 'Sky Sports F1', label: 'Sky Sports F1 (motorsport safety)' },
    { query: 'Astro Cricket', label: 'Astro Cricket' },
    { query: 'Cartoonito', label: 'Cartoonito' },
    { query: 'Willow Cricket', label: 'Willow Cricket' },
    { query: 'Eurosport 1', label: 'Eurosport 1' },
    { query: 'Canal+ MotoGP', label: 'Canal+ MotoGP' }
  ];

  const results = [];

  for (const item of testChannels) {
    console.log(`\nTesting [${item.label}] (query: "${item.query}")...`);
    const enc = encodeURIComponent(item.query);
    const [rSearch, lSearch] = await Promise.all([
      fetchJson(`${REMOTE}/catalog/tv/nuvio_sports_networks/search=${enc}.json`),
      fetchJson(`${LOCAL}/catalog/tv/nuvio_sports_networks/search=${enc}.json`)
    ]);

    const rMetas = rSearch.ok && Array.isArray(rSearch.data?.metas) ? rSearch.data.metas : [];
    const lMetas = lSearch.ok && Array.isArray(lSearch.data?.metas) ? lSearch.data.metas : [];

    console.log(`  Cards Found:`);
    console.log(`    Remote: ${rMetas.length} card(s) -> ${rMetas.map(m => m.name).join(' | ') || 'None'}`);
    console.log(`    Local : ${lMetas.length} card(s) -> ${lMetas.map(m => m.name).join(' | ') || 'None'}`);

    // Resolve streams for top match
    const rTop = rMetas[0];
    const lTop = lMetas[0];

    let rStreams = [];
    let lStreams = [];
    let rElapsed = 0;
    let lElapsed = 0;

    const streamPromises = [];
    if (rTop) {
      streamPromises.push(
        fetchJson(`${REMOTE}/stream/tv/${rTop.id}.json`).then(res => {
          rElapsed = res.elapsed;
          if (res.ok && Array.isArray(res.data?.streams)) {
            rStreams = res.data.streams.filter(s => !s.name?.includes('Support Us') && !s.title?.includes('Support Us'));
          }
        })
      );
    }
    if (lTop) {
      streamPromises.push(
        fetchJson(`${LOCAL}/stream/tv/${lTop.id}.json`).then(res => {
          lElapsed = res.elapsed;
          if (res.ok && Array.isArray(res.data?.streams)) {
            lStreams = res.data.streams.filter(s => !s.name?.includes('Support Us') && !s.title?.includes('Support Us'));
          }
        })
      );
    }

    await Promise.all(streamPromises);

    const formatStreams = (streams) => streams.map(s => {
      const firstLine = (s.title || '').split('\n')[0] || s.name || '';
      const quality = (s.title || '').split('\n')[1] || '';
      return `${firstLine} [${quality}]`;
    });

    console.log(`  Streams for Top Card:`);
    console.log(`    Remote (${rTop?.id || 'none'}): ${rStreams.length} stream(s) in ${rElapsed}ms`);
    rStreams.slice(0, 3).forEach((s, idx) => {
      console.log(`      [Remote #${idx + 1}] ${JSON.stringify(s.title?.split('\n')?.[0] || s.name)}`);
    });

    console.log(`    Local  (${lTop?.id || 'none'}): ${lStreams.length} stream(s) in ${lElapsed}ms`);
    lStreams.slice(0, 4).forEach((s, idx) => {
      console.log(`      [Local #${idx + 1}] ${JSON.stringify(s.title?.split('\n')?.[0] || s.name)}`);
    });

    results.push({
      item: item.label,
      query: item.query,
      remoteCardsCount: rMetas.length,
      localCardsCount: lMetas.length,
      remoteCards: rMetas.map(m => m.name),
      localCards: lMetas.map(m => m.name),
      remoteStreamCount: rStreams.length,
      localStreamCount: lStreams.length,
      remoteLatencyMs: rElapsed,
      localLatencyMs: lElapsed,
      remoteSampleStreams: formatStreams(rStreams.slice(0, 3)),
      localSampleStreams: formatStreams(lStreams.slice(0, 4))
    });
  }

  const outPath = path.resolve(__dirname, '../docs/live_vs_local_tnt_comparison.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed JSON results saved to: ${outPath}`);
}

runTest().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

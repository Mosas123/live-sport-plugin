/**
 * Compare mainstream 24/7 channels and their stream counts
 * between Remote (nuviosports.xyz) and Local (localhost:7000).
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
          resolve({ ok: false, status: res.statusCode, error: 'JSON_PARSE_ERROR', elapsed, raw: raw.slice(0, 150) });
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

const CHANNELS = [
  'Sky Sports Main Event',
  'Sky Sports Premier League',
  'Sky Sports Football',
  'TNT Sports 1',
  'TNT Sports 2',
  'ESPN',
  'ESPN 2',
  'Fox Sports 1',
  'Willow Cricket',
  'Astro Cricket',
  'SuperSport Premier League',
  'Eurosport 1',
  'CBS Sports Network',
  'Cartoon Network'
];

async function main() {
  console.log('='.repeat(75));
  console.log(' MAINSTREAM 24/7 CHANNELS: STREAM COUNT & SOURCE COMPARISON');
  console.log(` Remote: ${REMOTE}`);
  console.log(` Local : ${LOCAL}`);
  console.log('='.repeat(75));

  const results = [];

  for (const chName of CHANNELS) {
    console.log(`\nAnalyzing [${chName}]...`);
    const enc = encodeURIComponent(chName);
    const [rSearch, lSearch] = await Promise.all([
      fetchJson(`${REMOTE}/catalog/tv/nuvio_sports_networks/search=${enc}.json`),
      fetchJson(`${LOCAL}/catalog/tv/nuvio_sports_networks/search=${enc}.json`)
    ]);

    const rCards = rSearch.ok && rSearch.data?.metas ? rSearch.data.metas : [];
    const lCards = lSearch.ok && lSearch.data?.metas ? lSearch.data.metas : [];

    console.log(`  Cards found -> Remote: ${rCards.length} | Local: ${lCards.length}`);

    // If local has a card, pick the best matching one; similarly for remote
    const lBest = lCards[0];
    const rBest = rCards[0];

    let lStreams = [];
    let rStreams = [];
    let lElapsed = 0;
    let rElapsed = 0;

    const streamPromises = [];
    if (rBest) {
      streamPromises.push(
        fetchJson(`${REMOTE}/stream/tv/${rBest.id}.json`).then(res => {
          rElapsed = res.elapsed;
          if (res.ok && Array.isArray(res.data?.streams)) {
            // Filter out donation / support items to count genuine playback streams
            rStreams = res.data.streams.filter(s => !s.name?.includes('Support Us') && !s.title?.includes('Support Us') && !s.title?.includes('Donation'));
          }
        })
      );
    }
    if (lBest) {
      streamPromises.push(
        fetchJson(`${LOCAL}/stream/tv/${lBest.id}.json`).then(res => {
          lElapsed = res.elapsed;
          if (res.ok && Array.isArray(res.data?.streams)) {
            lStreams = res.data.streams.filter(s => !s.name?.includes('Support Us') && !s.title?.includes('Support Us') && !s.title?.includes('Donation'));
          }
        })
      );
    }

    await Promise.all(streamPromises);

    const getProviders = (streams) => {
      const set = new Set();
      for (const s of streams) {
        const text = `${s.name || ''} ${s.title || ''}`;
        if (/vavoo/i.test(text)) set.add('Vavoo');
        else if (/daddylive|dlv/i.test(text)) set.add('DaddyLive');
        else if (/cdnlive/i.test(text)) set.add('CDNLive');
        else if (/sktech/i.test(text)) set.add('SKTech');
        else if (/streamed/i.test(text)) set.add('Streamed');
        else set.add('Direct');
      }
      return Array.from(set);
    };

    const rProviders = getProviders(rStreams);
    const lProviders = getProviders(lStreams);

    console.log(`  Streams resolved:`);
    console.log(`    Remote: ${rStreams.length} stream(s) in ${rElapsed}ms (Providers: ${rProviders.join(', ') || 'none'})`);
    console.log(`    Local : ${lStreams.length} stream(s) in ${lElapsed}ms (Providers: ${lProviders.join(', ') || 'none'})`);

    results.push({
      channel: chName,
      remoteCards: rCards.length,
      localCards: lCards.length,
      remoteCardName: rBest?.name || 'N/A',
      localCardName: lBest?.name || 'N/A',
      remoteStreamCount: rStreams.length,
      localStreamCount: lStreams.length,
      remoteLatencyMs: rElapsed,
      localLatencyMs: lElapsed,
      remoteProviders: rProviders,
      localProviders: lProviders,
      sampleLocalTitles: lStreams.slice(0, 3).map(s => s.title?.split('\n')?.[0] || s.title)
    });
  }

  const outPath = path.resolve(__dirname, '../docs/mainstream_247_comparison.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report written to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal comparison error:', err);
  process.exit(1);
});

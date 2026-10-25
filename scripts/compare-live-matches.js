#!/usr/bin/env node
'use strict';

/**
 * scripts/compare-live-matches.js
 *
 * Dedicated live-fixtures-only comparison tool between:
 *  - Remote Production:  https://nuviosports.xyz
 *  - Local Development:  http://localhost:7000
 *
 * Evaluates:
 * 1. Live Match Catalog counts (/catalog/tv/nuvio_sports_live.json)
 * 2. Total stream count across live matches
 * 3. Stream source provider breakdown (ak47live, daddylive, vavoo, streamedpk, damitv, sktech, etc.)
 * 4. Real stream playability probe (HTTP 200 #EXTM3U validation)
 * 5. Generates markdown comparison report in docs/live_matches_stream_comparison.md
 */

const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
function getArg(name, def) {
  const match = ARGS.find(a => a.startsWith(`--${name}=`));
  if (match) return match.split('=')[1];
  const idx = ARGS.indexOf(`--${name}`);
  if (idx !== -1 && ARGS[idx + 1] && !ARGS[idx + 1].startsWith('--')) {
    return ARGS[idx + 1];
  }
  return def;
}
const hasFlag = (name) => ARGS.includes(`--${name}`);

const LIVE_HOST = (getArg('live', 'https://nuviosports.xyz')).replace(/\/+$/, '');
const LOCAL_HOST = (getArg('local', 'http://localhost:7000')).replace(/\/+$/, '');
const IS_ALL = hasFlag('all');
const LIMIT = IS_ALL ? 9999 : parseInt(getArg('limit', '25'), 10);
const DO_PROBE = hasFlag('probe');
const TIMEOUT_MS = parseInt(getArg('timeout', '12000'), 10);
const REPORT_PATH = path.resolve(__dirname, '../docs/live_matches_stream_comparison.md');

// ANSI Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

async function timedFetch(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const elapsed = Date.now() - started;
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, elapsed, response: res };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      elapsed: Date.now() - started,
      error: err.name === 'AbortError' ? 'TIMEOUT' : err.message
    };
  }
}

async function probeStreamHealth(streamUrl, proxyHeaders = {}) {
  if (!streamUrl || typeof streamUrl !== 'string' || !streamUrl.startsWith('http')) {
    return { ok: false, status: 0, error: 'INVALID_URL' };
  }
  const headers = {
    'User-Agent': proxyHeaders['User-Agent'] || proxyHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Referer': proxyHeaders['Referer'] || proxyHeaders['referer'] || ''
  };
  if (proxyHeaders['Origin'] || proxyHeaders['origin']) {
    headers['Origin'] = proxyHeaders['Origin'] || proxyHeaders['origin'];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(streamUrl, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timer);
    const body = await res.text();
    const isValid = res.status === 200 && (body.includes('#EXT') || body.includes('<MPD') || streamUrl.includes('.mp4'));
    return { ok: isValid, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: err.name === 'AbortError' ? 'TIMEOUT' : err.message };
  }
}

function detectSource(stream) {
  if (stream._source) return stream._source.toLowerCase();
  const title = (stream.title || '').toLowerCase();
  const name = (stream.name || '').toLowerCase();
  const full = `${title} ${name}`;

  if (full.includes('ak47')) return 'ak47live';
  if (full.includes('vavoo')) return 'vavoo';
  if (full.includes('daddylive') || full.includes('dlive')) return 'daddylive';
  if (full.includes('streamed') || full.includes('spk')) return 'streamedpk';
  if (full.includes('damitv')) return 'damitv';
  if (full.includes('sktech')) return 'sktech';
  if (full.includes('ppvst') || full.includes('ppv.st')) return 'ppvst';
  if (full.includes('cdnlive')) return 'cdnlive';
  if (full.includes('watchfooty')) return 'watchfooty';
  if (full.includes('timstreams')) return 'timstreams';
  if (full.includes('streamsports')) return 'streamsports';
  return 'other';
}

async function runLiveMatchComparison() {
  console.log(`${c.bold}${c.cyan}========================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}    NUVIO LIVE SPORTS: LIVE MATCHES STREAM AUDIT & COMPARISON           ${c.reset}`);
  console.log(`${c.bold}${c.cyan}    Local Host:  ${c.yellow}${LOCAL_HOST}${c.cyan}                                             ${c.reset}`);
  console.log(`${c.bold}${c.cyan}    Remote Host: ${c.yellow}${LIVE_HOST}${c.cyan}                                      ${c.reset}`);
  console.log(`${c.bold}${c.cyan}    Scope:       ${c.green}LIVE MATCHES ONLY (/catalog/tv/nuvio_sports_live.json)${c.reset}`);
  console.log(`${c.bold}${c.cyan}========================================================================${c.reset}\n`);

  // 1. Fetch live catalogs from both hosts
  console.log(`${c.bold}Step 1: Fetching live matches catalogs...${c.reset}`);
  const [localCatRes, liveCatRes] = await Promise.all([
    timedFetch(`${LOCAL_HOST}/catalog/tv/nuvio_sports_live.json`),
    timedFetch(`${LIVE_HOST}/catalog/tv/nuvio_sports_live.json`)
  ]);

  if (!localCatRes.ok) {
    console.error(`${c.red}Failed to fetch local catalog from ${LOCAL_HOST}: status ${localCatRes.status}${c.reset}`);
    process.exit(1);
  }
  if (!liveCatRes.ok) {
    console.error(`${c.red}Failed to fetch remote catalog from ${LIVE_HOST}: status ${liveCatRes.status}${c.reset}`);
    process.exit(1);
  }

  const localMetas = (await localCatRes.response.json())?.metas || [];
  const liveMetas = (await liveCatRes.response.json())?.metas || [];

  console.log(`  Localhost Live Matches:  ${c.green}${localMetas.length}${c.reset} (fetched in ${localCatRes.elapsed}ms)`);
  console.log(`  Remote Live Matches:     ${c.green}${liveMetas.length}${c.reset} (fetched in ${liveCatRes.elapsed}ms)`);

  // Detect Ak47-specific live events on local
  const ak47Matches = localMetas.filter(m => m.id && m.id.includes('ak47'));
  console.log(`  AK47 Exclusive Matches:  ${c.yellow}${ak47Matches.length}${c.reset} on Localhost\n`);

  // 2. Build target sample list
  const targetMap = new Map();

  // Prioritize shared live fixtures
  for (const m of localMetas) {
    const isLiveShared = liveMetas.some(lm => lm.id === m.id);
    targetMap.set(m.id, {
      id: m.id,
      name: m.name || m.title,
      isShared: isLiveShared,
      isAk47: m.id.includes('ak47')
    });
  }

  // Also include any remote matches not present in local
  for (const lm of liveMetas) {
    if (!targetMap.has(lm.id)) {
      targetMap.set(lm.id, {
        id: lm.id,
        name: lm.name || lm.title,
        isShared: false,
        isRemoteOnly: true
      });
    }
  }

  const allTargets = Array.from(targetMap.values());
  const auditList = allTargets.slice(0, LIMIT);

  console.log(`${c.bold}Step 2: Auditing streams across ${auditList.length} live matches...${c.reset}`);
  if (DO_PROBE) {
    console.log(`  ${c.dim}[Probe mode active: checking HTTP 200 HLS playability]${c.reset}`);
  }

  let totalLocalStreams = 0;
  let totalLiveStreams = 0;
  let totalLocalPlayable = 0;
  let totalLivePlayable = 0;

  const localProviders = {};
  const liveProviders = {};
  const itemComparisons = [];

  // Run in bounded concurrent batches of 4
  const BATCH_SIZE = 4;
  for (let i = 0; i < auditList.length; i += BATCH_SIZE) {
    const batch = auditList.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (item) => {
      const streamPath = `/stream/tv/${encodeURIComponent(item.id)}.json`;

      const [localRes, liveRes] = await Promise.all([
        timedFetch(`${LOCAL_HOST}${streamPath}`),
        timedFetch(`${LIVE_HOST}${streamPath}`)
      ]);

      const localStreams = (localRes.ok ? (await localRes.response.json())?.streams : []) || [];
      const liveStreams = (liveRes.ok ? (await liveRes.response.json())?.streams : []) || [];

      // Filter out donation/support cards from stream count
      const cleanLocal = localStreams.filter(s => s.url);
      const cleanLive = liveStreams.filter(s => s.url);

      totalLocalStreams += cleanLocal.length;
      totalLiveStreams += cleanLive.length;

      // Count providers
      cleanLocal.forEach(s => {
        const src = detectSource(s);
        localProviders[src] = (localProviders[src] || 0) + 1;
      });
      cleanLive.forEach(s => {
        const src = detectSource(s);
        liveProviders[src] = (liveProviders[src] || 0) + 1;
      });

      // Optional Playability probe
      let localPlayable = cleanLocal.length;
      let livePlayable = cleanLive.length;
      if (DO_PROBE) {
        let lOk = 0;
        for (const s of cleanLocal.slice(0, 5)) {
          const pr = await probeStreamHealth(s.url, s.behaviorHints?.proxyHeaders?.request || {});
          if (pr.ok) lOk++;
        }
        localPlayable = lOk;

        let rOk = 0;
        for (const s of cleanLive.slice(0, 5)) {
          const pr = await probeStreamHealth(s.url, s.behaviorHints?.proxyHeaders?.request || {});
          if (pr.ok) rOk++;
        }
        livePlayable = rOk;
      }

      totalLocalPlayable += localPlayable;
      totalLivePlayable += livePlayable;

      itemComparisons.push({
        id: item.id,
        name: item.name,
        isAk47: item.isAk47,
        localStreams: cleanLocal.length,
        liveStreams: cleanLive.length,
        localSources: cleanLocal.map(detectSource).join(', ') || 'none',
        liveSources: cleanLive.map(detectSource).join(', ') || 'none',
        delta: cleanLocal.length - cleanLive.length
      });

      const deltaStr = cleanLocal.length >= cleanLive.length
        ? `${c.green}+${cleanLocal.length - cleanLive.length}${c.reset}`
        : `${c.red}${cleanLocal.length - cleanLive.length}${c.reset}`;

      console.log(`  [Match] ${item.name.slice(0, 48).padEnd(50)} | Local: ${cleanLocal.length.toString().padStart(2)} streams | Remote: ${cleanLive.length.toString().padStart(2)} streams | Delta: ${deltaStr}`);
    }));
  }

  // 3. Summarize & Print Results
  console.log(`\n${c.bold}${c.cyan}========================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}                         EXECUTIVE SUMMARY                              ${c.reset}`);
  console.log(`${c.bold}${c.cyan}========================================================================${c.reset}`);
  console.log(`  Live Matches in Catalog:  Local: ${c.green}${localMetas.length}${c.reset} vs Remote: ${c.green}${liveMetas.length}${c.reset}`);
  console.log(`  Live Matches Audited:     ${auditList.length}`);
  console.log(`  Total Streams (Local):    ${c.bold}${c.green}${totalLocalStreams} streams${c.reset}`);
  console.log(`  Total Streams (Remote):   ${c.bold}${c.yellow}${totalLiveStreams} streams${c.reset}`);

  const diffStreams = totalLocalStreams - totalLiveStreams;
  const pctChange = totalLiveStreams > 0 ? ((diffStreams / totalLiveStreams) * 100).toFixed(1) : '+100';
  console.log(`  Stream Count Delta:       ${diffStreams >= 0 ? c.green + '+' + diffStreams : c.red + diffStreams} streams (${pctChange}% difference)${c.reset}`);

  const avgLocal = (totalLocalStreams / (auditList.length || 1)).toFixed(1);
  const avgLive = (totalLiveStreams / (auditList.length || 1)).toFixed(1);
  console.log(`  Avg Streams per Fixture:  Local: ${c.green}${avgLocal}${c.reset} vs Remote: ${c.yellow}${avgLive}${c.reset}`);

  // Provider Breakdown Table
  console.log(`\n${c.bold}Provider Stream Breakdown:${c.reset}`);
  console.log(`  ${'Provider'.padEnd(18)} | ${'Localhost'.padEnd(12)} | ${'Remote (Live)'.padEnd(14)} | ${'Delta'}`);
  console.log(`  -------------------+--------------+----------------+-------`);
  const allProviders = Array.from(new Set([...Object.keys(localProviders), ...Object.keys(liveProviders)])).sort();
  for (const prov of allProviders) {
    const loc = localProviders[prov] || 0;
    const liv = liveProviders[prov] || 0;
    const d = loc - liv;
    const dStr = d > 0 ? `+${d}` : `${d}`;
    console.log(`  ${prov.padEnd(18)} | ${loc.toString().padEnd(12)} | ${liv.toString().padEnd(14)} | ${d >= 0 ? c.green + dStr + c.reset : c.red + dStr + c.reset}`);
  }

  // 4. Generate Markdown Report
  const docsDir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  let md = `# Live Matches Stream Comparison Report\n\n`;
  md += `**Date**: ${new Date().toISOString()}\n`;
  md += `**Scope**: Only Live Sports Matches (\`/catalog/tv/nuvio_sports_live.json\`)\n`;
  md += `**Local Instance**: \`${LOCAL_HOST}\` (Branch \`feature/more-24-7-channels\`)\n`;
  md += `**Remote Production**: \`${LIVE_HOST}\`\n\n`;

  md += `## 1. High-Level Metrics Summary\n\n`;
  md += `| Metric | Localhost (Development) | nuviosports.xyz (Production) | Delta |\n`;
  md += `| :--- | :---: | :---: | :---: |\n`;
  md += `| **Live Matches in Catalog** | **${localMetas.length}** | **${liveMetas.length}** | ${localMetas.length - liveMetas.length >= 0 ? '+' : ''}${localMetas.length - liveMetas.length} |\n`;
  md += `| **Audited Matches** | ${auditList.length} | ${auditList.length} | - |\n`;
  md += `| **Total Streams Found** | **${totalLocalStreams}** | **${totalLiveStreams}** | **${diffStreams >= 0 ? '+' : ''}${diffStreams} (${pctChange}%)** |\n`;
  md += `| **Avg Streams / Match** | **${avgLocal}** | **${avgLive}** | ${(+avgLocal - +avgLive).toFixed(1)} |\n\n`;

  md += `## 2. Stream Provider Breakdown\n\n`;
  md += `| Provider Source | Localhost Streams | Remote Streams | Delta |\n`;
  md += `| :--- | :---: | :---: | :---: |\n`;
  for (const prov of allProviders) {
    const loc = localProviders[prov] || 0;
    const liv = liveProviders[prov] || 0;
    const d = loc - liv;
    md += `| \`${prov}\` | ${loc} | ${liv} | ${d > 0 ? '+' + d : d} |\n`;
  }
  md += `\n`;

  md += `## 3. Sample Live Matches Stream Audit\n\n`;
  md += `| Live Match Title | Local Streams | Remote Streams | Local Providers | Delta |\n`;
  md += `| :--- | :---: | :---: | :--- | :---: |\n`;
  for (const it of itemComparisons.slice(0, 30)) {
    md += `| **${it.name.replace(/\|/g, '-')}** | ${it.localStreams} | ${it.liveStreams} | \`${it.localSources}\` | ${it.delta > 0 ? '+' + it.delta : it.delta} |\n`;
  }

  fs.writeFileSync(REPORT_PATH, md, 'utf8');
  console.log(`\n${c.green}✔ Detailed comparison report saved to: ${REPORT_PATH}${c.reset}\n`);
}

runLiveMatchComparison().catch(err => {
  console.error(`${c.red}Comparison execution failed: ${err.message}${c.reset}`, err.stack);
  process.exit(1);
});

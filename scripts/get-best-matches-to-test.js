'use strict';

async function main() {
  const catRes = await fetch('http://localhost:7000/catalog/tv/nuvio_sports_live.json').then(r => r.json());
  const metas = (catRes.metas || []).slice(0, 10);

  console.log(`Found ${metas.length} live matches. Inspecting streams...\n`);

  for (let i = 0; i < Math.min(metas.length, 6); i++) {
    const m = metas[i];
    const sRes = await fetch('http://localhost:7000/stream/tv/' + encodeURIComponent(m.id) + '.json')
      .then(r => r.json())
      .catch(() => ({ streams: [] }));
    const streams = sRes.streams || [];
    
    console.log(`=== MATCH ${i + 1}: ${m.name || m.title} ===`);
    console.log(`Match ID: ${m.id}`);
    console.log(`Total Streams Available: ${streams.length}`);

    // List top 4 streams
    streams.slice(0, 5).forEach((s, idx) => {
      const topTitle = (s.title || '').split('\n')[0];
      const isTikTok = Boolean(s.isTikTok || s._isTikTok);
      console.log(`  [${idx}] ${s.name} | ${topTitle} | Score: ${s.score || 'N/A'} | TikTok: ${isTikTok ? 'YES' : 'NO'}`);
    });
    console.log('');
  }
}

main().catch(console.error);

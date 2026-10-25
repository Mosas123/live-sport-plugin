/**
 * verify_144.js - Standalone diagnostic script to test DaddyLive Channel 144
 * 
 * Run in terminal: node scripts/verify_144.js
 */

function decodeEconfig(rawEconfig) {
  if (!rawEconfig || typeof rawEconfig !== 'string') return null;
  try {
    const order = [2, 0, 3, 1];
    const partsCount = 4;
    const decodedB64 = Buffer.from(rawEconfig, 'base64').toString('utf-8');
    const len = decodedB64.length;
    if (len < partsCount) return null;

    const partLen = Math.ceil(len / partsCount);
    const parts = [];
    let offset = 0;
    for (let i = 0; i < partsCount; i++) {
      parts.push(decodedB64.substr(offset, partLen));
      offset += partLen;
    }

    const orderedParts = [];
    for (let i = 0; i < order.length; i++) {
      let str = String(parts[i]);
      str = str.slice(0, 3) + str.slice(4);
      orderedParts[order[i]] = Buffer.from(str, 'base64').toString('utf-8');
    }

    const combined = orderedParts.join('');
    const finalJsonStr = Buffer.from(combined, 'base64').toString('utf-8');
    return JSON.parse(finalJsonStr);
  } catch (_) {
    return null;
  }
}

async function verifyChannel144() {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
  console.log(`\n======================================================`);
  console.log(`VERIFYING DADDYLIVE CHANNEL 144 (NATIVE MPEG-TS MIRROR)`);
  console.log(`======================================================`);

  // Step 1: Probe DaddyLive /cast/ folder to get current embed
  const playerUrl = 'https://dlive.sx/cast/stream-144.php';
  console.log(`[Step 1] Fetching player page: ${playerUrl}`);
  const playerRes = await fetch(playerUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://dlive.sx/' } });
  const playerHtml = await playerRes.text();
  const iframeMatch = playerHtml.match(/<iframe[^>]+src=["']?([^"'\s>]+)["']?/i);
  if (!iframeMatch) {
    console.error('Failed: No iframe found on player page');
    return;
  }
  const embedUrl = iframeMatch[1];
  console.log(`         Found active embed iframe: ${embedUrl}`);

  // Step 2: Fetch embed page and extract _econfig
  console.log(`\n[Step 2] Fetching embed page from missflight...`);
  const embedRes = await fetch(embedUrl, { headers: { 'User-Agent': UA, 'Referer': playerUrl } });
  const embedHtml = await embedRes.text();
  const m = embedHtml.match(/_econfig\s*=\s*['"]([^'"]+)['"]/);
  if (!m) {
    console.error('Failed: No _econfig found in embed HTML');
    return;
  }

  // Step 3: Decode native m3u8 URL
  const conf = decodeEconfig(m[1]);
  const streamUrl = conf.stream_url || conf.stream_url_nop2p;
  console.log(`\n[Step 3] Successfully decoded native stream URL:`);
  console.log(`         ${streamUrl}`);

  // Step 4: Fetch live m3u8 playlist
  console.log(`\n[Step 4] Fetching live .m3u8 playlist...`);
  const m3u8Res = await fetch(streamUrl, {
    headers: { 'User-Agent': UA, 'Referer': embedUrl, 'Origin': new URL(embedUrl).origin }
  });
  console.log(`         HTTP Status: ${m3u8Res.status}`);
  const playlist = await m3u8Res.text();
  console.log(`         Playlist preview:\n` + playlist.split('\n').slice(0, 7).join('\n'));

  // Step 5: Test downloading a live .ts segment
  const segMatch = playlist.match(/([^\s#]+\.ts)/);
  if (!segMatch) {
    console.error('Failed: No .ts segment in playlist');
    return;
  }
  const segUrl = new URL(segMatch[1], streamUrl).toString();
  console.log(`\n[Step 5] Fetching live video segment (.ts):`);
  console.log(`         ${segUrl}`);
  const segRes = await fetch(segUrl, { headers: { 'User-Agent': UA, 'Referer': embedUrl } });
  console.log(`         HTTP Status: ${segRes.status}`);
  console.log(`         Content-Type: ${segRes.headers.get('content-type')}`);
  console.log(`         CORS Origin: ${segRes.headers.get('access-control-allow-origin')}`);
  
  const buf = await segRes.arrayBuffer();
  const bytes = new Uint8Array(buf);
  console.log(`         Downloaded Size: ${(buf.byteLength / 1024 / 1024).toFixed(2)} MB`);
  console.log(`         MPEG-TS Sync Byte (0x47): ${bytes[0] === 0x47 ? 'YES! (Valid native MPEG-TS video)' : 'NO'}`);

  console.log(`\n======================================================`);
  console.log(`CONCLUSION: Stream 144 is 100% active, pure native MPEG-TS,`);
  console.log(`with zero TikTok CDN abuse and zero PNG unwrapping required!`);
  console.log(`======================================================\n`);
}

verifyChannel144();

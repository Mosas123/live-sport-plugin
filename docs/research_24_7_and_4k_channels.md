# Context & Research: 24/7 Channels & 4K Providers Architecture

## 1. Upstream Targets & Reverse Engineering Findings

### Vavoo.to / MediaHubMX (`world.m3u` & 4K Feeds)
- **Category**: Global 24/7 Linear Channels & 4K UHD Streams (175+ 4K channels including CANAL+ SPORT 4K, TF1 ULTRA 4K, RMC SPORT 1 UHD, BEIN SPORTS 4K).
- **Catalog Source**:
  - Extracted from `https://github.com/leanhhu061206/LIVETV/raw/main/world.m3u` or queried via `POST https://vavoo.to/mediahubmx-catalog.json`.
- **Authentication Handshake (Lokke / MediaHubMX)**:
  1. `POST https://www.lokke.app/api/app/ping` with spoofed Android device metadata:
     - Returns ephemeral JWT `addonSig` valid for 10-15 minutes.
  2. `POST https://vavoo.to/mediahubmx-resolve.json` with headers:
     - `mediahubmx-signature: {addonSig}`
     - `user-agent: MediaHubMX/2`
     - Body: `{"language": "de", "region": "AT", "url": "https://vavoo.to/vavoo-iptv/play/{channelId}", "clientVersion": "3.0.2"}`
  3. Response contains ephemeral Sunshine streaming server link:
     - `http://{server_ip}:8008/sunshine/{crypto_token}/hls/index.m3u8`
- **Playback Properties**:
  - Protocol: Native HLS with `.ts` segments.
  - Bitrate: Measured up to **17.85 Mbps** (TF1 4K) and **7.13 Mbps** (Canal+ Sport 4K).
  - Stream Headers: Requires `User-Agent: MediaHubMX/2` and `Referer: https://vavoo.to/`.
  - Resilience Rule: Edge nodes load balance across restream capture tuners. If an edge node returns `502 Unavailable 3`, the resolver must retry to fetch an alternate sunshine node IP.

---

### Reference Repositories
1. `https://github.com/leanhhu061206/LIVETV`: Source of `world.m3u` containing 10,000+ Vavoo streams and 175 4K/UHD entries.
2. `https://github.com/qwertyuiop8899/TV`: Original parent repo with master `lista.py`, EPG builder (`epg.py`), and TMDB/VixSrc VOD scrapers (`film.py`, `serie.py`).
3. `https://github.com/qwertyuiop8899/tvvoo`: Dedicated Stremio addon implementing the on-the-fly Vavoo signature resolver.
4. `https://github.com/mhdzumair/mediaflow-proxy`: Production reverse engineering of Vavoo extractor (`mediaflow_proxy/extractors/vavoo.py`).

---

## 2. Nuvio Integration Strategy

### Zero Server Bandwidth Rule
- Never proxy video chunks (`.ts` or `.m4s`) through the Nuvio Node.js process.
- The addon only performs lightweight metadata fetches and token resolution (few KB of JSON).
- The resolved `.m3u8` URL is passed to Stremio with `behaviorHints.proxyHeaders`. Stremio's native media engine (ExoPlayer / libmpv / AVPlayer) pulls the segments directly from the edge CDN.

class StreamScoringService {
  constructor() {}

  /**
   * Calculates a score out of 100 for a stream to determine sorting order.
   * Higher score = better UX for the user.
   */
  calculateScore(streamEntity, sourceName) {
    let score = 50; // Base score

    // 1. Native HLS vs Web Player (External)
    if (streamEntity.url) {
      score += 30; // Direct streaming is always preferred
    } else if (streamEntity.externalUrl) {
      score -= 20; // Having to open a web browser is a worse UX
    }

    // 2. Resolution
    const title = streamEntity.title || streamEntity.name || '';
    const res = String(streamEntity.resolution || streamEntity.quality || '').toLowerCase();
    if (title.includes('1080p') || res.includes('1080')) {
      score += 20;
    } else if (title.includes('720p') || res.includes('720')) {
      score += 10;
    } else if (title.includes('540p') || title.includes('SD') || res.includes('540') || res === 'sd') {
      score -= 5;
    }

    // 3. TikTok CDN / Cloudflare Worker Penalty
    // Streams that offload video chunks onto TikTok CDN require Cloudflare Worker
    // proxying to uncloak the 42-byte fake WebP RIFF header. To save limited CF
    // worker invocations, heavily prioritize clean direct CDN streams.
    const isTikTok = Boolean(
      streamEntity.isTikTok ||
      streamEntity._isTikTok ||
      (typeof streamEntity.url === 'string' && /tiktokcdn|byteoversea|ibytedtos|\.image/i.test(streamEntity.url))
    );

    if (isTikTok) {
      score -= 30; // Deprioritize worker-heavy streams
    } else {
      // Direct CDN bonus for providers that bypass Cloudflare Workers entirely:
      // DaddyLive is top (+20), Vavoo is solid (+15, higher than SKTech's +10)
      if (sourceName === 'daddylive' || streamEntity._source === 'daddylive') {
        score += 20;
      } else if (sourceName === 'vavoo' || streamEntity._source === 'vavoo') {
        score += 15;
      } else if (sourceName === 'sktech' || streamEntity._source === 'sktech') {
        score += 10;
      } else {
        const otherDirect = ['golf', 'ppvst', 'damitv'];
        if (otherDirect.includes(sourceName) || (streamEntity._source && otherDirect.includes(streamEntity._source))) {
          score += 10;
        }
      }
    }

    // 4. Source Reliability
    // Non-TikTok reliable sources
    const reliableSources = ['daddylive', 'golf', 'echo', 'delta', 'vavoo', 'ppvst'];
    if (!isTikTok && reliableSources.includes(sourceName)) {
      score += 15;
    } else if (sourceName === 'timstreams') {
      score += 5;
    }

    return score;
  }
}

module.exports = StreamScoringService;

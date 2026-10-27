'use strict';

// Only inspect a bounded number of iframe tags; this does not fetch any page.
// Prefer a candidate already understood by the provider, while retaining the
// first valid iframe as the existing fallback for unknown player formats.
function findBridgeIframe(html, baseUrl, isKnownPlayer, maxCandidates = 8) {
  if (typeof html !== 'string') return null;
  let fallback = null;
  let count = 0;
  const pattern = /<iframe[^>]+src="([^"]+)"/gi;
  for (const match of html.matchAll(pattern)) {
    if (++count > maxCandidates) break;
    let parsed;
    try { parsed = new URL(match[1], baseUrl); } catch (_) { continue; }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) continue;
    if (!fallback) fallback = parsed.href;
    if (isKnownPlayer(parsed)) return parsed.href;
  }
  return fallback;
}

module.exports = { findBridgeIframe };

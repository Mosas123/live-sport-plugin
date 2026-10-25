'use strict';

const express = require('express');
const router = express.Router();
const byteRangeSigner = require('../services/ByteRangeSigner');
const net = require('net');
const { classifyAddress, isReservedHostname } = require('../services/OutboundUrlGuard');

/**
 * GET /api/hls/resource/:token/media.ts
 * GET /hls/resource/:token/media.ts (alias)
 *
 * Zero-bandwidth 307 Temporary Redirect for HLS Byte-Range segments.
 *
 * The player requests this URI with a "Range: bytes=42-..." header (generated
 * by the player's HLS engine after reading #EXT-X-BYTERANGE:<length>@42).
 *
 * This handler validates the HMAC signature (psig) and immediately redirects
 * directly to the upstream CDN URL (TikTok CDN, strmd.st, etc.) with HTTP 307.
 * Modern HLS players preserve the Range header across 307 redirects, allowing
 * the upstream CDN to slice off the 42 fake WebP bytes at the CDN edge!
 *
 * Server outbound bandwidth: 0 KB/s.
 */
function handleSegmentRedirect(req, res) {
  const token = req.params.token;
  const psig = req.query.psig;

  if (!token || !psig) {
    return res.status(400).send('Missing token or signature');
  }

  const payload = byteRangeSigner.verifySegmentToken(token, psig);
  if (!payload || !payload.url) {
    return res.status(403).send('Invalid or expired signature');
  }

  // Tokens are signed, but reject malformed or local destinations before issuing a redirect.
  let destination;
  try {
    destination = new URL(payload.url);
  } catch (_) {
    return res.status(403).send('Invalid redirect destination');
  }
  if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
    return res.status(403).send('Invalid redirect protocol');
  }
  let hostname = destination.hostname.toLowerCase();
  if (hostname.startsWith('[') && hostname.endsWith(']')) hostname = hostname.slice(1, -1);
  if (!hostname || isReservedHostname(hostname) || ((net.isIP(hostname) !== 0) && classifyAddress(hostname))) {
    return res.status(403).send('Blocked redirect destination');
  }

  // Set CORS headers so browser-based Hls.js clients can read headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  res.setHeader('Cache-Control', 'private, max-age=30');

  // Issue 307 Temporary Redirect directly to upstream CDN
  return res.redirect(307, payload.url);
}

// Support OPTIONS for CORS pre-flight
function handleCorsPreflight(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  return res.sendStatus(204);
}

router.options('/api/hls/resource/:token/media.ts', handleCorsPreflight);
router.get('/api/hls/resource/:token/media.ts', handleSegmentRedirect);

router.options('/hls/resource/:token/media.ts', handleCorsPreflight);
router.get('/hls/resource/:token/media.ts', handleSegmentRedirect);

module.exports = router;

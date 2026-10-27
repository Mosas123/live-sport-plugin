'use strict';
const { findBridgeIframe, matchesHost, isByseHost } = require('../src/providers/bridgeIframe');
const known = url => /\.(m3u8|mp4)$/i.test(url.pathname);
const base = 'https://bridge.example/dir/page';

test('keeps the first valid iframe when no candidate is recognized', () => {
  expect(findBridgeIframe('<iframe src="/unknown"></iframe><iframe src="/other"></iframe>', base, known))
    .toBe('https://bridge.example/unknown');
});
test('skips invalid and non-http URLs and resolves relative media with its signed query', () => {
  const html = '<iframe src="http://["></iframe><iframe src="javascript:alert(1)"></iframe><iframe src="../video/game.m3u8?token=a%2Bb%3D"></iframe>';
  expect(findBridgeIframe(html, base, known)).toBe('https://bridge.example/video/game.m3u8?token=a%2Bb%3D');
});
test('does not inspect beyond the candidate limit', () => {
  const html = Array.from({ length: 8 }, (_, i) => `<iframe src="/unknown${i}"></iframe>`).join('') + '<iframe src="/video.mp4"></iframe>';
  expect(findBridgeIframe(html, base, known)).toBe('https://bridge.example/unknown0');
});
test('recognizes configured domains and subdomains but not lookalikes', () => {
  expect(matchesHost('player.vidara.so', 'vidara.so')).toBe(true);
  expect(matchesHost('vidara.so.attacker.example', 'vidara.so')).toBe(false);
  expect(isByseHost('bysexyz.com')).toBe(true);
  expect(isByseHost('bysexyz.com.attacker.example')).toBe(false);
});

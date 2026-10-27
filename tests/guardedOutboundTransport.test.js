'use strict';
jest.mock('undici', () => ({ ...jest.requireActual('undici'), request: jest.fn() }));
const dns = require('node:dns');
const { request } = require('undici');
const { guardedFetch } = require('../src/services/GuardedOutbound');

function body(text = '') {
  const value = Buffer.from(text);
  return {
    on: jest.fn(), destroy: jest.fn(),
    arrayBuffer: async () => value,
    async *[Symbol.asyncIterator]() { yield value; }
  };
}

describe('guarded external redirect transport', () => {
  let lookup;
  beforeEach(() => {
    request.mockReset();
    lookup = jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });
  afterEach(() => lookup.mockRestore());

  test.each([301, 302, 303, 307, 308])('rejects a public-to-loopback %s before the second transport call', async statusCode => {
    const redirectBody = body();
    request.mockResolvedValueOnce({ statusCode, headers: { location: 'http://127.0.0.1:7003/api/cache/stats' }, body: redirectBody });
    await expect(guardedFetch('https://cdn.example.org/playlist')).rejects.toMatchObject({ code: 'ERR_OUTBOUND_BLOCKED' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(redirectBody.destroy).toHaveBeenCalledTimes(1);
  });

  test('valid relative redirects preserve signed query and response URL', async () => {
    request.mockResolvedValueOnce({ statusCode: 302, headers: { location: '/live/index.m3u8?token=a%2Bb%3D' }, body: body() })
      .mockResolvedValueOnce({ statusCode: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' }, body: body('#EXTM3U\nseg.ts') });
    const response = await guardedFetch('https://cdn.example.org/start');
    expect(response.url).toBe('https://cdn.example.org/live/index.m3u8?token=a%2Bb%3D');
    expect(await response.text()).toBe('#EXTM3U\nseg.ts');
    expect(request.mock.calls[1][1].maxRedirections).toBe(0);
  });

  test('manual redirects return the Location without contacting or approving a second destination', async () => {
    request.mockResolvedValueOnce({ statusCode: 302, headers: { location: 'http://127.0.0.1/private' }, body: body('redirect') });
    const response = await guardedFetch('https://cdn.example.org/', { redirect: 'manual' });
    expect(response.status).toBe(302); expect(response.headers.get('location')).toBe('http://127.0.0.1/private');
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('redirect:error releases the first body without contacting the redirected host', async () => {
    const redirectBody = body();
    request.mockResolvedValueOnce({ statusCode: 302, headers: { location: '/next' }, body: redirectBody });
    await expect(guardedFetch('https://cdn.example.org/', { redirect: 'error' })).rejects.toThrow('Redirect forbidden');
    expect(request).toHaveBeenCalledTimes(1); expect(redirectBody.destroy).toHaveBeenCalledTimes(1);
  });

  test('private initial targets never enter the transport', async () => {
    await expect(guardedFetch('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({ statusCode: 403 });
    expect(request).not.toHaveBeenCalled();
  });

  test('a DNS failure has no unguarded transport fallback', async () => {
    lookup.mockRejectedValue(Object.assign(new Error('failed'), { code: 'ENOTFOUND' }));
    await expect(guardedFetch('https://cdn.example.org/start')).rejects.toMatchObject({ reason: 'dns_resolution_failed' });
    expect(request).not.toHaveBeenCalled();
  });

  test('redirect loops are bounded and release every response body', async () => {
    const redirectBody = body();
    request.mockResolvedValue({ statusCode: 302, headers: { location: '/loop' }, body: redirectBody });
    await expect(guardedFetch('https://cdn.example.org/loop')).rejects.toMatchObject({ code: 'ERR_OUTBOUND_REDIRECT_LIMIT' });
    expect(request).toHaveBeenCalledTimes(6);
    expect(redirectBody.destroy).toHaveBeenCalledTimes(6);
  });

  test('retains caller cancellation instead of starting the request', async () => {
    const abort = new AbortController();
    abort.abort(new Error('caller stopped'));
    await expect(guardedFetch('https://cdn.example.org/', { signal: abort.signal })).rejects.toThrow('caller stopped');
    expect(request).not.toHaveBeenCalled();
  });

  test('metadata probes still honor safeFetch maxBodyBytes', async () => {
    request.mockResolvedValue({ statusCode: 200, headers: {}, body: body('1234567890') });
    const response = await guardedFetch('https://cdn.example.org/', { maxBodyBytes: 4 });
    expect(await response.text()).toBe('1234');
    expect(response.bodyTruncated).toBe(true);
  });

  test('guardExternal cannot fall back to impit or a caller-supplied dispatcher', async () => {
    const { safeFetch } = require('../src/impitClient');
    await expect(safeFetch('http://127.0.0.1/', { guardExternal: true, dispatcher: {} })).rejects.toMatchObject({ code: 'ERR_OUTBOUND_BLOCKED' });
    expect(request).not.toHaveBeenCalled();
  });
});

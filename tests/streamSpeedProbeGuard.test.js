'use strict';

jest.mock('../src/container', () => ({ resolve: jest.fn() }));

jest.mock('../src/services/OutboundUrlGuard', () => ({
  ...jest.requireActual('../src/services/OutboundUrlGuard'),
  checkOutboundUrl: jest.fn(),
}));

const { checkOutboundUrl } = require('../src/services/OutboundUrlGuard');
const { guardedProbeFetch, readProbeBytes } = require('../src/streams');

function response(status, location) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => name.toLowerCase() === 'location' ? location || null : null },
    body: { cancel: jest.fn().mockResolvedValue(undefined) },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  checkOutboundUrl.mockReset();
});

describe('guarded speed-probe fetch', () => {
  test('blocks a private redirect target before sending a request to it', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(302, 'http://private.example/metadata'));
    checkOutboundUrl.mockImplementation(async url => url.includes('private.example')
      ? { ok: false, reason: 'blocked_address' }
      : { ok: true, url, addresses: ['93.184.216.34'] });

    await expect(guardedProbeFetch('https://public.example/segment.ts'))
      .rejects.toMatchObject({ code: 'EOUTBOUNDURLBLOCKED', statusCode: 403 });

    expect(checkOutboundUrl).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://public.example/segment.ts');
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  test('follows a permitted redirect only after validating its target', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(302, '/media.ts'))
      .mockResolvedValueOnce(response(200));
    checkOutboundUrl.mockImplementation(async url => ({ ok: true, url, addresses: ['93.184.216.34'] }));

    const result = await guardedProbeFetch('https://cdn.example/live/master.m3u8');
    expect(result.status).toBe(200);
    expect(checkOutboundUrl.mock.calls.map(args => args[0])).toEqual([
      'https://cdn.example/live/master.m3u8',
      'https://cdn.example/media.ts',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('reads no more than the configured probe window', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    });
    expect(await readProbeBytes(stream, 5)).toBe(5);
  });
  test('rejects an unrelated URL on the addon origin instead of automatically trusting it', async () => {
    const { BASE_URL } = require('../src/config');
    const url = new URL('/api/cache/private-key', BASE_URL).toString();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(200));
    checkOutboundUrl.mockResolvedValue({ ok: false, reason: 'blocked_address' });
    await expect(guardedProbeFetch(url))
      .rejects.toMatchObject({ code: 'EOUTBOUNDURLBLOCKED' });
    expect(checkOutboundUrl).toHaveBeenCalledWith(url);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('permits only the signed HLS redirect path on the addon origin without a public-address check', async () => {
    const { BASE_URL } = require('../src/config');
    const url = new URL('/api/hls/resource/signed-token/media.ts?psig=abc', BASE_URL).toString();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(200));
    const result = await guardedProbeFetch(url);
    expect(result.status).toBe(200);
    expect(checkOutboundUrl).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('blocks a forbidden redirect protocol even when the first URL was allowed', async () => {
    checkOutboundUrl.mockResolvedValue({ ok: true });
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(302, 'file:///etc/hostname'));
    await expect(guardedProbeFetch('https://cdn.example/segment.ts'))
      .rejects.toThrow('Blocked speed-probe redirect protocol');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('stops after two redirects rather than fetching an unbounded chain', async () => {
    checkOutboundUrl.mockResolvedValue({ ok: true });
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValue(response(302, '/again'));
    await expect(guardedProbeFetch('https://cdn.example/segment.ts'))
      .rejects.toMatchObject({ code: 'ETOOMANYREDIRECTS' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('does not buffer an entire non-streaming response as a fallback', async () => {
    const arrayBuffer = jest.fn(async () => new ArrayBuffer(5 * 1024 * 1024));
    const body = { arrayBuffer };
    await expect(readProbeBytes(body, 1024)).resolves.toBe(0);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  test('cancels the stream once the byte budget is reached', async () => {
    const reader = {
      read: jest.fn().mockResolvedValueOnce({ done: false, value: new Uint8Array(100) }),
      cancel: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn(),
    };
    expect(await readProbeBytes({ getReader: () => reader }, 16)).toBe(16);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(reader.read).toHaveBeenCalledTimes(1);
  });

});

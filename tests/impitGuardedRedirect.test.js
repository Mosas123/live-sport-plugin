'use strict';

jest.mock('impit', () => ({
  Impit: class {
    fetch(...args) { return mockImpitFetch(...args); }
  },
}));
jest.mock('undici', () => ({
  request: jest.fn(() => { throw new Error('undici should not be used for guarded Impit redirects'); }),
  Agent: class { constructor() {} close() { return Promise.resolve(); } },
}));
jest.mock('../src/services/OutboundUrlGuard', () => ({
  ...jest.requireActual('../src/services/OutboundUrlGuard'),
  checkOutboundUrl: jest.fn(),
}));

const mockImpitFetch = jest.fn();
const { checkOutboundUrl } = require('../src/services/OutboundUrlGuard');
const { safeFetch } = require('../src/impitClient');

function impitResponse(status, location) {
  return {
    status,
    headers: { get: name => name.toLowerCase() === 'location' ? location || null : null },
    body: { cancel: jest.fn().mockResolvedValue(undefined) },
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

beforeEach(() => {
  mockImpitFetch.mockReset();
  checkOutboundUrl.mockReset();
});

describe('safeFetch guarded redirects retain the Impit transport', () => {
  test('blocks a private redirect before making the second request', async () => {
    mockImpitFetch.mockResolvedValueOnce(impitResponse(302, 'http://127.0.0.1:8080/metadata'));
    checkOutboundUrl.mockImplementation(async url => url.includes('127.0.0.1')
      ? { ok: false, reason: 'blocked_address' }
      : { ok: true, url, addresses: ['93.184.216.34'] });

    await expect(safeFetch('https://cdn.example/master.m3u8', {
      validateRedirect: checkOutboundUrl,
      attempts: 1,
    })).rejects.toMatchObject({ code: 'EOUTBOUNDURLBLOCKED', statusCode: 403 });

    expect(mockImpitFetch).toHaveBeenCalledTimes(1);
    expect(mockImpitFetch.mock.calls[0][0]).toBe('https://cdn.example/master.m3u8');
  });

  test('validates and follows public redirects using Impit, stripping cross-origin credentials', async () => {
    mockImpitFetch
      .mockResolvedValueOnce(impitResponse(302, 'https://mirror.example/live.m3u8'))
      .mockResolvedValueOnce(impitResponse(200));
    checkOutboundUrl.mockImplementation(async url => ({ ok: true, url, addresses: ['93.184.216.34'] }));

    const res = await safeFetch('https://cdn.example/master.m3u8', {
      validateRedirect: checkOutboundUrl,
      attempts: 1,
      headers: { Cookie: 'secret=1', Authorization: 'Bearer secret', Host: 'cdn.example', 'User-Agent': 'test-agent' },
    });

    expect(res.status).toBe(200);
    expect(checkOutboundUrl.mock.calls.map(args => args[0])).toEqual([
      'https://cdn.example/master.m3u8',
      'https://mirror.example/live.m3u8',
    ]);
    expect(mockImpitFetch).toHaveBeenCalledTimes(2);
    expect(mockImpitFetch.mock.calls[1][0]).toBe('https://mirror.example/live.m3u8');
    const redirectedHeaders = mockImpitFetch.mock.calls[1][1].headers;
    for (const key of ['cookie', 'authorization', 'host']) {
      expect(Object.keys(redirectedHeaders).some(k => k.toLowerCase() === key)).toBe(false);
    }
    expect(redirectedHeaders['User-Agent']).toBe('test-agent');
  });
});

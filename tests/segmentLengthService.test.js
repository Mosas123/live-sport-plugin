'use strict';

jest.mock('../src/impitClient', () => ({ safeFetch: jest.fn() }));

const segmentLengthService = require('../src/services/SegmentLengthService');
const { safeFetch } = require('../src/impitClient');
const { SegmentLengthService } = segmentLengthService;

function fakeHeaders(map = {}) {
  return { get: (k) => (map[String(k).toLowerCase()] !== undefined ? map[String(k).toLowerCase()] : null) };
}

describe('SegmentLengthService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SegmentLengthService({ maxSize: 10, autoProbe: false });
  });

  afterEach(() => {
    service.clear();
  });

  test('alignToTsPacket aligns bytes down to multiple of 188', () => {
    expect(service.alignToTsPacket(1000)).toBe(940); // 188 * 5 = 940
    expect(service.alignToTsPacket(188)).toBe(188);
    expect(service.alignToTsPacket(100)).toBe(188); // floor guard
  });

  test('returns cached length if available and not expired', () => {
    const url = 'https://cdn.example.com/chunk_1.image';
    service.setCachedLength(url, 500000);

    const length = service.getSegmentLength(url);
    expect(length).toBe(500000);
  });

  test('returns estimate based on duration and bitrate when not cached', () => {
    const url = 'https://cdn.example.com/chunk_uncached.image';
    // 6 seconds @ 4,000,000 bps = 3,000,000 bytes total.
    // Minus 42 = 2,999,958. Aligned down to 188: 15957 * 188 = 2,999,916.
    const length = service.getSegmentLength(url, { duration: 6.0, bitrate: 4000000 });
    expect(length).toBe(2999916);
    expect(length % 188).toBe(0);
  });

  test('returns default fallback when duration is not provided', () => {
    const url = 'https://cdn.example.com/chunk_unknown.image';
    // 1,022,720 minus 42 = 1,022,678, aligned: 5439 * 188 = 1,022,532.
    const length = service.getSegmentLength(url);
    expect(length).toBe(1022532);
    expect(length % 188).toBe(0);
  });

  test('probed true length replaces the estimate once cached', async () => {
    const url = 'https://cdn.example.com/chunk_probed.image';
    safeFetch.mockResolvedValueOnce({
      status: 206,
      headers: fakeHeaders({ 'content-range': 'bytes 0-0/3535338' })
    });

    const svc = new SegmentLengthService({ maxSize: 10 }); // autoProbe on
    const estimate = svc.getSegmentLength(url, { duration: 3.84 });
    expect(estimate % 188).toBe(0);

    const probed = await svc.inFlightProbes.get(url);
    expect(probed).toBe(3535338 - 42); // true payload excluding the 42-byte cloak

    expect(svc.getSegmentLength(url, { duration: 3.84 })).toBe(3535338 - 42);
    expect(svc.cache.get(url).length).toBe(3535338 - 42);
  });

  test('falls back to HEAD when the ranged GET carries no Content-Range', async () => {
    const url = 'https://cdn.example.com/chunk_head.image';
    safeFetch
      .mockResolvedValueOnce({ status: 403, headers: fakeHeaders({}) })
      .mockResolvedValueOnce({ status: 200, headers: fakeHeaders({ 'content-length': '2000042' }) });

    const svc = new SegmentLengthService({ maxSize: 10 });
    const probed = await svc.probeContentLength(url, { duration: 3.84 });

    expect(probed).toBe(2000042 - 42);
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(safeFetch.mock.calls[0][1].method).toBe('GET');
    expect(safeFetch.mock.calls[0][1].headers.Range).toBe('bytes=0-0');
    expect(safeFetch.mock.calls[1][1].method).toBe('HEAD');
  });

  test('full 200 range fallback reads at most 1 KiB and still uses full object metadata', async () => {
    const url = 'https://cdn.example.com/ignores-range.image';
    safeFetch.mockResolvedValueOnce({
      status: 200,
      bodyTruncated: true,
      headers: fakeHeaders({ 'content-length': '5000042' }),
    });
    const size = await service.probeContentLength(url);
    expect(size).toBe(5000000);
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(safeFetch.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: 'GET',
      maxBodyBytes: 1024,
      attempts: 1,
    }));
  });

  test('206 Content-Range total is accepted with the capped ranged body', async () => {
    const url = 'https://cdn.example.com/ranged.image';
    safeFetch.mockResolvedValueOnce({
      status: 206,
      headers: fakeHeaders({ 'content-range': 'bytes 0-0/6000042', 'content-length': '1' }),
    });
    expect(await service.probeContentLength(url)).toBe(6000000);
    expect(safeFetch.mock.calls[0][1].maxBodyBytes).toBe(1024);
  });

  test('a rejected ranged probe never treats an error-page length as segment size', async () => {
    const url = 'https://cdn.example.com/access-denied.image';
    safeFetch
      .mockResolvedValueOnce({ status: 403, headers: fakeHeaders({ 'content-length': '9990042' }) })
      .mockResolvedValueOnce({ status: 200, headers: fakeHeaders({ 'content-length': '2000042' }) });
    expect(await service.probeContentLength(url)).toBe(2000000);
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(safeFetch.mock.calls[1][1]).toEqual(expect.objectContaining({
      method: 'HEAD',
      maxBodyBytes: 1024,
    }));
    expect(service.getSegmentLength(url)).toBe(2000000);
  });

  test('partial 206 Content-Length without Content-Range is not a full object length', async () => {
    const url = 'https://cdn.example.com/partial-without-total.image';
    safeFetch
      .mockResolvedValueOnce({ status: 206, headers: fakeHeaders({ 'content-length': '65536' }) })
      .mockResolvedValueOnce({ status: 200, headers: fakeHeaders({ 'content-length': '3333042' }) });
    expect(await service.probeContentLength(url)).toBe(3333000);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  test('a failed HEAD error page cannot poison the segment length cache', async () => {
    const url = 'https://cdn.example.com/head-denied.image';
    safeFetch
      .mockResolvedValueOnce({ status: 403, headers: fakeHeaders({ 'content-length': '5000042' }) })
      .mockResolvedValueOnce({ status: 403, headers: fakeHeaders({ 'content-length': '6000042' }) });
    expect(await service.probeContentLength(url)).toBeNull();
    expect(service.hasValidLength(url)).toBe(false);
    expect(service.probeFailures.has(url)).toBe(true);
  });

  test('a failed probe caches NOTHING and suppresses re-probing briefly', async () => {
    const url = 'https://cdn.example.com/chunk_dead.image';
    safeFetch.mockRejectedValue(new Error('cdn blocked'));

    const svc = new SegmentLengthService({ maxSize: 10 });
    const estimate = svc.getSegmentLength(url, { duration: 3.84 });
    await svc.inFlightProbes.get(url);

    expect(estimate % 188).toBe(0);
    expect(svc.cache.size).toBe(0); // estimate must NOT be cached as truth
    expect(svc.probeFailures.has(url)).toBe(true);

    // Next call within the retry window reuses the estimate without probing.
    safeFetch.mockClear();
    svc.getSegmentLength(url, { duration: 3.84 });
    expect(safeFetch).not.toHaveBeenCalled();
  });

  test('evicts oldest entries when cache reaches capacity', () => {
    for (let i = 0; i < 12; i++) {
      service.setCachedLength(`https://cdn.example.com/chunk_${i}.image`, 100000 + i);
    }
    expect(service.cache.size).toBeLessThanOrEqual(10);
  });

  test('caps concurrent probes and releases slots when a probe resolves', async () => {
    const svc = new SegmentLengthService({ maxSize: 10, maxConcurrentProbes: 2 });
    const pending = [];
    safeFetch.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));

    const firstUrl = 'https://cdn.example.com/chunk_limit_1.image';
    const secondUrl = 'https://cdn.example.com/chunk_limit_2.image';
    const rejectedUrl = 'https://cdn.example.com/chunk_limit_3.image';
    const nextUrl = 'https://cdn.example.com/chunk_limit_4.image';
    const okResponse = {
      status: 206,
      headers: fakeHeaders({ 'content-range': 'bytes 0-0/500042' })
    };

    const first = svc.probeContentLength(firstUrl);
    const second = svc.probeContentLength(secondUrl);
    expect(svc.activeProbes).toBe(2);
    expect(pending).toHaveLength(2);

    await expect(svc.probeContentLength(rejectedUrl)).resolves.toBeNull();
    expect(svc.activeProbes).toBe(2);
    expect(pending).toHaveLength(2);
    expect(svc.inFlightProbes.has(rejectedUrl)).toBe(false);
    expect(svc.probeFailures.has(rejectedUrl)).toBe(false);

    pending[0](okResponse);
    await expect(first).resolves.toBe(500000);
    expect(svc.activeProbes).toBe(1);

    const next = svc.probeContentLength(nextUrl);
    expect(svc.activeProbes).toBe(2);
    expect(pending).toHaveLength(3);

    pending[1](okResponse);
    pending[2](okResponse);
    await expect(Promise.all([second, next])).resolves.toEqual([500000, 500000]);
    expect(svc.activeProbes).toBe(0);
  });

  test('releases the active probe slot when safeFetch fails', async () => {
    const svc = new SegmentLengthService({ maxSize: 10, maxConcurrentProbes: 1 });
    safeFetch.mockRejectedValue(new Error('network failure'));

    await expect(svc.probeContentLength('https://cdn.example.com/chunk_error.image')).resolves.toBeNull();
    expect(svc.activeProbes).toBe(0);
  });
});

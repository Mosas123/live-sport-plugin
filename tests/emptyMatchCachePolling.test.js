const fs = require('fs');
const os = require('os');
const path = require('path');
const CacheService = require('../src/services/CacheService');

describe('Empty match-cache disk polling', () => {
  let directory, cache, now, clock;
  function write(matches, mtime = now) {
    fs.writeFileSync(cache.cacheFilePath, JSON.stringify({ matches, timestamp: now }));
    fs.utimesSync(cache.cacheFilePath, new Date(mtime), new Date(mtime));
  }
  function readsFor(spy) {
    // Cache reads may use a path or a stable open descriptor. These synchronous
    // scenarios perform no other descriptor-based file reads.
    return spy.mock.calls.filter(([filename]) => filename === cache.cacheFilePath || typeof filename === 'number').length;
  }
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvio-empty-cache-'));
    cache = new CacheService();
    cache.cacheFilePath = path.join(directory, 'matches.json');
    cache.cachedMatches = [];
    cache.lastDiskMtime = 0;
    cache.lastFetchTime = 0;
    cache.lastStatCheck = 0;
    cache._hasDiskSnapshot = false;
    cache.rev = 0;
    now = 100000;
    clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('1,000 reads of an unchanged empty snapshot do not reread disk or advance its revision', () => {
    write([]);
    cache._loadDiskCache();
    const revision = cache.rev, fetchedAt = cache.lastFetchTime;
    const read = jest.spyOn(fs, 'readFileSync');
    for (let i = 0; i < 1000; i++) expect(cache.getMatches()).toEqual([]);
    expect(readsFor(read)).toBe(0);
    expect(cache.rev).toBe(revision);
    expect(cache.lastFetchTime).toBe(fetchedAt);
    now += 1000;
    expect(cache.getMatches()).toEqual([]);
    expect(readsFor(read)).toBe(0);
    expect(cache.rev).toBe(revision);
  });

  test('an empty snapshot sees a later populated file on the next polling interval', () => {
    write([]);
    cache._loadDiskCache();
    cache.getMatches();
    const revision = cache.rev;
    now += 500;
    write([{ id: 'new-match', sources: [] }]);
    expect(cache.getMatches()).toEqual([]);
    now += 500;
    expect(cache.findMatch('new-match').id).toBe('new-match');
    expect(cache.rev).toBe(revision + 1);
  });

  test('a populated-to-empty transition advances revision once, without invalidating on every read', () => {
    write([{ id: 'old-match', sources: [] }]);
    cache._loadDiskCache();
    cache.getMatches();
    const revision = cache.rev;
    now += 1000;
    write([]);
    expect(cache.getMatches()).toEqual([]);
    expect(cache.rev).toBe(revision + 1);
    for (let i = 0; i < 20; i++) expect(cache.getMatchesReadOnly()).toEqual([]);
    expect(cache.rev).toBe(revision + 1);
  });

  test('a missing cache file is polled once per interval and is discovered after creation', () => {
    const exists = jest.spyOn(fs, 'existsSync');
    for (let i = 0; i < 100; i++) cache.getMatchesReadOnly();
    expect(exists.mock.calls.filter(([filename]) => filename === cache.cacheFilePath)).toHaveLength(1);
    now += 1000;
    write([{ id: 'created-match', sources: [] }]);
    expect(cache.findMatch('created-match').id).toBe('created-match');
  });

  test('invalid JSON is retried at the polling interval, then a valid snapshot can recover', () => {
    fs.writeFileSync(cache.cacheFilePath, '{broken');
    const read = jest.spyOn(fs, 'readFileSync');
    for (let i = 0; i < 100; i++) cache.getMatches();
    expect(readsFor(read)).toBe(1);
    now += 1000;
    write([{ id: 'recovered', sources: [] }]);
    expect(cache.findMatch('recovered').id).toBe('recovered');
    expect(cache.rev).toBe(1);
  });

  test('an initial snapshot is loaded even if its file timestamp is zero', () => {
    write([{ id: 'epoch', sources: [] }], 0);
    expect(cache.findMatch('epoch').id).toBe('epoch');
  });
});

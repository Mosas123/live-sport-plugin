const fs = require('fs');
const os = require('os');
const path = require('path');
const CacheService = require('../src/services/CacheService');

describe('Atomic match-cache file identity', () => {
  let directory, cache, now, replacement;
  function install(id, mtime) {
    const temp = path.join(directory, `replacement-${replacement++}.json`);
    fs.writeFileSync(temp, JSON.stringify({ matches: [{ id, sources: [] }], timestamp: now }));
    fs.utimesSync(temp, new Date(mtime), new Date(mtime));
    fs.renameSync(temp, cache.cacheFilePath);
  }
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvio-file-identity-'));
    cache = new CacheService();
    cache.cacheFilePath = path.join(directory, 'matches.json');
    cache.cachedMatches = [];
    cache.lastDiskMtime = 0;
    cache.lastStatCheck = 0;
    cache._hasDiskSnapshot = false;
    cache._diskSignature = null;
    cache.rev = 0;
    now = 100000;
    replacement = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('detects atomic replacement with the same mtime and byte length', () => {
    install('a', now);
    cache.getMatches();
    const previous = fs.statSync(cache.cacheFilePath), revision = cache.rev;
    install('b', now);
    const current = fs.statSync(cache.cacheFilePath);
    expect(current.mtimeMs).toBe(previous.mtimeMs);
    expect(current.size).toBe(previous.size);
    now += 1000;
    expect(cache.getMatches().map(m => m.id)).toEqual(['b']);
    expect(cache.rev).toBe(revision + 1);
  });

  test('detects a replacement whose timestamp moves backwards', () => {
    install('a', now + 10000);
    cache.getMatches();
    install('b', now);
    now += 1000;
    expect(cache.getMatches().map(m => m.id)).toEqual(['b']);
  });

  (process.platform === 'win32' ? test.skip : test)('a concurrent replacement after local rename is detected on the next poll', () => {
    const originalRename = fs.renameSync;
    const originalStat = fs.statSync;
    let replaced = false;
    jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      originalRename(source, destination);
      if (destination === cache.cacheFilePath && !replaced) {
        replaced = true;
        install('other-worker', originalStat(destination).mtimeMs + 1000);
      }
    });
    cache.setMatches([{ id: 'local-worker', sources: [] }]);
    expect(cache.cachedMatches[0].id).toBe('local-worker');
    now += 1000;
    expect(cache.getMatches().map(m => m.id)).toEqual(['other-worker']);
  });

  test('loaded bytes and recorded metadata describe the same open file during replacement', () => {
    install('a', now);
    cache.getMatches();
    install('b', now + 1000);
    const originalStat = fs.statSync;
    let replaced = false;
    jest.spyOn(fs, 'statSync').mockImplementation((filename, ...args) => {
      const stats = originalStat(filename, ...args);
      if (filename === cache.cacheFilePath && !replaced) {
        replaced = true;
        install('c', now + 2000);
      }
      return stats;
    });
    now += 1000;
    expect(cache.getMatches().map(m => m.id)).toEqual(['c']);
    expect(cache.lastDiskMtime).toBe(originalStat(cache.cacheFilePath).mtimeMs);
    const revision = cache.rev;
    now += 1000;
    cache.getMatches();
    expect(cache.rev).toBe(revision);
  });

  test('a failed rename preserves the previous complete file and removes the temporary file', () => {
    install('old', now);
    const oldContents = fs.readFileSync(cache.cacheFilePath, 'utf8');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('simulated rename failure'); });
    cache.setMatches([{ id: 'new', sources: [] }]);
    expect(fs.readFileSync(cache.cacheFilePath, 'utf8')).toBe(oldContents);
    expect(fs.readdirSync(directory)).toEqual(['matches.json']);
  });

  test('a malformed snapshot closes its open file descriptor', () => {
    fs.writeFileSync(cache.cacheFilePath, '{broken');
    const open = jest.spyOn(fs, 'openSync');
    const close = jest.spyOn(fs, 'closeSync');
    expect(cache.getMatches()).toEqual([]);
    expect(open).toHaveBeenCalledWith(cache.cacheFilePath, 'r');
    const descriptors = open.mock.results.filter(result => result.type === 'return').map(result => result.value);
    for (const fd of descriptors) expect(close).toHaveBeenCalledWith(fd);
    expect(cache.rev).toBe(0);
  });
});

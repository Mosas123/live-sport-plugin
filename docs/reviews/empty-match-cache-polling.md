# Avoid repeated disk reads for empty match caches

Branch: fix/empty-match-cache-polling
Upstream base: 8128ade7752834f3541f1df3b185d6621ad468aa
This is independent of the other pending follow-ups and includes the merged
single-flight/isolation fixes already in upstream main.

## Reproduced problem

CacheService._ensureLoaded() bypassed the one-second polling throttle whenever
cachedMatches was empty. _loadDiskCache() also bypassed its unchanged-mtime guard
for empty snapshots. Consequently, every request could synchronously read/parse
the same empty file, rebuild the indices and increment rev. The revision changes
invalidate downstream catalog memoization despite unchanged match data.

In a controlled-clock test with an already loaded empty snapshot, 1,000 reads
caused 1,000 additional full file reads before the fix. After the fix, they cause
zero additional full reads and leave rev/lastFetchTime unchanged. File metadata
is still checked during the polling interval. This counts I/O operations, not
production latency or throughput.

Missing and malformed files also retried filesystem access on every empty-cache
request rather than at the polling interval.

## Change

Apply the existing one-second polling interval to every cache state. Track whether
a disk snapshot has been loaded or saved independently of the match count, so a
valid empty snapshot uses the unchanged-mtime guard. Preserve initial loading,
including files with timestamp zero, and subsequent disk refresh/index rebuilding.

Externally written files can now take up to the polling interval to become visible
from an empty/missing state, matching the existing populated-state policy. Local
setMatches() continues updating memory immediately. Change detection still relies
on increasing file mtime; this does not introduce a new filesystem revision protocol.

## Validation

Five of six new regression tests failed before the fix and pass afterward; initial
loading with a zero file timestamp is a compatibility control.

Coverage includes repeated empty reads, empty-to-populated and populated-to-empty
transitions, stable revisions, missing-file creation, and malformed-file recovery.
Tests use real temporary files with a controlled clock and inspect actual I/O.

- Focused cache validation: 4 suites, 21 tests passed.
- Full independent branch suite: 45 suites, 617 tests passed on Node 24.19.0.
- git diff --check passed.
- Jest briefly warned about pending async work and then exited with code 0 without
  --forceExit. Live-provider playback and deployment were not tested.
- This standalone branch excludes the other pending fixes, so its test total
  differs from their combined counts.

Workspace command:

```sh
npx jest --runInBand --silent --testPathIgnorePatterns='/node_modules/|/test-scripts/|/nuvio-proxy-2/|/tests/load/'
```

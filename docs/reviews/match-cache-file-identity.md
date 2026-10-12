# Track match-cache snapshots by file identity

Branch: fix/match-cache-file-identity
Base / dependency: fix/empty-match-cache-polling (PR #22).
Review only the additional changes against that branch, and refresh the base
after PR #22 is merged. Other pending shared-cache/response fixes are excluded.

## Reproduced problems

Cache refresh previously required a strictly increasing file mtime. An atomic
replacement with the same timestamp/byte length, or an earlier timestamp, could
therefore leave a worker's old in-memory match list unchanged indefinitely.

On local writes, the worker renamed its temporary file and then statted the
destination path. If another worker replaced that path in between, the first
worker could record the second file's timestamp while retaining its own match
list. Subsequent polls then treated the other worker's file as already loaded.

On reads, path metadata could describe one file while readFileSync(path) opened
another replacement. That mismatch could cause unnecessary reloads/revisions.

## Fix

Compare a metadata signature (device, inode, size, mtime and ctime) rather than
requiring a newer wall-clock mtime. If the path signature changed, open the file
once and obtain both bytes and metadata from the same descriptor.

During saving, open the temporary snapshot before rename and fstat that descriptor
after rename. Record the snapshot actually written, even if another worker has
already replaced the destination. Close descriptors in finally blocks and remove
failed temporary files after closing them.

Atomic rename already existed; this patch preserves it rather than introducing
a new atomic-write strategy. This is filesystem identity tracking, not a global
revision/transaction protocol. It does not prevent competing writers from
replacing each other's changes, and assumes atomic file replacements with usable
filesystem metadata. Arbitrary in-place writers restoring indistinguishable
metadata are outside this guarantee. The one-second polling policy is retained.

## Validation

Four of five initial tests failed before the fix; failed-rename preservation was
an existing-behavior control. A sixth test verifies descriptor cleanup after
malformed JSON.

Tests use real temporary files and controlled interleavings of stat/rename calls:
- equal timestamp and byte-length replacement;
- replacement with a backwards timestamp;
- another worker replacing the destination after a local rename;
- coherent metadata/bytes when replacement occurs between path stat and read;
- previous-file preservation and temporary cleanup after rename failure;
- descriptor closure after invalid JSON.

- Focused cache checks: 5 suites, 27 tests passed.
- Full branch suite: 46 suites, 623 tests passed on Node 24.19.0.
- git diff --check passed.
- Jest briefly warned about pending async work, then exited with code 0 without
  --forceExit. No live-provider playback or deployment was tested.

The empty-cache I/O regression helper was updated to count descriptor-based reads
as well as pathname reads; its expectations remain unchanged.

Workspace command:

```sh
npx jest --runInBand --silent --testPathIgnorePatterns='/node_modules/|/test-scripts/|/nuvio-proxy-2/|/tests/load/'
```

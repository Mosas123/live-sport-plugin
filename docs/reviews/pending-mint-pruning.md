# Prevent locally pruned matches from being restored by pending resolutions

Branch: codex/prune-pending-mints
Base branch: codex/shared-cache-expiry
This follow-up depends on the single-flight/isolation changes in PR #16 and the
shared-cache expiry/pruning follow-up. Review its additional changes against
codex/shared-cache-expiry. It does not include the independent response-deadline branch.

## Reproduced failure

pruneEnded() previously removed stored entries only. If a provider was still
resolving, its completion could later recreate the removed entry and write it
to shared L2. Empty results or late exceptions could also recreate a negative
entry. An outstanding shared-cache lookup could restore the match locally.

Six of seven new unit tests failed before the fix. The preservation test for
active matches and evergreen channels passed and remains a compatibility check.

## Fix

Track a pruning marker for each local pending operation. Mark operations for
removed matches during pruneEnded(), exempting __channel__ entries. Recheck the
marker after shared-cache waits and after provider completion/rejection, before
adopting results or publishing positive/negative entries. Remove operation
metadata when the existing in-flight promise settles.

A new explicit resolution for the same key is allowed after the discarded
operation finishes; the marker belongs to that operation, not a permanent denylist.

## Scope and limitations

This protects operations whose local worker receives pruning before they finish
resolving/adopting a result. It does not cancel provider network work, settle a
provider promise that never returns, broadcast cancellation to other workers,
or undo a shared POST already dispatched before pruning. It is not distributed
claim fencing. A shared claim acquired before pruning may remain until its
normal TTL (currently 30 seconds). The patch deliberately avoids an unconditional
DELETE on discard, which could interfere with another worker's newer result.

## Validation

- Seven unit tests cover late streams, empty answers, exceptions, delayed shared
  lookups, suppression of shared writes, active/channel preservation, and a later
  new resolution of the same key. Operation metadata cleanup is also checked.
- A real-resolver integration test confirms a provider completed after local
  pruning publishes neither a positive nor negative shared payload.
- Focused pruning validation: 2 suites, 13 tests passed.
- Complete branch suite: 46 suites, 628 tests passed on Node 24.19.0.
- git diff --check passed.
- Jest briefly warned about pending async operations and then exited with code 0
  without --forceExit. No live-provider playback or deployment was tested.

Workspace command:

```sh
npx jest --runInBand --silent --testPathIgnorePatterns='/node_modules/|/test-scripts/|/nuvio-proxy-2/|/tests/load/'
```

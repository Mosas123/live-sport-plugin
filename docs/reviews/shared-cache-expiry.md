# Shared-cache expiry and empty-set pruning

This follow-up builds on PR #16 (single-flight and nested cache isolation).
Branch: `codex/shared-cache-expiry`.
Review only the additional changes against `codex/resolve-cache-single-flight`.
Wait for PR #16 to be incorporated before opening this branch against upstream
`main`, or the comparison will also include the earlier fixes.

## Findings

1. A shared positive or negative result can expire between the resolver's
   lookup and the worker receiving it. Previously the worker adopted it and
   returned without retrying. For an expired positive result, the final cache
   read discarded it and the request returned an empty list. The fallback for
   a missing/invalid expiresAt could also assign old URLs a new default lifetime.
2. `pruneEnded([])` removed local match entries but skipped the shared-cache
   POST because `ids.size` was zero. Another worker could still obtain ended
   matches from L2 until their TTL expired. Evergreen `__channel__` entries
   should remain available even when there are no active matches.
3. `get()` treated the exact expiry timestamp as fresh, unlike `getOrCreate()`.

## Fix

Validate that the shared expiry is finite and strictly in the future before
adoption. If the payload is stale, fall through to resolution instead of
returning empty results or inventing a new lifetime. Apply this check to both
shared-result paths. Align local expiry with `getOrCreate()` and send shared
pruning requests even for an empty active-match set.

Pruning remains asynchronous and best-effort. This change does not guarantee
cross-worker invalidation during a resolver outage or cancel pending mints.
Provider cancellation/timeouts and pending-mint invalidation remain pending
review; this patch does not claim to fix them.

## Validation

- Eight new unit regressions failed before the fix and passed after it.
- A real-resolver integration test verifies that empty-set pruning removes
  shared match entries, preserves 24/7 channels, and makes a fresh worker resolve
  the removed match again.
- Focused expiry/prune validation: 2 suites, 13 tests passed.
- Full local suite: 45 suites, 620 tests passed (Node 24.19.0).
- `git diff --check` passed.
- Jest briefly warned about pending async operations and then exited with code 0;
  no `--forceExit` was used. No live-provider playback or deployment was tested.

Workspace test command (avoids the existing absolute `/scratch/` ignore):

```sh
npx jest --runInBand --silent --testPathIgnorePatterns='/node_modules/|/test-scripts/|/nuvio-proxy-2/|/tests/load/'
```

# Enforce the stream response hard deadline

This is an independent change based on upstream commit
6586411cd8935bc7cf3596339187b60a01f4e4ab. It does not require PR #16 or the
shared-cache expiry follow-up. It changes src/streams.js and adds regression tests.

## Problem

If no playable stream arrived before STREAM_SOFT_DEADLINE_MS (default 6 seconds),
handleStream raced all remaining resolutions against the remaining hard budget
(STREAM_HARD_DEADLINE_MS, default 15 seconds overall for the resolution wait).
After that race, it awaited every source promise again. A provider that never
settled could therefore block the response indefinitely despite the hard timer.
Providers which finished early also left their soft-deadline timers running.

## Change

Track each source's settled result and, after the hard wait ends, collect only
completed resolutions. Do not await unfinished promises again. Account for
elapsed resolution time when computing the remaining budget, cap the soft wait
at the hard deadline, and clear response-wait timers when work finishes early.

If nothing completes in time, the request returns an empty stream list. Late
resolutions continue in the cache and can supply the next request. This bounds
the asynchronous response wait; it does not cancel provider network operations,
repair permanently stuck cache mints, or prevent late invalidation races.
The deadline begins when resolution starts, not at HTTP connection acceptance,
and event-loop stalls or synchronous CPU work can still delay timers.

## Validation

Five initial regression tests failed before the change and pass after it:
- all providers remain pending beyond the hard deadline;
- one stream arrives between the soft/hard deadlines while a peer stays pending;
- late fulfillment/rejection leaves the returned response unchanged;
- immediate provider completion leaves no response-wait timers behind;
- a soft deadline larger than the hard deadline cannot extend the response wait.

An additional test uses the real local StreamResolveCache and a deferred provider
stub to verify late completion warms the cache and the next request reuses it
without another provider resolution.

All six deadline tests passed. The complete standalone branch suite passed:
43 suites, 612 tests, Node 24.19.0. This branch excludes the separate cache-fix
branches, so its test count differs from their cumulative count. git diff --check
passed. Jest briefly warned about pending async work and later exited with code 0,
without --forceExit. No live-provider playback or deployment was tested.

Workspace command:

```sh
npx jest --runInBand --silent --testPathIgnorePatterns='/node_modules/|/test-scripts/|/nuvio-proxy-2/|/tests/load/'
```

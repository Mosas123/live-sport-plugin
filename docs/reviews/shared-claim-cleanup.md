# Reclaim expired shared-cache mint reservations

Branch: fix/shared-cache-claim-cleanup
Upstream base: 8128ade7752834f3541f1df3b185d6621ad468aa
This is an independent follow-up on current upstream main, including the merged
single-flight/isolation fixes. It does not depend on the other pending branches.

## Reproduced problem

The resolver stored mint reservations in a claims Map. Expiry stopped a claim
from blocking a new claimant, but did not remove its stored key. If a worker
failed or abandoned a mint without POST/DELETE, and the key was never reused,
expired claims remained in memory indefinitely. The claims Map had no eviction
mechanism corresponding to the existing 500-entry limit on stream payloads.

A controlled-clock experiment left 1,000 expired reservations stored before the
fix. The regression test exercises 2,000 unique keys and confirms zero expired
reservations remain after cleanup. This verifies retained reservation records;
it is not an RSS measurement or a production load benchmark.

## Fix

Reclaim expired claims during normal cache reads, claim acquisition, pruning,
and statistics access. Throttle full scans to once per second of cache activity.
A requested key is still expired immediately at its exact deadline between
sweeps. No background timer is introduced, and live reservations are preserved.
Use the default claim TTL for non-finite or non-positive TTL input, so Infinity
cannot create a reservation that never expires. The existing minimum TTL stays
five seconds and the default stays thirty seconds.

Cleanup is activity-driven. During an idle period, expired records remain until
activity resumes. This is not an absolute cap on the number of simultaneously
live reservations. The patch does not implement claim ownership/fencing,
provider cancellation, or cache-payload invalidation across workers.

## Validation

All six new regressions failed before the fix and passed afterward. They cover
never-reused expired keys, new claim traffic, live stream preservation, active
claim exclusion, exact expiry/reacquisition, and non-finite TTL input. Tests run
the real ESM cache module in fresh Node processes with a controlled clock.

- Focused claim cleanup and shared-resolver integration: 2 suites, 10 tests passed.
- Full independent branch suite: 45 suites, 617 tests passed on Node 24.19.0.
- git diff --check passed.
- Jest briefly warned about pending async work and then exited with code 0;
  no --forceExit was used. Live-provider playback and deployment were not tested.

Workspace command:

```sh
npx jest --runInBand --silent --testPathIgnorePatterns='/node_modules/|/test-scripts/|/nuvio-proxy-2/|/tests/load/'
```

## Suggested PR title

Reclaim expired shared-cache mint reservations

## Suggested PR description

Expired shared-cache mint reservations could remain stored indefinitely when a
worker abandoned a mint and its key was never reused. This PR reclaims those
expired records during cache activity, with full scans throttled to once per
second, while preserving active claims and existing stream payloads.

It also normalizes invalid/non-finite claim TTL input to the existing default.
Six new regression tests reproduce the old failures and pass after the fix.
The full branch suite passes: 45 suites, 617 tests. A controlled-clock test
confirms 2,000 expired reservations are removed; it is not a production memory
or latency benchmark.

Based on current upstream main and independent of the other pending follow-ups.
Cleanup is activity-driven, not a cap on live claims or a distributed ownership
protocol. No live-provider playback or deployment was tested.

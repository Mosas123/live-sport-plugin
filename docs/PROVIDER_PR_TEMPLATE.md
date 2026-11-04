# Provider PR and AI task template

Use this template together with [the provider guide](PROVIDER_GUIDE.md). Replace
all `<placeholders>` and delete cases that do not apply with an explicit reason.
An unchecked box or `NOT RUN` is not a passing test.

This is a proposed provider contribution workflow, not a claim about GitHub
branch-protection rules. The guide records the merged stable baseline containing
reviewed #59/#61 behavior. Verify the actual target tree first; these capabilities
are not automatically available on an older checkout.

## Copy into the PR description

### Problem and resulting behavior

`<Provider>` adds `<live fixtures / 24/7 channels / replays>` from `<source>`.
The implementation obtains `<catalog format>`, resolves `<stream format>`, and
hands `<direct media / signed local manifest / external player>` to the user.
The server fetches `<metadata only / explicitly reviewed media exceptions>`.
State why an existing provider or declarative YAML definition is insufficient.

- Feature switch: `<NAME_ENABLED>`, default `<false / justified existing default>`.
- Disabled behavior: `<discovery, direct dispatch and custom routes>` perform no
  provider I/O; the controlled route response is `<status/body classification>`.
- Unsupported cases: `<DASH, DRM, unavailable region, notice media, other>`.
- Expected visible change: `<concrete before/after example>`.
- Remaining limitation: `<specific limitation and user impact>`.

### Exact base and provenance

| Item | Value |
| --- | --- |
| Target branch and SHA | `<branch> / <full SHA>` |
| Dependency commits | `<full SHAs; e.g. guarded transport and mapping>` |
| Candidate SHA and tree | `<full SHA> / <tree SHA>` |
| Source evidence | `<synthetic fixture / sanitized captured response; acquisition time>` |
| Source staging | `<checkout / git archive provenance and selected source hashes>` |
| Toolchain and install | `<Node, npm, locked dependencies, captured install result>` |
| Build | `<captured result, index byte size and measured SHA-256>` |
| Active isolated catalog | `<full hash, event count and activation time; no private contents>` |

A build hash identifies those bytes; it does not prove the checkout's commit.
A branch name, screenshot or filename is not independent source provenance.
Record the candidate that actually ran after a conflict resolution or rebase.

### Provider classification and design choice

Select every applicable class and complete its required cases below.

| Class | Chosen implementation | Required extra evidence |
| --- | --- | --- |
| JSON/API | `<schema validator and per-entry parser>` | Partial endpoint failure, malformed neighbors, bounded/truncated body |
| HTML/iframe | `<extractor and hop limit>` | Relative/protocol-relative URLs, final redirected base, supported host boundaries |
| Declarative YAML | `<existing loader and supported selectors>` | Parser contract, generated file reviewed, unsupported flow kept out of YAML |
| Direct HLS | `<direct URL and player context>` | Main/child/media requests and actual player headers |
| Tokenized HLS | `<mint path, expiry and cooldown>` | Expiry/recovery, concurrent viewers, safe cached publication |
| IP-bound session | `<mint + manifest egress identity>` | Same configured proxy/profile and no direct fallback |
| VOD/replay | `<replay identity/date semantics>` | Separate games/dates; no merge with live/channel rows |
| 24/7 channels | `<canonical channel identity>` | Country, channel number, language/signal separation |
| External player only | `<externalUrl and explicit label>` | No claim of direct playback; safe URL and short fallback retry policy |
| DASH/ClearKey/DRM | `<exclude under current offered-stream policy>` | Source not offered as playable HLS; no covert relay/decryption feature |
| Disguised segments | `<confirmed media format and existing supported path>` | Safe sample classification and actual playback; extension alone proves nothing |

### Request ownership and header matrix

Fill one row per distinct request, including verification and token refresh.
`Server`, `player` and `external player` are different actors.

| Phase | Actor | URL origin and how derived | Adapter | Method/body | Headers needed | Egress/profile | Timeout/body/concurrency bound |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Catalog | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |
| Bridge/channel list | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |
| Mint/playback API | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |
| Verification | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |
| Master playlist | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |
| Child/audio playlist | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |
| Key/init/media segment | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |
| Recovery mint | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |

- [ ] Every new server-side metadata request enters `ProviderOutbound` in the
  guarded integration profile, including custom routes, helpers and child scripts.
- [ ] Dynamic URLs, DNS results and every redirect are admitted by the existing
  guard. A hostname suffix check or same-origin variant check is not a substitute.
- [ ] URL credentials and private/loopback/link-local destinations are rejected.
  Tests do not fix a self-request by permitting localhost in the outbound guard.
- [ ] `bodyTruncated` is rejected before parsing, rewriting, persisting or caching
  a result that requires the complete response.
- [ ] Cross-origin redirect behavior is tested with the actual shared header
  policy. Cookie, Authorization, Referer, Origin and custom headers are not
  broadly forwarded. Do not weaken the shared policy for one provider.
- [ ] User-Agent, Referer and Origin requirements are measured per actor. The
  player receives only its bounded required context, never server secrets.
- [ ] Configured proxy/profile selection survives redirects. No retry/fallback
  silently changes an IP-bound session's egress.
- [ ] Verification uses the real provider-produced stream, not a hand-built
  object with a different `notWebReady` value or missing signed route context.

### Entity, mapping and integration contract

- [ ] `getMatches()` returns `MatchEntity[]`; `resolveStream(...)` returns
  `StreamEntity[]` with the intended playable `url` or labeled `externalUrl`.
- [ ] Provider/source identity is stable and consistent across registration,
  `sources[].source`, stream `_source`, dispatch, configuration and health.
- [ ] Event IDs distinguish separate meetings; aliases resolve unambiguously.
  Interactive resolve, prewarm and remint agree on the canonical stored match ID.
- [ ] Country and numbered signal are preserved for broadcaster matching. A
  similarly named foreign channel is not assumed to carry the same event.
- [ ] Women/youth/reserve qualifiers remain attached to the correct participant.
  Replays, scheduled fixtures and evergreen channels remain separate.
- [ ] Date parsing states units/timezone and rejects invalid calendar fields,
  rollover, missing dates and unexpected formats according to the chosen policy.
- [ ] Dependency injection, aggregator inclusion, source selection, dispatch,
  labels/priorities, configure UI and custom-route URL rewriting are all checked.
  Document each changed location; registration alone is not end-to-end support.
- [ ] Prewarm is explicitly included or skipped with a measured budget reason.
  Adding a provider does not start a background mint storm.
- [ ] New child/helper imports resolve in source and the actual copied build
  layout. An unbundled helper is added to the relevant copy manifest if required.

### Cache, retry, health and signed state

Document each cache: key dimensions, maximum entries/bytes, positive/negative TTL,
expiry/eviction, invalidation revision, credential/config changes, and whether it
is local to one process or shared across workers. TTL alone does not evict old
keys. Do not cache a private URL under a key that ignores required UA/session
identity, or assume opaque signed application state reveals upstream expiry.

- [ ] Single-flight coalesces concurrent identical work, including token minting.
- [ ] Late timeout results cannot overwrite a newer health/publication outcome.
- [ ] A genuinely empty schedule, partial failure, total failure, capacity
  exhaustion, guard rejection and upstream denial remain distinguishable.
- [ ] One failed endpoint or malformed row does not discard healthy independent
  results. Total failure is not disguised as a successful empty catalog.
- [ ] Retry/remint is bounded and limited to its documented recovery class.
  Local guard/capacity failures do not mint another credential. Notice media or
  upstream denial does not authorize identity replacement or access-control bypass.
- [ ] Signed local routes use a configured private key shared by participating
  workers. No hard-coded public fallback; missing-key behavior is explicit.
- [ ] Payload schema, field sizes, allowed values, expiry and future timestamps
  are checked. Signature encoding and byte length are validated before a
  constant-time comparison; Unicode signatures produce a controlled 4xx.
- [ ] Rate-limit identity follows the app's trusted-proxy contract, not an
  arbitrary raw `X-Forwarded-For`. Limits and rate-limit storage are bounded.
- [ ] Public responses/logs use safe error classes, not raw upstream errors,
  signed URLs, install paths, credentials, proxy passwords or JWT identities.

### HLS-specific checklist

- [ ] Master and media playlists are distinguished using actual format, not
  HTTP200, MIME alone or a `.m3u8` substring in arbitrary query text.
- [ ] All supported child references share one consistent URI-to-index mapping:
  video, audio, I-frame, image and rendition reports as applicable. Repeated URIs
  and extensionless children cannot shift an index or escape the refresh path.
- [ ] Relative references use the final response URL. Signed query bytes and
  key/init/segment semantics are preserved without cross-origin token copying.
- [ ] Parent-to-child refresh retains intended state; segments remain direct
  under the chosen bandwidth policy. No hidden video relay is added.
- [ ] URI attributes, LF/CRLF, redirects, malformed/truncated playlists, expired
  tokens, out-of-range variants and notice/HTML responses have fixtures.
- [ ] PNG/WebP/TikTok labels are not treated as a universal encoding format.
  No fixed byte skip, decompressor or success label is invented from a screenshot.

### Targeted validation results

Use `PASS`, `FAIL` or `NOT RUN` exactly. Explain every failure and omission.
A mocked PASS means the mocked contract passed, not that upstream playback did.

| Check | Result | Exact evidence / reason |
| --- | --- | --- |
| Parser: valid, empty, null and malformed neighbors | `<...>` | `<...>` |
| Partial endpoints + truthful provider health | `<...>` | `<...>` |
| Real provider output -> selection -> verification -> publication | `<...>` | `<...>` |
| ID/alias/date/country/squad and replay/channel boundaries | `<...>` | `<...>` |
| Guard, DNS, redirects, credentials and truncated responses | `<...>` | `<...>` |
| Header/UA/proxy matrix and cache partitioning | `<...>` | `<...>` |
| Single-flight, bounded caches, timeout and retry/remint | `<...>` | `<...>` |
| Missing key, malformed Unicode signature, schema and expiry | `<...>` | `<...>` |
| HLS master/audio/I-frame/extensionless children and direct segments | `<...>` | `<...>` |
| Disabled provider and custom route: zero upstream calls | `<...>` | `<...>` |
| Relevant inherited regressions and copied build imports | `<...>` | `<...>` |
| Build of the final candidate | `<...>` | `<...>` |
| Isolated catalog -> meta -> stream | `<...>` | `<...>` |
| Real player/device/media and observation duration | `<...>` | `<...>` |
| Token recovery or configured proxy behavior | `<...>` | `<...>` |
| Owned PID/start ticks/descendants/listeners after stop | `<...>` | `<...>` |

For the guarded profile's offline runners, preserve their worker/connect/listener
boundary. Add meaningful pure suites to the appropriate selection; run focused
checks first and broaden when shared code changes justify it. Inspect suites
before execution: a test that starts Express or imports the live container may
open listeners or workers. Do not run that suite as an offline unit test.
The full repository suite is not automatically covered by selected offline runs.

### Isolated runtime and evidence bundle

Use one resource-conscious isolated session when available. Keep production,
PM2, credentials and active caches outside it. Optional unconfigured providers,
arm64, DRM and sustained load remain `NOT RUN` unless part of the actual scope;
they are not universal prerequisites for every provider PR.

Capture exact SHA/tree, active isolated catalog identity, commands, original
stdout/stderr, timestamps, recorded exit statuses, route/body classifications,
actual player/device observation and owned-process shutdown evidence. In pinned
resolver mode, use a valid current resolver certificate, expected CA/hostname
and matching loaded pin; the public website certificate is a separate identity.
An HTTP200 playlist, a segment HEAD, a browser alternative or `stream_notice`
does not establish direct playback. Never reconstruct missing original logs.
Share no keys, private environment files, signed URLs or private catalog.

### Reviews, merge and rollout

| Stage | Recorded decision |
| --- | --- |
| Review 1: contracts, guard/security, budgets and ownership | `<reviewer / final tree / findings closed>` |
| Review 2: independent compatibility, identity and real publication path | `<reviewer / final tree / findings closed>` |
| Structural merge | `<base/head checked; dependency order; accepted remaining risks>` |
| Isolated acceptance | `<available cases passed; exact FAIL / NOT RUN left open>` |
| Production enablement | `<owner decision after required runtime checks; rollback build/config>` |

Use a separate provider feature PR. Preserve unrelated changes during conflicts;
recheck the final integrated tree and communicate new SHAs. The proposed two
review passes do not assert a server-enforced GitHub rule. A deliberate opt-in
merge with unavailable runtime evidence must say so and keep enablement separate.
A conflict-free PR or successful merge does not prove playback. Reverting source
alone does not restore old credentials/configuration; identify the matching
rollback build and configuration before enabling the provider.

## Copyable task for an AI contributor

```text
Implement <provider> in a separate draft feature PR on the exact current target
base <SHA>, retaining the reviewed guarded transport and mapping dependencies.
First inspect the actual BaseProvider, MatchEntity, StreamEntity,
ProviderOutbound, aggregator, source selection/dispatch, verifier/publication,
cache/health and build-copy contracts. Do not invent APIs from old examples.
Classify the provider, fill the request actor/header/egress matrix, and explain
whether YAML is sufficient. generate-provider.js creates only a YAML scaffold;
it does not register, secure, test or complete a provider integration.
Use the existing guarded metadata adapter for every new server-side request.
Keep configured egress and TLS checks; never permit private destinations or
silently use a direct fallback to make a test pass. Preserve stable event/source
identity, partial-result isolation, bounded I/O/cache/retry and truthful health.
Test actual provider-produced streams through verification/publication, including
signed local routes, rather than hand-building flags that skip the failing path.
For HLS, preserve supported child URI identity, final redirected bases, signed
queries and bounded player headers. Keep direct segments under current policy.
Treat DASH/DRM and disguised segments according to the guide's explicit scope.
Use configured private signing keys, bounded validated expiring state and safe
errors; a malformed signature must never reject outside the HTTP error handler.
Provide focused mocked regression tests, relevant shared regressions, final build
and static copied-import checks. Do not execute real provider/native/listener
checks inside an offline-only boundary or claim simulated playback is real.
Run only the agreed isolated actual-player cases when resources and configuration
allow. Return exact SHA/tree/build/catalog provenance, original sanitized logs,
PASS/FAIL/NOT RUN and remaining limits. Do not manufacture missing evidence,
merge, deploy or change production configuration as part of implementation.
Request two independent review passes on the final integrated tree and document
merge acceptance separately from production enablement.
```

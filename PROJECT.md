# Project: Nuvio Live Sports Plugin Replay & Streaming Pipeline

## Architecture
- Module/package boundaries, data flow, shared interfaces:
  - **Providers** (`src/providers/`): Scrape replays and live streams (ReplayZoneProvider, FullRacesProvider, SoccerFullProvider, LiveTVProvider).
  - **Match Aggregator** (`src/services/MatchAggregator.js`): Ingests provider fixtures/replays, deduplicates matches, normalizes dates, merges multi-provider stream sources.
  - **Cache Service** (`src/services/CacheService.js`, `src/data/matches_cache.json`): Persists matches across runs with fast index lookups.
  - **Catalog Presentation** (`src/catalog.js`): Surfaces matches into Stremio catalogs, replay subfilters, and replay hubs.
  - **Stream Resolution** (`src/streams.js`, `src/providers/*Provider.js`): Extracts playable HLS/MP4 URLs and headers (SprintCDN, Byse, Uppod/azplay, OK.ru, Dailymotion).
  - **Build & Daemon Server** (`dist/index.js`, `package.json`, `@vercel/ncc`): Production bundling and standalone HTTP daemon on port 7000.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Motorsport Session Classification | Classify FP1/FP2/FP3, Qualifying, Sprint, Main Race deterministically and prevent session merging | M1 | survey_1 |
| 2 | Motorsport Series Classification | Disambiguate F1, F2, F3, F4, Formula E, NASCAR, IndyCar, MotoGP, WSBK, WRC, DTM and prevent series cross-merging | M1 | survey_1 |
| 3 | Token & Date Window Sanitization | Add generics filter ('full', 'replay', 'show', months) and strict date window / date-0 guard in MatchAggregator | M1 | survey_1 |
| 4 | idIndex Verification Guard | Verify candidate matches in idIndex via _sameEventPre before adopting index | M1 | survey_1 |
| 5 | Team Delimiter Guard for Motorsport | Prevent hyphen splitting in race titles from creating fake teams and overwriting Grand Prix titles | M1 | survey_1 |
| 6 | matches_cache.json Sanitization | Purge bloated black-hole entries (e.g. Barcelona shakedown 204 aliases) and restore standalone F1/NASCAR/MotoGP | M1 | survey_1 |
| 7 | SoccerFull Date Ingestion | Ensure SoccerFullProvider assigns valid ISO date strings (YYYY-MM-DD) so matches sort correctly and populate date hubs | M2 | survey_2 |
| 8 | Football Replay Subfilter & Catalog Visibility | Ensure standalone SoccerFull matches populate page 1 and are not dropped by date subfilters | M2 | survey_2 |
| 9 | LiveTV Mirror & Referer Handling | Preserve dynamic emb.apl\d+.online domains and attach Referer header to prevent 403 bot blocks | M2 | survey_2 |
| 10 | Multi-Part Replay Source Preservation | In streams.js, ensure secondary replay provider sources (SoccerFull) are not discarded when selecting episode candidates | M2 | survey_2 |
| 11 | SprintCDN Stream Playback & Web-Readiness | Retain notWebReady: false for SprintCDN streams with open CORS to enable web client playback | M2 | survey_2 |
| 12 | Manchester City vs PSG Stream Resolution | Verify functional playback URL resolution for Manchester City vs PSG replay | M2 | survey_2 |
| 13 | Full Jest Test Suite Validation | 100% green test passing across all existing and new test suites (0 failures) | M3 | survey_3 |
| 14 | Production Bundle & Daemon Verification | npm run build succeeds and daemon server starts cleanly on port 7000 serving manifest | M3 | survey_3 |
| 15 | GEMINI.md Commit Compliance | Structured commit message with summary, Before & After breakdown, and measured impact metrics | M3 | survey_3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Motorsport Deduplication & Cache Sanitization | MatchAggregator session/series classifiers, idIndex guard, date guards, cache cleanup, new unit tests | none | IN_PROGRESS |
| 2 | Football Replay Pipeline & Multi-Source Stream Resolution | SoccerFull date generation, LiveTV domain/referer fix, streams.js multi-part preservation, SprintCDN web readiness | M1 | PLANNED |
| 3 | Full Test Suite Pass, Production Build, Daemon Verification & Commit Compliance | Run full test suite (100% green), npm run build, daemon server restart verification, commit formatting per GEMINI.md | M1, M2 | PLANNED |

## Interface Contracts
### MatchAggregator ↔ CacheService & Catalog
- Match objects must preserve distinct IDs for distinct sessions (`p1`, `p2`, `p3`, `qualifying`, `sprint`, `race`).
- `aliasIds` must only contain IDs of the identical event session from other providers.
- `title` must reflect the true session and series without being overwritten by NASCAR or secondary fixtures.
- `date` must be an ISO date string (`YYYY-MM-DD`) or valid epoch timestamp.

### SoccerFullProvider / LiveTVProvider ↔ StreamResolver & streams.js
- SoccerFullProvider returns stream objects with `{ title, url, behaviorHints: { notWebReady: false } }`.
- LiveTVProvider returns direct MP4 stream or HLS stream without 403 Forbidden errors.
- `streams.js` preserves all provider streams for multi-part matches and passes valid stream arrays to Stremio.

## Code Layout
- `src/services/MatchAggregator.js`: Owned by Milestone 1
- `src/data/matches_cache.json`: Owned by Milestone 1
- `tests/motorsportSessionIsolation.test.js`: Owned by Milestone 1
- `src/providers/SoccerFullProvider.js`: Owned by Milestone 2
- `src/providers/LiveTVProvider.js`: Owned by Milestone 2
- `src/streams.js`: Owned by Milestone 2
- `src/catalog.js`: Owned by Milestone 2
- `tests/soccerFullReplayStreamResolution.test.js`: Owned by Milestone 2
- `dist/`: Owned by Milestone 3

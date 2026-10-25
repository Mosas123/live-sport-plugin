# Live Matches Stream Comparison Report

**Date**: 2026-10-18T13:26:18.550Z
**Scope**: Only Live Sports Matches (`/catalog/tv/nuvio_sports_live.json`)
**Local Instance**: `http://localhost:7000` (Branch `feature/more-24-7-channels`)
**Remote Production**: `https://nuviosports.xyz`

## 1. High-Level Metrics Summary

| Metric | Localhost (Development) | nuviosports.xyz (Production) | Delta |
| :--- | :---: | :---: | :---: |
| **Live Matches in Catalog** | **100** | **100** | +0 |
| **Audited Matches** | 30 | 30 | - |
| **Total Streams Found** | **178** | **130** | **+48 (36.9%)** |
| **Avg Streams / Match** | **5.9** | **4.3** | 1.6 |

## 2. Stream Provider Breakdown

| Provider Source | Localhost Streams | Remote Streams | Delta |
| :--- | :---: | :---: | :---: |
| `ak47live` | 4 | 0 | +4 |
| `daddylive` | 106 | 92 | +14 |
| `damitv` | 16 | 12 | +4 |
| `ppvst` | 0 | 6 | -6 |
| `sktech` | 7 | 13 | -6 |
| `streamedpk` | 16 | 7 | +9 |
| `vavoo` | 29 | 0 | +29 |

## 3. Sample Live Matches Stream Audit

| Live Match Title | Local Streams | Remote Streams | Local Providers | Delta |
| :--- | :---: | :---: | :--- | :---: |
| **🔴 LIVE: AFC Bournemouth 󠁧󠁢󠁥󠁮󠁧󠁿 vs Sunderland 󠁧󠁢󠁥󠁮󠁧󠁿** | 16 | 8 | `daddylive, daddylive, daddylive, sktech, damitv, damitv, vavoo, vavoo, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive` | +8 |
| **🔴 LIVE: Brighton & Hove Albion 󠁧󠁢󠁥󠁮󠁧󠁿 vs Crystal Palace 󠁧󠁢󠁥󠁮󠁧󠁿** | 23 | 13 | `daddylive, daddylive, daddylive, daddylive, daddylive, sktech, sktech, sktech, damitv, damitv, vavoo, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive` | +10 |
| **🔴 LIVE: Leeds United 󠁧󠁢󠁥󠁮󠁧󠁿 vs Manchester United 󠁧󠁢󠁥󠁮󠁧󠁿** | 34 | 17 | `daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, sktech, streamedpk, streamedpk, streamedpk, streamedpk, streamedpk, streamedpk, streamedpk, streamedpk, damitv, damitv, vavoo, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive` | +17 |
| **🔴 LIVE: Angers SCO vs Olympique Marseille** | 14 | 8 | `daddylive, daddylive, sktech, streamedpk, streamedpk, damitv, damitv, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive` | +6 |
| **🔴 LIVE: Charlton Athletic 󠁧󠁢󠁥󠁮󠁧󠁿 vs Manchester United 󠁧󠁢󠁥󠁮󠁧󠁿** | 1 | 2 | `vavoo` | -1 |
| **🔴 LIVE: Fiorentina vs Como** | 6 | 13 | `streamedpk, streamedpk, streamedpk, damitv, damitv, vavoo` | -7 |
| **🔴 LIVE: Cambuur vs AZ** | 2 | 8 | `vavoo, streamedpk` | -6 |
| **🔴 LIVE: Fenerbahce vs Petkim Spor** | 6 | 1 | `vavoo, vavoo, vavoo, vavoo, vavoo, vavoo` | +5 |
| **🔴 LIVE: Osasuna vs Racing Santander** | 4 | 1 | `vavoo, damitv, damitv, vavoo` | +3 |
| **🔴 LIVE: Brands Hatch GP Race 2** | 0 | 1 | `none` | -1 |
| **🔴 LIVE: Västerås SK vs Mjällby** | 2 | 1 | `damitv, damitv` | +1 |
| **🔴 LIVE: Sirius vs Elfsborg** | 2 | 4 | `damitv, damitv` | -2 |
| **🔴 LIVE: 6 Hours of Barcelona** | 2 | 2 | `streamedpk, streamedpk` | 0 |
| **🔴 LIVE: Chelsea FC 󠁧󠁢󠁥󠁮󠁧󠁿 vs Tottenham Hotspur 󠁧󠁢󠁥󠁮󠁧󠁿** | 5 | 9 | `daddylive, daddylive, vavoo, vavoo, daddylive` | -4 |
| **🔴 LIVE: Real Madrid vs Bilbao** | 4 | 5 | `vavoo, vavoo, daddylive, daddylive` | -1 |
| **🔴 LIVE: ️ FIA WEC - Round 7 - 6 Hours of Barcelona Race** | 11 | 13 | `vavoo, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive` | -2 |
| **🔴 LIVE: Tronche Meylan W vs Landerneau Bretagne W** | 1 | 1 | `daddylive` | 0 |
| **🔴 LIVE: Dinamo Moskva vs CSKA Moskva** | 4 | 3 | `vavoo, daddylive, daddylive, daddylive` | +1 |
| **🔴 LIVE: Al Ittihad Kalba vs Al Jazira** | 1 | 1 | `daddylive` | 0 |
| **🔴 LIVE: Kocaelispor vs Göztepe** | 4 | 1 | `ak47live, vavoo, daddylive, daddylive` | +3 |
| **🔴 LIVE: Premier Padel. Milan (T2026): Women's Final** | 7 | 4 | `vavoo, vavoo, vavoo, daddylive, daddylive, daddylive, daddylive` | +3 |
| **🔴 LIVE: ️ WorldSBK - Round 12 - Spain Race 2** | 3 | 3 | `daddylive, daddylive, daddylive` | 0 |
| **🔴 LIVE: London City Lionesses 󠁧󠁢󠁥󠁮󠁧󠁿 vs Everton 󠁧󠁢󠁥󠁮󠁧󠁿** | 4 | 1 | `daddylive, sktech, ak47live, vavoo` | +3 |
| **🔴 LIVE: SG Flensburg-Handewitt vs Fuchse Berlin** | 6 | 2 | `vavoo, vavoo, vavoo, daddylive, daddylive, daddylive` | +4 |
| **🔴 LIVE: Basketball Braunschweig vs Chemnitz** | 0 | 0 | `none` | 0 |
| **🔴 LIVE: Wolfsberger AC vs WSG Tirol** | 3 | 1 | `ak47live, daddylive, daddylive` | +2 |
| **🔴 LIVE: Salzburg vs Rheindorf Altach** | 5 | 3 | `ak47live, daddylive, daddylive, daddylive, daddylive` | +2 |
| **🔴 LIVE: Wurzburg vs Syntainics MBC** | 0 | 0 | `none` | 0 |
| **🔴 LIVE: Live racing from Kempton, Leopardstown & Limerick** | 1 | 1 | `daddylive` | 0 |
| **🔴 LIVE: Eneco Tour - Stage 5 Men - Arnhem (149.2km)** | 7 | 3 | `daddylive, daddylive, daddylive, daddylive, daddylive, daddylive, daddylive` | +4 |

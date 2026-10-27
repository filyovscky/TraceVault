# Resource measurements — 27 October 2026

## 0.5.1 — compact screenshots and memory

Default screenshot storage is now Compact: one lossless full-resolution PNG, no duplicate viewport files. PNG + source frames is still available. [Implementation and limits](COMPACT-CAPTURE.md).

Two different measurements must not be mixed:

| Controlled 1500×2400 fixed/sticky fixture, final run | Source-frame mode | Compact |
| --- | ---: | ---: |
| Primary PNG | 106,555 bytes | 34,592 bytes |
| All capture artifacts | 148,387 bytes | 34,592 bytes |
| Total added workspace file bytes, including audit | 327,490 bytes | 74,751 bytes |
| Decoded RGBA hash | identical | identical |

Both CFT and installed Chrome produced the same image pixels and sizes. Total workspace savings were about 77% on this controlled flat-color page, not a guarantee for photos or arbitrary websites. Source-frame mode retained all 10 intermediate PNGs; Compact explicitly retained none. Old source files were independently rehashed after the second capture and stayed unchanged. The test's first comparison failed because its fixture changes header text color on first scroll; setting the same pre-capture scroll state fixed the comparison without weakening pixel equality.

| 1600×8000 / 12.8 MP page, isolated CFT 156.0.8078.4 | Archived 0.5.0 | 0.5.1 Compact |
| --- | ---: | ---: |
| Initial whole-browser private bytes | 362.7 MB | 393.6 MB |
| Sampled peak whole-browser private bytes | 701.9 MB | 469.9 MB |
| Capture artifacts | 786,106 bytes | 84,375 bytes |
| Retained source frames | 20 | 0 |
| Capture wall time | 16.90 s | 20.02 s |
| Whole-browser CPU during capture | 4.82 CPU-s | 3.37 CPU-s |

Decimal MB. This is **Windows process PrivateMemorySize64**, not extension-only heap, resident RAM, or a hard memory bound. A separate PowerShell sampler reads the fixed process IDs returned by that test browser; its 100 ms sleeps plus process-query overhead can miss short peaks. Totals include the source renderer, browser, GPU and extension. Each version runs in its own profile; their initial memory differs. This run showed ~33% lower sampled peak private bytes, but it is not a universal 33% reduction. Timing varied strongly across exploratory runs, and the final Compact run was slower in wall time. Do not promise faster capture on every page.

The first prototype, before using a read-heavy software canvas, actually increased sampled peak private bytes (701 → 755 MB). After fixing the canvas path, an intermediate run was 620 → 509 MB; after reusing the filtered buffer the final run above was 702 → 470 MB. These exploratory values show why simply making a smaller PNG cannot be described as reducing RAM without measurement. Final raw output: [capture memory](qa/0.5.1-capture-memory.json).

The codec's controlled 801×1101 canvases retained exact decoded pixels for 11px text, gradients, pseudorandom opaque RGB and alpha. Native/optimized PNG bytes were 197,131/159,080; 1,073,269/429,611; 3,035,447/2,649,838; 21,708/5,929 respectively. These are test-pattern results, not claimed average compression rates. Its explicitly tracked pixel-strip arrays peaked at 0.37–0.42 MB in these cases and 0.69 MB for the full-page fixture; this excludes the main canvas, native encoder/zlib memory, output Blobs and garbage awaiting collection. [Codec results](qa/0.5.1-png-codec.json).

PDF v2 uses filtered strip streams instead of whole-page RGBA+RGB arrays. Independent Pillow/pypdf verification found source PNG and concatenated decoded PDF RGB exactly equal in CFT and installed Chrome; the tested compact-derived PDFs were 37,104 bytes, two pages. [Independent results](qa/0.5.1-independent-pixels.json).

The rebuildable journal LRU now has a 2048-entry / 4 MiB **source JSON** budget; actual JS object memory and active-case state are additional. Annotation browser cache retains the active case only. Loading 60 synthetic 110 KB audit entries twice still replayed all 61 events, stayed under the cache budget and rejected a subsequently damaged journal. Switching from a real highlighted case to another and back restored the highlight from disk, including after page reload. A 24 MP stitch canvas still costs 96 MB by itself; large pages, source DOMs, PDF source bitmaps and long journals remain costly. The 64 MB file limit is not a RAM ceiling.

Reproduce: tests/compact.e2e.mjs, tests/compact-memory.e2e.mjs, tests/cache-budget.e2e.mjs and `python scripts/verify_compact.py --render`. No new runtime dependencies or permissions are needed. Existing files are not compressed/deleted in place.

## 0.5.0 — historical session-recorder measurement

Reproduce: `npx playwright test tests/session-performance.e2e.mjs`. This runs one isolated Chrome for Testing 156.0.8078.4 profile, a real native-directory workspace, one source fixture and an extension panel. It starts recording, samples an approximately 11-second idle interval, issues 100 actual history.pushState changes, waits for every event and stops. All 100 History API events must exist in the real case journal. It samples the panel V8 heap after explicit GC and sums CPU time plus Windows process memory for all processes returned by that test browser's SystemInfo.getProcessInfo. No competitor benchmark was run.

| Measurement | Before optimization | After optimization |
| --- | ---: | ---: |
| Panel retained V8 heap before burst | 2.79 MB | 2.80 MB |
| Panel retained V8 heap after burst | 3.19 MB | 3.18 MB |
| Full burst drain, including Stop | 70.46 s | 53.94 s |
| Whole test browser CPU during work | 34.98 CPU-s | 19.47 CPU-s |
| Saved session events | 103 | 103 |
| Session JSON file bytes, audit excluded | 76,303 | 76,510 |

Decimal MB, not MiB. The small byte difference comes from run-specific IDs, URLs and timestamps. Event count is start + initial page + 100 History API events + stop. Audit files duplicate event metadata and Artifact descriptors, so those 76.5 KB are **not total disk consumption**. No HTML or PNG is automatically created by session recording.

The after run used 0.312 CPU seconds during an 11.114-second idle interval: about 2.8% of one logical core for the **entire test browser**, including automation, source renderer and measurement overhead. Whole-browser private memory was 319 MB idle and 381 MB after work; working set was 673 MB and 730 MB. These totals cannot be attributed to TraceVault alone. The ~3 MB panel heap excludes worker memory, content scripts, native allocations, canvas pixels and the browser itself. A single run does not establish leak-freedom or long-session behavior.

The optimization eliminates duplicate journal enumeration within a locked append and limits recording-time list refresh to once per two seconds. It reduced measured drain time by about 23% and work CPU seconds by about 44%. The remaining ~54-second burst delay is a real limitation: disk writes/hash verification are sequential and the entire event directory is still validated. Normal human browsing is less bursty; thousands of events need further benchmarking and incremental indexing before stronger efficiency claims.

Content-script annotations also cost memory per loaded page. They use a 600 ms debounced mutation observer; when no annotations exist, render skips constructing a text model. Restoring many highlights on large, dynamic DOMs still requires text scanning. Pagination limits rendered list rows to 25, not the size of loaded metadata. Repository caches parsed journal metadata in memory across cases and have not been long-duration profiled.

Full-page captures are the heavy path. At the current 24-million-pixel limit, **one RGBA canvas alone requires 96 MB**, before decoded tiles, PNG/base64 representations and PDF buffers. The 64 MB capture-file setting is not a RAM ceiling. No peak-RAM benchmark of a maximum-size capture was performed here. HTML resource embedding likewise retains intermediate bytes. Background idle, metadata recording and large capture should not be described as having the same cost.

Raw measurements: [before](qa/0.5.0-session-performance-before.json), [after](qa/0.5.0-session-performance-after.json). These are measurements of this machine/run, not published product guarantees.

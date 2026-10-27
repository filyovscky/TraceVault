# Resource measurements — 27 October 2026

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

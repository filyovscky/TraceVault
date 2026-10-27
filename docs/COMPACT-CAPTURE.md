# Compact capture architecture and QA plan, 0.5.1

The user's request is lower RAM/disk use while keeping screenshots readable. The chosen default is lossless PNG with original dimensions, rather than a lossy quality slider or automatic downscaling. Existing primary files remain immutable. The largest avoidable disk duplication was full-page PNG plus all viewport PNGs and repeated per-frame audit snapshots. A separate source-frame mode retains the earlier reconstructable collection policy.

## Storage and encoding

Preference `screenshotStorage` is `compact` by default, including existing profiles without this key, or `source_frames`. It is saved by the ordinary Settings flow. Compact stores one primary PNG; full-page PDF capture additionally retains the verified source PNG and derived PDF. Raw downloaded images and HTML archives keep their existing formats. The setting never rewrites historical captures.

In Compact, `onFrame` returns retained=false and does not write frame files/audit snapshots. Final frame metadata still includes sequence, time, scroll, presentation and source/destination rectangles, with no invented artifact IDs or hashes for discarded intermediates. `frame_storage=not_retained` and an explicit diagnostic disclose that reconstruction from original tiles is unavailable. Source-frame mode writes the exact native screenshot blobs and preserves the earlier reconstruction data. Final PNG/PDF artifacts retain ordinary readback hashes and case/source/time attribution.

`png.js` independently implements PNG 8-bit RGB/RGBA, CRC-32 chunks and Sub/Up adaptive scanline filters, then streams through native CompressionStream(deflate). It reads at most a 1 MiB RGBA strip (or one very wide row), uses four reusable scanline arrays plus one reusable filtered-strip buffer, yields between strips and handles AbortSignal/backpressure. It does not read a second whole-image ImageData. The native PNG is kept when the optimized output would be larger or the optimizer fails; cancellation still fails the operation. PNG re-encoding changes bytes/digest, not the decoded screenshot pixels in the covered tests. No runtime codec/library is added.

References checked 27 October 2026: [PNG specification](https://www.w3.org/TR/png-3/), [CompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream), [canvas encoding](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob). This is an independent implementation of format rules, not copied SingleFile or a third-party encoder. The licence inventory remains dependency-free at runtime.

## Memory changes

- Delay the full stitch surface allocation until the first frame establishes actual dimensions, instead of allocating, filling and resizing it again.
- Use willReadFrequently for compact/read-heavy canvases to avoid the GPU/readback copy penalty observed in the first prototype. Close fixed-overlay bitmaps before encoding. Reuse the filtered buffer after each awaited compression write; drop the RGBA strip reference before yielding.
- FSA writes a Blob directly after hashing its bytes; the entire input ArrayBuffer is no longer kept as the writer's payload through readback. Existing retry/permission/size/hash checks remain.
- PDF v2 compresses strips using PNG Predictor 15, Colors 3, BitsPerComponent 8 and the image width. The old full-page RGBA + full-page RGB conversion arrays are removed. The source bitmap and page canvas still exist; this is not streaming the whole document from disk without decoding.
- Journal LRU is capped at 2048 entries and 4 MiB of source JSON bytes. Parsed JS objects have overhead, so the cache's actual heap is not promised to be 4 MiB. Active-case replay/UI metadata is separate from the cache and still grows with case size. Annotation browser storage caches only the active case, with others restored from the primary directory.

The final stitch surface remains necessary in this implementation: at 24 MP one RGBA surface alone is 96 MB. Browser/GPU/source-page memory and PNG/PDF output add to it. The file-size setting is not a memory cap. Tiled output without a full image surface, incremental journal indexing and long-duration memory profiling remain future work.

## Verification sequence

1. Real-browser codec probe: exact decoded pixel hashes for text/color/gradient/noise/alpha, cancellation, output-size failure and smaller-file fallback.
2. Real FSA captures in CFT and installed Chrome: same controlled source state in both modes, identical RGBA hashes, source-frame reconstruction compatibility, real file sizes/SHA-256, old files unchanged, settings persistence, actual PDF conversion.
3. Existing full PNG/PDF/geometry/zoom/cancellation regressions, independent pypdf/Pillow decoding and rendered PDF inspection.
4. Cache budget/replay/corruption, FSA retry/overwrite/permission failure, original P0 workflow/annotations and English settings regressions.
5. Native-process sample comparing archived 0.5.0 with the new compact default on a controlled 1600×8000 page. Scope and limitations must accompany every RAM figure. Measurements/results are recorded in TEST-REPORT.md and PERFORMANCE.md; no success is inferred from a screenshot or a displayed toast alone.

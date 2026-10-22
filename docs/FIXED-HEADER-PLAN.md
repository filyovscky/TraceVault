# Full-page fixed/sticky normalization — 0.4.1

The supplied TraceVault image repeats a viewport-fixed header at tile boundaries. The current stitcher detects fixed/sticky elements but only reports a warning. This is a capture defect, not a property of the underlying saved page.

Implementation plan:

1. Keep existing evidence and supplied images read-only. Reproduce with a local page containing a fixed header and patterned content.
2. During full capture only, temporarily place sticky elements in their natural flow, preserving their containing block. Show viewport-fixed roots once at a selected edge tile and hide repeats without changing layout. Exclude fixed descendants whose containing block already scrolls with the document.
3. Preserve visible fixed-element regions from their source frame and composite them after stitching. This prevents later overlapping tiles from erasing the single retained header. Record source/destination rectangles so the composite remains explainable from saved frames.
4. Store normalization method, counts and per-frame visibility/overlay metadata. Raw frame bytes retain their own timestamps and SHA-256. The full PNG remains a derived sequential capture; neither PNG nor PDF is represented as an atomic unmodified browser viewport.
5. Restore only properties still carrying our temporary values, in finally, on success/error/cancel. Preserve original inline values and priorities and do not replace an entire style attribute. Restore scroll after styles when the URL is unchanged. Presentation cleanup uses a document-scoped session token, including after SPA navigation; unrelated new documents are not modified.
6. Verify actual pixels: one header, one bottom bar, natural-flow sticky sections, uninterrupted content at seams including the final overlap and horizontal tiles. Verify styles and scroll after success, cancellation, and failure; preserve unrelated style updates. Run both Chrome for Testing and installed Chrome, plus existing full PNG/PDF tests. Package, commit and push after checks.

Limits to disclose: nested browsing contexts, closed shadow roots, virtualized content, dynamic layout changes and complex overflowing/transformed overlays are not universally normalized. Do not conceal unsupported geometry by inventing pixels.

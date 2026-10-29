# Manual saved-version comparison

Available from 0.7.0 in an HTML material's **Compare saved versions** action. This is independent of the window visit recorder. There is no automatic polling, schedule or live DOM monitoring.

1. Save the same source as HTML at the times of interest.
2. Open either version, choose Before and After, and run Compare text.
3. Both originals are re-read with SHA-256/length verification. A checksum failure clears the previous result and blocks comparison.

Choices come from completed/partial HTML captures in the original case with the same exact final URL. Partial captures remain labelled Partial. Version IDs, acquisition times and verified SHA-256 values are available in the result's source details. Case changes cannot redirect an already-open comparison to another case's originals. Nothing is written to the source files or case journal by comparison; results are temporary UI data.

## Meaning and limits

This compares archived **document text**, with whitespace normalized. Scripts, style, templates, noscript, SVG/canvas, frames and explicitly hidden/aria-hidden nodes are excluded. Other CSS visibility is not evaluated. It is not a rendered-pixel, image, stylesheet, asset, OCR or embedded-frame comparison. Identical extracted text does not prove an unchanged page; the UI distinguishes identical verified HTML bytes from different HTML bytes with unchanged text.

HTML is parsed in an inert document with a prepended default-src none CSP. Archive nodes are never inserted into the UI. Result rows use textContent, including literal HTML-looking source text. Browser QA checks offline operation and absence of HTTP requests.

Sources are limited to 8 MiB each, with at most 12000 text lines across both versions. A line LCS uses at most 1000000 Uint32 cells (about 4 MB for that table, not a total memory cap), after trimming shared prefix/suffix. Bigger changes use a clearly labelled before/after changed-region fallback that may include unchanged lines inside the region. UI shows at most 1500 comparison lines and explicitly discloses any truncation. Larger originals remain available through normal verified preview/export. Source strings, parser DOMs and output buffers still consume memory during this explicit action; they are not retained by a background watcher.

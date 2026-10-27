# TraceVault

A local Chrome Manifest V3 extension for capturing web evidence with SHA-256, source URLs, timestamps and annotations. The main interface is Chrome's **side panel**, normally on the right. English UI, light/dark themes, original flat icons, no runtime dependencies or telemetry.

## Install or update

1. Extract [TraceVault 0.5.2](releases/TraceVault-0.5.2.zip) to a permanent folder, or build `dist` from this repository.
2. In `chrome://extensions`, enable Developer mode and select **Load unpacked** → the folder containing `manifest.json`.
3. To update, replace files in the folder Chrome already loads, click **Reload ↻** on its extension card, then reopen the panel and refresh already-open source tabs. The version should read 0.5.2. Updates from before 0.5.0 add `webNavigation` for the implemented session recorder; Chrome may require permission approval or re-enabling. Updates from 0.4.3 or earlier also add all-site access. Versions 0.5.1–0.5.2 add no permissions.
4. Pin TraceVault and click its icon on an HTTP/HTTPS page. Chrome controls which side hosts its panel.
5. Follow **Folder → Case → Capture**. Choose a folder: if it contains other files but no workspace.json, TraceVault creates a separate TraceVault subfolder (or TraceVault-2, etc. when names are occupied). Empty folders and existing TraceVault workspaces are used directly. Access is checked with a real write/read/delete probe. Enter a case title; leave the optional code blank to assign the next free CASE-001, CASE-002, etc., or enter your own code. The form identifies the destination folder. When the panel says **Ready**, capture and annotation actions become available. The actual workspace subfolder is remembered for subsequent launches. If Chrome has lost folder access, use **Restore folder access** before creating a case; existing files stay in the original folder.

Site access is granted at installation/update for all websites by default. Capture and annotation actions do not request individual domains. The `<all_urls>` host permission also enables visible/full-page screenshots without clicking the extension icon again after changing sites. Annotation scripts automatically load on HTTP/HTTPS pages. If you restrict access in Chrome, the shield opens the extension's Chrome settings; choose **Site access → On all sites**. Protected Chrome pages remain restricted. File URLs are not supported by TraceVault's capture flow. Workspace folder access is a separate permission.

## Find an action

Hover an icon or focus it with the keyboard to see its English description. Icons have accessible names; Tab, Enter and Space remain available. **Commands** also provides a searchable list with readable action names.

| Group | Icons, left to right |
| --- | --- |
| Header | Commands, open workspace tab, settings |
| Capture | HTML document, visible-area camera, full-page PNG scan, PDF document |
| Annotate selection | Highlight, quote, note, entity |
| Browsing session | Start this window, Stop, journal, export JSON |
| Case sections | Materials, Highlights, Entities, History (visible names) |

The active section has a labelled heading and an underlined icon. **Highlights** lists highlights, quotes and notes, with separate counts and a type filter. Search and filters are remembered separately for each section while the panel is open; Reset filters clears the current section. Empty lists distinguish missing records from filtered-out records and offer guidance or Clear filters. A free note is available in Highlights. Record details provide preview, checksum verification, copy, export and other relevant actions; each has a tooltip.

Settings has five groups: **Appearance, Capture, Annotations, Keyboard shortcuts, Storage**. Use the checkmark to apply preferences. Closing the dialog discards unapplied theme/pause/size/global-visibility changes. The per-site visibility icon is an immediate action. Shortcut settings display actual Chrome assignments; unassigned internal browser actions are omitted.

| Shortcut | Action |
| --- | --- |
| Ctrl+Shift+1 | Save HTML |
| Ctrl+Shift+2 | Capture visible PNG |
| Ctrl+Shift+3 | Open side panel |
| Ctrl+Shift+4 | Highlight selection |
| Ctrl+Shift+Space, inside the panel | Search commands |
| /, outside an editor | Focus collection search |
| Ctrl+Enter, annotation editor | Save to case |
| Esc | Close dialog or cancel capture |

Chrome or another application may reserve a shortcut. Use Settings → keyboard icon to open `chrome://extensions/shortcuts` and assign it. Existing profiles can retain earlier assignments.

## Files and permissions

Primary data stays in the selected workspace: `workspace.json`, `cases/<UUID>/case.json`, `events`, `captures`, `screenshots`, `attachments`, `exports`. Single-case mode omits the cases level. Copy the whole workspace for backup or transfer. Browser storage holds folder handles, preferences, annotation cache and explicit pending commands; it does not replace primary files.

If Chrome expires folder permission, **Save page as HTML** requests access and reconnects the previous case. The **key** icon restores access explicitly. If denied, use the folder icon to select the same workspace again. Chrome controls permission lifetime; choose “Allow on every visit” if offered. Native permission prompts require your action. Re-selecting a folder does not repair damaged metadata.

All new files are immutable and verified by reading back their size and complete SHA-256. Preview/export verify again and stop if a file changed. A transient FSA InvalidStateError can retry at most twice, only for the same fresh empty file created by that operation. Existing/nonempty files and quota/permission failures are never retried. Corrupt journals block further changes. Interrupted captures remain explicitly interrupted; unfinished files are not reported as verified evidence.

There are **no excluded-domain lists**. Incognito capture and the pause setting remain separate controls. Source text, titles, quotes, notes, existing originals and historical events retain their original language.

## Capture and annotations

HTML capture uses our DOM/inline-resource engine. Password and editable-field values are cleared; visible personal data can still be included. Offline archives use a strict CSP and sandboxed preview. Cross-origin frames, DRM/video/WebGL, closed shadow DOM, virtualized lists and complex authenticated applications remain best effort; diagnostics record incompleteness.

Full PNG scrolls both axes, stitches a PNG and restores scroll/overlays. **Settings → Capture → Screenshot storage** defaults to **Compact · lossless PNG**: full resolution, no resampling, separate viewport files are not retained. **PNG + source frames** preserves every original viewport PNG with its timestamps/SHA-256 for independent reconstruction, at a higher disk cost. Both modes keep stitch geometry and presentation metadata; captures explicitly state whether frames were retained. Existing saved files are never recompressed or deleted by changing this option.

Compact uses a dependency-free strip PNG encoder with lossless filtering/deflate; the smaller of the native PNG and optimized PNG is saved. Viewport PNGs use the same size fallback. Text/colors remain exact in decoded-pixel tests; savings depend on content. Capture stops if the URL, active tab, zoom or geometry changes. Limits: 24 million pixels, 30000 px per side, 64 frames, configurable byte limit (64 MB default). Viewport-fixed roots are shown once at a selected edge tile; sticky elements are temporarily returned to their natural flow. Source/destination crop rectangles and normalization details are recorded, and styles/scroll are restored. Closed shadow roots, nested frames, newly appearing overlays and complex transformed/overflowing elements are not universally normalized. Sequential capture is not an atomic snapshot in time.

PDF is a lossless raster A4 derivative of a verified PNG, without OCR or HTML reflow. Version 0.5.1 compresses its pixel rows in strips with PNG predictors instead of allocating full-page RGBA and RGB arrays. It has its own SHA-256 and source derivation. Open it from the workspace in an external viewer; blob-PDF preview is not supported by the extension's strict CSP.

Highlight selection saves immediately without opening an editor; the note is optional. Right-click a visible highlight and use **Edit highlight note** or **Delete highlight here**. Deletion is a reversible journal update; use Undo in TraceVault to restore it. A right-click outside a highlight returns a clear error. Annotations use CSS Highlights, without rewriting page text or saved originals. An unarchived reference is marked **Live page only**. Use the archive-and-link icon in the editor to bind a quote to a verified HTML capture. Edits, hide and undo are journal events; existing evidence references remain pinned to their original version.

## Record one window

Connect a case, then press the circle in **Browsing session**. Start records only the current HTTP(S) page as **Initial page**, not the list of already-open tabs. It neither activates nor reloads background tabs. When using the workspace tab, the source already shown under Current page may be used if it is still in the same window. Switching to an existing HTTP(S) tab later records **Tab visited**; subsequent navigations, SPA/hash changes, tab entry/exit and browser-provided linked-tab relationships are recorded normally. If there is no current HTTP(S) source, Start writes only the session-start event and waits for activity.

The session stays pinned to that window and case, even when you switch cases or close the panel. Future activity in that window's tabs participates; other windows do not. A tab moved out stops contributing; moving it in records its current page and resumes tracking. Existing annotation functionality remains independent of this recording scope.

Stop with the square. Closing the selected window also stops the session. After a browser/extension restart it ends explicitly; no other window is silently adopted. Saving **Pause all capture** also stops recording. Start remains disabled until you resume.

The history icon filters **History** to the session; event details offer the URL, times, original metadata and checksum verification. The export icon writes a real JSON file into the case's `exports` directory after re-verifying source event files. Each event is a separate verified JSON under `sessions/<session UUID>/`, referenced from the case's ordinary audit journal. A write error stops collection and exposes pending events with **Retry saving pending events**; reconnect the original workspace before retrying.

This records a browsing trail, **not page contents**. Use HTML/PNG/PDF capture to preserve the page itself. It does not reconstruct pre-session history, every redirect hop, failed navigation or user input. System time is not an independent timestamp. Sudden process/disk failure may lose browser callbacks that have not reached persistent pending storage; it is not a lossless forensic network recorder. One active session is supported. See [architecture and limits](docs/SESSION-RECORDING.md), [measured performance](docs/PERFORMANCE.md) and [comparison with adjacent tools](docs/COMPARISON.md).

## OSINTchart and build

Export writes a versioned interchange JSON to the case's exports folder. It is not an `.oscase` file. The [Python adapter](adapters/osintchart_import.py) targets the real OSINTchart CaseService/schema 2 and supports preview, explicit confirmation, repeat imports and conflict detection. It is not installed in the OSINTchart GUI and has no native/HTTP bridge.

Requires Node.js 24; Python is used for ZIP packaging and adapter QA.

```powershell
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
python scripts/package.py
```

E2E uses isolated profiles and actual disk folders under `output/playwright`. Directory selection is automated with a native FSA handle supplied by CDP; only the QA profile pre-allows writes. Native OS picker/permission bubbles are not automated. The installed-Chrome tests use the standard Windows path; elsewhere add `--grep-invert "installed Chrome"`.

SingleFile is not bundled. There are no runtime third-party dependencies. [Dependency licenses](docs/LICENSES.md), [architecture](docs/ARCHITECTURE.md), [acceptance limits](docs/P0-STATUS.md), [test results](docs/TEST-REPORT.md), [UI plan](docs/UI-0.4-PLAN.md), [screenshots](docs/qa/README.md). Earlier engineering logs and the original specification remain in Russian. P0 is a tested MVP candidate; OCR, diff, video, trusted timestamps, encryption and a native bridge are not implemented.

# TraceVault

A local Chrome Manifest V3 extension for capturing web evidence with SHA-256, source URLs, timestamps and annotations. The main interface is Chrome's **side panel**, normally on the right. English UI, light/dark themes, original flat icons, no runtime dependencies or telemetry.

## Install or update

1. Extract [TraceVault 0.8.1](releases/TraceVault-0.8.1.zip) to a permanent folder, or build `dist` from this repository.
2. In `chrome://extensions`, enable Developer mode and select **Load unpacked** → the folder containing `manifest.json`.
3. To update, replace files in the folder Chrome already loads, click **Reload ↻** on its extension card, then reopen the panel and refresh already-open source tabs. The version should read 0.8.1. Updates from before 0.5.0 add `webNavigation` for the implemented session recorder; Chrome may require permission approval or re-enabling. Updates from 0.4.3 or earlier also add all-site access. Versions 0.5.1–0.8.1 add no permissions.
4. Pin TraceVault and click its icon on an HTTP/HTTPS page. Chrome controls which side hosts its panel.
5. Follow **Folder → Case → Capture**. Choose a folder: if it contains other files but no workspace.json, TraceVault creates a separate TraceVault subfolder (or TraceVault-2, etc. when names are occupied). Empty folders and existing TraceVault workspaces are used directly. Access is checked with a real write/read/delete probe. Enter a case title; leave the optional code blank to assign the next free CASE-001, CASE-002, etc., or enter your own code. The form identifies the destination folder. When the panel says **Ready**, capture and annotation actions become available. The actual workspace subfolder is remembered for subsequent launches. If Chrome has lost folder access, use **Restore folder access** to continue the old case, or **Case actions → New case** to choose a different destination. Existing files stay in their original folder.

Site access is granted at installation/update for all websites by default. Capture and annotation actions do not request individual domains. The `<all_urls>` host permission also enables visible/full-page screenshots without clicking the extension icon again after changing sites. Annotation scripts automatically load on HTTP/HTTPS pages. If you restrict access in Chrome, the shield opens the extension's Chrome settings; choose **Site access → On all sites**. Protected Chrome pages remain restricted. File URLs are not supported by TraceVault's capture flow. Workspace folder access is a separate permission.

## Find an action

Hover an icon or focus it with the keyboard to see its English description. Icons have accessible names; Tab, Enter and Space remain available. **Commands** also provides a searchable list with readable action names.

Long URL displays keep their beginning and ending on one line, with a middle ellipsis when space is limited. Hover the URL to read the full address; Current page and URL fields also support keyboard focus. Very long tooltips can scroll. Saved source values, searches, link destinations, citations and exports keep the complete URL; clipping is visual CSS only.

| Location | Actions |
| --- | --- |
| Header | Case actions menu, Settings |
| Current page | **Save page** (HTML), bookmark current page, full-page PNG, PDF; more capture options for visible-area PNG, refresh and capture notes |
| Case sections | Materials, Bookmarks, Highlights, History; counts show saved records before filtering |
| Case actions menu | New case, Entities, export JSON, selected-text tools, Commands, workspace tab and folder |
| Bottom bar | Start/Stop window history; session journal and JSON export in Session actions |

**New case** remains available even when the remembered folder needs permission or is a single-case folder. The form lets you choose a destination independently. Selecting an occupied single-case workspace creates a separate child workspace; the original case stays intact. A visible checkbox controls whether to stop the current window's previous recording before creation. Pending old-session events are preserved and still require recovery before recording a new session. Creating a case resets collection/search state to Materials.

The case picker sits directly below the header. **Highlights** lists highlights, quotes and notes, with separate counts and a type filter. Search and filters are remembered separately for each section while the panel is open. Filters holds Current page only, type/status/domain/date; its active count stays visible when collapsed. Reset filters clears the current section. Empty lists distinguish missing records from filtered-out records. The note icon in Highlights creates a free note. Opening a record replaces its collection list with details; the back arrow or any section tab returns to the list. Source capture tools stay available. Preview, checksum verification, copy and original export remain in record details.

Select text on the website and use its context menu or selection toolbar for immediate annotation. The same actions remain in Case actions → Selected text. **Entities** is in Case actions; choosing it opens its collection with a visible heading. Menus support Tab, Escape and outside-click dismissal. Ctrl+Shift+Space opens Commands directly.

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

## Compare saved versions

Save the same page as HTML on each visit you want to compare. Open one of its saved Materials → **Compare saved versions**, choose Before and After, then **Compare text**. Both files are read and SHA-256-verified again. The comparison is manual and read-only; it does not monitor live pages or run on a schedule. It compares normalized document text, not CSS, layout, images, embedded frames or OCR. Different HTML bytes can have identical extracted text. Limits and coarse-result disclosure are in [saved-version comparison](docs/VERSION-COMPARISON.md).

## Record one window

Connect a case, then press the circle in the bottom **Window history** bar. Start records only the current HTTP(S) page as **Initial page**, not the list of already-open tabs. It neither activates nor reloads background tabs. When using the workspace tab, the source already shown under Current page may be used if it is still in the same window. Switching to an existing HTTP(S) tab later records **Tab visited**; subsequent document navigations and real SPA page-address changes are recorded. Same-address History API updates, fragment-only movement and title changes do not create page events. Tab membership and browser-provided linked-tab relationships remain technical provenance in the raw session journal. If there is no current HTTP(S) source, Start writes only the session-start event and waits for activity.

The session stays pinned to that window and case, even when you switch cases or close the panel. Future activity in that window's tabs participates; other windows do not. A tab moved out stops contributing; moving it in records its current page and resumes tracking. Existing annotation functionality remains independent of this recording scope.

Stop with the square. Closing the selected window also stops the session. After a browser/extension restart it ends explicitly; no other window is silently adopted. Saving **Pause all capture** also stops recording. Start remains disabled until you resume.

**Session actions → Open session journal** opens the investigation path: visited pages only, scoped to that session. Under Filters, uncheck **Visited pages only** to inspect technical lifecycle records. In History, event details offer the URL, times, original metadata and checksum verification. **Session actions → Export saved session as JSON** writes a real JSON file into the case's `exports` directory after re-verifying source event files. Each event is a separate verified JSON under `sessions/<session UUID>/`, referenced from the case's ordinary audit journal. A write error stops collection and exposes pending events with **Retry saving pending events**; reconnect the original workspace before retrying. From 0.5.4, retry also recovers older files whose JSON keys were reordered by browser storage, preserving the original file and its actual checksum. Interrupted empty/truncated files are retained alongside the recovered event; conflicting event data or committed checksum failures require review. Retry finishes the failed session; press Start explicitly for a new recording.

This records a browsing trail, **not page contents**. Use HTML/PNG/PDF capture to preserve the page itself. It does not reconstruct pre-session history, every redirect hop, failed navigation or user input. System time is not an independent timestamp. Sudden process/disk failure may lose browser callbacks that have not reached persistent pending storage; it is not a lossless forensic network recorder. One active session is supported. See [architecture and limits](docs/SESSION-RECORDING.md), [measured performance](docs/PERFORMANCE.md) and [comparison with adjacent tools](docs/COMPARISON.md).

## Export and build

**Export case JSON** writes a versioned JSON file to the case's `exports` folder, with source metadata, entities, evidence references, annotations, artifact hashes and relative paths. Copy the complete case folder alongside the JSON to transfer its primary files. The export is TraceVault's own interchange format; compatibility with other applications requires a separate adapter.

Requires Node.js 24; Python is used for ZIP packaging.

```powershell
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
python scripts/package.py
```

E2E uses isolated profiles and actual disk folders under `output/playwright`. Directory selection is automated with a native FSA handle supplied by CDP; only the QA profile pre-allows writes. Native OS picker/permission bubbles are not automated. The installed-Chrome tests use the standard Windows path; elsewhere add `--grep-invert "installed Chrome"`.

SingleFile is not bundled. There are no runtime third-party dependencies. [Dependency licenses](docs/LICENSES.md), [architecture](docs/ARCHITECTURE.md), [acceptance limits](docs/P0-STATUS.md), [test results](docs/TEST-REPORT.md), [UI plan](docs/UI-0.4-PLAN.md), [screenshots](docs/qa/README.md). [Features in development](docs/development/README.md) are separate from released functionality. Earlier engineering logs and the archived original specification remain in Russian. P0 is a tested MVP candidate; OCR, visual/image diff, scheduled monitoring, video, trusted timestamps, encryption and a native bridge are not implemented.

### Bookmarks

Use the ribbon icon beside **Save page** to bookmark the current HTTP/HTTPS page in the active case. **Bookmarks** keeps these links separate from saved evidence. No page contents are captured at this stage. The same full URL is deduplicated within the case.

Each bookmark has **Save HTML**, **Save PDF** and **Save full-page PNG** icon buttons with English tooltips. They activate a matching tab in the current window (preserving its live state), or open the address and wait up to 30 seconds for loading. The resulting capture links back to the bookmark and has its own source URL, acquisition times and verified files. Redirect destinations are recorded by the capture. Authentication, restricted pages, changing sites and expired links can prevent capture; a bookmark alone cannot recover lost content.

Click a bookmark to see its URL, addition time, saved copies and delete action. Deleting a bookmark hides the reference and leaves its audit history and all captured files intact. Bookmarks live in the case journal on disk and are included in case JSON exports. No Chrome bookmarks permission or browser bookmark access is used.

### Remove a route step

In History or the session journal, hover a recorded page visit and click the **×** at its right edge (**Remove step from history**). The control also appears with keyboard focus, and remains visible on touch devices. It removes only that occurrence, including while recording continues. Technical lifecycle records have no removal control.

**Undo step removal** restores the last removed step. After reopening the panel, use **Filters → Show removed steps**, then the row’s **Restore step** button. Changes persist in the case journal. Acquired navigation JSON files, original sequence numbers, hashes, timestamps and prior exports remain unchanged.

New session JSON exports provide the edited visit list in `path` and exclusion IDs in `excluded_event_ids`. The existing `events` array retains the verified acquisition record for provenance; it includes excluded events. Raw `previous_url` fields still describe actual browser transitions. Case JSON exports include the current `route_edits` state. Old exports remain unchanged on disk.

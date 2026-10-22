# TraceVault

A local Chrome Manifest V3 extension for capturing web evidence with SHA-256, source URLs, timestamps and annotations. The main interface is Chrome's **side panel**, normally on the right. English UI, light/dark themes, original flat icons, no runtime dependencies or telemetry.

## Install or update

1. Extract [TraceVault 0.4.2](releases/TraceVault-0.4.2.zip) to a permanent folder, or build `dist` from this repository.
2. In `chrome://extensions`, enable Developer mode and select **Load unpacked** → the folder containing `manifest.json`.
3. To update, replace files in the folder Chrome already loads, click **Reload ↻** on its extension card, then reopen the panel and refresh already-open source tabs. The version should read 0.4.2. The `tabs` metadata permission introduced in 0.3.2 may require confirmation when updating an older version.
4. Pin TraceVault and click its icon on an HTTP/HTTPS page. Chrome controls which side hosts its panel.
5. Use the **folder** icon to choose a workspace. The extension verifies access with a real write/read/delete probe. Choose an empty folder or an existing TraceVault workspace. Create a case using its code and title.

On a new site, click the extension icon or use a capture shortcut to grant temporary `activeTab`. A click inside an already-open panel does not grant that permission. The shield action grants optional annotation auto-restore for the current site. URL/title tracking works independently of capture permission and workspace access.

## Find an action

Hover an icon or focus it with the keyboard to see its English description. Icons have accessible names; Tab, Enter and Space remain available. **Commands** also provides a searchable list with readable action names.

| Group | Icons, left to right |
| --- | --- |
| Header | Commands, open workspace tab, settings |
| Capture | HTML document, visible-area camera, full-page PNG scan, PDF document |
| Annotate selection | Highlight, quote, note, entity |
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

Full PNG scrolls both axes, keeps original frames and their coordinates/timestamps/SHA-256, stitches a PNG and restores scroll/overlays. Capture stops if the URL, active tab, zoom or geometry changes. Limits: 24 million pixels, 30000 px per side, 64 frames, configurable byte limit (64 MB default). Viewport-fixed roots are shown once at a selected edge tile; sticky elements are temporarily returned to their natural flow. Source/destination crop rectangles and normalization details are recorded, and styles/scroll are restored. Closed shadow roots, nested frames, newly appearing overlays and complex transformed/overflowing elements are not universally normalized. Sequential capture is not an atomic snapshot in time.

PDF is a lossless raster A4 derivative of a verified PNG, without OCR or HTML reflow. It has its own SHA-256 and source derivation. Open it from the workspace in an external viewer; blob-PDF preview is not supported by the extension's strict CSP.

Highlight selection saves immediately without opening an editor; the note is optional. Right-click a visible highlight and use **Edit highlight note** or **Delete highlight here**. Deletion is a reversible journal update; use Undo in TraceVault to restore it. A right-click outside a highlight returns a clear error. Annotations use CSS Highlights, without rewriting page text or saved originals. An unarchived reference is marked **Live page only**. Use the archive-and-link icon in the editor to bind a quote to a verified HTML capture. Edits, hide and undo are journal events; existing evidence references remain pinned to their original version.

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

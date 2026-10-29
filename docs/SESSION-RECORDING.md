# Window-scoped session recorder

## Design and API prototype

The MV3 worker owns the recorder; the panel selects a real FSA workspace and sends commands. This avoids depending on an open panel. Before implementation, the scope was fixed as one normal non-incognito window, all its HTTP(S) top-level tabs, one pinned workspace/case, and explicit Start/Stop. No history import, silent page archiving, server transport or automatic window replacement.

From 0.5.2, that scope means future activity, not an initial inventory. Start queries `{windowId, active:true}` only, records at most one current HTTP(S) page and never scans the list of existing tabs. If the active page is TraceVault's own workspace, a panel-supplied sourceTabId may resolve the source already displayed in Current page, after same-window/incognito/HTTP checks. With no eligible source, only session_started is written. No tabs are activated or reloaded. Later tabs.onActivated events record tab_activated (Tab visited) after scope/active checks, with same-page deduplication; untouched background pages stay out. Historical tab_snapshot records from older versions remain intact.

Navigation and activation receipts bind to the session ID before asynchronous lookup/queueing. Receipts with no recording session are discarded; a callback cannot be adopted by a later session just because tabs.get resolved late. This volatile ingress gate is reconstructed from persisted state when a worker wakes, before accepting the first waking navigation; it is not the primary session store and does not compare Chrome process timestamps to wall time. Stop/failure closes the gate. Interruption/persistence limits below still apply.

`webNavigation` is required for committed navigations, History API address changes. Linked-tab provenance uses `onCreatedNavigationTarget`; previous_url is chronological context, not proof of a click. Standalone title events and fragment-only changes are no longer collected from 0.7.0. Visit titles are retained when available at acquisition; committed navigation may not yet have its final title. Membership uses tabs.onCreated/onAttached/onDetached/onRemoved. windows.onRemoved ends the session. Navigation membership is resolved before the disk queue, guarded against tab moves during that lookup, and checked again before writing. Events in transit during tab moves can be conservatively omitted.

Technical references checked 27 October 2026: [Chrome webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation) and [MV3 worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). The real-browser API prototype wrote from the worker to a user-directory FSA handle persisted in IndexedDB, read each result back, and independently verified the bytes/SHA-256 with Node. No mock writer or Downloads fallback.

## Current route behavior, 0.7.0

The route records visits, not live document mutations. History API callbacks with the same URL after removing the fragment are ignored before writing. A real path/query change inside a SPA is stored as navigation with navigation_method=history_api; committed document navigation uses navigation_method=document. Reload/back/forward remain visits. Fragment-only callbacks and tabs.onUpdated title listeners are not registered by the recorder. No DOM observers, content snapshots or change-monitor scheduler are added. Existing files retain their original types/bytes.

The session-journal action defaults to Visited pages only. It shows initial page, navigations, explicit tab visits and tab entry into the selected window. Legacy SPA events are shown only when their page address changed. Lifecycle/provenance events remain in the raw journal and verified export, available by clearing that filter. Manual content comparison is an independent read-only [saved-version action](VERSION-COMPARISON.md).

## State and messages

- Panel-only messages: TV_SESSION_START(sessionId, windowId, optional sourceTabId), TV_SESSION_STOP, TV_SESSION_RETRY. The background validates the sending extension page and responds with actual state or an error.
- IndexedDB key session-target:<UUID>: original directory handle, workspace metadata, case ID/label. Active-case changes do not modify it.
- chrome.storage.local.navigationRecorder: status, original window/workspace/case/session IDs, saved count, next sequence, pending events, current scoped tab metadata and errors. UI listens to storage changes; counts update immediately, disk-backed lists refresh at most once per two seconds during recording.
- chrome.storage.session.navigationEpoch: distinguishes browser/extension restart from ordinary worker suspension. A new epoch stops the old recording; no window-ID reuse is trusted. Missing original windows also terminate during initialization.
- Serial recorder Web Lock followed by the existing disk writer lock. Pending data is persisted before file writing. From 0.5.4, each pending event is frozen as validated JSON text before persistence, because Chrome storage can reorder keys in object values. Legacy object drafts are migrated to text before any recovery write. Audit event ID deduplication verifies both the committed artifact checksum and its event data before clearing a repeated draft. Recorder flush reuses the loaded audit snapshot while still holding the writer lock.

Statuses: starting → recording → stopping → stopped. Any write failure → save_error; collection stops, pending records remain explicit. Retry flushes those records and ends the session; starting a new session requires no outstanding pending events. Closing the window writes a stop event. A browser/extension restart records detection time, not an invented exact shutdown timestamp.

## Disk contract

Workspace: cases/<case UUID>/sessions/<session UUID>/<sequence>-<event UUID>.json. Single-case mode omits cases/<case UUID>/. Every event has schema_version=1, stable IDs, sequence, type, observed_at, timezone/offset/system-clock source and window ID. Navigation also retains the raw Chrome browser timestamp, document ID, transition type/qualifiers and source URL/title when available. Raw Chrome timestamp and extension wall clock are kept separate because Chrome documents possible process-clock skew.

writeNew performs SHA-256/size readback; the existing append-only case journal references the event and Artifact descriptor under navigation_recorded. Recovery does not invent original file-write timestamps. Export re-verifies every source Artifact and writes a new verified exports/<UUID>__session.json with format tracevault-navigation-session and event/Artifact pairs. It adds navigation_exported to the journal. Existing export contracts and data schemas are unchanged.

### Recovery without rewriting originals, 0.5.4

If the event file exists but its case-journal receipt was never committed, retry compares the parsed event with the pending draft. Only JSON object-key ordering and formatting may differ: all values, array order, strings, IDs and times must match. This comparison is not a cryptographic canonicalization scheme. A matching file is adopted in place with its actual byte length and SHA-256, marked recovered_existing and existing_representation=exact_payload or equivalent_json. Legacy object drafts can therefore recover files written before Chrome reordered their keys. No original is normalized or rewritten.

An empty, truncated, invalid-UTF-8 or invalid-format uncommitted file is preserved in place. Retry uses the next free deterministic __retry-N.json path (up to eight), with a session_recovery descriptor recording the preserved paths, hashes, lengths and detection times. It also recognizes an already-complete retry file after another interruption. Unexpectedly large existing files stop recovery before allocation-heavy parsing. Valid JSON containing different event data stops recovery for review. Committed artifact checksum failures and invalid case journals remain blocking errors; this mechanism does not repair them or create alternative success records for them.

Retry ends a failed session after saving its pending records; it does not resume recording silently. Browser pending storage must still exist. Physical power loss, disk-full and permission revocation remain outside the automated recovery coverage.

## Limits and remaining work

The recorder observes browser events; it does not preserve page contents, failed navigations, every redirect response, network headers/bodies, form fields, passwords, older browser history, video or trusted timestamps. A tab entering the chosen window exposes its current URL, even if that URL was opened outside; the earlier outside navigation is not collected. Protected pages and subframes are excluded. Existing annotation scripts remain separate from session scope.

One session at a time. Disk access may expire while the panel is closed; the worker cannot display a permission request and stops with pending/error state. Reconnect the original folder before Retry. FSA success is never substituted with an in-browser-only success. Browser storage is temporary recovery state, not the primary archive. If browser storage itself fails, errors propagate; catastrophic interruption before a browser callback has been persisted can lose that callback. RAM-queued callbacks are not promised crash-durable. Physical power loss during filesystem commit, quota exhaustion and native permission dialogs were not fault-tested in this iteration.

The directory journal is rescanned for every append to retain corruption/sequence checks. Large cases and sudden bursts remain slower; 100 real SPA events took about 54 seconds to fully write on the test machine. Incremental verified indexing and a bounded persistent ingress queue are future improvements, not implemented guarantees. No new runtime libraries were added; SingleFile code is not embedded or copied.

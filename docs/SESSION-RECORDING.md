# Window-scoped session recorder, 0.5.0

## Design and API prototype

The MV3 worker owns the recorder; the panel selects a real FSA workspace and sends commands. This avoids depending on an open panel. Before implementation, the scope was fixed as one normal non-incognito window, all its HTTP(S) top-level tabs, one pinned workspace/case, and explicit Start/Stop. No history import, silent page archiving, server transport or automatic window replacement.

`webNavigation` is required for committed navigations, History API and fragments. Linked-tab provenance uses `onCreatedNavigationTarget`; previous_url is chronological context, not proof of a click. Titles use tabs.onUpdated only when the currently scoped tab matches the tracked URL. Membership uses tabs.onCreated/onAttached/onDetached/onRemoved. windows.onRemoved ends the session. Navigation membership is resolved before the disk queue, guarded against tab moves during that lookup, and checked again before writing. Events in transit during tab moves can be conservatively omitted.

Technical references checked 27 October 2026: [Chrome webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation) and [MV3 worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). The real-browser API prototype wrote from the worker to a user-directory FSA handle persisted in IndexedDB, read each result back, and independently verified the bytes/SHA-256 with Node. No mock writer or Downloads fallback.

## State and messages

- Panel-only messages: TV_SESSION_START(sessionId, windowId), TV_SESSION_STOP, TV_SESSION_RETRY. The background validates the sending extension page and responds with actual state or an error.
- IndexedDB key session-target:<UUID>: original directory handle, workspace metadata, case ID/label. Active-case changes do not modify it.
- chrome.storage.local.navigationRecorder: status, original window/workspace/case/session IDs, saved count, next sequence, pending events, current scoped tab metadata and errors. UI listens to storage changes; counts update immediately, disk-backed lists refresh at most once per two seconds during recording.
- chrome.storage.session.navigationEpoch: distinguishes browser/extension restart from ordinary worker suspension. A new epoch stops the old recording; no window-ID reuse is trusted. Missing original windows also terminate during initialization.
- Serial recorder Web Lock followed by the existing disk writer lock. Pending data is persisted before file writing. Audit event ID deduplication and exact-byte checks recover an already-written event without duplication. Recorder flush reuses the loaded audit snapshot while still holding the writer lock.

Statuses: starting → recording → stopping → stopped. Any write failure → save_error; collection stops, pending records remain explicit. Retry flushes those records and ends the session; starting a new session requires no outstanding pending events. Closing the window writes a stop event. A browser/extension restart records detection time, not an invented exact shutdown timestamp.

## Disk contract

Workspace: cases/<case UUID>/sessions/<session UUID>/<sequence>-<event UUID>.json. Single-case mode omits cases/<case UUID>/. Every event has schema_version=1, stable IDs, sequence, type, observed_at, timezone/offset/system-clock source and window ID. Navigation also retains the raw Chrome browser timestamp, document ID, transition type/qualifiers and source URL/title when available. Raw Chrome timestamp and extension wall clock are kept separate because Chrome documents possible process-clock skew.

writeNew performs SHA-256/size readback; the existing append-only case journal references the event and Artifact descriptor under navigation_recorded. Recovery of an existing exact-byte event does not invent original file-write timestamps. Export re-verifies every source Artifact and writes a new verified exports/<UUID>__session.json with format tracevault-navigation-session and event/Artifact pairs. It adds navigation_exported to the journal. The OSINTchart exchange contract and existing schemas are unchanged.

## Limits and remaining work

The recorder observes browser events; it does not preserve page contents, failed navigations, every redirect response, network headers/bodies, form fields, passwords, older browser history, video or trusted timestamps. A tab entering the chosen window exposes its current URL, even if that URL was opened outside; the earlier outside navigation is not collected. Protected pages and subframes are excluded. Existing annotation scripts remain separate from session scope.

One session at a time. Disk access may expire while the panel is closed; the worker cannot display a permission request and stops with pending/error state. Reconnect the original folder before Retry. FSA success is never substituted with an in-browser-only success. Browser storage is temporary recovery state, not the primary archive. If browser storage itself fails, errors propagate; catastrophic interruption before a browser callback has been persisted can lose that callback. RAM-queued callbacks are not promised crash-durable. Physical power loss during filesystem commit, quota exhaustion and native permission dialogs were not fault-tested in this iteration.

The directory journal is rescanned for every append to retain corruption/sequence checks. Large cases and sudden bursts remain slower; 100 real SPA events took about 54 seconds to fully write on the test machine. Incremental verified indexing and a bounded persistent ingress queue are future improvements, not implemented guarantees. No new runtime libraries were added; SingleFile code is not embedded or copied.

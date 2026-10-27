# Changelog

## 0.5.4 — recover interrupted session writes, 27.10.2026

- Fix false "different bytes" failures: chrome.storage.local can reorder keys in object values. Pending events are now frozen as validated JSON text before persistence/writing; legacy object drafts migrate on retry.
- Reuse a matching uncommitted event in place even when JSON formatting/key order differs. The audit references its actual original bytes and SHA-256; event values, IDs, timestamps and array order must match.
- Preserve empty/truncated/invalid uncommitted files and write a verified event to a deterministic retry path, recording the preserved files' hashes and lengths. Valid conflicting events, corrupted committed artifacts and invalid audit journals still block recovery.
- Verify committed event data as well as its checksum before clearing an already-published pending draft. Persist retry errors; no silent overwrite, deletion, restart of collection, new permissions or dependencies.

## 0.5.3 — compact URL display, 27.10.2026

- Current page, capture/session lists and URL detail fields use one-line middle ellipsis, preserving the beginning and ending. Layout adapts to available width with CSS, without canvas measurement or per-element observers.
- Hover/focus shows the full URL using the existing tooltip system; oversized URL tooltips scroll within the viewport. Tooltips refresh when a URL changes and dismiss when their owner is removed. No nested focus targets inside list buttons.
- Original URL strings remain intact in DOM text, stored metadata, search/filter inputs, citations, hrefs and exports. No permissions, dependencies, schema or evidence-file changes.

## 0.5.2 — start from the current page, 27.10.2026

- Start no longer initializes every pre-existing tab as Initial page. It queries only the selected window's active tab and records at most one initial HTTP(S) page; workspace mode can use its already-displayed same-window source. No background tab is activated or reloaded.
- Subsequent activation of an existing HTTP(S) tab records Tab visited. Other-window activations stay excluded; repeated activation of the same tracked page is suppressed. Navigation updates the active-tab context so returning from a newly opened tab is handled correctly.
- Bind navigation/activation callbacks to their session at receipt, so delayed pre-start events cannot enter a later recording. Restore that ingress binding on ordinary worker wake without relying on cross-process clock comparisons.
- Existing history files are unchanged. No new permissions, dependencies or incompatible schema changes.

## 0.5.1 — compact lossless captures and bounded caches, 27.10.2026

- Default Compact screenshot storage: retain one full-resolution PNG, omit duplicate intermediate viewport files. PNG + source frames remains selectable for independently reconstructing the stitch. Each capture records its retention policy; no old originals are deleted or recompressed.
- Original strip PNG encoder, RGB/RGBA Sub/Up filtering, native deflate and smaller-file fallback. No downsampling or lossy quality setting. Tests compare exact decoded pixels, including 11px text and alpha. Encoding diagnostics record source/output bytes and bounded strip buffers.
- Read-heavy capture canvases use software-oriented contexts; the full stitch canvas is allocated once, overlay bitmaps close before encoding, and scanline buffers are reused. FSA writes accept immutable Blobs without holding a second full input ArrayBuffer throughout the write; readback SHA-256/size checks and overwrite protection stay intact.
- PDF v2 uses filtered strip compression with PNG predictors. It remains a lossless PNG derivative with the same source hash and no OCR. Independent PDF decoding checks exact RGB equality.
- Journal cache is limited to 2048 entries / 4 MiB of source JSON bytes, whichever comes first. That is a cache budget, not a total RAM limit. Replay still loads/validates every event. Browser annotation cache retains only the active case; other cases are restored from disk on activation.
- No new dependencies, permissions or incompatible data-schema changes. Large full-page canvases, source-page memory, journal replay and compressed output still consume memory; Compact is not a fixed RAM cap.

## 0.5.0 — one-window browsing sessions, 27.10.2026

- Explicit Start/Stop in the side panel, pinned to one normal window and the starting case. Record top-level HTTP(S) navigation, SPA/hash changes, titles, tab membership and browser-provided linked-tab relationships. Other windows and incognito are excluded; moved tabs are checked before queueing and before writing.
- Background FSA writes continue after closing the panel. Separate immutable JSON event files with readback SHA-256, ordinary case audit references, pending/error/retry states, idempotent retry and explicit stop on window close or browser/extension restart. No automatic reassignment of window IDs.
- Session journal, original metadata/checksum details and verified JSON export. Pausing capture stops the session. Source content is captured separately. No dependencies or OSINTchart schema changes; `webNavigation` is a new required permission.
- Reuse the journal snapshot under the existing writer lock, and throttle list refresh during recording. A measured 100-event burst improved from 70.5 to 53.9 seconds and 35.0 to 19.5 whole-test-browser CPU seconds. Panel retained JS heap grew by about 0.4 MB; whole-browser memory is explicitly not extension-only memory. High-volume journal indexing remains a bottleneck.

## 0.4.8 — create a workspace subfolder, 27.10.2026

- Picking a populated folder without workspace.json creates a separate TraceVault subfolder. Occupied names, including regular files, are skipped as TraceVault-2, TraceVault-3, etc. Existing workspaces and empty selections still open in place.
- The actual child handle is validated and persisted; reload/reconnection does not create another directory. Case setup and the folder indicator show the selected parent/child location during creation. Folder changes preserve the selected workspace layout for new directories.
- Corrupt existing workspace metadata remains an explicit error. Existing user files, prior workspaces and captured artifact bytes are not overwritten.

## 0.4.7 — optional case code, 27.10.2026

- Case code is optional and blank by default. Empty/whitespace/omitted codes are assigned in the repository when the case is created: first unused CASE-001, CASE-002, etc. Existing codes are read from disk under the caller's write lock.
- User-supplied codes retain their value (with surrounding whitespace trimmed). Existing case files are not renamed or rewritten. The form explicitly says that leaving the code blank assigns one automatically.

## 0.4.6 — guarded workspace setup, 27.10.2026

- Fix null-workspace case operations: a remembered folder handle no longer enables case creation before workspace metadata is connected. Repository path/list/create operations validate the workspace mode before any disk access. Invalid/null workspace.json reports a recovery message instead of a property-access exception.
- Guided Folder → Case → Capture sequence, labelled first-case action, automatic editable case codes, explicit destination folder and a Ready summary. Capture/annotation/export actions stay disabled until a case is connected; collections are hidden during setup. Lost access has a labelled Restore folder access action.
- Connection and case creation have separate in-progress guards; duplicate form submissions create one case. Folder changes are pinned and persisted only after metadata, cases and recovery validate. A bad candidate preserves the connected folder. Reauthorization reopens existing cases; single-case mode hides the impossible second-case action.

## 0.4.5 — selection toolbar dismissal, 23.10.2026

- Annotation rendering no longer opens the floating selection toolbar. Previously background refreshes, page mutations and capture cleanup could make an already-dismissed toolbar visible with no selection.
- Toolbar eligibility uses a live, nonempty, connected page selection outside editors and TraceVault UI, with a visible rectangle. Clearing selection, outside clicks, Escape, scroll, resize, blur, capture-hide and native context menus dismiss the toolbar and cancel queued opening callbacks.
- Cached selection remains available for side-panel actions after focus changes; explicit empty page clicks clear the cache. Original page text and archived evidence are unchanged.

## 0.4.4 — all-site access by default, 22.10.2026

- Required `<all_urls>` host access replaces optional per-domain access. HTML/PNG/PDF and selection actions no longer call permissions.request. Chrome may require approval on update; user-imposed site restrictions remain under Chrome's control.
- Manifest content scripts restore annotations automatically on HTTP/HTTPS pages and after browser restart. Update removes the legacy per-domain dynamic registration. Non-HTML documents are skipped safely by the annotation script.
- The shield appears only when Chrome withholds site access and opens the extension's actual Chrome settings. The separate workspace directory permission flow is unchanged.

## 0.4.3 — resource CORS and site access, 22.10.2026

- Archive resources and original images use credentialed fetch only on the source page's origin. Cross-origin public CSS/fonts/images use anonymous fetch, compatible with `Access-Control-Allow-Origin: *`. Missing resources still produce partial-capture diagnostics.
- Panel Capture/Annotate actions request optional permission for the current site directly inside the button gesture when no working access has been observed. The source is rechecked after permission approval. Existing activeTab access avoids the request; denied access does not start a capture.
- Missing-host injection errors carry an actionable SiteAccessError with shield/icon recovery instructions. Expected permission refusals stay in the status UI rather than being logged as internal exceptions. Permission changes invalidate observed access and refresh source state.
- Corrected the collector version constant to match the release; existing evidence metadata is unchanged.

## 0.4.2 — discoverable collections, 22.10.2026

- Visible names under the four collection icons: Materials, Highlights, Entities, History. Action toolbars remain icon-only. Highlights contains an explicit breakdown of highlights, quotes and notes, with a type filter and type labels on records.
- Search, type, status, domain, date and current-page filters are retained independently for each section while the panel is open. Capture-only fields are hidden outside Materials. Filter count and reset state reflect the active section.
- Empty collections explain how to add a record. Filtered-out records offer a working Clear filters action. Empty lists hide pagination; changing sections closes unrelated record details.
- First launch presents Choose workspace folder as a labelled action; the optional layout choice is tucked into Folder layout with an explanation. No storage/schema/permission or capture-engine changes.

## 0.4.1 — fixed headers and direct highlights, 22.10.2026

- Full-page capture shows viewport-fixed roots once and returns sticky nodes to their natural flow temporarily. Overlap-safe source-pixel patches preserve the single header/footer occurrence. Capture method v2 records frame crop rectangles, visible/hidden roots, normalization and restoration results; existing evidence is untouched.
- Styles/priorities and scroll restore after success, cancellation and failure. Unrelated site style updates survive. Fixed descendants of scrolling transformed containers are excluded. A document-scoped lease releases temporary styles if the capture document stops responding.
- Highlight selection now writes immediately with an optional empty note, without an editor. Right-click a visible highlight to edit its note or delete it; deletion is reversible through Undo. Hit testing uses actual CSS Highlight ranges and pointer coordinates, without inserting spans into source text.
- Successful command receipts prevent duplicate delivery from repeating automatic annotation actions. Native selection text is used for the menu-selection digest, preserving multi-paragraph highlights with rendered line breaks.
- On-page success feedback follows verified writes and is hidden during captures. No new permissions or runtime dependencies.

## 0.4.0 — English icon interface, 22.10.2026

- All shipped interface text, runtime errors/progress, context menus, command descriptions and citation labels are English. Source content, user data, existing originals and historical journal entries are preserved.
- Original monochrome SVG action icons with English hover/keyboard-focus tooltips and accessible names. Searchable command results and evidence titles retain readable text.
- One-line application toolbar, matching capture/annotation grids, icon navigation with an active section heading, aligned controls, fixed header/status and a scrolling content area.
- Grouped Settings dialog: Appearance, Capture, Annotations, Keyboard shortcuts and Storage. Apply/cancel behavior is consistent for theme, pause, limit and global annotation visibility; per-site visibility remains an immediate action. Unassigned internal browser commands are omitted.
- Validation/errors are visible inside the active dialog. No new permissions, runtime dependencies or data-schema changes.

## 0.3.2 — текущая страница и доступ к папке, 22.10.2026

- По прямому запросу пользователя полностью удалены исключения доменов: enforcement, стартовые списки, настройки и кнопка разрешения. Старые blockedDomains/allowedCaptureHosts удаляются из preferences при открытии панели.
- URL и название текущей страницы обновляются до чтения диска; события вкладок обрабатываются с защитой от устаревших асинхронных результатов. Добавлено разрешение tabs для метаданных после смены домена без activeTab.
- При истёкшем разрешении на папку кнопка сохранения запрашивает его в пользовательском действии и заново подключает прежний Workspace/дело. При отказе видна кнопка повторного доступа. Исходная вкладка фиксируется до запроса; смена URL в процессе приводит к отказу.
- Пассивное открытие панели с недоступной папкой больше не пытается читать workspace.json. Обновление источника продолжает работать. Постоянство разрешений остаётся под управлением Chrome.
- Реальный stress-test выявил редкий InvalidStateError на FSA close с пустым новым файлом. Добавлены максимум два повтора только для того же нового пустого файла; permission/quota и непустые/старые файлы не повторяются. Успех по-прежнему требует close и полного SHA-256 readback. Исправлен зависший статус «Инициализация…» в подключённой панели.

## 0.3.1 — понятные исключения сайтов, 22.10.2026

- Вместо общего «Домен исключён» показаны hostname, сработавшее правило и способ разрешения.
- В панели исключённого сайта — «Разрешить фиксацию на этом сайте». Разрешение относится к точному hostname, сохраняется в настройках и не открывает другие поддомены/банки.
- В настройках список точных разрешений доступен для редактирования/отмены; домены нормализуются, URL можно вставлять целиком. Настройки перечитываются перед действием для других открытых документов.
- Стартовый список чувствительных доменов сохранён; pause/incognito и разрешения Chrome не обходятся.

## 0.3.0 — полный снимок, PDF и знак, 22.10.2026

- Полный PNG по двум осям с небольшим перекрытием без масштабирования пикселей; raw-кадры, порядок, scroll, SHA-256, восстановление позиции/оверлея, отмена, лимиты и fail-closed при изменении геометрии.
- Исправлено округление CSS-размеров при zoom 125%, которое давало неверную высоту и однопиксельные щели. Добавлена проверка всех 3000 строк тестовой страницы.
- Многостраничный растровый A4 PDF с lossless RGB/Flate, метаданными источника/UTC/SHA-256. «Страница в PDF» и «Создать PDF» для существующего PNG; оригинал неизменен, PDF отдельный Artifact.
- PDF сохраняется локально; копирование пути/экспорт проверены. Браузерный blob-просмотр исключён после реального отказа Chrome CSP; object-src none сохранён.
- Авторский плоский знак T/V, SVG и PNG 16/32/48/128, внедрён в заголовок и manifest/action icons.
- Artifact.kind дополнен full_page_png/screenshot_frame/derived_pdf. Старые записи v1 не переписываются; новые enum требуют актуальной схемы у строгого импортёра. Runtime-зависимостей/permissions не добавлено.

## 0.2.0 — исправления и удобство, 22.10.2026

- Проверка SHA-256 перед просмотром и экспортом, показ проверенного снимка байтов.
- Исправлены доменные фильтры, поиск источников Entity, синхронизация активного дела между документами, выбор вкладки своего окна и привязка archive-first к исходному делу редактора.
- Очередь привязана к workspace; повтор failed/cancelled capture не пытается открыть несуществующий артефакт.
- Контент-скрипт не сканирует текст страницы без аннотаций; Escape освобождает URL просмотрщика.
- Выделение целого абзаца и диапазоны с границами на HTML-элементах корректно переводятся в текстовые якоря.
- Палитра команд, фильтр текущего URL, сброс фильтров, цитирование с SHA-256, возврат последней удалённой аннотации.
- Четыре предлагаемых сочетания Ctrl+Shift+1…4, показ фактических назначений; локальные Ctrl+Shift+Space, /, Ctrl+Enter, Escape.
- Формат workspace/schema v1 сохранён, runtime-зависимостей не добавлено.

## 0.1.0 — разработка, 22.10.2026

- MV3 Side Panel, Obsidian-подобные светлая/тёмная темы.
- Реальная выбранная папка, несколько дел или одна папка на дело, восстановление handle.
- Собственный автономный HTML engine, PNG viewport, исходные изображения; readback SHA-256 и точные часы.
- Append-only файловые события, восстановление interrupted, pinned case ID, отмена/лимиты/диагностика.
- Аннотации через CSS Highlight, заметки, точные цитаты, консервативные якоря.
- Entity drafts, immutable Evidence Reference, JSON export и отдельный OSINTchart CaseService adapter.
- Unit/E2E/схемы и фактический отчёт; P0 acceptance ещё уточняется, P1/P2 не объявлены завершёнными.
- Проверен установленный Chrome 155 и CFT 156, native SIDE_PANEL, 32 корректных HiDPI PNG, 2000 synthetic metadata records.
- Исправлены activeTab при открытии панели, stale annotation state, null injected-DOM result при лимите, race редактора/экспорта и обработка очереди после прерывания.
- Готовы unpacked dist и детерминированный ZIP с SHA-256; исходные публичные тестовые capture включены в samples/public.

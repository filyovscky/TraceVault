# Фактические проверки

## 0.4.3 — reported Chrome CORS / host access errors

- The screenshots showed a public Google Fonts stylesheet fetched with credentials and a missing-host script injection on mail-tester.com. The capture engine unconditionally used `credentials:include`; panel buttons did not request host access after cross-origin navigation revoked activeTab. No supplied evidence or user session was modified.
- Public cross-origin archive/image fetches now use `omit`; same-source-origin fetches retain `include`. The origin comes from the actual source URL, not an external `<base>`. No permission expansion for third-party resources and no silent removal of partial-capture diagnostics.
- Capture/selection button handlers initiate optional site permission requests synchronously in the click event when there is no observed working access. Grant checks the source again and registers annotation restore; refusal does not create evidence. Missing-host injections become a SiteAccessError with recovery instructions, without console.error for this expected condition. Access cache is invalidated on permission removal; the page status distinguishes temporary from persistent access.
- `npm run check`: **16 unit tests**, ESLint and build PASS. Credential-policy regression covers same origin, CDN/subdomain, protocol, port and invalid URL. Collector metadata version now matches 0.4.3; existing records retain their historical metadata.
- The new browser regression first reproduced an actual denied script injection with no activeTab, checks its actionable error, and models only optional-permission **refusal** while asserting a live button user gesture and the exact origin request. It then invokes the real extension action to acquire activeTab and saves an actual HTML artifact from a fixture with cross-origin wildcard-CORS CSS and a nested SVG. Node reads the artifact and independently verifies SHA-256, embedded CSS/image data, empty warnings and absence of CORS errors from the extension page. The driver waits for the temporary-access status before retrying capture; its first run raced action invocation and was corrected.
- Final browser run: **6/6 PASS** — the new wildcard-CORS/access-recovery scenario in CFT and installed Chrome, source metadata/navigation/SPA in both browsers, expired-folder reconnect with real verified saves, and the English UI/settings/annotation/filter regression. Real optional-permission approval UI remains outside this coverage. Release ZIP contains 22 files, byte-identical to `extension/`; SHA-256 is saved beside it.
- Boundaries: the operating-system Chrome permission approval bubble is not automated; a successful native optional-host approval was not claimed. Actual positive temporary access uses Chrome's real action invocation. Google Fonts/mail-tester private session was not opened. Authenticated resources on a different origin may still be unavailable and produce partial diagnostics. The 0.4.2 CFT context/Undo timeout is separate and was not retested or claimed fixed here.
- Relevant platform references: [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [MDN wildcard CORS and credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSNotSupportingCredentials).

## 0.4.2 — collection discoverability and independent filters

- Implemented labelled collection navigation, Highlights with type filter and accurate type counts, per-section in-session filter state, context-sensitive filter fields, distinct empty/filter-miss states, working Clear filters, and a simpler folder setup. No capture/storage model changes.
- `npm run check`: ESLint, **15/15 unit tests**, clean build PASS. `git diff --check` PASS.
- English UI regression PASS with native disk HTML write and independent Node SHA-256 check, real note save, preference reload, independent Materials/Highlights search state, annotation type filtering and restoration, working reset, empty Entities guidance, and no misleading reset action when the collection is empty.
- Quote/entity/archive-reference/edit/orphan/tamper regression PASS. Two usability scenarios PASS: keyboard assignments/palette, clipboard, filters, Undo, checksum-tamper refusal, and active-case synchronization across documents. These are **4 browser scenarios PASS** in the final UI run.
- Visual QA: actual screenshots at 320 and 420 CSS px in both themes, with horizontal overflow assertions PASS. Inspected dark 320 and light 420; checked visible navigation labels, icon alignment, counts, list and footer. Screenshots: `qa/0.4.2-dark-320.png`, `qa/0.4.2-light-420.png`. The screenshot driver now waits for the Settings dialog to finish saving/closing before capturing.
- Initial context-highlight regression runs exposed a driver race: both the test workspace tab and a real native side panel consumed the durable inbox. Disk journals contained `annotation_created` and `command_completed` while the driver asserted status in the other document. The integration fixture now disables the native panel **only in its disposable QA profile**, using Chrome's real `sidePanel.setOptions({enabled:false})`; real action invocation, context handler, queue, selection hit testing and native disk writes remain in use. This test does not validate the OS context-menu popup or native side-panel opening. API reference: https://developer.chrome.com/docs/extensions/reference/api/sidePanel#type-PanelOptions.
- One initial English UI run timed out waiting for Case created; its repeated final UI runs passed. This is recorded rather than counted as a clean first-run success.
- Context-highlight integration after isolating the receiver: installed Chrome **PASS**, including immediate save, edit, delete, Undo, no-hit refusal, multi-paragraph selection, and original-byte/hash checks. CFT remains **FAIL by timeout**: one run exceeded the 5-second disk-count wait for a second annotation, and the final CFT run exceeded the 5-second CSS highlight wait after Undo. The second-annotation poll now uses 20 seconds and less aggressive disk polling; this did not make the final CFT run clean. No production capture/highlight logic was changed to conceal this issue. In total **5 distinct browser scenarios passed; 1 CFT context scenario remains unstable**. Native filesystem/notification completion timing needs separate diagnosis; a cause has not been established for the remaining CFT failure.
- Limits: visible labels improve discoverability but no human usability study or timed performance benchmark was performed. Filter state survives section switches within the current panel, not a browser restart. Original capture-engine limitations remain as documented below.

## 0.4.1 — fixed headers and direct context highlights

### Architecture and implementation

- [Capture plan](FIXED-HEADER-PLAN.md), [highlight plan](HIGHLIGHT-PLAN.md). The supplied images showed the viewport header repeated by the old tile stitcher, which only warned about fixed/sticky elements. No supplied evidence file was changed. No GoFullPage code/library was copied.
- `capture-layout.js` owns a document-scoped temporary presentation session: sticky→relative/insets auto; fixed roots visible at one edge tile; opacity suppression elsewhere. Descendants of transformed/contained scrolling blocks are excluded. Original property values/priorities restore conditionally, preserving unrelated site updates. Finally handles success/error/cancel; a 30-second renewable lease additionally releases temporary styles after an abandoned session.
- The stitcher retains screenshot-pixel patches and applies them after all tile overlaps. Frames record exact stitch source/destination rectangles; `screenshot_adjustments.fixed_overlays` records retained patches. Saved frame timestamps, bytes and SHA-256 remain verifiable. Method is now `tracevault-scroll-stitch-v2`; normalization is explicit and sequential capture still reports partial.
- Highlight selection writes immediately with `note=''`; optional note editing uses the existing pinned-reference editor. Context hit testing uses CSS Highlight ranges/rectangles at the right-click point. Delete pins ID/case/URL, rechecks disk state, journals `deleted:true`, broadcasts actual state and offers Undo. A miss returns an error. Source text/DOM structure and original evidence files stay unchanged. Completed command receipts prevent duplicate automatic actions.

### Actual tests

- `npm run check`: ESLint/build and **15/15 unit tests PASS**.
- **2 fixed-header E2E PASS**, CFT 156 and installed Chrome 155. Each captures a wide 1500×2400 page and a short page just taller than the viewport, exposing large final-frame overlap. Every row in a probe column is checked: exactly 80 header rows, 32 footer rows and 40 natural-flow sticky rows; all other stripe rows match. A right-edge control appears once at the document edge; transformed local-fixed content is excluded from suppression.
- Entire PNG RGBA buffers reconstructed independently from verified saved frames plus recorded crop/patch metadata match the final PNG. Every frame/artifact SHA-256 is independently read by Node. Styles, priorities, source text and initial x/y scroll match after success, cancellation and size failure; an unrelated site color update survives.
- **2 context-highlight E2E PASS**, CFT and installed Chrome: real DOM right-click hit testing → same exported handler used by the native menu → real disk annotation with empty note and no modal → duplicate delivery without another annotation/interrupted receipt → optional note edit without changing the reference → point deletion → CSS highlight disappears → Undo restores it → no-hit delete refuses → multi-paragraph highlight saves correctly. Original source body text and archived HTML bytes/SHA-256 are unchanged. On-page feedback is hidden by the actual capture-hide protocol.
- Regression: existing full PNG/PDF tests **3/3 PASS** (CFT, installed Chrome, cancellation/size/geometry/real 125% zoom/viewport PDF). Inbox and two usability scenarios PASS; English UI and quote/entity/edit/reference scenarios PASS. This is **12 distinct browser scenarios** across targeted runs.
- Visual QA: [wide fixed/sticky capture](qa/0.4.1-fixed-wide.png), [large final-overlap capture](qa/0.4.1-fixed-short.png). One retained header/footer, no repeating stripes or empty stitch bands. These are local QA pages, not the user's authenticated Dzhino account.

### Findings and limits

- Initial context-test driver attempted dynamic import in a service worker, which Chrome forbids. Production uses static module imports; the driver was corrected to call the shared handler from the extension document. Native OS menu popup item selection itself remains manual; the real handler, point events, queue and disk behavior are tested.
- Normalization covers the first 20000 top-document elements, max 256 fixed roots and a bounded overlay area. Nested browsing contexts/closed shadow roots, newly appearing overlays and complex transformed/overflowing elements are not universally normalized. Pixel patches include an 8 CSS px margin for common edge effects; arbitrary large effects are not guaranteed. Edge selection for compact bottom/right controls follows viewport geometry.
- The user's authenticated site was not accessed. Existing PNGs/PDFs are immutable and must be recaptured to use v2. Permission dialogs and physical browser/process termination remain manual acceptance boundaries. The lease is implemented; automated tests exercise finally cleanup rather than waiting for the real lease timeout.

## 0.4.0 — English icon UI

### Architecture and API prototype

- [UI plan](UI-0.4-PLAN.md) recorded before implementation. One original SVG stroke icon module, no remote assets, libraries, new permissions or evidence-schema changes.
- Action controls use SVG plus English accessible names. A single viewport-clamped tooltip supports pointer hover and keyboard focus; it moves into the active dialog so Chrome's top layer does not hide it. Command-search results and record titles retain readable text.
- Header/status remain visible while main content scrolls. Capture and annotation tools share an equal four-column grid. Settings is a native modal dialog with five named groups, real preference persistence and visible inline error feedback.

### Implemented

- English static UI, runtime errors/progress, Chrome menus/command descriptions, entity-type options and citation labels. Source titles, original page text, user notes, archived files and old journal entries keep their original language. The README is now English.
- Icon actions throughout the panel, record details, dialogs and the source-page selection toolbar. Every tool has an English accessible name/description; native button keyboard behavior and existing shortcuts are preserved.
- Settings groups: Appearance, Capture, Annotations, Keyboard shortcuts, Storage. Apply/cancel works consistently for theme, pause, size limit and global annotation visibility. Site visibility remains an immediate action. Internal unassigned `_execute_action` is omitted.

### Tests and visual QA

- `npm run check`: ESLint, **15/15 unit tests**, build PASS. New language audit checks the shipped HTML/JS/manifest; existing integrity, anchoring, schema and citation tests pass with English labels.
- **13 distinct browser E2E scenarios PASS** across targeted runs (8 scenarios, then 7 with two overlapping). Coverage: English hover/focus and accessible names; grouped modal settings, invalid limits and pause; apply/cancel visibility against actual CSS Highlights; persisted preferences; unchanged Russian source/user content; real HTML disk readback and independent Node SHA-256; navigation and permission recovery; quote/entity/reference creation, edit/undo, command palette, clipboard, filters, tamper rejection, case sync, registered script restart, offline originals and interrupted recovery.
- Native installed Chrome **155.0.8059.85**: real SIDE_PANEL runtime target; **32 main-panel + 32 Settings layout combinations** at widths 320/360/420/520 and DPR 1/1.25/1.5/2, both themes. Matching capture/annotation x/width/height and absence of horizontal overflow inside both the main scroll area and dialog are asserted. Native PNG dimensions are checked against DPR.
- Full PNG/PDF regression: CFT 156 and installed Chrome 155 passed actual capture/conversion, frame/pixel/hash and restore assertions. Failure-boundary test passed cancellation, size limit, changing geometry, real 125% zoom with all 3000 test rows checked, and viewport PNG→PDF. Independent external Python PDF rendering was not repeated in this UI iteration.
- [Dark panel](qa/0.4-panel-dark-320.png), [light panel](qa/0.4-panel-light-320.png), [Settings](qa/0.4-settings-dark-320.png), [hover tooltip](qa/0.4-tooltip-320.png), [dialog tooltip](qa/0.4-settings-tooltip-320.png).

### Defects found and corrected

- Initial role-based test found duplicate “Create case” names. The launcher is now “New case”; confirmation remains “Create case”.
- Visual inspection found a status footer covering list controls, a raw internal Chrome command in Settings, and inconsistent global-visibility apply behavior. The scroll layout, shortcut list and preference flow were corrected and rechecked.
- Validation errors previously appeared only behind the modal in the application footer. Active dialogs now show the actual error inline with `role=alert`.

### Limits and remaining checks

- Native OS picker/permission bubbles and real Windows display-scaling changes remain manual. Browser DPR emulation and installed Chrome are covered; these tests do not certify all assistive technologies or all websites.
- Extension reload does not reliably replace UI already injected into open sites. Refresh existing source tabs after updating. Browser/OS dialogs use their own language; source content and historical evidence are deliberately not translated.
- Existing capture/FSA/OSINTchart boundaries remain as documented below. No OCR, video, trusted timestamp or native bridge is claimed.

## Итерация 0.3.2 — папка, навигация, удаление исключений

### Диагностика и архитектура

- Старый refreshSource читал журнал дела до обновления заголовка/URL; отсутствие доступа к папке прерывало обновление. Теперь метаданные отображаются первыми, диск читается отдельно только с разрешением. Debounce событий вкладок и ревизии исключают применение устаревших ответов.
- activeTab теряет доступ к URL после перехода на другой origin. Добавлен tabs для метаданных активной вкладки; он не даёт доступа к содержимому. [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs).
- File System Access handle сохраняется в IDB, но срок разрешения задаёт Chrome. requestPermission вызывается при явном сохранении или кнопкой доступа; после grant заново читается прежний Workspace/дело, probe проверяет запись и чтение. [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), [постоянные разрешения](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api).

### Реализовано

- Полностью удалены блокирующие доменные списки, кнопка обхода и соответствующие поля настроек. Legacy preferences мигрируют без изменения оригиналов/событий. Прямое указание пользователя заменяет соответствующее требование исходного ТЗ.
- Источник обновляется при смене вкладки, URL/title, SPA-навигации и закрытии вкладки, включая недоступную/невыбранную рабочую папку. Захват фиксирует вкладку до диалога доступа и отказывает при смене её URL до начала записи.
- При восстановлении разрешения через Save подключается исходное дело. При отказе нет фиктивного материала; кнопки повторного доступа/смены папки доступны. Пассивное открытие панели не читает workspace.json без разрешения.
- Визуальный QA обнаружил оставшийся текст «Инициализация…» в уже подключённом Side Panel. Исправлен финальный статус подключения, предупреждения о восстановленных операциях сохраняются.

### Фактическая проверка

- `npm run check`: ESLint/build PASS, **14/14 unit PASS**; в том числе Gmail/банковский hostname не блокируются даже при переданных старых правилах, миграция сохраняет остальные настройки.
- `navigation.e2e.mjs`: **3/3 PASS**. CFT 156 и установленный Chrome 155: без папки/activeTab URL/title следуют обычной навигации, SPA, cross-origin, серии быстрых изменений, переключению и закрытию вкладок. Третий сценарий: миграция, реальная папка/дело → перезагрузка с имитацией истечения права → Save с user activation → native requestPermission → восстановление того же case_id → HTML на диске. Затем отказ без нового материала → навигация при отказе → явное восстановление → второй HTML. Node SHA-256 совпадает с обоими Artifact.
- Регрессия: prototype, UI, workflow, два usability-сценария и inbox — **6 разных E2E PASS на итоговых прогонах**. Проверены дисковые файлы/повторное открытие, очередь и deduplication, 3 архива/PNG/image, офлайн-просмотр, ссылки, неизменность оригиналов, аннотации, команды, clipboard, фильтры, tamper rejection, синхронизация дела и interrupted recovery.
- Native Chrome: **1/1 PASS**, реальный runtime context SIDE_PANEL. Проверены смена origin и SPA непосредственно в DOM этого target, финальный статус подключения; **32 layout-комбинации** (темы light/dark, 320/360/420/520 px, DPR 1/1.25/1.5/2) без горизонтального overflow. Просмотрены реальные PNG, [тёмная панель](qa/0.3.2-side-panel.png), [светлая тема](qa/0.3.2-light-320-2.png), [сохранение после восстановления](qa/0.3.2-access-restored.png).
- При дальнейшей проверке выявлен FSA InvalidStateError на close. После исправления обработки: **200/200 последовательных новых файлов** с native readback/SHA-256 PASS (49.5 с); отдельный storage-boundaries E2E PASS: два смоделированных отказа close на пустом файле → третья реальная запись с совпавшим Node SHA-256; постоянный отказ ограничен тремя попытками; quota — одна попытка; ошибка после реального commit не вызывает повтор и сохраняет байты; повторный вызов для существующего файла запрещён; denied не создаёт файл. Все фактические записи в этих тестах делает native FSA, fault injection не подменяет сохранение.
- После изменения storage повторно прошли сценарий восстановления доступа/двух HTML (37.0 с), failure boundaries (32.9 с), inbox, prototype, storage-boundaries и workflow. Повреждённый журнал остаётся блокирующей ошибкой, размер/отмена/duplicates и привязка к делу проверены.

### Ограничения и остаток

- На первых прогонах inbox получил InvalidStateError с пустым case.json; позже сценарий доступа оставил пустой файл события. Сохранены локальные traces `output/playwright/inbox-initial-failure-0.3.2.zip` и `output/playwright/access-initial-failure-0.3.2.zip`. Отдельный stress воспроизвёл отказ **на close, файл 198 из 200**. Добавленная диагностика установила этап, но причина на уровне Chrome/Windows не установлена; сжатие NTFS тестового каталога наблюдалось, причинная связь не доказана. Обработка этого переходного отказа исправлена ограниченным повтором нового пустого файла, а не обходом SHA-256. После исчерпания повторов/физического crash пустые/повреждённые метаданные по-прежнему требуют отдельного восстановления; повторный выбор папки сам по себе их не чинит. Автоматическая починка старых повреждённых журналов не реализована.
- Отзыв/истечение права моделируются на границе queryPermission/requestPermission. В grant-ветке вызывается настоящий requestPermission, все чтения/записи выполняет native FSA. Нативный permission bubble и его вариант постоянного доступа в пользовательском профиле не автоматизированы. Расширение не обещает отсутствие будущих запросов Chrome.
- Доступ к содержимому нового origin по-прежнему требует activeTab/host permission. Сами письма Gmail и личная папка пользователя в QA не открывались. Полный PNG/PDF в этой итерации не менялись и заново не проходили независимую попиксельную PDF-проверку; результаты 0.3.0 ниже остаются привязаны к той версии.

## Итерация 0.3.1 — исключение Gmail и исправление UX

- Причина: стартовые preferences содержали mail.google.com. Это настройка TraceVault, основанная на требовании ТЗ о чувствительных доменах (раздел 18); не ограничение captureVisibleTab или Gmail. Пользовательский профиль и почта не читались.
- Реализованы точное разрешение текущего hostname одной кнопкой, сохранение/отмена в настройках, понятное правило блокировки до действия и в сообщении ошибки. Разрешённый hostname имеет приоритет над блокирующим родительским доменом; разрешение не распространяется на соседние/вложенные поддомены. Chrome site permissions, paused и incognito проверяются отдельно как прежде.
- `npm run check`: ESLint/build PASS, **14/14 unit PASS**. В том числе mail.google.com разрешается явно, accounts.google.com/sub.mail.google.com и банк остаются закрыты, pause/incognito не обходятся, URL/IDNA нормализуются.
- Новый реальный браузерный E2E **1/1 PASS** (18.7 с): исключённый loopback-сайт → отказ без фиктивного материала → кнопка разрешения → HTML на диске с совпавшим SHA-256 → reload сохраняет разрешение → удаление разрешения снова блокирует PNG. Второе правило bank.test сохранено. Gmail с авторизованной перепиской этим тестом не открывался; проверен общий механизм фильтра и отдельно Gmail hostname unit-тестом.
- Интерфейс проверен на 360 px; [снимок блокировки](qa/0.3.1-exclusion.png). Новых permissions/зависимостей/миграции материалов нет. Ограничения архивирования Gmail как динамического приложения остаются общими ограничениями движка, успешный архив конкретного письма не заявляется проверенным.

## Итерация 0.3.0 — полный PNG, PDF и плоский логотип

### Архитектура и прототип API

- План записан и отправлен отдельным коммитом e7c3585 до реализации: [решения и границы](RENDERING-PLAN.md). Без debugger, Native Messaging и новых runtime-библиотек/permissions. SVG/PNG — авторский знак T/V, не заимствованный логотип.
- Реальный прототип выявил расхождение между эмулированным viewport и физическим captureVisibleTab. Первый собранный PNG имел неверные пропорции; код исправлен: проверка viewport/DPR с отказом вместо неравномерного масштабирования, тест использует настоящее окно.
- При zoom 125% вычисление через округлённый innerHeight давало высоту 2997 вместо 3000; исправлено координатами по DPR. Независимая построчная проверка затем обнаружила однопиксельные белые швы; добавлено перекрытие 2 CSS px. Это проверено всеми 3000 строками, а не только заголовком/серединой/низом.
- Blob PDF реально открывался пустым даже с object-src self. Не добавлялись запрещённые MV3 CSP значения; возвращён object-src none. В результате вместо неработающего открытия доступны запись/экспорт/копирование пути PDF. Источник: [MV3 CSP ограничения](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security), [Chromium PDF/CSP issue](https://issuetracker.google.com/issues/40213536).

### Реализовано

- Двумерный полный PNG, исходные кадры как отдельные readback-verified Artifact, координаты/порядок/время/хеши, восстановление scroll/оверлея в finally, прогресс и отмена. Смена URL/вкладки/геометрии/масштаба и лимит дают честный отказ с уже записанными материалами.
- «Страница в PDF» сохраняет кадры + полный PNG + производный многостраничный A4 PDF. «Создать PDF» работает для ранее сохранённого PNG, включая viewport. Оригиналы не перезаписываются; повтор проверяет источник и PDF перед использованием прежнего результата.
- PDF с lossless Flate RGB, ID/UTC/URL/SHA-256 в метаданных, source_artifact_id/source_sha256/page_count/searchable_text=false в derivation. Нет HTML reflow/OCR. Новые Artifact.kind перечислены в схемах; старые записи не мигрируются, старым строгим импортёрам требуется актуальная схема.
- Знак T/V с плоской фиолетовой рамкой/срезанным углом: SVG + PNG 16/32/48/128, внедрён в заголовок, action и manifest. Скрипт воспроизводит значки без внешних шрифтов/картинок.

### Фактические проверки

- Финальный `npm run check`: ESLint PASS, **13/13 unit PASS**, build 0.3.0 PASS.
- Целевой регрессионный прогон: **5/5 PASS** — установленный Chrome/native панель/32 layouts, существующий UI, workflow HTML/PNG/ссылки/offline/restart, новый PNG/PDF, границы захвата. После исправления швов новые CFT/installed full-page сценарии повторены: **2/2 PASS** (18.3/23.0 с).
- Последний boundary-сценарий сначала не стартовал из-за реального low-disk: на C: осталось около 37 МБ, FSA probe вернул QuotaExceededError. Ложного успеха/записи в Downloads не было. Массовая и точечная очистка тестовых профилей были отклонены автоматической политикой. Вместо удаления выполнено обратимое NTFS-сжатие только workspace/output: 1 112 594 846 логических байтов размещены в 78 264 345 физических байтах, свободно стало около 1 ГБ. Содержимое первичных файлов не менялось; хеши затем перепроверены. Реальный disk-full во время close не заявляется проверенным.
- После освобождения места boundary-сценарий **1/1 PASS** (18.9 с): отмена после кадра, лимит, изменение геометрии, возвращение scroll, native zoom 125% и все 3000 строк без щелей, конвертация viewport PNG. Отменённый capture сохранил кадр с корректным SHA-256.
- Независимый `python scripts/verify_pdf.py --render`: **PASS** — 2 страницы, SHA-256 PDF/PNG, источник/UTC, footer ID, все распакованные RGB-байты PDF равны PNG, 3000 zoom-строк совпали. Первая/последняя страницы просмотрены. [Доказательные QA-артефакты](qa/0.3.0/README.md).
- Адаптер OSINTchart: **5/5 PASS** против реального CaseService, включая сохранение full PNG/raw frame/derived PDF и derivation в реестре. Python QA-библиотеки не поставляются в ZIP; [лицензионные границы](LICENSES.md).

### Оставшиеся границы

- Растровый PDF открывается пользователем из выбранной папки; встроенный PDF viewer не реализован. Пагинация режет пиксели без анализа строк текста.
- Полный PNG — последовательный, не атомарный; fixed/sticky могут повторяться, скрытый/lazy/виртуальный контент и вложенные scroll-контейнеры не обещаются. Операция помечается partial с диагностикой. Пределы: 24 млн пикселей, сторона 30000, 64 кадра, общий лимит байтов всех материалов.
- Системный picker/permission dialogs, физический Windows scaling и interrupted close остаются ручной приёмкой. OCR/diff/video/native bridge/независимые timestamps/шифрование в этой итерации не добавлялись.

## Итерация 0.2.0 — баги, удобство и клавиатура, 22.10.2026

### Архитектура и API

- Активное дело явно синхронизируется через activeContext; refresh не публикует старое дело. Команды содержат workspaceId, очередь изолирована Web Lock по workspace. Редактор/архивирование сохраняют исходный caseId, sourceTab привязан к окну браузера. Полной независимости одновременно открытых разных workspace пока нет: контекст и кеш подсветки общие для профиля.
- Перед просмотром/экспортом читаются реальные байты, проверяются размер/SHA-256, отображается immutable Blob. Изменённый оригинал не экспортируется и не показывается как подтверждённый.
- Документация Commands API проверена: максимум 4 suggested keys, Ctrl+Alt исключён из-за AltGr. В новом профиле chrome.commands.getAll подтвердил Ctrl+Shift+1/2/3/4. Существующие назначения Chrome могут сохраниться после обновления; реальные назначения выводятся в настройках. Проверены [Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands) и [клавиши Chrome](https://support.google.com/chrome/answer/157179).
- Runtime-зависимостей не добавлено, SingleFile по-прежнему не включён; schema v1 сохранена.

### Реализовано и проверено

- Палитра команд с поиском, стрелками, Enter/Escape; Ctrl+Shift+Space. Ctrl+Enter действительно сохраняет аннотацию на диск, / переводит фокус в поиск вне редактора.
- Текущий полный URL, сброс фильтров, hostname/поддомены вместо поиска подстроки; источники Entity разрешаются через refs. Unit-проверки IDNA и доменов-обманок прошли.
- Настоящий clipboard содержит источник, точное UTC, ID и SHA-256. Viewer закрывается Escape с освобождением содержимого. Удаление/возврат аннотации создаёт события; оригинал не меняется.
- Два документа одной workspace синхронизируют создание/выбор дела; старый refresh не переключает его обратно.
- Найден и исправлен дефект whole-paragraph Range: границы на элементах теперь переводятся в отфильтрованные UTF-16 позиции. Реальный браузерный тест сравнивает полную цитату абзаца.
- Контент-скрипт не строит текстовый индекс при отсутствии аннотаций; повтор failed/cancelled capture корректно показывает состояние без обращения к отсутствующему Artifact; лимит исключает NaN/Infinity.

### Фактические результаты и исправления QA

- Финальный `npm run check`: ESLint PASS, **12/12 unit PASS**, чистая сборка 0.2.0 PASS.
- Первый полный браузерный прогон: **9 PASS / 3 FAIL**. Public sites и workflow превысили общий лимит времени; usability завершился ошибкой Playwright trace streaming `file data stream has unexpected number of bytes` при закрытии контекста после намеренного изменения файла. Эти ошибки не скрыты.
- Повтор public/workflow/usability: public sites PASS (23.8 с), workflow PASS (47.8 с), синхронизация PASS. Usability выявил слишком короткое ожидание закрытия редактора: запись ещё выполнялась, кнопка была disabled. Время ожидания подтверждённой дисковой операции увеличено с 5 до 25 секунд. Для сценария намеренной подмены файла отключён только Playwright trace; реальные FSA записи, проверки, clipboard и скриншоты сохранены.
- Финальный usability: **2/2 PASS**, 38.1 и 28.9 с, включая новую проверку границ абзаца, клавиатурное сохранение, восстановление и отказ просмотра/экспорта повреждённого HTML. Всего **все 12 уникальных браузерных сценариев прошли в этой итерации с повторными запусками**; один полностью зелёный общий прогон после всех исправлений не заявляется.
- OSINTchart: **4/4 PASS** против реального reference CaseService. Существующая интеграция не расширялась.
- Установленный Chrome 155.0.8059.85: настоящий SIDE_PANEL и **32/32** сочетания темы/ширины/DPR PASS, отсутствие horizontal overflow и размеры PNG. Светлая 320/DPR2, тёмная 360 и палитра просмотрены визуально. [Снимки и границы проверки](qa/0.2.0/README.md).
- Нативный ввод через Windows подтвердил Ctrl+Shift+3 → SIDE_PANEL, Ctrl+Shift+1 → HTML и Ctrl+Shift+2 → PNG; обе записи перечитаны и SHA-256 совпали. Ctrl+Shift+4 после исправления Range нативно НЕ подтверждён: computer-use остановлен инструментом из-за невозможности уверенно определить URL. Браузерная кнопка выделения и фактическое назначение этой команды проверены. Повторная нативная проверка остаётся задачей.

### Осталось и ограничения

- Обновить расширение в пользовательском Chrome и при необходимости изменить сохранённые назначения в chrome://extensions/shortcuts. Универсальное отсутствие конфликтов с чужими программами не гарантируется.
- Ручные FSA permission dialogs/системный picker, физический disk-full, прерывание во время close и реальный Windows scaling остаются границами автоматической приёмки, как в 0.1.0.
- Undo последней аннотации хранится в текущем документе до его закрытия; сама аннотация и события сохраняются на диске.
- P1/P2 (OCR, full-page screenshot, diff, native bridge, независимые timestamps, шифрование) в этой итерации не реализовывались.

## Итерация 0 — архитектура

- Спецификация прочитана полностью (680 строк), сохранена без изменения.
- Репозиторий назначения пуст; clone выполнен через git http.sslBackend=schannel. Обычный TLS backend в этой среде возвращал TLS connect error.
- OSINTchart клонирован отдельно, контракт изучен; native importer не существует в TraceVault.
- API подтверждены документацией, браузерный прототип ещё не выполнялся.
- MVP, визуальный QA и P1/P2 пока НЕ завершены.

Следующая итерация: исполнимый прототип FSA/архиватора, затем P0 и реальные браузерные тесты.

## Итерация 1 — исполнимый каркас и FSA-прототип

- `npm run check`: ESLint, 8 unit tests, сборка — PASS.
- `playwright test tests/prototype.e2e.mjs`: PASS, Chrome for Testing 156 на Windows. Реальный FileSystemDirectoryHandle указывает в output/playwright/prototype-workspace-<run>; запись workspace/case/events проверена Node чтением с диска, handle восстановлен из IndexedDB после reload.
- Автотест выбирает настоящий каталог через CDP drag-and-drop и передаёт его picker callback. Запись не подменена, OPFS не используется. В изолированном QA-профиле file_system_write_guard/read_guard=allow; интерактивные permission bubbles автоматом не тестируются. У пользовательского профиля настройки не менялись.
- Две первоначальные попытки unattended picker (headless, тестовые флаги) зависали в ожидании UI и завершились FAIL. Windows helper не смог выбрать Chrome for Testing из-за ошибки `window ... no longer belongs to Chrome; current owner is Chrome`; дальнейшие действия им прекращены.
- В видимом тестовом браузере пользователь подключил папку ProofTest и создал дело `1 · test`; приложение показало подтверждённый readwrite access. Эту папку тесты не изменяют.
- Три offline HTML, end-to-end захват через chrome.scripting, PNG, перезапуск процесса и визуальная матрица ещё не проверены. Каркас P0 не объявляется MVP.
- По уточнению пользователя основной режим — правая Chrome Side Panel; полная вкладка вторична. Визуальное направление — Obsidian, нейтральные поверхности/фиолетовый акцент.

## Итерация 2 — P0 и исправления по реальному браузеру

Проверки 22.10.2026, Chrome for Testing 156, Windows:

- `npm run check`: ESLint, 9 unit tests, build — PASS.
- Workflow E2E — PASS: три fixture-страницы → 3 отдельных HTML, CSS import/background/SVG/картинки встроены; 2 complete, 1 partial с диагностикой missing image и video. PNG signature/pixel dimensions, исходный SVG, SHA-256 всех записанных файлов проверены Node чтением с диска.
- Offline HTML открыт через file:// при context offline: текст/ресурсы доступны, HTTP(S) запросов 0, script не исполняется. Изолированный iframe viewer проверен UI-тестом.
- UI E2E — PASS: реальные кнопки capture, viewer, Entity, archive-first, экспорт, свободная заметка, редактирование. Исчезнувшая цитата → orphaned; оригинал не изменён.
- Реальный restart процесса браузера, IndexedDB handle и дело восстановлены; durable writing operation → interrupted. Предыдущий FAIL выявил дефект самого QA: перезапись всего Preferences ломала данные восстановления браузера; harness теперь сохраняет существующие настройки. В продукт добавлено понятное сообщение InvalidStateError.
- Failure E2E (2 tests) — PASS: лимит размера, AbortSignal, запрет записи (инъекция denied на границе адаптера), повтор ID без второго файла, новая версия, переключение активного дела в ходе захвата, повреждённый JSON журнала, single_case и отказ от второго дела.
- Public sites E2E — PASS: example.com, example.org, example.net, три самостоятельных complete HTML в настоящей рабочей папке. Личные данные не использовались.
- JSON Schema v1: Capture, Annotation, EntityDraft, EvidenceReference, OSINTchartExport; реальный экспорт workflow валидирован AJV.
- OSINTchart adapter: 4 Python tests PASS против настоящего CaseService/schema 2 commit 1e90238, без моков моделей. Три Entity, один Capture, пять строковых evidence_refs; повторный импорт → skip без дублей; подтверждение/устаревший preview/конфликты проверены. Это in-process адаптер, не UI-плагин/Native Messaging и не запуск OSINTchart GUI.
- Найден реальный дефект: setPanelBehavior(openPanelOnActionClick:true) не давал activeTab в тесте. Исправлено открытием Side Panel через chrome.action.onClicked; захват после реального Extensions.triggerAction проходит.
- Две темы, реальные browser PNG на ширинах 320/360/420/520; горизонтального overflow нет. Полная матрица DPR и native Chrome Side Panel ещё проверяется.

Ограничения: unattended OS directory picker и реальный отзыв permission через UI не автоматизированы; нехватка физического места не воспроизводилась. CSS parser — ограниченный best effort; cross-origin ресурсы требуют доступа и могут дать partial. Полный screenshot/OCR/video/native companion не реализованы. P0 не объявляется полностью принятым до завершения оставшейся матрицы.

## Итерация 3 — native Chrome, восстановление, визуальный QA

- Установленный Google Chrome 155.0.8059.85, не только CFT: загрузка unpacked через CDP, реальные capture API и FSA — PASS. Первая попытка в harness блокировалась стандартным Playwright --disable-extensions; исправлен запуск только изолированного QA-профиля.
- Chrome runtime.getContexts подтвердил один контекст SIDE_PANEL. Его отдельный DevTools target прочитан напрямую, проверены текущая папка и UI, снят настоящий PNG. В API Playwright этот context не выдавался обычным page объектом; использована CDP target session, а не нарисованный макет.
- Native Chrome: светлая/тёмная темы × 320/360/420/520 × DPR 1/1.25/1.5/2 = 32 снимка и проверки horizontal overflow. PASS эмуляции DPR; настройки масштаба Windows пользователя не менялись.
- Persistent annotation registration — PASS после navigation/restart настоящего процесса. Тестовая копия исходников имеет дополнительный required host только http://127.0.0.1/*; проверяется состояние после выдачи доступа, не интерактивное согласие пользователя. Ambiguous anchor не подсвечивается.
- Найден дефект синхронизации: второй открытый документ мог использовать старый memory state и снять свежие выделения при обновлении сайта. UI теперь перечитывает диск под writer lock перед восстановлением. Это также исключает transient parsing незакрытого события.
- Найден дефект при превышении лимита DOM: Chrome возвращал null после исключения injected function. Исправлен явный `{error}` результат и сообщение лимита; failure E2E после исправления PASS.
- Плотность UI исправлена по реальным снимкам: фильтры свёрнуты, пояснения сокращены, свободная заметка в Аннотациях, настройка скрытия на домене в Настройках. Порядок действий и сохранение исходников не менялись.
- Один промежуточный общий прогон: 6 PASS/2 FAIL; один FAIL — исправленный лимит, второй — конфликт файлов trace из-за ошибочно запущенных параллельно двух harness-процессов. Финальная регрессия выполняется одним процессом.

## Финальная регрессия и поставка 0.1.0

- `npm run check`: ESLint PASS, 9/9 Node unit PASS, clean dist build PASS.
- Единый последовательный Playwright прогон: 9/9 PASS за 3.8 минуты (failures ×2, native Chrome, prototype, public sites, reattachment, scale, UI, workflow).
- Дополнительный persistent inbox E2E: PASS; после уточнения обработки повторной доставки и privacy guard — targeted inbox + UI 2/2 PASS. Итого 10 уникальных browser E2E сценариев проверены; последний полный прогон из 10 одним запуском ещё не выполнялся, дополнительные изменения проверены целевыми тестами.
- OSINTchart CaseService adapter: 4/4 Python PASS (реальные модели/сервисы reference checkout, без GUI).
- Нагрузка: 2000 искусственных failed-capture metadata events прочитаны с реального диска за 2050 мс, таймер UI выполнился 403 раза; 25 строк на странице, Unicode search возвращает нужный материал. Это не 2000 реальных фиксаций.
- Offline same-origin iframe проверен отдельно внутри сохранённого HTML; HTTP(S) обращений нет. Проверка сохранённых материалов/PNG, изменения заметок, предыдущих версий и corrupt-file digest PASS.
- Новый UI race исправлен: редактор закрывается после завершения записи/обновления, повторная отправка заблокирована на время операции. Старое сообщение больше не затирает результат следующего экспорта.
- Privacy: content script отказывается использовать старое выделение при фокусе в input/textarea/contenteditable; UI password-field guard и отсутствие введённого QA-секрета в chrome.storage проверены. Очередь новых context-menu команд хранит selectionDigest, не сырой выделенный текст. Стартовый sensitive-domain blacklist редактируемый, не исчерпывающий.
- Исправлен harness визуальной матрицы: raw CDP viewport и Playwright screenshot конфликтовали, снимки могли обрезать desktop layout. Теперь viewport согласован, съёмка через Page.captureScreenshot, физическая ширина PNG проверена по IHDR. Финальные 32 PNG просмотрены/сохранены в docs/qa; базовые светлый/тёмный снимки визуально осмотрены.
- `samples/public` — реальная перенесённая рабочая папка трёх публичных capture, не демонстрационные выдуманные SHA. Пользовательская ProofTest не включена.
- Runtime ZIP не содержит SingleFile/сторонних runtime библиотек. Dev license inventory из package-lock: 86 пакетов; при установке npm audit сообщил 0 уязвимостей. GitHub Actions добавлен, его удалённый результат пока не подтверждён.
- Упаковка: 16 файлов ZIP побайтно совпали с extension source, повторная упаковка дала тот же SHA-256 `2010b977e9349cf978fb290457b0fcaa4dcc0ae81b113139c4451c7df2b12cd4`. Три артефакта в перенесённом samples/public отдельно перечитаны и сверены с исходными SHA/byte_length.

Оставшиеся границы: нативные picker/permission UI, физический disk-full и crash посреди FSA close, реальные системные масштабы Windows. Авторизованные/сложные сайты требуют эксплуатационной приёмки. См. P0-STATUS.md и CAPTURE-ENGINE.md. Это кандидат MVP P0; P1/P2 не объявлены выполненными.

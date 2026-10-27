# TraceVault: архитектура v1

Решение принято до реализации 22.10.2026. Полный входной документ: SPECIFICATION_RU.md.

## Инициализация рабочей папки, 0.4.6

Сохранённый root handle и подключённый workspace — разные состояния. Наличие handle без проверенных метаданных не разрешает создание дела. Панель отдельно отслеживает initialization/connection/case-save, блокирует повторную отправку формы и показывает Folder → Case → Capture. Название и код, а также root/workspace фиксируются до асинхронной записи. Репозиторий проверяет допустимый mode до любых файловых операций.

Подключение проверяет метаданные, список дел и восстановление журнала под дисковой блокировкой; только после этого сохраняет новый root handle и публикует контекст. Неудачный выбор новой папки сохраняет прежний рабочий контекст. После потери разрешения сначала восстанавливается доступ и загружается workspace; лишь затем доступны дела. Формат первичных данных и append-only журнал не меняются.

## Границы компонентов

- `background.js`: MV3 worker; контекстное меню, команды, открытие панели, персистентный почтовый ящик команд. Не владеет файлами/долгими операциями.
- `panel.html`/`panel.js`: одинаковое приложение в Side Panel и отдельной вкладке. Выбор каталога только по жесту. Закрытие страницы прерывает операцию; журнал позволяет обнаружить это.
- `content.js`: изолированный мир, селекторы текста, CSS Custom Highlight, компактный Shadow DOM toolbar. Текстовые узлы оригинала не изменяются.
- `capture.js`: независимый best-effort архиватор, сериализует текущий DOM; встраивает ресурсы, удаляет активное содержимое, добавляет запрещающую сетевые обращения CSP. Недоступные ресурсы перечисляет.
- `storage.js`: FSA + IndexedDB handle, чтение после записи, SHA-256; Web Locks для единственного writer между вкладкой и панелью.
- `repository.js`: неизменяемые файлы событий, восстановление состояния свёрткой. Первичный источник — диск. Индексы вычисляемые.
- `domain.js`: часы, нормализация, якоря, экспорт. Никаких запросов к сервису продукта.

## Дисковый контракт

`workspace.json`: schema_version, workspace_id. `cases/<UUID>/case.json`: case_id, code, title, created_at. `cases/<UUID>/events/<UUID>.json`: версии записей и аудит; каждый файл пишется один раз. `captures/<capture_id>.html`, `screenshots/<capture_id>.png`, `attachments/<capture_id>.<ext>`, `exports/<UUID>.json` внутри дела. Все пути относительные; сегменты проверяются. Нет папки ресурсов рядом с HTML.

Журнал неизменяем на уровне приложения, не криптографически защищён. Отдельный файл события уменьшает область повреждения при сбое. Файл закрывается и перечитывается перед публикацией события завершения. Некорректный JSON события не игнорируется: диагностика и запрет дальнейших изменений до устранения. Незавершённый capture помечается interrupted при получении writer lock после повторного открытия. Файлы, записанные до сбоя, остаются для ручной проверки; автоматического объявления completed нет. Новые версии имеют новые UUID, ссылки старых Entity не перепривязываются.

Для индекса используются батчи чтения по 32 и восстанавливаемый memory cache распарсенных событий, сверяемый с size/mtime файлов. Это ускорение, не защита от подмены локальным злоумышленником. Пропуск/дубликат sequence блокирует replay. UI читает под тем же Web Lock, чтобы не принять создаваемый файл события за повреждённый. Все внешние ссылки/quotes выводятся textContent, не HTML.

## Обмен сообщениями

Worker → chrome.storage.local inbox: `{id, action, tabId, caseId, workspaceId, sourceUrl, selectionDigest?, imageUrl?, created_at}`. Исходный выделенный текст в очередь не записывается. UI забирает команды под Web Lock своей workspace, удаляет после регистрации на диске; идентификатор capture совпадает с id команды. Повторная доставка существующего ID безопасна. Пользовательская повторная фиксация создаёт новый ID. Чужая workspace не потребляет новую команду.

В 0.2 активный контекст явно публикуется при выборе/создании дела: `{workspaceId,caseId,owner,revision}`. Другие документы той же workspace обновляют выбор без повторной публикации; обычное обновление списка не переключает глобальное дело обратно. Редактор хранит исходный caseId. Текущая вкладка определяется внутри окна документа, fallback sourceTab также хранится по windowId. Это синхронизация одной workspace, а не независимые параллельные сессии разных workspace: activeContext и кеш подсветки пока общие для профиля.

UI → content: `TV_SELECTION`, `TV_RENDER` (только аннотации текущего URL/дела), `TV_HIDE`, `TV_SCROLL`. Content → worker: `TV_ACTION`; sender.tab определяет источник. Content scripts не получают FileSystemHandle. Дополнительный доступ к домену запрашивается явно и позволяет восстановление после навигации/перезапуска. Скрытие аннотаций распространяется на открытые вкладки.

Операция фиксирует case_id и tabId до первого await захвата. Перед/после получения DOM/скриншота проверяются URL и активная вкладка; изменение приводит к ошибке. Запись файлов сериализована; длительная операция держится в документе, а не в worker.

## Безопасность

В 0.2 просмотр и экспорт оригинала каждый раз читают файл целиком, сверяют размер и SHA-256 с Artifact и используют неизменяемый Blob этих проверенных байтов. Это защищает от случайной подмены файла после захвата; переписывание самого журнала локальным злоумышленником не исключено. Большой файл потребует памяти на чтение и snapshot; лимит захвата по умолчанию остаётся 64 МБ.

Только http(s); incognito отклоняется. activeTab, tabs, scripting, storage, contextMenus, sidePanel; с 0.4.4 обязательное host permission `<all_urls>` вместо optional permissions по домену. Это также обеспечивает captureVisibleTab без повторной активации значка на каждом сайте. Static content script запускается только на HTTP/HTTPS в верхнем документе и восстанавливает аннотации из локального кеша; при обновлении удаляется прежняя динамическая регистрация tracevault-annotations. Не-HTML документы пропускаются. Пользовательские ограничения Chrome соблюдаются, восстановление доступа открывает настоящие настройки расширения. Доступ к директории запрашивается отдельно. Без debugger, downloads, nativeMessaging, telemetry. Архивы удаляют скрипты, обработчики, формы submit, refresh, embed/object; CSP default-src none, inline styles/data images/fonts, sandbox. Просмотр в iframe sandbox без allow-scripts/allow-same-origin. Пароли и значения редактируемых полей не фиксируются. Авторизованные страницы всё равно могут содержать чувствительный видимый текст.

В 0.3.2 refreshSource сначала отображает метаданные активной вкладки и лишь затем пробует загрузить материалы дела при read permission. Счётчик ревизий предотвращает перезапись последнего источника завершившимся старым запросом. tabs.onUpdated/onActivated/onRemoved и focus вызывают обновление с debounce 80 мс. Запись фиксирует источник до возможного запроса доступа к папке и проверяет неизменность URL после него. canWrite вызывает requestPermission только при user activation, reconnect читает исходный Workspace/дело и проверяет запись через probe. При фоновом запуске без активации требуется явная кнопка. Срок прав задаёт Chrome.

Исключения доменов удалены по прямому запросу пользователя, который заменяет соответствующее требование исходного ТЗ. Мигрируются только preferences: blockedDomains/allowedCaptureHosts удаляются без изменения материалов и журналов. Доменный поиск по коллекции не ограничивает захват.

QA 0.3.2 воспроизвёл InvalidStateError на close() настоящего FSA writer (1 из 200 файлов): новый destination оставался пустым. writeNew допускает до двух повторов только при InvalidStateError, если destination всё ещё та же пустая запись, созданная данным вызовом. Непустые/существовавшие до вызова файлы, permission/quota errors не повторяются. Каждый успешный результат требует штатного close и совпадения полного readback SHA-256/размера; временная ошибка не считается успехом. При исчерпании попыток поток abort, ошибка сохраняется, пустой файл не маскируется. Журнал с повреждением по-прежнему блокирует новые изменения. Физический сбой/закрытие процесса и длительные отказы диска требуют отдельного восстановления, не автоматической перезаписи доказательств.

## Очерёдность и критерии

0. Исследование/API: реальная запись/перечитывание FSA, сохранение handle, три HTML fixture, лицензии. Результаты отдельно от предположений документации.
1. P0: папка, дела, архивы/PNG, метаданные/хеш, аннотации/Entity, поиск/экспорт, восстановление. Все AC из ТЗ отражаются в TEST-REPORT.md.
2. Тесты реального Chromium, офлайн/файлы, ошибки, визуальные снимки обоих цветов и размеров. Исправления до дополнительных функций.
3. P1/P2 после закрытия P0. Native bridge/OSINTchart importer — отдельный этап с реальными моделями и preview.

## Источники проверки

Chrome: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access/ ; https://developer.chrome.com/docs/extensions/reference/api/sidePanel ; https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle ; https://developer.chrome.com/docs/extensions/reference/api/tabs . Документация не заменяет браузерный тест.

## 0.4.0 interface

The interface is English; archived/user content is not translated. `icons.js` owns original SVG paths, accessible action names and a shared hover/focus tooltip. It never renders source HTML. Tooltips are clamped to the viewport and attached inside an active native dialog to participate in Chrome's top layer. `i18n.js` maps stable status/entity keys to display labels; domain values, messages and evidence schemas retain their existing contracts.

The panel uses a fixed application header/status and one scrolling main region. Capture and annotation rows share the same four-column geometry. `#settings` is a modal dialog; unapplied theme/pause/limit/global annotation visibility controls reset when reopened, while the theme preview is restored on close. Apply persists preferences and broadcasts actual annotation visibility. Per-site visibility and command-palette visibility are explicit immediate actions. Errors are rendered in the active dialog as well as application status. Existing IDs, keyboard commands, filesystem and inter-component message types are preserved.

## 0.4.1 capture and annotation actions

Full capture uses a document-scoped presentation lease. Sticky elements retain a positioned containing block but use natural-flow offsets; viewport-fixed roots are visible at one selected edge tile. Fixed descendants whose containing blocks scroll are excluded. Per-frame `stitch_rect` and `presentation` plus `screenshot_adjustments.fixed_overlays` allow pixel reconstruction from stored SHA-verified screenshots. Retained patches are composited after overlapping tiles. Styles are restored property-by-property only when still carrying our temporary values; a renewable 30-second lease is a secondary cleanup guard. Method v2 and the normalization warning disclose the transformed capture presentation. Originals from earlier releases remain immutable.

Context menu actions are routed through `context-actions.js`, shared by the background listener and E2E driver. Highlight writes an empty optional note immediately; delete/edit pin the right-click CSS Highlight ID, case and source URL. Delete is a journal update followed by a real visibility broadcast and reversible Undo. `command_completed` supplements durable receipts for automatic actions. Content stores native rendered selection text separately from the exact UTF-16 anchor for stale-selection digests across paragraph boundaries. Transient feedback uses the existing capture-hide protocol and does not become source evidence.

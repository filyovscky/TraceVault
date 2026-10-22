# Changelog

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

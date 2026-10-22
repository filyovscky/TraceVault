# Фактические проверки

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

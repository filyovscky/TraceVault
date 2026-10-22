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

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

# Матрица приёмки 0.1.0

PASS означает проверенный сценарий в границах описанного теста. Ручные/непроверенные границы остаются явными; все возможные сайты не сертифицированы.

| Критерий | Фактическое покрытие | Статус |
|---|---|---|
| AC-01: выбранная папка, три HTML | Реальная FSA запись, Node readback, три fixture и три public origins; Downloads API не используется | PASS автоматизированного дискового сценария; OS picker вручную |
| AC-02: отозванный доступ | query/requestPermission, no fallback; denied fault injection не создаёт файл | Автотест адаптера PASS; реальный отзыв через UI вручную |
| AC-03: offline HTML | file:// offline, SVG/CSS/background, раскрытый DOM, отсутствие HTTP загрузок/scripts | PASS fixture; сложные сайты best effort |
| AC-04: точное время | UTC/zone/ms и отдельные started/finished/write поля в реальном Capture | PASS |
| AC-05: выделение, toggle, restart | CSS Highlights, тексты не меняются, registered script с выданным доменным доступом, restart процесса | PASS; разрешение в QA выдано тестовым manifest, prompt вручную |
| AC-06: изменённый источник | orphaned и ambiguous в UI/content script, ложной подсветки нет | PASS |
| AC-07: Entity → архив | UI archive-first, точная цитата, immutable IDs/путь/SHA, версия остаётся прежней | PASS |
| AC-08: обмен OSINTchart | JSON Schema; реальный CaseService adapter, 3 Entity/1 Capture/5 refs, повтор skip | PASS сервиса; установка в OSINTchart GUI/bridge не сделана |
| AC-09: оригиналы неизменны | реальные HTML/PNG до/после note/color edit имеют одинаковые digest | PASS |
| AC-10: прерывание | durable writing event, restart, interrupted; corrupted JSON и missing sequence блокируют запись | PASS журнала; физический crash в середине FSA close вручную |
| AC-11: темы, размеры, HiDPI | native Chrome 155 и CFT 156, 320/360/420/520, DPR 1/1.25/1.5/2 | Browser emulation PASS; реальная смена масштаба Windows вручную |
| AC-12: версии/ресурсы | отдельные UUID/файлы, previous_capture_id, лимит/отмена/partial, повтор idempotency key | PASS; экстремальные объёмы вручную |

## По этапам

Архитектура и модель хранения зафиксированы до реализации. API прототип, основная реализация P0 и browser regression представлены в TEST-REPORT.md. Визуальные PNG — docs/qa. Оставшиеся проверки выше не скрываются статусом «всё готово».

P0 реализован для проверенных сценариев. Статус релиза: кандидат MVP, ручная эксплуатационная приёмка перечисленных границ не завершена. Расширенная диагностика, необходимая для честного partial, реализована в минимальном объёме. Остальные P1/P2 не начинались: full-page screenshot/OCR/diff/bridge/video/RFC3161/encryption/collaboration отсутствуют. Дополнительные функции не должны маскировать оставшуюся приёмку P0.

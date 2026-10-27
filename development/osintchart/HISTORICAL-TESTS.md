# Historical prototype test results

Moved from the release test report. These are past service-level tests, not tests of a released integration. They were not rerun as part of this reorganization. See [contract notes](COMPATIBILITY.md).

## Итерация 0.3.0 — полный PNG, PDF и плоский логотип

- Адаптер OSINTchart: **5/5 PASS** против реального CaseService, включая сохранение full PNG/raw frame/derived PDF и derivation в реестре. Python QA-библиотеки не поставляются в ZIP; [лицензионные границы](../../docs/LICENSES.md).

## Итерация 0.2.0 — баги, удобство и клавиатура, 22.10.2026

- OSINTchart: **4/4 PASS** против реального reference CaseService. Существующая интеграция не расширялась.

## Итерация 0 — архитектура

- OSINTchart клонирован отдельно, контракт изучен; native importer не существует в TraceVault.

## Итерация 2 — P0 и исправления по реальному браузеру

- OSINTchart adapter: 4 Python tests PASS против настоящего CaseService/schema 2 commit 1e90238, без моков моделей. Три Entity, один Capture, пять строковых evidence_refs; повторный импорт → skip без дублей; подтверждение/устаревший preview/конфликты проверены. Это in-process адаптер, не UI-плагин/Native Messaging и не запуск OSINTchart GUI.

## Финальная регрессия и поставка 0.1.0

- OSINTchart CaseService adapter: 4/4 Python PASS (реальные модели/сервисы reference checkout, без GUI).

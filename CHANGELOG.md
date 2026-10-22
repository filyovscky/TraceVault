# Changelog

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

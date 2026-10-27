# Реальные снимки интерфейса

0.5.1: [Compact storage Settings, installed Chrome](0.5.1-storage-settings-installed.png), [CFT](0.5.1-storage-settings-cft.png), [dark Settings](0.5.1-storage-settings-dark.png). Actual [compact PDF first page](0.5.1-compact-pdf-installed-1.png) and [last page](0.5.1-compact-pdf-installed-2.png) rendered independently; [PNG/PDF pixel verification](0.5.1-independent-pixels.json), [codec](0.5.1-png-codec.json), [whole-browser private-memory sample](0.5.1-capture-memory.json), full disk metadata [CFT](0.5.1-compact-cft.json) / [installed Chrome](0.5.1-compact-installed.json). Measurements are scoped in PERFORMANCE.md; screenshots are actual test artifacts, not design mockups.

0.5.0: real session recorder in the extension document, 320 px, [light](0.5.0-session-light.png) and [dark](0.5.0-session-dark.png). Real one-window/two-window, FSA/hash/export/restart scenarios are documented in TEST-REPORT.md. [Raw resource measurements before](0.5.0-session-performance-before.json) and [after](0.5.0-session-performance-after.json); these include the entire isolated browser where stated, not extension-only RSS.

0.4.1 capture regression: [wide page](0.4.1-fixed-wide.png), [short page with large overlap](0.4.1-fixed-short.png). Actual saved PNGs: one fixed header/footer and one natural-flow sticky bar. Pixel/metadata reconstruction checks are documented in TEST-REPORT.md; supplied user evidence was not rewritten.

0.4.0: English icon UI. [Dark](0.4-panel-dark-320.png), [light](0.4-panel-light-320.png), [Settings](0.4-settings-dark-320.png), [hover description](0.4-tooltip-320.png), [description inside a modal](0.4-settings-tooltip-320.png). Native Chrome checks 32 main-panel and 32 Settings combinations, matching tool-grid geometry and internal horizontal overflow. Earlier screenshots below are historical.

Версия 0.3.2: [Side Panel после cross-origin и SPA](0.3.2-side-panel.png), [светлая тема 320 px/DPR 2](0.3.2-light-320-2.png), [два файла после восстановления доступа](0.3.2-access-restored.png). Отдельная повторная проверка 32 layout-комбинаций прошла; ранние снимки ниже оставлены как история QA.

Снято из установленного Chrome 155.0.8059.85 на Windows, не рендер-макет.

- [Нативный Side Panel](native-side-panel.png): отдельный target с runtime contextType SIDE_PANEL, текущая папка подтверждена в его DOM.
- [Тёмная тема, 360 px](native-dark-360-1.png).
- [Светлая тема, 320 px, DPR 2](native-light-320-2.png).
- Все 32 комбинации: `native-{light|dark}-{320|360|420|520}-{1|1.25|1.5|2}.png`.
- [Машинный протокол размеров](native-layouts.json), включая физическую ширину PNG.

Проверены обе темы, перенос текста, отсутствие horizontal overflow, длинное название папки/дела, кириллица, фокусируемые системные поля. Приёмка реальной смены масштаба Windows остаётся ручной: DPR эмулировался в браузере. Панель Chrome может быть короче снимка полностраничного UI; содержимое прокручивается.

Во время QA найден дефект harness: Playwright screenshot восстанавливал старую ширину после прямой CDP-эмуляции, получалось обрезание desktop layout. Исправлено согласованной установкой viewport и прямым Page.captureScreenshot. Каждый PNG теперь проверяется по реальной ширине в IHDR, а не только по innerWidth до съёмки. Снимки в этой папке — после исправления.

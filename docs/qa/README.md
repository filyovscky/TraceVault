## 0.8.0 — Bookmarks

Actual installed Chrome screenshots at 320 × 900 px from the final passing disk-backed workflow:

- [Light](0.8.0-bookmarks-light.png)
- [Dark](0.8.0-bookmarks-dark.png)

Inspected navigation alignment, five capture controls, bookmark row/actions, saved-copy count and horizontal bounds. These are extension UI screenshots, not a design mockup. Broader system DPI/OS picker coverage remains outside this iteration.

# Реальные снимки интерфейса

0.7.0: [manual comparison, light](0.7.0-comparison-light.png) / [dark](0.7.0-comparison-dark.png), [new-case destination and explicit stop choice](0.7.0-new-case-dialog.png), [fresh case without old stopped-session state](0.7.0-new-case-ready.png). Actual installed Chrome at 360px, real source files and verified comparison. The HTML-looking added text is deliberately rendered literally; offline/no-request and tamper checks are in TEST-REPORT.md.

0.6.0 Focus: [light, 320 px](0.6.0-focus-light-320.png), [dark, 420 px](0.6.0-focus-dark-420.png) and [case menu, 320 px](0.6.0-focus-menu-320.png). Actual extension document in installed Chrome after real HTML/PNG/highlight/export operations. Both browsers cover 320/360/420/520 px in both themes, collection counts/details/back navigation and native action-menu bounds. Native side-panel attachment and the full Windows DPI matrix were not rerun for this iteration.

0.5.3: actual installed Chrome at 320 px, [light URL hover](0.5.3-url-installed-light.png) / [dark URL hover](0.5.3-url-installed-dark.png). The address keeps its beginning/end on one line; the full encoded URL is in a scrollable tooltip. Focused browser/data-integrity coverage and incomplete broader smoke coverage are distinguished in TEST-REPORT.md.

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

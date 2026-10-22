# Capture engine v1

Независимая реализация, SingleFile не включён. Из SingleFile reference checkout f0011b86057e683a751569dc96399290d6e3c5de изучены LICENSE/README, manifest, tools, src/index.js (getPageData), core/content и build scripts. Его root manifest содержит не универсальный MV3 entry point; использовать произвольные исходные файлы как готовую MV3-библиотеку нельзя. Его лицензия AGPL-3.0 и дополнительное разрешение к notices не превращают движок в MIT.

## Pipeline

1. Зафиксировать case/tab/URL/UUID/UTC, записать начало на диск.
2. Скрыть собственный toolbar и CSS Highlights, восстановить в finally.
3. Через chrome.scripting в isolated world клонировать текущий DOM. Картинки берут currentSrc, доступный canvas → PNG, доступные iframe → srcdoc, открытый Shadow DOM → declarative template. CSSOM rules берутся там, где это разрешено.
4. В документе расширения DOMParser обрабатывает копию. CSS imports и url() рекурсивно встраиваются, ресурсы дедуплицируются по полному URL, относительные адреса разрешаются по исходной базе/URL ответа CSS. Шрифты и CSS backgrounds идут тем же механизмом. Неуспешные ресурсы → diagnostics, status partial.
5. Удаляются scripts/event handlers, object/embed, refresh/preloads, submit actions, значения input/textarea. SVG href обрабатываются отдельно; ссылки пользователя на веб-страницы сохраняются как явные navigable anchors.
6. В начале head — UTF-8 и CSP: default-src none, только data images/fonts/inline styles, script-src none. Внутренний viewer дополнительно iframe sandbox без разрешения scripts/same-origin. Это защита чтения, а не формальная гарантия безопасной обработки любой уязвимости Chrome.
7. Один HTML пишется один раз. SHA-256 сравнивается с повторно прочитанными байтами. Только после этого публикуется completed/partial. Повторный capture имеет новый UUID даже при равном хеше.

## Границы

- Нет побайтового HTTP/WARC захвата, cookie/header/body журналирования и обхода авторизации.
- activeTab — текущий origin; сторонний origin может требовать отдельного разрешения/CORS. Недоступный ресурс не подменяется сетевой ссылкой с ложным статусом complete.
- CSS parser покрывает типичные quoted imports и url(); сложные новые синтаксисы, escape-последовательности, CSS paint worklets и edge cases не имеют гарантии точного воспроизведения. CSP блокирует оставшиеся неразрешённые сетевые обращения. Отчёт diagnostics — перечень известных проблем, не математическое доказательство отсутствия всех зависимостей.
- iframe до глубины 3, CSS imports до 8; недоступные cross-origin iframe → partial. Media playback/DRM не архивируются. WebGL/tainted canvas, закрытый shadow root, adopted shadow styles, динамические виртуальные списки и lazy loading за пределами полученного DOM ограничены.
- Нет автоматического скролла/нажатий сайта. Вводимые поля очищаются; видимый текст авторизованной страницы может быть чувствительным. Сохранение таких страниц — явное действие пользователя.
- По умолчанию max 64 МБ, UI 1–256 МБ. Сетевой timeout ресурса 12 секунд, image fetch 15 секунд, импортов не более 8. Общий deadline зависит от числа ресурсов; отмена доступна в панели.
- Объём DOM ограничивается до клонирования по длине HTML, окончательный UTF-8 HTML проверяется по byte_length. Пиковая память больше размера архива. Сотни мегабайт и тысячи одновременно загружаемых ресурсов не сертифицированы нагрузочным тестом.

## Аннотации

Нормализация якорей `textContent UTF-16 v1`: TreeWalker text nodes body, исключая script/style/noscript/input/textarea/contenteditable/TraceVault UI. Нет Unicode case folding или whitespace collapse. Хранятся точная цитата, 48 code units prefix/suffix, offsets, DOM hint. Подсветка разрешена только единственному совпадению с точным контекстом. Одинаковые совпадения → ambiguous, отсутствие → orphaned. Неизменяемый Reference продолжает указывать на старый Capture.

MutationObserver реагирует на childList/characterData с debounce 600 мс, модель ограничена 5 млн UTF-16 units. За пределами модели, в closed shadow root и отдельных frame highlights не обещаются. Текст оригинала не заменяется. Скрытие на сайте/глобальное сохраняется отдельно от первичных файлов.

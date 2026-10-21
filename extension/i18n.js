// UI currently ships Russian. Domain values stay language-neutral; add dictionaries here.
export const locale = 'ru';
const dictionaries={ru:{completed:'Сохранено',partial:'Частично сохранено',failed:'Ошибка',interrupted:'Прервано',cancelled:'Отменено',queued:'В очереди',capturing:'Получение страницы',writing:'Запись на диск',verifying:'Проверка файла',attached:'Восстановлено',orphaned:'Текст не найден',ambiguous:'Неоднозначный якорь',pending:'Не проверено',not_applicable:'Заметка',live_only:'Только живая страница',archived:'Есть архив'}};
export const t=key=>dictionaries[locale][key] || key;

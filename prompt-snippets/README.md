# prompt-snippets

Your prompts as snippets: `;name` in the prompt expands to the saved text, `/snip save` keeps the last prompt, `/snip` lists them all.

[English](#english) · [Русский](#русский)

## English

The same requests come back every day: a review checklist, "fix the failing test and run it again", a project's conventions. Save each once and type it in two keystrokes.

- **Save:** `/snip save review` keeps the last prompt you sent as `;review`; `/snip save fix Fix the failing test, then run it again.` saves the text given right there (lines included).
- **Use:** type `;` and the first letters: the suggestions list the matching snippets with their first line; taking one puts the whole text in its place. A `;review` sent as it is expands too, so `;review for a.ts` works without the suggestion.
- **Browse:** `/snip` opens a pane with every snippet, **Insert** (at the cursor, the draft stays) and **Delete**. `/snip rm review` deletes one.

Snippets are yours across every project and session. Names are letters (any script), digits, `_` and `-`, so `;ревью` works too.

### What it touches

Keeps the snippets and the last prompt you typed in the mod's store (a JSON file under the Claude Code configuration folder). Adds suggestions for words starting with `;`; replaces a sent `;name` with the snippet's text. Adds the `/snip` command.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.

### Install

```
/plugin install prompt-snippets --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

Ваши промпты как сниппеты: `;имя` в промпте разворачивается в сохранённый текст, `/snip save` сохраняет последний промпт, `/snip` показывает все.

Одни и те же просьбы возвращаются каждый день: чек-лист ревью, «почини упавший тест и прогони заново», соглашения проекта. Сохраните каждую один раз и вставляйте в два нажатия.

- **Сохранить:** `/snip save ревью` сохраняет последний отправленный промпт как `;ревью`; `/snip save fix Почини упавший тест и прогони заново.` сохраняет текст, указанный прямо в команде (с переносами строк).
- **Вставить:** наберите `;` и первые буквы — в подсказках появятся подходящие сниппеты с первой строкой; выбор подставляет весь текст на место слова. Отправленный как есть `;ревью` тоже разворачивается, так что `;ревью для a.ts` работает и без подсказки.
- **Посмотреть:** `/snip` открывает панель со всеми сниппетами, кнопками **Вставить** (у курсора, набранное остаётся) и **Удалить**. `/snip rm ревью` удаляет один.

Сниппеты общие для всех проектов и сессий. Имя — буквы (любого алфавита), цифры, `_` и `-`, так что `;ревью` тоже работает.

### Что мод делает в системе

Хранит сниппеты и последний набранный промпт в хранилище мода (JSON-файл в папке настроек Claude Code). Добавляет подсказки для слов, начинающихся с `;`; заменяет отправленное `;имя` текстом сниппета. Добавляет команду `/snip`.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.

### Установка

```
/plugin install prompt-snippets --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

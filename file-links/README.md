# file-links

Turns file mentions in Claude's replies into clickable links to where the file really is.

[English](#english) · [Русский](#русский)

## English

Claude often names a file as `src/app.ts` or `C:\Users\me\notes.md`, and the mention is not clickable, or opens nothing because the path is relative to another folder. This mod finds path-shaped mentions (in `inline code` or bare absolute Windows paths), looks the file up from the session's folder and project root, and turns each one it finds into a `file:///` link. A `:12` line suffix is kept. Code blocks, existing links and files that do not exist are left as written.

### What it touches

Checks whether mentioned paths exist (`exists` / `stat`) and changes only how a reply is drawn; what the model reads is not changed. Reads `USERPROFILE` to resolve `~`.

### Settings (`/config`)

No settings.

### Install

```
/plugin install file-links --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

Превращает упоминания файлов в ответах Claude в кликабельные ссылки на то место, где файл реально лежит.

Claude часто называет файл как `src/app.ts` или `C:\Users\me\notes.md`, и упоминание либо не кликается, либо открывает пустоту, потому что путь относительный. Мод находит упоминания, похожие на пути (в `inline code` или голые абсолютные Windows-пути), ищет файл от папки сессии и корня проекта и превращает каждое найденное в ссылку `file:///`. Суффикс строки `:12` сохраняется. Блоки кода, готовые ссылки и несуществующие файлы не трогает.

### Что мод делает в системе

Проверяет, существуют ли упомянутые пути (`exists` / `stat`), и меняет только отрисовку ответа; то, что читает модель, не меняется. Читает `USERPROFILE`, чтобы раскрыть `~`.

### Настройки (`/config`)

Настроек нет.

### Установка

```
/plugin install file-links --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

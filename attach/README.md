# attach

`/attach`: files into the prompt — pick several in the Windows dialog or take the ones copied in Explorer.

[English](#english) · [Русский](#русский)

## English

An `@` mention finds files inside the project, but a file in Downloads, on the desktop or on another drive means typing its full path. `/attach` opens the usual Windows open dialog instead: pick one file or many (Ctrl / Shift + click), from any folder, and each lands in the prompt at the cursor.

- `/attach`: the Windows open dialog, on top of the terminal, starting in the project folder. Pick as many files as you like.
- `/attach clip`: the files (and folders) you copied in Explorer with Ctrl+C.

How each file goes in:

- **Pictures, PDFs, text and code** go in as `@` mentions: inside the project relative (`@src/app.ts`), elsewhere absolute (`@D:\Downloads\photo.png`), quoted when the path has a space. Claude Code does not always attach a picture or a PDF for an `@` mention, so when a prompt names files this mod added, it asks Claude to open each one.
- **Binary files** (exe, dll, msi, zip, 7z, iso, torrent, docx, xlsx, pptx, audio, video, fonts, databases…) go in by path only, without `@`: otherwise Claude Code pastes their bytes into the context as text, kilobytes of noise. Claude is told they are binary and to look inside with a fitting tool only if the task needs it.

**Several batches in one message:** a slash command only works in an empty prompt, so use the **📎 files** button the [hud](../hud) mod shows when this mod is installed: the files land at the cursor and what you typed stays. Next to it, 📷 from the [shot](../shot) mod adds screenshots the same way.

### What it touches

On `/attach` runs one PowerShell script: it shows the Windows open dialog (owned by the window in front, so it opens over the terminal) or reads the list of files copied to the clipboard; it reads nothing else and changes nothing. Puts the files' mentions into the prompt box and remembers, for the session, which files it added; when a sent prompt names one of them, adds a note for Claude. Adds the `/attach` command. Windows only.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.

### Install

```
/plugin install attach --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

`/attach`: файлы в промпт — выберите несколько в окне Windows или возьмите скопированные в Проводнике.

`@`-упоминание находит файлы внутри проекта, но для файла из Загрузок, с рабочего стола или с другого диска приходится набирать полный путь. `/attach` вместо этого открывает обычное окно выбора файлов Windows: выберите один файл или сразу несколько (Ctrl / Shift + клик) из любой папки, и каждый встанет в промпт у курсора.

- `/attach`: окно выбора файлов Windows поверх терминала, открывается в папке проекта. Выбирайте сколько угодно файлов.
- `/attach clip`: файлы (и папки), скопированные в Проводнике через Ctrl+C.

Как вставляется каждый файл:

- **Картинки, PDF, текст и код** — `@`-упоминаниями: внутри проекта относительным путём (`@src/app.ts`), снаружи абсолютным (`@D:\Downloads\photo.png`), в кавычках, если в пути есть пробел. Claude Code не всегда прикладывает картинку или PDF по `@`-упоминанию, поэтому, когда в промпте есть файлы, добавленные этим модом, мод просит Claude открыть каждый.
- **Бинарные файлы** (exe, dll, msi, zip, 7z, iso, torrent, docx, xlsx, pptx, аудио, видео, шрифты, базы данных…) — только путём, без `@`: иначе Claude Code вставит их байты в контекст как текст, килобайты мусора. Claude получает пометку, что они бинарные, и смотрит внутрь подходящим инструментом, только если это нужно для задачи.

**Несколько партий в одном сообщении:** слэш-команда работает только в пустом поле ввода, поэтому пользуйтесь кнопкой **📎 файлы**, которую показывает мод [hud](../hud), когда установлен этот мод: файлы встают у курсора, набранный текст остаётся. Рядом 📷 из мода [shot](../shot) так же добавляет скриншоты.

### Что мод делает в системе

По `/attach` запускает один PowerShell-скрипт: показывает окно выбора файлов Windows (привязанное к окну на переднем плане, поэтому оно открывается поверх терминала) или читает список файлов, скопированных в буфер обмена; больше ничего не читает и ничего не меняет. Вставляет упоминания файлов в поле ввода и запоминает на время сессии, какие файлы добавил; если в отправленном промпте есть такой файл, добавляет для Claude пометку. Добавляет команду `/attach`. Только Windows.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.

### Установка

```
/plugin install attach --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

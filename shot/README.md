# shot

`/shot`: a screenshot straight into the prompt — a region, the window behind the terminal, the whole screen or the clipboard.

[English](#english) · [Русский](#русский)

## English

Showing Claude what you see on Windows usually takes a snip, a save and a path to type. `/shot` does it in one go: it saves a PNG and puts `@<path>` into the prompt at the cursor; when you send the message, Claude opens the picture.

- `/shot`: the Windows snipping overlay opens (the same as Win+Shift+S); select a region, and it lands in the prompt.
- `/shot window`: the window that was in front before you switched to the terminal (a browser with a bug, an app), captured whole even where the terminal covers it.
- `/shot screen`: every monitor.
- `/shot clip`: the image already on the clipboard.

**Several screenshots in one message:** a slash command only works in an empty prompt, so use the **📷 shot · window** buttons the [hud](../hud) mod shows when this mod is installed: each picture lands at the cursor and what you typed stays.

Screenshots are saved to `%TEMP%\claude-shots\shot-<date>-<time>.png`. Claude Code does not attach a picture for an `@` mention by itself, so when a prompt names one of these files the mod tells Claude to open it.

### What it touches

On `/shot` runs one PowerShell script that takes the picture (the snipping overlay through `ms-screenclip:` and the clipboard, `PrintWindow` for a window, `CopyFromScreen` for the screen; `/shot` clears the clipboard before the overlay opens) and saves it under `%TEMP%\claude-shots`. Puts the file's `@mention` into the prompt box; when a sent prompt names such a file, adds a note asking Claude to open it. Adds the `/shot` command. Windows only.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.

### Install

```
/plugin install shot --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

`/shot`: скриншот прямо в промпт — область, окно за терминалом, весь экран или буфер обмена.

Чтобы показать Claude то, что вы видите, на Windows обычно нужно сделать снимок, сохранить его и вписать путь. `/shot` делает это за раз: сохраняет PNG и вставляет `@<путь>` в промпт у курсора; когда вы отправите сообщение, Claude откроет картинку.

- `/shot`: открывается выделение области Windows (то же, что Win+Shift+S); выделили — картинка в промпте.
- `/shot window`: окно, которое было на переднем плане до того, как вы переключились в терминал (браузер с багом, приложение); снимается целиком, даже там, где его перекрывает терминал.
- `/shot screen`: все мониторы.
- `/shot clip`: картинка, которая уже лежит в буфере обмена.

**Несколько скриншотов в одном сообщении:** слэш-команда работает только в пустом поле ввода, поэтому пользуйтесь кнопками **📷 скрин · окно**, которые показывает мод [hud](../hud), когда установлен этот мод: каждая картинка встаёт у курсора, набранный текст остаётся.

Скриншоты сохраняются в `%TEMP%\claude-shots\shot-<дата>-<время>.png`. Claude Code сам не прикладывает картинку по `@`-упоминанию, поэтому, когда в промпте есть путь к такому файлу, мод просит Claude открыть его.

### Что мод делает в системе

По `/shot` запускает один PowerShell-скрипт, который делает снимок (выделение области через `ms-screenclip:` и буфер обмена, `PrintWindow` для окна, `CopyFromScreen` для экрана; перед выделением области `/shot` очищает буфер обмена) и сохраняет его в `%TEMP%\claude-shots`. Вставляет `@упоминание` файла в поле ввода; если в отправленном промпте есть путь к такому файлу, добавляет для Claude просьбу открыть его. Добавляет команду `/shot`. Только Windows.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.

### Установка

```
/plugin install shot --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

# encoding-guard

Keeps Cyrillic and other non-ASCII text intact in Claude's commands on Windows.

[English](#english) · [Русский](#русский)

## English

On a Windows with a Russian (or any non-UTF-8) system locale, Claude's commands mangle text in several quiet ways: PowerShell 5.1 reads UTF-8 files without a BOM as cp1251 and saves with `Set-Content` in cp1251, Python in Git Bash fails with `UnicodeEncodeError`, git prints `"\321\204\320\260..."` instead of a file name, `cmd` tools print `�`. Claude then sees mojibake, takes it at face value and sometimes writes it back to a file. This mod:

- **reads UTF-8 in PowerShell:** adds `-Encoding UTF8` to `Get-Content` (`gc`, `cat`, `type`) that has no `-Encoding`. If the file turns out to be cp1251, it tells Claude to read it with `-Encoding Default`;
- **stops writes in cp1251:** a `Set-Content` / `Add-Content` without `-Encoding` is not run when it writes non-ASCII text or text read in the same command, and Claude is told to use the Edit / Write tool or to write UTF-8 without a BOM;
- **runs Python and git in UTF-8:** the session's commands get `PYTHONUTF8=1` and git's `core.quotepath=false` (through `GIT_CONFIG_*` variables: your git config is not changed). A variable you already set is left as it is;
- **explains broken output to Claude:** mojibake like `Р...С...`, `�` from `cmd` tools, Python's `UnicodeEncodeError`, git's octal paths each get a short note with what to do instead.

A command containing `# encoding:off` is passed through untouched.

### What it touches

Rewrites PowerShell commands that read files with `Get-Content` without `-Encoding` (adds `-Encoding UTF8`); refuses the PowerShell writes described above. Sets `PYTHONUTF8`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0`, `GIT_CONFIG_VALUE_0` for the Claude Code process and the commands it starts, on Windows only. Adds notes for Claude to command results. Changes no files and no settings.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.
- `sessionEnv`: `on` (default) sets the UTF-8 variables above; `off` leaves the environment alone and only gives hints.

### Install

```
/plugin install encoding-guard --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

Бережёт кириллицу и прочий не-ASCII текст в командах Claude на Windows.

На Windows с русской (или любой не-UTF-8) системной локалью команды Claude тихо портят текст: PowerShell 5.1 читает UTF-8 файлы без BOM как cp1251 и сохраняет через `Set-Content` в cp1251, Python в Git Bash падает с `UnicodeEncodeError`, git вместо имени файла печатает `"\321\204\320\260..."`, утилиты `cmd` выводят `�`. Claude видит кракозябры, принимает их за чистую монету и иногда записывает обратно в файл. Мод:

- **читает UTF-8 в PowerShell:** добавляет `-Encoding UTF8` к `Get-Content` (`gc`, `cat`, `type`) без `-Encoding`. Если файл оказался в cp1251, подсказывает Claude прочитать его с `-Encoding Default`;
- **не даёт записать в cp1251:** `Set-Content` / `Add-Content` без `-Encoding` не запускается, если пишет не-ASCII текст или текст, прочитанный в той же команде; Claude получает совет использовать инструменты Edit / Write или писать UTF-8 без BOM;
- **запускает Python и git в UTF-8:** команды сессии получают `PYTHONUTF8=1` и `core.quotepath=false` для git (через переменные `GIT_CONFIG_*`: ваш конфиг git не меняется). Переменную, которую вы уже задали сами, мод не трогает;
- **объясняет Claude испорченный вывод:** кракозябры вида `Р...С...`, `�` от утилит `cmd`, `UnicodeEncodeError` в Python, восьмеричные пути в git — на каждое короткая заметка, что делать вместо этого.

Команду со строкой `# encoding:off` мод пропускает без изменений.

### Что мод делает в системе

Переписывает команды PowerShell, читающие файлы через `Get-Content` без `-Encoding` (добавляет `-Encoding UTF8`); не запускает описанные выше записи в PowerShell. Задаёт `PYTHONUTF8`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0`, `GIT_CONFIG_VALUE_0` процессу Claude Code и командам, которые он запускает, только на Windows. Добавляет к результатам команд заметки для Claude. Файлы и настройки не меняет.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.
- `sessionEnv`: `on` (по умолчанию) задаёт переменные UTF-8, описанные выше; `off` не трогает окружение и только подсказывает.

### Установка

```
/plugin install encoding-guard --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

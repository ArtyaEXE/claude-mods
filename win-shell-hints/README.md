# win-shell-hints

Stops Windows-breaking shell commands before they run and tells Claude the right syntax.

[English](#english) · [Русский](#русский)

## English

Claude often writes bash habits into PowerShell 5.1 (`&&`, `grep`, `head`, `rm -rf`, `curl -s`, `python3`) or Windows paths and `%VAR%` into Git Bash. Each failure costs a round trip and tokens. This mod checks every `PowerShell` and `Bash` tool call first: a line that would certainly fail is refused with a one-line fix, so Claude rewrites it right away. When a command does fail with a known Windows error, a short hint is added to the result for Claude.

Quoted strings and here-strings are ignored. A line containing `# win-hints:off` is passed through untouched.

### What it touches

Reads the command text of `PowerShell` / `Bash` tool calls and may refuse one. Runs nothing itself, except one PowerShell call at start to detect the language when `language` is `auto`.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.

### Install

```
/plugin install win-shell-hints --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

Не даёт запустить команды, которые упадут на Windows, и сразу подсказывает Claude правильный синтаксис.

Claude часто пишет bash-привычки в PowerShell 5.1 (`&&`, `grep`, `head`, `rm -rf`, `curl -s`, `python3`) или Windows-пути и `%VAR%` в Git Bash. Каждая такая ошибка — лишний круг и токены. Мод проверяет каждый вызов `PowerShell` и `Bash` до запуска: строка, которая точно упадёт, не запускается, а Claude получает однострочную подсказку и сразу переписывает команду. Если команда всё же упала с известной ошибкой Windows, к результату добавляется короткая подсказка для Claude.

Строки в кавычках и here-strings не проверяются. Строку с `# win-hints:off` мод пропускает как есть.

### Что мод делает в системе

Читает текст команд `PowerShell` / `Bash` и может отказать в запуске. Сам ничего не запускает, кроме одного вызова PowerShell при старте для определения языка в режиме `auto`.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.

### Установка

```
/plugin install win-shell-hints --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

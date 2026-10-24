# claude-mods

[English](#english) · [Русский](#русский)

## English

Four Claude Code mods built for Windows. The mods' on-screen text is in Russian.

| Mod | What it does |
| --- | --- |
| `win-shell-hints` | Catches commands that would fail on Windows before they run: bash syntax in PowerShell 5.1 (`&&`, `grep`, `head`, `rm -rf`, `curl -s`, `python3`), and Windows paths or `%VAR%` in Git Bash. It refuses the line and tells Claude the correct form right away. A line containing `# win-hints:off` is passed through. |
| `context-handoff` | At 350k / 600k / 800k context tokens it offers to move on: the agent writes `.handoff/handoff-<date>.md`, the chat is cleared, and a fresh agent reads the file and continues. Run it by hand with `/handoff`. |
| `file-links` | Turns file mentions in Claude's replies into clickable `file:///` links, resolving where each file actually lives. |
| `bg-watchdog` | Watches the session's background tasks and the dev servers listening on ports that were started during the session. Anything running longer than 20 minutes gets a bar with Stop / Snooze / Hide. Everything at once: `/bg-tasks`. |

### Install

In a Claude Code terminal session, one mod at a time (install only the ones you want):

```
/plugin install win-shell-hints --marketplace ArtyaEXE/claude-mods
/plugin install context-handoff --marketplace ArtyaEXE/claude-mods
/plugin install file-links --marketplace ArtyaEXE/claude-mods
/plugin install bg-watchdog --marketplace ArtyaEXE/claude-mods
```

Answer `y` to `Add marketplace?`, then pick a scope.

From a shell:

```
claude plugin install win-shell-hints --marketplace ArtyaEXE/claude-mods
```

In the desktop app: click + next to the prompt box → Plugins → Add marketplace `ArtyaEXE/claude-mods` → Add plugin.

### License

MIT

---

## Русский

Четыре мода для Claude Code, заточенные под Windows. Интерфейс на русском.

| Мод | Что делает |
| --- | --- |
| `win-shell-hints` | Ловит команды, которые упадут на Windows (bash-синтаксис в PowerShell 5.1: `&&`, `grep`, `head`, `rm -rf`, `curl -s`, `python3`; Windows-пути и `%VAR%` в Git Bash), не запускает их и сразу подсказывает Claude правильный вариант. Строку с `# win-hints:off` пропускает. |
| `context-handoff` | На 350k / 600k / 800k токенов контекста предлагает переезд: агент пишет `.handoff/handoff-<дата>.md`, чат очищается, новый агент читает файл и продолжает. Вручную: `/handoff`. |
| `file-links` | Превращает упоминания файлов в ответах Claude в кликабельные `file:///` ссылки, находя, где файл реально лежит. |
| `bg-watchdog` | Следит за фоновыми задачами сессии и dev-серверами на портах, запущенными в этой сессии. Висит дольше 20 минут — плашка «Остановить / Отложить / Скрыть». Всё сразу: `/bg-tasks`. |

### Установка

В терминальной сессии Claude Code, по одному моду (ставьте только нужные):

```
/plugin install win-shell-hints --marketplace ArtyaEXE/claude-mods
/plugin install context-handoff --marketplace ArtyaEXE/claude-mods
/plugin install file-links --marketplace ArtyaEXE/claude-mods
/plugin install bg-watchdog --marketplace ArtyaEXE/claude-mods
```

На вопрос `Add marketplace?` ответьте `y`, затем выберите scope.

Из обычного шелла:

```
claude plugin install win-shell-hints --marketplace ArtyaEXE/claude-mods
```

В десктопном приложении: + рядом с полем ввода → Plugins → Add marketplace `ArtyaEXE/claude-mods` → Add plugin.

### Лицензия

MIT

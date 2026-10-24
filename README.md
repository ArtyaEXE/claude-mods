# claude-mods

Четыре мода для Claude Code, заточенные под Windows. Интерфейс на русском.

| Мод | Что делает |
| --- | --- |
| `win-shell-hints` | Ловит команды, которые упадут на Windows (bash-синтаксис в PowerShell 5.1: `&&`, `grep`, `head`, `rm -rf`, `curl -s`, `python3`; Windows-пути и `%VAR%` в Git Bash), не запускает их и сразу подсказывает Claude правильный вариант. Строку с `# win-hints:off` пропускает. |
| `context-handoff` | На 350k / 600k / 800k токенов контекста предлагает переезд: агент пишет `.handoff/handoff-<дата>.md`, чат очищается, новый агент читает файл и продолжает. Вручную: `/handoff`. |
| `file-links` | Превращает упоминания файлов в ответах Claude в кликабельные `file:///` ссылки, находя, где файл реально лежит. |
| `bg-watchdog` | Следит за фоновыми задачами сессии и dev-серверами на портах, запущенными в этой сессии. Висит дольше 20 минут — плашка «Остановить / Отложить / Скрыть». Всё сразу: `/bg-tasks`. |

## Установка

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

## Лицензия

MIT

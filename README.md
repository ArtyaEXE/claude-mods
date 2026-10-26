# claude-mods

[English](#english) · [Русский](#русский)

## English

<p align="center"><img src="assets/demo-en.gif" alt="All five mods in action: win-shell-hints, file-links, bg-watchdog, context-handoff, hud" width="1000"></p>
<p align="center"><sub>All five mods in action (illustration)</sub></p>

Ten Claude Code mods built for Windows. Each one speaks English or Russian: set `language` in `/config` (`auto`, the default, follows `LANG` or the Windows language).

| Mod | What it does |
| --- | --- |
| `win-shell-hints` | Catches commands that would fail on Windows before they run: bash syntax in PowerShell 5.1 (`&&`, `grep`, `head`, `rm -rf`, `curl -s`, `python3`), and Windows paths or `%VAR%` in Git Bash. It refuses the line and tells Claude the correct form right away. A line containing `# win-hints:off` is passed through. |
| `context-handoff` | At 350k / 600k / 800k context tokens it offers to move on: the agent writes `.handoff/handoff-<date>.md`, the chat is cleared, and a fresh agent reads the file and continues. Run it by hand with `/handoff`. |
| `file-links` | Turns file mentions in Claude's replies into clickable `file:///` links, resolving where each file actually lives. |
| `bg-watchdog` | Watches the session's background tasks and the dev servers listening on ports that were started during the session. Anything running longer than 20 minutes gets a bar with Stop / Snooze / Hide. Everything at once: `/bg-tasks`. |
| `hud` | A three-line HUD under the prompt (or above it: `position` in `/config`): model, folder, git branch with uncommitted / ahead / behind counts; claude-hud-style bars for the context and the 5-hour limit side by side, the weekly limit, each limit with when it resets; and a countdown until the prompt cache goes cold (60 min by default, `cacheTtlMinutes` in `/config`). Click the folder to open Claude Code in another folder in a new window; click the branch to open `/changes` (changes-pane). Replaces a status-line HUD such as claude-hud. |
| `turn-notify` | A Windows notification when a turn of 30 seconds or more ends, or when Claude waits for permission, an answer or plan approval, while the terminal is not in front: how long it took and the first line of the answer. With a Telegram bot set up, the same goes to Telegram once you have been away for 5 minutes. `/notify test`, `/notify off`. |
| `encoding-guard` | Keeps Cyrillic intact: adds `-Encoding UTF8` to PowerShell 5.1's `Get-Content`, stops `Set-Content` / `Add-Content` that would save text as cp1251, runs Python and git in UTF-8 for the session (`PYTHONUTF8=1`, `core.quotepath=false`, your config untouched), and explains mojibake, `�` and `UnicodeEncodeError` to Claude. |
| `changes-pane` | `/changes` opens a pane of the files changed since the session started: git status, +/− line counts, open in VS Code; a click unfolds the diff. Files that were already dirty before the session are left out unless Claude edited them. |
| `test-watch` | Runs the tests after a turn in which Claude changed files (and did not run them itself): ⟳ / ✓ / ✗ above the prompt, a failure goes to Claude in one click. Asks once per project; the command is found from the project (npm / pnpm / yarn / bun, pytest, cargo, go, dotnet, `claude plugin test` for changed plugins). `/tests`. |
| `danger-guard` | A safety net for auto mode: `git reset --hard`, `clean -f`, `checkout -- .`, `branch -D`, `stash drop` run after a snapshot of the whole tree (restore with `/guard`); force push, `rm -rf` outside the project, `DROP TABLE`, `terraform destroy` and the like wait for your answer. |


### Install

In a Claude Code terminal session, one mod at a time (install only the ones you want):

```
/plugin install win-shell-hints --marketplace ArtyaEXE/claude-mods
/plugin install context-handoff --marketplace ArtyaEXE/claude-mods
/plugin install file-links --marketplace ArtyaEXE/claude-mods
/plugin install bg-watchdog --marketplace ArtyaEXE/claude-mods
/plugin install hud --marketplace ArtyaEXE/claude-mods
/plugin install turn-notify --marketplace ArtyaEXE/claude-mods
/plugin install encoding-guard --marketplace ArtyaEXE/claude-mods
/plugin install changes-pane --marketplace ArtyaEXE/claude-mods
/plugin install test-watch --marketplace ArtyaEXE/claude-mods
/plugin install danger-guard --marketplace ArtyaEXE/claude-mods
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

<p align="center"><img src="assets/demo-ru.gif" alt="Все пять модов в деле: win-shell-hints, file-links, bg-watchdog, context-handoff, hud" width="1000"></p>
<p align="center"><sub>Все пять модов в деле (иллюстрация)</sub></p>

Десять модов для Claude Code, заточенные под Windows. Каждый говорит по-русски и по-английски: `language` в `/config` (`auto` по умолчанию — по `LANG` или языку Windows).

| Мод | Что делает |
| --- | --- |
| `win-shell-hints` | Ловит команды, которые упадут на Windows (bash-синтаксис в PowerShell 5.1: `&&`, `grep`, `head`, `rm -rf`, `curl -s`, `python3`; Windows-пути и `%VAR%` в Git Bash), не запускает их и сразу подсказывает Claude правильный вариант. Строку с `# win-hints:off` пропускает. |
| `context-handoff` | На 350k / 600k / 800k токенов контекста предлагает переезд: агент пишет `.handoff/handoff-<дата>.md`, чат очищается, новый агент читает файл и продолжает. Вручную: `/handoff`. |
| `file-links` | Превращает упоминания файлов в ответах Claude в кликабельные `file:///` ссылки, находя, где файл реально лежит. |
| `bg-watchdog` | Следит за фоновыми задачами сессии и dev-серверами на портах, запущенными в этой сессии. Висит дольше 20 минут — плашка «Остановить / Отложить / Скрыть». Всё сразу: `/bg-tasks`. |
| `hud` | HUD из трёх строк под полем ввода (или над ним: `position` в `/config`): модель, папка, ветка git (незакоммиченные / ahead / behind); полоски контекста и лимита 5ч рядом, в стиле claude-hud, недельный лимит, у каждого лимита — когда сбросится; таймер, через сколько остынет кэш промптов (по умолчанию 60 мин, `cacheTtlMinutes` в `/config`). Клик по папке открывает Claude Code в другой папке в новом окне, клик по ветке — `/changes` (changes-pane). Заменяет HUD в статусной строке вроде claude-hud. |
| `turn-notify` | Уведомление Windows, когда закончился ход дольше 30 секунд или Claude ждёт разрешения, ответа или одобрения плана, а терминал не на переднем плане: сколько шёл ход и первая строка ответа. Если настроен Telegram-бот, то же уходит в Telegram, когда вы отошли больше чем на 5 минут. `/notify test`, `/notify off`. |
| `encoding-guard` | Бережёт кириллицу: добавляет `-Encoding UTF8` к `Get-Content` в PowerShell 5.1, не даёт `Set-Content` / `Add-Content` сохранить текст в cp1251, запускает Python и git в UTF-8 на время сессии (`PYTHONUTF8=1`, `core.quotepath=false`, ваш конфиг не меняется) и объясняет Claude кракозябры, `�` и `UnicodeEncodeError`. |
| `changes-pane` | `/changes` открывает панель файлов, изменённых с начала сессии: статус git, счётчики +/− строк, «открыть» в VS Code; клик раскрывает дифф. Файлы, изменённые ещё до сессии, не показываются, если Claude их не правил. |
| `test-watch` | Запускает тесты после хода, в котором Claude менял файлы (и не прогнал их сам): ⟳ / ✓ / ✗ над полем ввода, падение отдаётся Claude в один клик. Спрашивает один раз на проект; команда определяется по проекту (npm / pnpm / yarn / bun, pytest, cargo, go, dotnet, `claude plugin test` для изменённых плагинов). `/tests`. |
| `danger-guard` | Страховка для авто-режима: `git reset --hard`, `clean -f`, `checkout -- .`, `branch -D`, `stash drop` идут после снимка всего дерева (вернуть — `/guard`); force push, `rm -rf` вне проекта, `DROP TABLE`, `terraform destroy` и подобное ждут вашего ответа. |


### Установка

В терминальной сессии Claude Code, по одному моду (ставьте только нужные):

```
/plugin install win-shell-hints --marketplace ArtyaEXE/claude-mods
/plugin install context-handoff --marketplace ArtyaEXE/claude-mods
/plugin install file-links --marketplace ArtyaEXE/claude-mods
/plugin install bg-watchdog --marketplace ArtyaEXE/claude-mods
/plugin install hud --marketplace ArtyaEXE/claude-mods
/plugin install turn-notify --marketplace ArtyaEXE/claude-mods
/plugin install encoding-guard --marketplace ArtyaEXE/claude-mods
/plugin install changes-pane --marketplace ArtyaEXE/claude-mods
/plugin install test-watch --marketplace ArtyaEXE/claude-mods
/plugin install danger-guard --marketplace ArtyaEXE/claude-mods
```

На вопрос `Add marketplace?` ответьте `y`, затем выберите scope.

Из обычного шелла:

```
claude plugin install win-shell-hints --marketplace ArtyaEXE/claude-mods
```

В десктопном приложении: + рядом с полем ввода → Plugins → Add marketplace `ArtyaEXE/claude-mods` → Add plugin.

### Лицензия

MIT

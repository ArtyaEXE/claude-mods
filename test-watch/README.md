# test-watch

Runs the project's tests after a turn in which Claude changed files, shows pass / fail above the prompt and hands a failure to Claude in one click.

[English](#english) · [Русский](#русский)

## English

Claude often finishes a change without running the tests, or runs only some of them. This mod runs them for it: at the end of every turn in which Claude changed files with Edit, Write or NotebookEdit, unless Claude itself ran the tests after its last change.

The first time in a project it asks above the prompt: **run `npm test` after Claude's changes in this project? Yes / No**. The answer is kept per project.

Above the prompt then:

- **⟳ `npm test` … 12 s** with **Stop** while the tests run;
- **✓ tests passed in 14 s**, which goes away with your next prompt;
- **✗ tests failed (code 1, 14 s)** with the line that says what failed, and **Hand to Claude** (sends the end of the output to Claude with a request to fix it), **Output** (a pane with the last 200 lines), **Hide**.

The command is found from the project: `npm` / `pnpm` / `yarn` / `bun test` by the lock file (when `package.json` has a real `test` script), `python -m pytest -q`, `cargo test`, `go test ./...`, `dotnet test`; in a marketplace of Claude Code plugins, `claude plugin test` for each changed plugin only. The `command` setting overrides it.

`/tests` opens the output pane; `/tests run` runs the tests now; `/tests on` / `/tests off` switch the runs on or off for this project.

### What it touches

Runs the test command through `cmd.exe` in the session folder (with `CI=1`, `FORCE_COLOR=0`, `NO_COLOR=1`), only in a project where you said yes, and stops it past the time limit or on **Stop** (at its next output). Reads `package.json`, lock files and other project markers to find the command. **Hand to Claude** submits a prompt. Keeps the yes / no per project in the mod's store. Adds the `/tests` command.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.
- `command`: empty (default) finds the command from the project; otherwise this command line, run through `cmd /c`.
- `timeoutMinutes`: a run longer than this is stopped, 10 by default.

### Install

```
/plugin install test-watch --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

Запускает тесты проекта после хода, в котором Claude менял файлы, показывает результат над полем ввода и отдаёт падение Claude в один клик.

Claude часто заканчивает правку, не запустив тесты, или запускает только часть. Мод делает это за него: в конце каждого хода, в котором Claude менял файлы через Edit, Write или NotebookEdit, если только сам Claude не прогнал тесты после последней правки.

В первый раз в проекте мод спрашивает над полем ввода: **запускать `npm test` после правок Claude в этом проекте? Да / Нет**. Ответ запоминается для проекта.

Дальше над полем ввода:

- **⟳ `npm test` … 12 с** и **Остановить**, пока тесты идут;
- **✓ тесты прошли за 14 с**, исчезает со следующим промптом;
- **✗ тесты упали (код 1, 14 с)** со строкой, где видно, что упало, и кнопками **Отдать Claude** (отправляет Claude хвост вывода с просьбой починить), **Вывод** (панель с последними 200 строками), **Скрыть**.

Команда определяется по проекту: `npm` / `pnpm` / `yarn` / `bun test` по lock-файлу (если в `package.json` есть настоящий скрипт `test`), `python -m pytest -q`, `cargo test`, `go test ./...`, `dotnet test`; в маркетплейсе плагинов Claude Code — `claude plugin test` только для изменённых плагинов. Настройка `command` её переопределяет.

`/tests` открывает панель с выводом; `/tests run` запускает тесты сейчас; `/tests on` / `/tests off` включают и выключают запуски в этом проекте.

### Что мод делает в системе

Запускает команду тестов через `cmd.exe` в папке сессии (с `CI=1`, `FORCE_COLOR=0`, `NO_COLOR=1`), только в проекте, где вы ответили «Да», и останавливает её по лимиту времени или по **Остановить** (при её следующем выводе). Читает `package.json`, lock-файлы и другие признаки проекта, чтобы найти команду. **Отдать Claude** отправляет промпт. Хранит ответ «Да / Нет» для проекта в хранилище мода. Добавляет команду `/tests`.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.
- `command`: пусто (по умолчанию) — команда определяется по проекту; иначе эта командная строка, запускается через `cmd /c`.
- `timeoutMinutes`: прогон дольше этого останавливается, по умолчанию 10.

### Установка

```
/plugin install test-watch --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

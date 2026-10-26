# changes-pane

`/changes`: a pane of the files changed in this session with +/− counts; a click unfolds the diff.

[English](#english) · [Русский](#русский)

## English

After a long autonomous turn it is hard to tell what Claude actually touched. `/changes` opens a pane with every file changed since the session started: its git status letter, how many lines were added and removed, and **open**: the file opens in VS Code when its `code` command is on PATH, else in the program Windows opens it with. A click on a file unfolds its diff right in the pane (whole hunks, up to 400 lines); another click folds it. **Refresh** (`r`) reads the files again; the list also refreshes at the end of every turn.

The pane counts from the commit the session started on, so commits Claude made during the session are included. Files that already had uncommitted changes before the session are left out, unless Claude changed them with Edit or Write. Outside a git repository the pane lists only the files Claude changed with Edit and Write, without counts.

### What it touches

Runs read-only git commands in the repository (`rev-parse`, `status`, `diff --numstat`, `diff --name-status`, `ls-files --others`, `diff -- <file>`) at session start, on `/changes`, on Refresh and at the end of each turn; reads new untracked files to count their lines. On **open**: runs `cmd /c code -g <file>`, or `explorer.exe <file>` without VS Code. Adds the `/changes` command. Changes no files.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.

### Install

```
/plugin install changes-pane --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

`/changes`: панель файлов, изменённых за сессию, со счётчиками +/−; клик раскрывает дифф.

После длинного автономного хода трудно понять, что Claude на самом деле поменял. `/changes` открывает панель со всеми файлами, изменёнными с начала сессии: буква статуса git, сколько строк добавлено и удалено, и кнопка **открыть**: файл откроется в VS Code, если его команда `code` есть в PATH, иначе в программе, которой Windows открывает такие файлы. Клик по файлу раскрывает его дифф прямо в панели (целыми ханками, до 400 строк), повторный клик сворачивает. **Обновить** (`r`) перечитывает файлы; список также обновляется в конце каждого хода.

Панель считает от коммита, на котором началась сессия, поэтому коммиты, сделанные Claude за сессию, тоже попадают в список. Файлы, у которых уже были незакоммиченные изменения до начала сессии, не показываются, если только Claude не правил их через Edit или Write. Вне git-репозитория панель показывает только файлы, изменённые Claude через Edit и Write, без счётчиков.

### Что мод делает в системе

Запускает в репозитории git-команды только на чтение (`rev-parse`, `status`, `diff --numstat`, `diff --name-status`, `ls-files --others`, `diff -- <файл>`) при старте сессии, по `/changes`, по «Обновить» и в конце каждого хода; читает новые неотслеживаемые файлы, чтобы посчитать в них строки. По **открыть**: выполняет `cmd /c code -g <файл>`, а без VS Code — `explorer.exe <файл>`. Добавляет команду `/changes`. Файлы не меняет.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.

### Установка

```
/plugin install changes-pane --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

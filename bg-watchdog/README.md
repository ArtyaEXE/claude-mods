# bg-watchdog

Shows background tasks and dev servers left running for over 20 minutes, with Stop / Snooze / Hide.

[English](#english) · [Русский](#русский)

## English

Background shells, monitors and dev servers started during a session tend to outlive their use and slow the machine down. This mod tracks the session's background tasks and, once a minute, the processes of common dev runtimes (node, python, bun, deno, java, ruby, php, dotnet, go) listening on a port. Only processes started during this session are shown, so servers you started yourself earlier are never touched. Anything running past 20 minutes gets a bar above the prompt: **Stop**, **Snooze 20 min** or **Hide**.

`/bg-tasks` opens a pane with everything tracked.

### What it touches

Once a minute runs a read-only PowerShell query (`Get-NetTCPConnection`, `Get-Process`, `Get-CimInstance Win32_Process`). Stops something **only when you press Stop**: a background task through `TaskStop`, a process through `taskkill /PID <pid> /T /F`. Adds the `/bg-tasks` command. The port scan works on Windows only.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.

### Install

```
/plugin install bg-watchdog --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

Показывает фоновые задачи и dev-серверы, которые висят дольше 20 минут, с кнопками «Остановить / Отложить / Скрыть».

Фоновые shell-команды, мониторы и dev-серверы, запущенные за сессию, часто переживают свою пользу и тормозят компьютер. Мод отслеживает фоновые задачи сессии и раз в минуту — процессы популярных dev-рантаймов (node, python, bun, deno, java, ruby, php, dotnet, go), слушающие порт. Показываются только процессы, запущенные во время этой сессии: серверы, которые ты поднял раньше сам, мод не трогает. Всё, что висит дольше 20 минут, получает плашку над полем ввода: **Остановить**, **Отложить 20 мин** или **Скрыть**.

`/bg-tasks` открывает панель со всем, что отслеживается.

### Что мод делает в системе

Раз в минуту выполняет PowerShell-запрос только на чтение (`Get-NetTCPConnection`, `Get-Process`, `Get-CimInstance Win32_Process`). Останавливает что-либо **только по нажатию «Остановить»**: фоновую задачу через `TaskStop`, процесс через `taskkill /PID <pid> /T /F`. Добавляет команду `/bg-tasks`. Сканирование портов работает только на Windows.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.

### Установка

```
/plugin install bg-watchdog --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

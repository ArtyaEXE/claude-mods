# turn-notify

A Windows notification when Claude finishes a long turn or waits for you while the terminal is in the background; Telegram when you are away.

[English](#english) · [Русский](#русский)

## English

You start a long task, switch to the browser and forget about it, while Claude has long been done or stuck on a permission prompt. This mod shows a Windows notification when:

- a turn that ran 30 seconds or more ends: how long it took and the first line of the answer;
- a turn ends on an API error, or the model refuses;
- Claude waits for you: a permission prompt, a question (`AskUserQuestion`), a plan to approve, an MCP server's dialog.

It only shows one while the terminal (Windows Terminal, VS Code, the desktop app: whichever window Claude Code runs in) is not in front, so it does not fire while you are watching. An interrupted turn and subagents' turns are not announced.

If notifications are turned off in Windows (Settings → System → Notifications, or just for Windows PowerShell), the mod says so once and, instead of a toast, flashes the terminal's taskbar button until you switch to it and plays the system notification sound.

With a Telegram bot set up, the same message also goes to Telegram once the keyboard and mouse have been idle for 5 minutes, so it reaches you when you have left the computer.

`/notify` shows the state, `/notify test` sends a test notification, `/notify off` and `/notify on` mute and unmute it for the session.

### What it touches

On each notification runs two short PowerShell scripts: one reads which window is in front, how long the input has been idle and whether Windows notifications are on (`GetForegroundWindow`, `GetLastInputInfo`, `Get-CimInstance Win32_Process`, two registry values under `HKCU\Software\Microsoft\Windows\CurrentVersion`), the other shows a toast under the Windows PowerShell app id or, with notifications off, flashes the taskbar button (`FlashWindowEx`) and plays a sound. The same check runs once at session start for the warning; whether it was given is kept in the mod's store. With Telegram set up, sends one `sendMessage` request to `api.telegram.org` per notification. Adds the `/notify` command. Notifications work on Windows only; elsewhere only Telegram does.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.
- `toast`: `unfocused` (default; only while the terminal is not in front), `always` or `never`.
- `minSeconds`: the shortest turn that is announced, 30 by default. A wait for permission or an answer is always announced.
- `awayMinutes`: after how many idle minutes Telegram is used, 5 by default.
- `telegramToken`: the bot token from @BotFather (secret: asked when the mod is installed, kept in secure storage).
- `telegramChatId`: your chat id with the bot (send the bot any message, then open `https://api.telegram.org/bot<token>/getUpdates`, or ask @userinfobot). Write to the bot first, or it cannot write to you.

### Install

```
/plugin install turn-notify --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

Уведомление Windows, когда Claude закончил долгий ход или ждёт вас, а терминал в фоне; Telegram, если вы отошли.

Запускаешь долгую задачу, переключаешься в браузер и забываешь, а Claude давно закончил или застрял на запросе разрешения. Мод показывает уведомление Windows, когда:

- закончился ход, который шёл 30 секунд и дольше: сколько он шёл и первая строка ответа;
- ход оборвался на ошибке API или модель отказалась отвечать;
- Claude ждёт вас: запрос разрешения, вопрос (`AskUserQuestion`), план на одобрение, диалог MCP-сервера.

Уведомление приходит, только если окно терминала (Windows Terminal, VS Code, десктопное приложение — в чём запущен Claude Code) не на переднем плане, поэтому, пока вы смотрите, оно не мешает. О прерванном ходе и ходах субагентов мод не сообщает.

Если уведомления в Windows выключены (Параметры → Система → Уведомления, целиком или только для Windows PowerShell), мод один раз об этом предупредит и вместо toast'а будет мигать кнопкой терминала на панели задач, пока вы на неё не переключитесь, и подавать системный звук уведомления.

Если настроен Telegram-бот, то же сообщение уходит и в Telegram, когда клавиатура и мышь простаивают 5 минут: так оно найдёт вас, даже если вы отошли от компьютера.

`/notify` показывает состояние, `/notify test` присылает тестовое уведомление, `/notify off` и `/notify on` выключают и включают уведомления до конца сессии.

### Что мод делает в системе

На каждое уведомление запускает два коротких PowerShell-скрипта: первый читает, какое окно на переднем плане, сколько простаивает ввод и включены ли уведомления Windows (`GetForegroundWindow`, `GetLastInputInfo`, `Get-CimInstance Win32_Process`, два значения реестра в `HKCU\Software\Microsoft\Windows\CurrentVersion`), второй показывает toast от имени Windows PowerShell или, если уведомления выключены, мигает кнопкой на панели задач (`FlashWindowEx`) и подаёт звук. Та же проверка один раз запускается при старте сессии ради предупреждения; было ли оно уже показано, мод хранит в своём хранилище. Если настроен Telegram, на каждое уведомление отправляет один запрос `sendMessage` в `api.telegram.org`. Добавляет команду `/notify`. Уведомления Windows работают только на Windows, в других системах — только Telegram.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.
- `toast`: `unfocused` (по умолчанию; только когда терминал не на переднем плане), `always` или `never`.
- `minSeconds`: самый короткий ход, о котором сообщать, по умолчанию 30 секунд. Об ожидании разрешения или ответа мод сообщает всегда.
- `awayMinutes`: через сколько минут простоя писать в Telegram, по умолчанию 5.
- `telegramToken`: токен бота от @BotFather (секрет: спрашивается при установке, хранится в защищённом хранилище).
- `telegramChatId`: ID вашего чата с ботом (напишите боту любое сообщение и откройте `https://api.telegram.org/bot<токен>/getUpdates` или спросите @userinfobot). Сначала напишите боту сами, иначе он не сможет написать вам.

### Установка

```
/plugin install turn-notify --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

# context-handoff

Moves a long session to a fresh one through a handoff file when the context grows past 350k / 600k / 800k tokens.

[English](#english) · [Русский](#русский)

## English

Past a few hundred thousand tokens an agent starts to drift. At 350k, 600k and 800k this mod shows a bar above the prompt: **Move**, **Later** or **Not in this session**. Move asks the agent to write `.handoff/handoff-<date>.md` in the project root (goal, what is done, where it stopped, decisions, pitfalls, next steps), then runs `/clear` and asks the fresh agent to read the file and continue. If the file does not appear, nothing is cleared.

`/handoff` does the same on demand.

### What it touches

Reads the session's context size. On Move it submits two prompts and runs `/clear`; it never clears the chat unless the handoff file exists. Adds the `/handoff` command.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.

### Install

```
/plugin install context-handoff --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

Переносит длинную сессию в чистую через handoff-файл, когда контекст перерастает 350k / 600k / 800k токенов.

После нескольких сотен тысяч токенов агент начинает «плыть». На 350k, 600k и 800k мод показывает плашку над полем ввода: **Переехать**, **Позже** или **Не предлагать в этой сессии**. «Переехать» просит агента записать `.handoff/handoff-<дата>.md` в корне проекта (цель, что сделано, где остановились, решения, грабли, следующие шаги), затем выполняет `/clear` и просит нового агента прочитать файл и продолжить. Если файл не появился, чат не очищается.

`/handoff` делает то же самое вручную.

### Что мод делает в системе

Читает размер контекста сессии. По «Переехать» отправляет два промпта и выполняет `/clear`; без handoff-файла чат не очищает. Добавляет команду `/handoff`.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.

### Установка

```
/plugin install context-handoff --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

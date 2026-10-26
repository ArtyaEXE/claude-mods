# danger-guard

A safety net for auto mode: git commands that discard work run after a snapshot you can restore; irreversible ones wait for your yes.

[English](#english) · [Русский](#русский)

## English

In auto mode Claude runs commands without asking, and a few of them cannot be taken back. This mod sorts them in two:

**Commands that discard work in git run after a snapshot**, with no question: `git reset --hard`, `git checkout -- .` / `-f`, `git restore`, `git switch --discard-changes`, `git clean -f`, `git stash drop` / `clear`, `git branch -D`. Before such a command the whole working tree, untracked files included, is saved as a commit under `refs/danger-guard/` (through an index of its own: your index, branches and stashes are untouched); a force-deleted branch keeps its tip, a dropped stash entry its commit. Claude is told how to bring files back; `/guard` lists the snapshots with **Restore** and **Delete**.

**Irreversible commands wait for your answer** in Claude Code's own question dialog: **Cancel** (first, so a dialog that closes by itself never means yes), **Run**, **Run these this session**:

- `git push --force` / `-f` / `+refspec` (not `--force-with-lease`), deleting a remote branch or tag, `git filter-branch` / `filter-repo`;
- a recursive delete (`rm -r`, `Remove-Item -Recurse`, `rd /s`) outside the project and the temp folders, or of a drive root or the home folder;
- `DROP TABLE` / `DATABASE` / `SCHEMA`, `TRUNCATE TABLE` through a database client (`psql`, `mysql`, `sqlite3`, `sqlcmd`...);
- `format`, `diskpart`, `Clear-Disk`; `terraform destroy`, `kubectl delete`, `docker system prune`, `docker volume rm`; `npm` / `pnpm` / `yarn` / `cargo publish`, `gh repo delete`; `shutdown`, `Restart-Computer`.

The command's own `cd` and git's `-C` are followed, so a snapshot is taken in the repository the command acts on. With no one to ask (`claude -p`) an irreversible command is not run.

### What it touches

Reads every Bash and PowerShell command before it runs. Before a git command that discards work: runs `git read-tree`, `git add -A`, `git write-tree`, `git commit-tree` with `GIT_INDEX_FILE` pointing at `.git/danger-guard.index`, and `git update-ref refs/danger-guard/...`. Asks you through the question dialog before an irreversible command. On **Restore**: `git restore --source=<snapshot> --worktree -- .`, `git branch <name> <sha>` or `git stash store`; on **Delete**: `git update-ref -d`. Adds the `/guard` command.

### Settings (`/config`)

- `language`: `auto` (default; follows `LANG`, else the Windows UI language or regional format), `ru` or `en`.
- `irreversible`: `ask` (default) or `deny`: never run them, and tell Claude to ask you to run them yourself.

### Install

```
/plugin install danger-guard --marketplace ArtyaEXE/claude-mods
```

Part of [claude-mods](https://github.com/ArtyaEXE/claude-mods). MIT license.

---

## Русский

Страховка для авто-режима: git-команды, выбрасывающие работу, идут после снимка, который можно восстановить; необратимые ждут вашего «да».

В авто-режиме Claude запускает команды не спрашивая, и некоторые из них назад не отыграть. Мод делит их на две группы:

**Git-команды, выбрасывающие работу, идут после снимка**, без вопросов: `git reset --hard`, `git checkout -- .` / `-f`, `git restore`, `git switch --discard-changes`, `git clean -f`, `git stash drop` / `clear`, `git branch -D`. Перед такой командой всё рабочее дерево, включая неотслеживаемые файлы, сохраняется коммитом в `refs/danger-guard/` (через отдельный индекс: ваш индекс, ветки и stash не трогаются); у принудительно удалённой ветки сохраняется её вершина, у удалённой записи stash — её коммит. Claude получает подсказку, как вернуть файлы; `/guard` показывает снимки с кнопками **Восстановить** и **Удалить**.

**Необратимые команды ждут вашего ответа** в штатном окне вопроса Claude Code: **Отменить** (первым, чтобы закрывшийся сам диалог никогда не означал «да»), **Выполнить**, **Выполнять в этой сессии**:

- `git push --force` / `-f` / `+refspec` (но не `--force-with-lease`), удаление ветки или тега на remote, `git filter-branch` / `filter-repo`;
- рекурсивное удаление (`rm -r`, `Remove-Item -Recurse`, `rd /s`) за пределами проекта и временных папок, а также корня диска или домашней папки;
- `DROP TABLE` / `DATABASE` / `SCHEMA`, `TRUNCATE TABLE` через клиент базы (`psql`, `mysql`, `sqlite3`, `sqlcmd`...);
- `format`, `diskpart`, `Clear-Disk`; `terraform destroy`, `kubectl delete`, `docker system prune`, `docker volume rm`; `npm` / `pnpm` / `yarn` / `cargo publish`, `gh repo delete`; `shutdown`, `Restart-Computer`.

Мод учитывает `cd` внутри самой команды и `-C` у git, поэтому снимок делается в том репозитории, где команда работает. Если спросить некого (`claude -p`), необратимая команда не запускается.

### Что мод делает в системе

Читает каждую команду Bash и PowerShell до запуска. Перед git-командой, выбрасывающей работу, выполняет `git read-tree`, `git add -A`, `git write-tree`, `git commit-tree` с `GIT_INDEX_FILE`, указывающим на `.git/danger-guard.index`, и `git update-ref refs/danger-guard/...`. Перед необратимой командой спрашивает вас через окно вопроса. По **Восстановить**: `git restore --source=<снимок> --worktree -- .`, `git branch <имя> <sha>` или `git stash store`; по **Удалить**: `git update-ref -d`. Добавляет команду `/guard`.

### Настройки (`/config`)

- `language`: `auto` (по умолчанию; по `LANG`, иначе по языку интерфейса или региональному формату Windows), `ru` или `en`.
- `irreversible`: `ask` (по умолчанию) или `deny`: не запускать их никогда и просить Claude, чтобы он предложил вам выполнить их самим.

### Установка

```
/plugin install danger-guard --marketplace ArtyaEXE/claude-mods
```

Часть [claude-mods](https://github.com/ArtyaEXE/claude-mods). Лицензия MIT.

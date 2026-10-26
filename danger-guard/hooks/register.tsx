import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'

type Lang = 'ru' | 'en'

// `ru` / `en` as set; `auto`: the locale variables first, then Windows' UI language or regional format.
async function resolveLang($: EngineInterface, setting: unknown): Promise<Lang> {
  if (setting === 'ru' || setting === 'en') return setting
  const env = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  if (env) return env.toLowerCase().startsWith('ru') ? 'ru' : 'en'
  try {
    const ran = await $.process.run(
      ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', '(Get-UICulture).Name; (Get-Culture).Name'],
      { timeoutMs: 10_000 },
    )
    if (ran.exitCode === 0 && /^ru\b/im.test(ran.stdout)) return 'ru'
  } catch {
    // Not Windows: English.
  }

  return 'en'
}

const PANE = 'danger-guard'
const snapshots = atom({ plugin: 'danger-guard', key: 'snapshots' } as const, [] as Snapshot[], { shape: 'snapshots-1' })

// What a command would do that cannot be taken back, and how the mod answers it.
type Verdict =
  | { kind: 'snapshot'; what: 'worktree' }
  | { kind: 'snapshot'; what: 'branch'; names: string[] }
  | { kind: 'snapshot'; what: 'stash'; entries: string[] }
  | { kind: 'ask'; rule: Rule }

type Rule = 'forcePush' | 'remoteDelete' | 'rewrite' | 'removeOutside' | 'sql' | 'disk' | 'cloud' | 'publish' | 'power'

const STRINGS = {
  ru: {
    rules: {
      forcePush: 'принудительный push перепишет историю на remote',
      remoteDelete: 'удаление ветки или тега на remote',
      rewrite: 'переписывание всей истории репозитория',
      removeOutside: 'рекурсивное удаление за пределами проекта (или корня диска, домашней папки)',
      sql: 'DROP / TRUNCATE в базе данных',
      disk: 'форматирование или разметка диска',
      cloud: 'удаление облачной или контейнерной инфраструктуры',
      publish: 'публикация пакета или удаление репозитория',
      power: 'выключение или перезагрузка компьютера',
    } as Record<Rule, string>,
    question: (why: string, command: string) => `Claude хочет выполнить необратимое — ${why}:\n\n${command}\n\nВыполнить?`,
    run: 'Выполнить',
    runAlways: 'Выполнять в этой сессии',
    cancel: 'Отменить',
    header: 'Опасно',
    saved: (command: string) => `danger-guard: сохранил снимок перед ${command}. Вернуть: /guard`,
    command: 'Снимки, сделанные перед опасными командами, и их восстановление',
    paneTitle: 'Снимки danger-guard',
    opened: 'Открыл панель снимков.',
    empty: 'Снимков нет: опасных git-команд в этом репозитории ещё не было.',
    noGit: 'Не git-репозиторий: снимков здесь не бывает.',
    kinds: { worktree: 'файлы', branch: 'ветка', stash: 'stash' } as Record<Snapshot['kind'], string>,
    restore: 'Восстановить',
    drop: 'Удалить',
    confirm: (s: Snapshot) =>
      s.kind === 'worktree'
        ? `Вернуть файлы к снимку перед «${s.command}»? Текущие изменения в этих файлах будут перезаписаны.`
        : s.kind === 'branch'
          ? `Вернуть ветку ${s.name}?`
          : 'Вернуть удалённую запись stash?',
    yes: 'Да',
    no: 'Нет',
    restored: 'danger-guard: восстановлено',
    failed: (why: string) => `danger-guard: не получилось: ${why}`,
  },
  en: {
    rules: {
      forcePush: 'a force push rewrites history on the remote',
      remoteDelete: 'deleting a branch or tag on the remote',
      rewrite: "rewriting the whole repository's history",
      removeOutside: 'a recursive delete outside the project (or of a drive root or the home folder)',
      sql: 'DROP / TRUNCATE in a database',
      disk: 'formatting or partitioning a disk',
      cloud: 'deleting cloud or container infrastructure',
      publish: 'publishing a package or deleting a repository',
      power: 'shutting down or restarting the computer',
    } as Record<Rule, string>,
    question: (why: string, command: string) => `Claude wants to run something irreversible — ${why}:\n\n${command}\n\nRun it?`,
    run: 'Run',
    runAlways: 'Run these this session',
    cancel: 'Cancel',
    header: 'Danger',
    saved: (command: string) => `danger-guard: saved a snapshot before ${command}. To restore: /guard`,
    command: 'Snapshots taken before dangerous commands, and restoring them',
    paneTitle: 'danger-guard snapshots',
    opened: 'Opened the snapshots pane.',
    empty: 'No snapshots: no dangerous git command has run in this repository yet.',
    noGit: 'Not a git repository: there are no snapshots here.',
    kinds: { worktree: 'files', branch: 'branch', stash: 'stash' } as Record<Snapshot['kind'], string>,
    restore: 'Restore',
    drop: 'Delete',
    confirm: (s: Snapshot) =>
      s.kind === 'worktree'
        ? `Bring the files back to the snapshot before "${s.command}"? Current changes to those files are overwritten.`
        : s.kind === 'branch'
          ? `Bring back branch ${s.name}?`
          : 'Bring back the dropped stash entry?',
    yes: 'Yes',
    no: 'No',
    restored: 'danger-guard: restored',
    failed: (why: string) => `danger-guard: that did not work: ${why}`,
  },
}

// What the model is told, in English like every tool result.
const FOR_MODEL = {
  declined: (why: string) =>
    `Not run: danger-guard asked the user, who declined (${why}). Do not retry it or work around it; ask the user how they want to proceed.`,
  denied: (why: string) =>
    `Not run: danger-guard does not let this run (${why}). If it is really needed, ask the user to run it themselves.`,
  saved: (sha: string) =>
    `danger-guard: before this command the working tree (untracked files included) was saved as commit ${sha.slice(0, 12)}. ` +
    `To bring files back: \`git restore --source=${sha.slice(0, 12)} --worktree -- <paths>\`.`,
  savedRefs: (what: string) => `danger-guard: ${what} saved before this command; the user can bring it back with /guard.`,
}

// The words of each stage of a command line: split at ; & | newlines and brackets outside quotes, quotes removed.
function stagesOf(command: string): string[][] {
  const stages: string[][] = []
  let words: string[] = []
  let word = ''
  let has = false
  let quote = ''
  const endWord = () => {
    if (has) words.push(word)
    word = ''
    has = false
  }
  const endStage = () => {
    endWord()
    if (words.length > 0) stages.push(words)
    words = []
  }
  for (let i = 0; i < command.length; i++) {
    const ch = command.charAt(i)
    if (quote !== '') {
      if (ch === quote) quote = ''
      else word += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (ch === '#' && !has) {
      // A comment: to the end of the line.
      const end = command.indexOf('\n', i)
      i = end === -1 ? command.length : end - 1
    } else if (ch === '\n' || ';&|(){}'.includes(ch)) {
      endStage()
    } else if (/\s/.test(ch)) {
      endWord()
    } else {
      word += ch
      has = true
    }
  }
  endStage()

  return stages
}

// The command word without a path or .exe, lower-cased; leading `sudo`, `env`, `VAR=x` and `&` skipped.
function head(words: string[]): { name: string; args: string[] } {
  let i = 0
  while (i < words.length && (/^(sudo|env|command|exec|&)$/i.test(words[i] ?? '') || /^[A-Za-z_]\w*=/.test(words[i] ?? ''))) i++
  const name = (words[i] ?? '').replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase()

  return { name, args: words.slice(i + 1) }
}

const has = (args: string[], ...flags: string[]) => args.some(a => flags.includes(a))
const shortFlag = (args: string[], letter: string) => args.some(a => /^-[A-Za-z]+$/.test(a) && a.includes(letter))

function gitVerdict(args: string[]): Verdict | null {
  // Global options before the subcommand.
  let i = 0
  while (i < args.length && (args[i] ?? '').startsWith('-')) i += /^-[Cc]$/.test(args[i] ?? '') ? 2 : 1
  const sub = args[i] ?? ''
  const rest = args.slice(i + 1)
  const plain = rest.filter(a => !a.startsWith('-'))

  switch (sub) {
    case 'reset':
      return has(rest, '--hard', '--merge') ? { kind: 'snapshot', what: 'worktree' } : null
    case 'checkout':
      return has(rest, '-f', '--force', '--', '.') ? { kind: 'snapshot', what: 'worktree' } : null
    case 'switch':
      return has(rest, '-f', '--force', '--discard-changes') ? { kind: 'snapshot', what: 'worktree' } : null
    case 'restore':
      return !has(rest, '--staged', '-S') || has(rest, '--worktree', '-W') ? { kind: 'snapshot', what: 'worktree' } : null
    case 'clean':
      return (shortFlag(rest, 'f') || has(rest, '--force')) && !shortFlag(rest, 'n') && !has(rest, '--dry-run')
        ? { kind: 'snapshot', what: 'worktree' }
        : null
    case 'stash':
      if (rest[0] === 'drop') return { kind: 'snapshot', what: 'stash', entries: [rest.find((a, k) => k > 0 && !a.startsWith('-')) ?? 'stash@{0}'] }
      if (rest[0] === 'clear') return { kind: 'snapshot', what: 'stash', entries: [] }

      return null
    case 'branch': {
      const force = has(rest, '-D') || (has(rest, '--delete', '-d') && has(rest, '--force', '-f')) || rest.some(a => /^-[a-z]*D/.test(a))
      return force && plain.length > 0 ? { kind: 'snapshot', what: 'branch', names: plain } : null
    }
    case 'push': {
      const lease = rest.some(a => a.startsWith('--force-with-lease') || a === '--force-if-includes')
      if (has(rest, '--force', '--mirror') || shortFlag(rest, 'f') || (!lease && plain.some(a => a.startsWith('+')))) return { kind: 'ask', rule: 'forcePush' }
      if (has(rest, '--delete', '-d', '--prune') || plain.some(a => a.startsWith(':'))) return { kind: 'ask', rule: 'remoteDelete' }

      return null
    }
    case 'filter-branch':
    case 'filter-repo':
      return { kind: 'ask', rule: 'rewrite' }
    default:
      return null
  }
}

type Places = { root: string; cwd: string; home: string; temp: string[] }

// A path in one spelling: forward slashes, lower case, /c/... as c:/..., `.` and `..` resolved against cwd.
function normalize(path: string, p: Places): string | undefined {
  let s = path
    .replace(/^~(?=[\\/]|$)/, p.home)
    .replace(/^\$(?:env:)?(?:HOME|USERPROFILE)\b/i, p.home)
    .replace(/^%USERPROFILE%/i, p.home)
  if (/^[$%]/.test(s)) return undefined
  s = s.replace(/\\/g, '/').toLowerCase()
  s = s.replace(/^\/([a-z])(?=\/|$)/, '$1:')
  if (!/^[a-z]:/.test(s) && !s.startsWith('/')) s = `${p.cwd}/${s}`
  const parts: string[] = []
  for (const part of s.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  const out = parts.join('/')

  return /^[a-z]:$/.test(out) ? `${out}/` : out
}

const inside = (path: string, dir: string) => dir !== '' && (path === dir || path.startsWith(`${dir.replace(/\/$/, '')}/`))

// A recursive delete is dangerous outside the project and the temp folders, and always at a drive root or the home folder.
function dangerousTarget(target: string, p: Places): boolean {
  // `dir/*` is `dir`'s content: judged as `dir` (so `/*` is the root itself).
  const path = normalize(target.replace(/([\\/])\.?\*$/, '$1'), p)
  if (path === undefined) return false
  if (/^[a-z]:\/?$/.test(path) || path === '' || path === p.home) return true
  if (p.temp.some(t => inside(path, t))) return false

  return !inside(path, p.root)
}

function removeVerdict(name: string, args: string[], p: Places): Verdict | null {
  let recursive = false
  let targets: string[] = []
  if (name === 'rm' && (shortFlag(args, 'r') || shortFlag(args, 'R') || has(args, '--recursive'))) {
    recursive = true
    targets = args.filter(a => !a.startsWith('-'))
  } else if (/^(remove-item|ri|rm|del|erase|rmdir|rd)$/.test(name) && args.some(a => /^-r(ec(urse?)?)?$/i.test(a))) {
    recursive = true
    targets = args.filter((a, k) => !a.startsWith('-') && !/^-(filter|include|exclude)$/i.test(args[k - 1] ?? ''))
  } else if (/^(rd|rmdir|del)$/.test(name) && args.some(a => /^\/s$/i.test(a))) {
    recursive = true
    targets = args.filter(a => !a.startsWith('/') || /^\/[^a-z]|^\/[a-z]\//i.test(a))
  }

  return recursive && targets.some(t => dangerousTarget(t, p)) ? { kind: 'ask', rule: 'removeOutside' } : null
}

// Database clients whose command line can carry SQL.
const DB_CLIENT = /^(psql|mysql|mariadb|sqlite3|sqlcmd|invoke-sqlcmd|duckdb|clickhouse-client|cockroach|mongosh)$/

// The first thing in the command that cannot be taken back, with how to answer it and the folder it runs in
// (after the command's own `cd`, or git's -C); null when there is none.
function verdictOf(command: string, p: Places): { verdict: Verdict; cwd: string } | null {
  let dir = p.cwd
  for (const words of stagesOf(command)) {
    const { name, args } = head(words)
    if (/^(cd|chdir|pushd|set-location|sl)$/.test(name)) {
      const to = args.find(a => !a.startsWith('-'))
      if (to !== undefined) dir = normalize(to, { ...p, cwd: dir }) ?? dir
      continue
    }
    const here = { ...p, cwd: dir }
    const line = words.join(' ').toLowerCase()
    const dashC = name === 'git' ? args.indexOf('-C') : -1
    const verdict =
      name === 'git'
        ? gitVerdict(args)
        : removeVerdict(name, args, here) ??
          (DB_CLIENT.test(name) && /\bdrop\s+(table|database|schema)\b|\btruncate\s+table\b/.test(line)
            ? { kind: 'ask' as const, rule: 'sql' as const }
            : null) ??
          ((name === 'format' && /^[a-z]:$/i.test(args[0] ?? '')) || name === 'diskpart' || name.startsWith('mkfs') || /^(format-volume|clear-disk|initialize-disk)$/.test(name)
            ? { kind: 'ask' as const, rule: 'disk' as const }
            : null) ??
          ((name === 'terraform' && (args[0] === 'destroy' || (args[0] === 'apply' && has(args, '-destroy')))) ||
          (name === 'kubectl' && args[0] === 'delete') ||
          (name === 'docker' && ((args[0] === 'system' && args[1] === 'prune') || (args[0] === 'volume' && /^(rm|prune)$/.test(args[1] ?? ''))))
            ? { kind: 'ask' as const, rule: 'cloud' as const }
            : null) ??
          ((/^(npm|pnpm|yarn|cargo)$/.test(name) && args[0] === 'publish') || (name === 'gh' && args[0] === 'repo' && args[1] === 'delete')
            ? { kind: 'ask' as const, rule: 'publish' as const }
            : null) ??
          (/^(shutdown|stop-computer|restart-computer)$/.test(name) ? { kind: 'ask' as const, rule: 'power' as const } : null)
    if (verdict !== null) {
      const gitDir = dashC === -1 ? undefined : normalize(args[dashC + 1] ?? '.', here)

      return { verdict, cwd: gitDir ?? dir }
    }
  }

  return null
}

let lang: Lang = 'en'
let mode: 'ask' | 'deny' = 'ask'
// Rules the person allowed for the rest of the session.
const allowed = new Set<Rule>()

const IDENTITY = { GIT_AUTHOR_NAME: 'danger-guard', GIT_AUTHOR_EMAIL: 'danger-guard@localhost', GIT_COMMITTER_NAME: 'danger-guard', GIT_COMMITTER_EMAIL: 'danger-guard@localhost' }

// git's trimmed output, undefined when it failed; in `cwd` when given, else the session's folder.
async function git($: EngineInterface, args: string[], env?: Record<string, string>, cwd?: string): Promise<string | undefined> {
  try {
    const ran = await $.process.run(['git', ...args], { env, cwd, timeoutMs: 60_000 })

    return ran.exitCode === 0 ? ran.stdout.trim() : undefined
  } catch {
    return undefined
  }
}

const stamp = () => String(Date.now())
const short = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// Saves what the command would take away; the model note to add after it runs, '' when nothing was saved.
async function save($: EngineInterface, v: Verdict & { kind: 'snapshot' }, command: string, cwd: string): Promise<string> {
  const subject = `danger-guard: ${short(command.replace(/\s+/g, ' '), 200)}`
  if (v.what === 'worktree') {
    // The whole working tree, untracked files included, through an index of its own: the real index is untouched.
    const index = await git($, ['rev-parse', '--git-path', 'danger-guard.index'], undefined, cwd)
    if (index === undefined) return ''
    const env = { ...IDENTITY, GIT_INDEX_FILE: index }
    const parent = await git($, ['rev-parse', '--verify', '-q', 'HEAD'], undefined, cwd)
    if ((await git($, parent === undefined ? ['read-tree', '--empty'] : ['read-tree', 'HEAD'], env, cwd)) === undefined) return ''
    if ((await git($, ['add', '-A'], env, cwd)) === undefined) return ''
    const tree = await git($, ['write-tree'], env, cwd)
    if (tree === undefined) return ''
    const sha = await git($, ['commit-tree', tree, ...(parent === undefined ? [] : ['-p', parent]), '-m', subject], env, cwd)
    if (sha === undefined || (await git($, ['update-ref', `refs/danger-guard/worktree/${stamp()}`, sha], undefined, cwd)) === undefined) return ''

    return FOR_MODEL.saved(sha)
  }
  if (v.what === 'branch') {
    let saved = 0
    for (const name of v.names) {
      const sha = await git($, ['rev-parse', '--verify', '-q', `refs/heads/${name}`], undefined, cwd)
      if (sha !== undefined && (await git($, ['update-ref', '-m', subject, `refs/danger-guard/branch/${stamp()}/${name}`, sha], undefined, cwd)) !== undefined) saved++
    }

    return saved > 0 ? FOR_MODEL.savedRefs(`the tip of ${v.names.join(', ')}`) : ''
  }
  const entries = v.entries.length > 0 ? v.entries : ((await git($, ['stash', 'list', '--format=%gd'], undefined, cwd)) ?? '').split('\n').filter(s => s !== '')
  let saved = 0
  for (const entry of entries) {
    const sha = await git($, ['rev-parse', '--verify', '-q', entry], undefined, cwd)
    if (sha !== undefined && (await git($, ['update-ref', '-m', subject, `refs/danger-guard/stash/${stamp()}-${saved}`, sha], undefined, cwd)) !== undefined) saved++
  }

  return saved > 0 ? FOR_MODEL.savedRefs(saved === 1 ? 'the stash entry' : `${saved} stash entries`) : ''
}

const folder = (s: string | undefined) => (s ?? '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()

// The home and temp folders, read once a session; the project and working folders, at each call.
let home = ''
let temp: string[] = []

async function readFolders($: EngineInterface) {
  home = folder((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')))
  temp = [folder(await $.env.get('TEMP')), folder(await $.env.get('TMP')), '/tmp', 'c:/windows/temp'].filter(t => t !== '')
}

async function places($: EngineInterface): Promise<Places> {
  return { root: folder(await $.session.root()), cwd: folder(await $.session.cwd()), home, temp }
}

async function listSnapshots($: EngineInterface) {
  const out = await git($, ['for-each-ref', 'refs/danger-guard', '--sort=-refname', '--format=%(refname)%09%(objectname)%09%(subject)'])
  const list: Snapshot[] = []
  for (const line of (out ?? '').split('\n').filter(l => l !== '')) {
    const [ref = '', sha = '', subject = ''] = line.split('\t')
    const m = /^refs\/danger-guard\/(worktree|branch|stash)\/(\d+)(?:-\d+)?(?:\/(.+))?$/.exec(ref)
    if (m === null) continue
    const kind = m[1] as Snapshot['kind']
    // A branch or stash ref keeps the command in its reflog message; its subject is the commit's own.
    const command = kind === 'worktree' ? subject.replace(/^danger-guard: /, '') : ''
    list.push({ ref, sha, at: Math.floor(Number(m[2]) / 1000), kind, command, name: m[3] ?? '' })
  }
  await update($, snapshots, () => list)
}

async function restore($: EngineInterface, s: Snapshot) {
  const L = STRINGS[lang]
  let answer = ''
  try {
    answer = await $.ui.ask(L.confirm(s), { options: [L.yes, L.no], header: L.header })
  } catch {
    return
  }
  if (answer !== L.yes) return
  const top = await git($, ['rev-parse', '--show-toplevel'])
  const ok =
    s.kind === 'worktree'
      ? await git($, ['-C', top ?? '.', 'restore', `--source=${s.sha}`, '--worktree', '--', '.'])
      : s.kind === 'branch'
        ? await git($, ['branch', s.name, s.sha])
        : await git($, ['stash', 'store', '-m', 'danger-guard restore', s.sha])
  $.ui.toast(ok === undefined ? L.failed(s.kind === 'branch' ? `git branch ${s.name}` : 'git') : L.restored)
}

async function drop($: EngineInterface, s: Snapshot) {
  await git($, ['update-ref', '-d', s.ref])
  await listSnapshots($)
}

const when = (at: number) => {
  const d = new Date(at * 1000)
  const two = (n: number) => String(n).padStart(2, '0')

  return `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
}

export const register: Register = (on, options) => {
  const o = options as { language?: unknown; irreversible?: unknown }
  mode = o.irreversible === 'deny' ? 'deny' : 'ask'

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await resolveLang($, o.language)
    allowed.clear()
    await readFolders($)
    await $.command.register({ name: 'guard', description: STRINGS[lang].command })

    return started
  })

  on('command.run', { command: 'guard' }, async $ => {
    await listSnapshots($)
    await $.ui.open({ id: PANE, title: STRINGS[lang].paneTitle, focus: true, closeOnEscape: true })

    return { text: STRINGS[lang].opened }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Bash' && e.tool !== 'PowerShell') return next(e)
    const command = String((e as { command?: unknown }).command ?? '')
    const found = verdictOf(command, await places($))
    if (found === null) return next(e)
    const v = found.verdict
    const L = STRINGS[lang]

    if (v.kind === 'ask') {
      const why = L.rules[v.rule]
      if (!allowed.has(v.rule)) {
        if (mode === 'deny') return { deny: FOR_MODEL.denied(STRINGS.en.rules[v.rule]) }
        let answer = ''
        try {
          answer = await $.ui.ask(L.question(why, short(command, 400)), { options: [L.cancel, L.run, L.runAlways], header: L.header })
        } catch {
          // Dismissed, or nobody to ask (claude -p): not run.
        }
        if (answer === L.runAlways) allowed.add(v.rule)
        else if (answer !== L.run) return { deny: FOR_MODEL.declined(STRINGS.en.rules[v.rule]) }
      }

      return next(e)
    }

    const note = await save($, v, command, found.cwd)
    if (note !== '') $.ui.toast(L.saved(short(command, 60)))
    const ran = await next(e)
    if (note === '' || ran.deny !== undefined) return ran

    return { ...ran, context: [...(ran.context ?? []), note] }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const L = STRINGS[lang]
    const list = await read($, snapshots)
    const width = Math.max(20, e.props.bodyColumns - 40)

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>{L.empty}</Text>}
        {list.map(s => (
          <Box flexDirection="row" gap={1}>
            <Text dimColor>{when(s.at)}</Text>
            <Text color="yellow">{L.kinds[s.kind]}</Text>
            <Text wrap="truncate">{short(s.kind === 'branch' ? s.name : s.kind === 'worktree' ? s.command : s.sha.slice(0, 12), width)}</Text>
            <Button key={`restore:${s.ref}`} plain label={L.restore} onPress={() => restore($, s)} />
            <Button key={`drop:${s.ref}`} plain dimColor label={L.drop} onPress={() => drop($, s)} />
          </Box>
        ))}
      </Box>
    )
  })
}

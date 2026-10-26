import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Baseline, Changed } from '../types'

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

const PANE = 'changes-pane'
// git's empty tree: the base of a repository with no commit yet.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
// Lines of a diff drawn at most, in whole hunks where they fit.
const DIFF_LINES = 400

const files = atom({ plugin: 'changes-pane', key: 'files' } as const, [] as Changed[], { shape: 'files-1' })
const selected = atom({ plugin: 'changes-pane', key: 'selected' } as const, '')
const diff = atom({ plugin: 'changes-pane', key: 'diff' } as const, '')
const baseline = atom(
  { plugin: 'changes-pane', key: 'baseline' } as const,
  { sessionId: '', root: '', base: '', dirty: [], touched: [] } as Baseline,
  { shape: 'baseline-1' },
)

const STRINGS = {
  ru: {
    command: 'Файлы, изменённые за эту сессию, с диффом',
    title: 'Изменения сессии',
    opened: 'Открыл панель изменений.',
    files: (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'файл' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'файла' : 'файлов'}`,
    since: 'с начала сессии',
    empty: 'За эту сессию файлы не менялись.',
    noGit: 'Не git-репозиторий: показываю только файлы, которые Claude правил через Edit и Write.',
    refresh: 'Обновить',
    open: 'открыть',
    binary: 'двоичный',
    outside: 'вне git',
    cut: (n: number) => `…показаны первые ${n} строк диффа`,
    noDiff: 'Диффа нет: файл удалён, двоичный или вне git.',
    before: (n: number) => `Изменено ещё до начала сессии: ${n}`,
    openFailed: (path: string) => `changes-pane: не смог открыть ${path}`,
  },
  en: {
    command: 'Files changed in this session, with their diff',
    title: 'Session changes',
    opened: 'Opened the changes pane.',
    files: (n: number) => `${n} file${n === 1 ? '' : 's'}`,
    since: 'since the session started',
    empty: 'No files have changed in this session.',
    noGit: 'Not a git repository: only the files Claude changed with Edit and Write are listed.',
    refresh: 'Refresh',
    open: 'open',
    binary: 'binary',
    outside: 'outside git',
    cut: (n: number) => `…the first ${n} lines of the diff`,
    noDiff: 'No diff: the file is deleted, binary or outside git.',
    before: (n: number) => `Changed before the session started: ${n}`,
    openFailed: (path: string) => `changes-pane: could not open ${path}`,
  },
}

let lang: Lang = 'en'
// The repository root with forward slashes, '' outside git; the commit the session started on.
let root = ''
let base = EMPTY_TREE
// Files changed before the session started: left out unless Claude touched them.
let dirtyAtStart = new Set<string>()
// Files Claude changed through Edit, Write or NotebookEdit, as absolute paths with forward slashes.
const touched = new Set<string>()
let reading: Promise<void> | undefined
let again = false

const slash = (p: string) => p.replace(/\\/g, '/')
const key = (p: string) => slash(p).toLowerCase()


// Relative to the repository root when inside it, else the absolute path.
const relative = (abs: string) => {
  const a = slash(abs)

  return root !== '' && key(a).startsWith(`${key(root)}/`) ? a.slice(root.length + 1) : a
}

async function git($: EngineInterface, args: string[]): Promise<string | undefined> {
  try {
    const ran = await $.process.run(['git', '-c', 'core.quotepath=false', ...args], { cwd: root || undefined, timeoutMs: 20_000 })

    return ran.exitCode === 0 ? ran.stdout : undefined
  } catch {
    return undefined
  }
}

const zsplit = (out: string | undefined) => (out ?? '').split('\0').filter(s => s !== '')

// What the session started from: kept in the session's state, so a reload of the mod keeps the
// session's own start instead of taking the files changed so far for older ones.
async function start($: EngineInterface) {
  const sessionId = await $.session.id()
  const kept = await read($, baseline)
  if (kept.sessionId === sessionId) {
    root = kept.root
    base = kept.base
    dirtyAtStart = new Set(kept.dirty)
    touched.clear()
    for (const t of kept.touched) touched.add(t)

    return
  }

  touched.clear()
  root = ''
  base = EMPTY_TREE
  dirtyAtStart = new Set()
  const top = await git($, ['rev-parse', '--show-toplevel'])
  if (top !== undefined) {
    root = slash(top.trim())
    base = (await git($, ['rev-parse', 'HEAD']))?.trim() || EMPTY_TREE
    // `XY path` entries; a rename carries its old path as the next entry.
    const entries = zsplit(await git($, ['status', '--porcelain', '-z', '--untracked-files=all']))
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i] ?? ''
      dirtyAtStart.add(key(entry.slice(3)))
      if (entry[0] === 'R' || entry[0] === 'C') i++
    }
  }
  await update($, baseline, () => ({ sessionId, root, base, dirty: [...dirtyAtStart], touched: [] }))
}

async function touch($: EngineInterface, path: string) {
  const k = key(path)
  if (touched.has(k)) return
  touched.add(k)
  await update($, baseline, b => ({ ...b, touched: [...touched] }))
}

async function countLines($: EngineInterface, abs: string): Promise<number | null> {
  try {
    const text = await $.fs.read(abs)
    if (text.includes('\0')) return null

    return text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  } catch {
    return null
  }
}

// The changed files now: git's view since the session's commit, plus what Claude touched outside git.
// A file dirty before the session and not touched by Claude since is marked as changed before.
async function readChanges($: EngineInterface) {
  const list: Changed[] = []
  const seen = new Set<string>()
  const before = (rel: string) => dirtyAtStart.has(key(rel)) && !touched.has(key(`${root}/${rel}`))

  if (root !== '') {
    const counts = new Map<string, [number | null, number | null]>()
    const numstat = zsplit(await git($, ['diff', '--numstat', '-z', '-M', base]))
    for (let i = 0; i < numstat.length; i++) {
      const [added, removed, path] = (numstat[i] ?? '').split('\t')
      const n = (s: string | undefined) => (s === undefined || s === '-' ? null : Number(s))
      if (path === '') {
        // A rename: the old path, then the new one, follow as entries of their own.
        counts.set(numstat[i + 2] ?? '', [n(added), n(removed)])
        i += 2
      } else if (path !== undefined) {
        counts.set(path, [n(added), n(removed)])
      }
    }
    const status = zsplit(await git($, ['diff', '--name-status', '-z', '-M', base]))
    for (let i = 0; i < status.length; i++) {
      const letter = (status[i] ?? '').charAt(0)
      const path = letter === 'R' || letter === 'C' ? status[(i += 2)] : status[++i]
      if (path === undefined) continue
      const [added, removed] = counts.get(path) ?? [null, null]
      list.push({ path, abs: `${root}/${path}`, status: letter, added, removed, isBefore: before(path) })
      seen.add(key(path))
    }
    for (const path of zsplit(await git($, ['ls-files', '--others', '--exclude-standard', '-z']))) {
      if (seen.has(key(path))) continue
      const added = await countLines($, `${root}/${path}`)
      list.push({ path, abs: `${root}/${path}`, status: '?', added, removed: 0, isBefore: before(path) })
      seen.add(key(path))
    }
  }
  for (const abs of touched) {
    const path = relative(abs)
    if (seen.has(key(path))) continue
    // Inside the repository and not listed by git: back as it was, or ignored.
    if (root !== '' && path !== slash(abs)) continue
    list.push({ path, abs, status: '~', added: null, removed: null, isBefore: false })
  }

  list.sort((a, b) => a.path.localeCompare(b.path))
  await update($, files, () => list)
  const open = await read($, selected)
  if (open !== '' && !list.some(f => f.path === open)) await choose($, '')
}

// One read at a time; a call while one runs asks for one more after it.
async function refresh($: EngineInterface) {
  if (reading !== undefined) {
    again = true

    return reading
  }
  reading = (async () => {
    do {
      again = false
      try {
        await readChanges($)
      } catch {
        // Keep the last list.
      }
    } while (again)
  })()
  await reading
  reading = undefined
}

// Whole hunks up to DIFF_LINES lines; a first hunk longer than that is cut at the limit.
function clip(text: string): { text: string; isCut: boolean } {
  const lines = text.split('\n')
  if (lines.length <= DIFF_LINES) return { text, isCut: false }
  let end = 0
  for (let i = 1; i < DIFF_LINES; i++) if (lines[i]?.startsWith('@@')) end = i

  return { text: lines.slice(0, end > 0 ? end : DIFF_LINES).join('\n'), isCut: true }
}

async function diffOf($: EngineInterface, f: Changed): Promise<string> {
  if (f.status === '?') {
    try {
      const text = await $.fs.read(f.abs)
      if (text.includes('\0')) return ''
      const lines = text.replace(/\n$/, '').split('\n')

      return `@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}`
    } catch {
      return ''
    }
  }
  if (root === '' || f.status === '~') return ''
  const out = await git($, ['diff', '-M', base, '--', f.path])

  return (out ?? '').split('\n').filter(l => !/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(l)).join('\n')
}

async function choose($: EngineInterface, path: string) {
  const open = await read($, selected)
  const next = open === path ? '' : path
  await update($, selected, () => next)
  if (next === '') {
    await update($, diff, () => '')

    return
  }
  const f = (await read($, files)).find(one => one.path === next)
  const text = f === undefined ? '' : await diffOf($, f)
  await update($, diff, () => text)
}

// In VS Code when its `code` command is on PATH, else in the file's default app.
async function openFile($: EngineInterface, abs: string) {
  const path = abs.replace(/\//g, '\\')
  try {
    const ran = await $.process.run(['cmd.exe', '/d', '/c', 'code', '-g', path], { timeoutMs: 20_000 })
    if (ran.exitCode === 0) return
  } catch {
    // No cmd.exe: not Windows.
  }
  try {
    await $.process.run(['explorer.exe', path], { timeoutMs: 20_000 })
  } catch {
    $.ui.toast(STRINGS[lang].openFailed(path))
  }
}

const short = (s: string, n: number) => (s.length > n ? `…${s.slice(s.length - n + 1)}` : s)

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await resolveLang($, (options as { language?: unknown }).language)
    await $.command.register({ name: 'changes', description: STRINGS[lang].command })
    await start($)
    await update($, selected, () => '')
    await update($, diff, () => '')
    void refresh($)

    return started
  })

  on('command.run', { command: 'changes' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: STRINGS[lang].title, focus: true, closeOnEscape: true })

    return { text: STRINGS[lang].opened }
  })

  // Remember what Claude itself changed: git sees the rest.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') {
      const input = e as { file_path?: unknown; notebook_path?: unknown }
      const path = String(input.file_path ?? input.notebook_path ?? '')
      if (path !== '') await touch($, path)
    }

    return ran
  })

  // A turn's end is when the files settle: read them again.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) void refresh($)

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const L = STRINGS[lang]
    const all = await read($, files)
    const mine = all.filter(f => !f.isBefore)
    const older = all.filter(f => f.isBefore)
    const open = await read($, selected)
    const shown = clip(await read($, diff))
    const width = Math.max(20, e.props.bodyColumns - 24)
    const added = mine.reduce((sum, f) => sum + (f.added ?? 0), 0)
    const removed = mine.reduce((sum, f) => sum + (f.removed ?? 0), 0)

    const row = (f: Changed) => (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text dimColor={f.isBefore} color={f.status === 'D' ? 'red' : f.status === 'A' || f.status === '?' ? 'green' : 'yellow'}>
            {f.status}
          </Text>
          <Button key={`file:${f.path}`} plain dimColor={open !== f.path} label={short(f.path, width)} onPress={() => choose($, f.path)} />
          {f.status === '~' ? (
            <Text dimColor>{L.outside}</Text>
          ) : f.added === null ? (
            <Text dimColor>{L.binary}</Text>
          ) : (
            <Text dimColor={f.isBefore}>
              <Text color="green">+{f.added}</Text> <Text color="red">−{f.removed ?? 0}</Text>
            </Text>
          )}
          {f.status !== 'D' && <Button key={`open:${f.path}`} plain dimColor label={L.open} onPress={() => openFile($, f.abs)} />}
        </Box>
        {open === f.path &&
          (shown.text === '' ? (
            <Text dimColor>{L.noDiff}</Text>
          ) : (
            <Box flexDirection="column">
              <Code source={shown.text} format="diff" path={f.path} />
              {shown.isCut && <Text dimColor>{L.cut(DIFF_LINES)}</Text>}
            </Box>
          ))}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text>
            <Text bold>{L.files(mine.length)}</Text> <Text color="green">+{added}</Text> <Text color="red">−{removed}</Text>{' '}
            <Text dimColor>{L.since}</Text>
          </Text>
          <Button key="refresh" plain hotkey="r" label={L.refresh} onPress={() => refresh($)} />
        </Box>
        {root === '' && <Text dimColor>{L.noGit}</Text>}
        {mine.length === 0 && <Text dimColor>{L.empty}</Text>}
        {mine.map(row)}
        {older.length > 0 && <Text dimColor>{L.before(older.length)}</Text>}
        {older.map(row)}
      </Box>
    )
  })
}

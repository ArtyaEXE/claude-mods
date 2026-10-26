import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TestRun } from '../types'

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

const PANE = 'test-watch'
// Lines of output kept for the pane and for Claude.
const TAIL_LINES = 200
const FEED_LINES = 80

const IDLE: TestRun = { state: 'idle', command: '', startedAt: 0, durationMs: 0, exitCode: null, summary: '', tail: '' }
const run = atom({ plugin: 'test-watch', key: 'run' } as const, IDLE, { shape: 'run-1' })
const now = atom({ plugin: 'test-watch', key: 'now' } as const, 0)

type Command = { argv: string[]; label: string }

const STRINGS = {
  ru: {
    seconds: (ms: number) => {
      const s = Math.round(ms / 1000)

      return s < 60 ? `${s} с` : `${Math.floor(s / 60)} мин ${s % 60} с`
    },
    ask: (c: string) => `test-watch: запускать \`${c}\` после правок Claude в этом проекте?`,
    yes: 'Да',
    no: 'Нет',
    running: (c: string, t: string) => `⟳ ${c} … ${t}`,
    passed: (c: string, t: string) => `✓ ${c}: тесты прошли за ${t}`,
    failed: (c: string, code: number | null, t: string) => `✗ ${c}: тесты упали (код ${code ?? '?'}, ${t})`,
    stopped: (c: string) => `■ ${c}: остановлено`,
    stop: 'Остановить',
    feed: 'Отдать Claude',
    output: 'Вывод',
    hide: 'Скрыть',
    runNow: 'Запустить',
    command: 'Тесты после правок Claude: /tests run | on | off',
    paneTitle: 'Тесты',
    opened: 'Открыл панель тестов.',
    started: (c: string) => `Запустил ${c}.`,
    on: (c: string) => `Буду запускать ${c} после ходов, в которых Claude менял файлы.`,
    off: 'Больше не запускаю тесты в этом проекте. Вернуть: /tests on',
    none: 'Не нашёл, как здесь запускать тесты. Задайте команду в /config → test-watch → command.',
    noRun: 'Тесты ещё не запускались.',
    feedPrompt: (c: string, code: number | null, tail: string) =>
      `Тесты (\`${c}\`) упали после последних правок, код выхода ${code ?? '?'}. Хвост вывода:\n\n\`\`\`\n${tail}\n\`\`\`\n\nРазберись в причине и почини.`,
  },
  en: {
    seconds: (ms: number) => {
      const s = Math.round(ms / 1000)

      return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
    },
    ask: (c: string) => `test-watch: run \`${c}\` after Claude's changes in this project?`,
    yes: 'Yes',
    no: 'No',
    running: (c: string, t: string) => `⟳ ${c} … ${t}`,
    passed: (c: string, t: string) => `✓ ${c}: tests passed in ${t}`,
    failed: (c: string, code: number | null, t: string) => `✗ ${c}: tests failed (code ${code ?? '?'}, ${t})`,
    stopped: (c: string) => `■ ${c}: stopped`,
    stop: 'Stop',
    feed: 'Hand to Claude',
    output: 'Output',
    hide: 'Hide',
    runNow: 'Run',
    command: "Tests after Claude's changes: /tests run | on | off",
    paneTitle: 'Tests',
    opened: 'Opened the tests pane.',
    started: (c: string) => `Started ${c}.`,
    on: (c: string) => `I will run ${c} after turns in which Claude changed files.`,
    off: 'No more test runs in this project. Back on: /tests on',
    none: 'Found no way to run tests here. Set the command in /config → test-watch → command.',
    noRun: 'No tests have run yet.',
    feedPrompt: (c: string, code: number | null, tail: string) =>
      `The tests (\`${c}\`) failed after the last changes, exit code ${code ?? '?'}. The end of the output:\n\n\`\`\`\n${tail}\n\`\`\`\n\nFind the cause and fix it.`,
  },
}

let lang: Lang = 'en'
let root = ''
let override = ''
let timeoutMs = 10 * 60_000
// Files changed in this turn (by Claude or a subagent), lower-cased with forward slashes.
const edited = new Set<string>()
// Claude ran tests itself after its last change in this turn: no need to run them again.
let testedAfterEdit = false
let stopAsked = false
let running = false

const slash = (p: string) => p.replace(/\\/g, '/')
const key = (p: string) => slash(p).toLowerCase()
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r(?!\n)/g, '\n')
const tailOf = (s: string, n: number) => s.split('\n').slice(-n).join('\n')

// A test command run by Claude itself: any of the forms detect() finds, or a test runner called directly.
const RUNS_TESTS =
  /(?:^|[\s;&|(])(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|(?:npx\s+|pnpm\s+(?:exec\s+)?)?(?:jest|vitest)\b|(?:python\s+-m\s+)?pytest\b|cargo\s+test\b|go\s+test\b|dotnet\s+test\b|claude\s+plugin\s+test\b)/

const cmd = (line: string): Command => ({ argv: ['cmd.exe', '/d', '/s', '/c', line], label: line })

async function readJson($: EngineInterface, path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await $.fs.read(path)) as Record<string, unknown>
  } catch {
    return undefined
  }
}

// How this project runs its tests, for the files changed in the turn (all of them for a run by hand: `files` absent).
async function detect($: EngineInterface, files?: string[]): Promise<Command | undefined> {
  if (override !== '') return cmd(override)
  const at = (name: string) => $.fs.exists(`${root}/${name}`)

  // A marketplace of Claude Code plugins: each changed plugin's own tests.
  const market = await readJson($, `${root}/.claude-plugin/marketplace.json`)
  if (market !== undefined) {
    const sources = ((market.plugins ?? []) as { source?: unknown }[])
      .map(p => (typeof p.source === 'string' ? p.source.replace(/^\.\//, '').replace(/\/$/, '') : ''))
      .filter(s => s !== '')
    const changed = files === undefined ? sources : sources.filter(s => files.some(f => f.startsWith(`${key(root)}/${s.toLowerCase()}/`)))
    if (changed.length === 0) return undefined

    return cmd(changed.map(s => `claude plugin test ${s}`).join(' && '))
  }
  if (await at('.claude-plugin/plugin.json')) return cmd('claude plugin test .')

  const pkg = await readJson($, `${root}/package.json`)
  const script = (pkg?.scripts as Record<string, unknown> | undefined)?.test
  if (typeof script === 'string' && !/no test specified/.test(script)) {
    const pm = (await at('pnpm-lock.yaml')) ? 'pnpm' : (await at('yarn.lock')) ? 'yarn' : (await at('bun.lockb')) || (await at('bun.lock')) ? 'bun run' : 'npm'

    return cmd(`${pm} test`)
  }
  if (await at('Cargo.toml')) return cmd('cargo test')
  if (await at('go.mod')) return cmd('go test ./...')
  if ((await at('pytest.ini')) || (await at('pyproject.toml')) || (await at('setup.cfg')) || (await at('tox.ini'))) {
    return cmd('python -m pytest -q')
  }
  try {
    if ((await $.fs.list(root)).some(f => /\.(sln|csproj|fsproj)$/i.test(f.name))) return cmd('dotnet test')
  } catch {
    // An unreadable folder: nothing found.
  }

  return undefined
}

// The line that best says what failed: a summary or error line near the end, else the last line.
function summaryOf(out: string): string {
  const lines = out.split('\n').map(l => l.trim()).filter(l => l !== '')
  const hit = [...lines].reverse().find(l => /\b\d+\s+(?:failed|failing|fail|errors?)\b|^FAIL\b|^FAILED\b|✗|AssertionError|Error:|panicked/i.test(l))
  const line = hit ?? lines.at(-1) ?? ''

  return line.length > 160 ? `${line.slice(0, 159)}…` : line
}

async function start($: EngineInterface, c: Command) {
  if (running) return
  running = true
  stopAsked = false
  const startedAt = Date.now()
  await update($, now, () => startedAt)
  await update($, run, () => ({ ...IDLE, state: 'running', command: c.label, startedAt }))

  let out = ''
  let state: TestRun['state'] = 'stopped'
  let exitCode: number | null = null
  try {
    const stream = $.process.spawn({ argv: c.argv, cwd: root, env: { FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' } })
    let isCut = false
    for await (const piece of stream) {
      out = tailOf(out + stripAnsi(piece.text), TAIL_LINES * 2)
      if (stopAsked || Date.now() - startedAt > timeoutMs) {
        isCut = true
        break
      }
    }
    if (!isCut) {
      exitCode = (await stream.result).code
      state = exitCode === 0 ? 'passed' : 'failed'
    }
  } catch (error) {
    out += `\n${String(error)}`
    state = 'failed'
  }
  running = false
  const tail = tailOf(out.replace(/\n+$/, ''), TAIL_LINES)
  await update($, run, r => ({ ...r, state, exitCode, durationMs: Date.now() - startedAt, tail, summary: state === 'failed' ? summaryOf(tail) : '' }))
}

// The command asked about is read back from the question itself, which outlives a reload of the mod.
async function consent($: EngineInterface, answer: 'yes' | 'no') {
  await $.store.set(`consent:${key(root)}`, answer)
  const asked = (await read($, run)).command
  await update($, run, () => IDLE)
  if (answer === 'yes' && asked !== '') await start($, cmd(asked))
}

// The end of a turn that changed files: run the tests, or ask first in a project not asked about yet.
async function afterTurn($: EngineInterface, files: string[]) {
  const c = await detect($, files)
  if (c === undefined) return
  const said = await $.store.get(`consent:${key(root)}`)
  if (said === 'no') return
  if (said !== 'yes') {
    await update($, run, () => ({ ...IDLE, state: 'ask', command: c.label }))

    return
  }
  await start($, c)
}

async function feed($: EngineInterface) {
  const r = await read($, run)
  await update($, run, () => IDLE)
  await $.prompt.submit({ text: STRINGS[lang].feedPrompt(r.command, r.exitCode, tailOf(r.tail, FEED_LINES)) })
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: STRINGS[lang].paneTitle, focus: true, closeOnEscape: true })
}

export const register: Register = (on, options) => {
  const o = options as { language?: unknown; command?: unknown; timeoutMinutes?: unknown }
  override = typeof o.command === 'string' ? o.command.trim() : ''
  timeoutMs = (typeof o.timeoutMinutes === 'number' && o.timeoutMinutes > 0 ? o.timeoutMinutes : 10) * 60_000

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await resolveLang($, o.language)
    root = slash(await $.session.cwd()).replace(/\/$/, '')
    // A run the previous load of the mod was reading died with it: say it stopped, not that it still runs.
    if ((await read($, run)).state === 'running') await update($, run, r => ({ ...r, state: 'stopped' as const }))
    await $.command.register({ name: 'tests', description: STRINGS[lang].command, argumentHint: 'run | on | off' })
    $.clock.every(1000, () => {
      if (running) void update($, now, () => Date.now())
    })

    return started
  })

  on('command.run', { command: 'tests' }, async ($, e) => {
    const L = STRINGS[lang]
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      await $.store.set(`consent:${key(root)}`, 'no')

      return { text: L.off }
    }
    const c = await detect($)
    if (arg === 'on' || arg === 'run') {
      if (c === undefined) return { text: L.none }
      if (arg === 'on') {
        await $.store.set(`consent:${key(root)}`, 'yes')

        return { text: L.on(c.label) }
      }
      void start($, c)

      return { text: L.started(c.label) }
    }
    await openPane($)

    return { text: L.opened }
  })

  // What changed in the turn, and whether Claude ran the tests itself after it.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') {
      const input = e as { file_path?: unknown; notebook_path?: unknown }
      const path = String(input.file_path ?? input.notebook_path ?? '')
      if (path !== '') {
        edited.add(key(path))
        testedAfterEdit = false
      }
    } else if ((e.tool === 'Bash' || e.tool === 'PowerShell') && RUNS_TESTS.test(String((e as { command?: unknown }).command ?? ''))) {
      testedAfterEdit = true
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    const files = [...edited]
    const changed = files.length > 0 && !testedAfterEdit && e.reason !== 'aborted'
    edited.clear()
    testedAfterEdit = false
    if (changed) void afterTurn($, files)

    return done
  })

  // A new prompt puts a passed or stopped run away; a failure stays until handed over or hidden.
  on('prompt.submit', async ($, e, next) => {
    const r = await read($, run)
    if (r.state === 'passed' || r.state === 'stopped') await update($, run, () => IDLE)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || e.props.view.agentId !== undefined) return below
    const r = await read($, run)
    if (r.state === 'idle') return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const L = STRINGS[lang]
    const t = (await read($, now)) || Date.now()
    const hide = () => update($, run, () => IDLE)

    return (
      <Box flexDirection="column">
        {r.state === 'ask' && (
          <Box flexDirection="row" gap={1}>
            <Text>{L.ask(r.command)}</Text>
            <Button key="yes" variant="primary" label={L.yes} onPress={() => consent($, 'yes')} />
            <Button key="no" label={L.no} onPress={() => consent($, 'no')} />
          </Box>
        )}
        {r.state === 'running' && (
          <Box flexDirection="row" gap={1}>
            <Text color="cyan">{L.running(r.command, L.seconds(t - r.startedAt))}</Text>
            <Button key="stop" label={L.stop} onPress={() => void (stopAsked = true)} />
          </Box>
        )}
        {r.state === 'passed' && (
          <Box flexDirection="row" gap={1}>
            <Text color="green">{L.passed(r.command, L.seconds(r.durationMs))}</Text>
            <Button key="hide" plain label={L.hide} onPress={hide} />
          </Box>
        )}
        {r.state === 'failed' && (
          <Box flexDirection="column">
            <Text>
              <Text color="red">{L.failed(r.command, r.exitCode, L.seconds(r.durationMs))}</Text>
              {r.summary !== '' && <Text dimColor> {r.summary}</Text>}
            </Text>
            <Box flexDirection="row" gap={1}>
              <Button key="feed" variant="primary" label={L.feed} onPress={() => feed($)} />
              <Button key="output" label={L.output} onPress={() => openPane($)} />
              <Button key="hide" label={L.hide} onPress={hide} />
            </Box>
          </Box>
        )}
        {r.state === 'stopped' && (
          <Box flexDirection="row" gap={1}>
            <Text color="yellow">{L.stopped(r.command)}</Text>
            <Button key="hide" plain label={L.hide} onPress={hide} />
          </Box>
        )}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const L = STRINGS[lang]
    const r = await read($, run)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Button
            key="pane-run"
            plain
            hotkey="r"
            label={L.runNow}
            onPress={async () => {
              const c = await detect($)
              if (c !== undefined) await start($, c)
            }}
          />
          {r.state === 'failed' && <Button key="pane-feed" plain hotkey="f" label={L.feed} onPress={() => feed($)} />}
        </Box>
        {r.tail === '' ? <Text dimColor>{L.noRun}</Text> : <Code source={r.tail} language="text" />}
      </Box>
    )
  })
}

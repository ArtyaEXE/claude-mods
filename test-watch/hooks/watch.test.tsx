import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// The test runtime has timers; the hooks environment's types do not declare them.
declare const setTimeout: (run: () => void, ms: number) => unknown

const BAND = {
  plugin: 'test-watch',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const START = { cwd: 'D:/proj', surface: 'terminal', isInteractive: true } as const
const TURN = { answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't' } as const

// A path the mod asks about, relative to the project, however the engine spelled it.
const rel = (p: string) => p.replace(/\\/g, '/').replace(/^d:\/proj\//i, '')

type World = { files: Record<string, string>; spawned: string[]; prompts: string[]; output: string; code: number }

// The engine beneath: a project made of `files`, a spawn that prints `output` and exits with `code`.
function engine(on: Parameters<TestBody>[1], w: World) {
  const store = new Map<string, unknown>()
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('env.get', () => ({ value: 'en_US.UTF-8' }))
  on('command.register', () => ({ value: { command: 'tests' } }))
  on('clock.every', () => ({ value: undefined }))
  on('fs.exists', (_, e) => ({ value: rel(e.path) in w.files }))
  on('fs.read', (_, e) => {
    const text = w.files[rel(e.path)]

    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.list', () => ({ value: [] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('process.spawn', async function* (_, e) {
    w.spawned.push(e.argv.join(' '))
    yield { stream: 'stdout' as const, text: w.output }

    return { value: { code: w.code, signal: null } }
  })
  on('prompt.submit', (_, e) => {
    w.prompts.push(e.text)

    return { text: e.text }
  })
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
}

// The run starts unawaited after the turn: let it reach its end.
const settle = (_: unknown) => new Promise<void>(resolve => setTimeout(resolve, 100))

test('a changed project asks once, then runs the tests; a failure goes to Claude in one click', { options: { language: 'ru' } }, async ($, on) => {
  const w: World = {
    files: { 'package.json': '{"scripts":{"test":"vitest run"}}', 'pnpm-lock.yaml': '' },
    spawned: [],
    prompts: [],
    output: ' ✓ a.test.ts\n ✗ b.test.ts > adds\nAssertionError: expected 3 to be 4\n Tests  1 failed | 1 passed\n',
    code: 1,
  }
  engine(on, w)
  await $.session.start(START)

  await $.tool.call({ tool: 'Edit', file_path: 'D:\\proj\\src\\b.ts', old_string: 'a', new_string: 'b' })
  await $.turn.complete(TURN)
  await settle($)

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /запускать/ }))?.text).toBe('test-watch: запускать `pnpm test` после правок Claude в этом проекте?')
  await ui.press({ key: 'yes' })
  await settle($)
  expect(w.spawned).toEqual(['cmd.exe /d /s /c pnpm test'])
  await ui.unmount()

  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /упали/ }))?.text).toMatch(/^✗ pnpm test: тесты упали \(код 1, \d+ с\) Tests {2}1 failed \| 1 passed$/)
  await ui.press({ key: 'feed' })
  expect(w.prompts[0]).toContain('Тесты (`pnpm test`) упали')
  expect(w.prompts[0]).toContain('AssertionError: expected 3 to be 4')
  expect(await ui.find({ type: 'Text', text: /упали/ })).toBeUndefined()
  await ui.unmount()

  // Asked already: the next changed turn runs straight away.
  w.code = 0
  w.output = 'all good\n'
  await $.tool.call({ tool: 'Write', file_path: 'D:\\proj\\src\\c.ts', content: 'x' })
  await $.turn.complete(TURN)
  await settle($)
  expect(w.spawned.length).toBe(2)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /прошли/ }))?.text).toMatch(/^✓ pnpm test: тесты прошли за \d+ с$/)
  await ui.unmount()
})

test('no run when Claude ran the tests itself after its last change, or changed nothing', async ($, on) => {
  const w: World = { files: { 'package.json': '{"scripts":{"test":"jest"}}' }, spawned: [], prompts: [], output: '', code: 0 }
  engine(on, w)
  await $.session.start(START)
  await $.command.run({ command: 'tests', args: 'on', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  await $.tool.call({ tool: 'Edit', file_path: 'D:/proj/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'npm test -- a' })
  await $.turn.complete(TURN)
  await $.turn.complete(TURN)
  await settle($)
  expect(w.spawned).toEqual([])
})

test("in a marketplace of plugins only the changed plugins' tests run", async ($, on) => {
  const w: World = {
    files: { '.claude-plugin/marketplace.json': '{"plugins":[{"name":"hud","source":"./hud"},{"name":"bg","source":"./bg-watchdog"}]}' },
    spawned: [],
    prompts: [],
    output: 'ok\n',
    code: 0,
  }
  engine(on, w)
  await $.session.start(START)
  expect((await $.command.run({ command: 'tests', args: 'on', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })).text).toContain('claude plugin test')

  await $.tool.call({ tool: 'Edit', file_path: 'D:\\proj\\hud\\hooks\\register.tsx', old_string: 'a', new_string: 'b' })
  await $.turn.complete(TURN)
  await settle($)
  expect(w.spawned).toEqual(['cmd.exe /d /s /c claude plugin test hud'])
})

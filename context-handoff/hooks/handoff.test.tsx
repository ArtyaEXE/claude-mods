import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'context-handoff',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const CASES = [
  { language: 'ru', title: 'Контекст 400k токенов.', move: 'Переехать' },
  { language: 'en', title: 'Context at 400k tokens.', move: 'Move' },
] as const

for (const c of CASES) {
  test(`past 350k the band offers the move (${c.language})`, { options: { language: c.language } }, async ($, on) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('command.register', () => ({ value: { command: 'handoff' } }))
    on('turn.complete', () => ({ text: 'done' }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 400_000, window: 1_000_000 }, rateLimits: [] } }))
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)

      return <Box />
    })

    await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect((await ui.find({ type: 'Text', text: /400k/ }))?.text).toContain(c.title)
      expect(await ui.find({ type: 'Button', key: 'move' })).toBeDefined()
      expect((await ui.find({ type: 'Button', key: 'move' }))?.props.label).toBe(c.move)
      await ui.unmount()
    }
  })
}

test('below 350k there is no band', { options: { language: 'en' } }, async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'handoff' } }))
  on('turn.complete', () => ({ text: 'done' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 100_000, window: 1_000_000 }, rateLimits: [] } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('/handoff writes the file, clears and resumes, even when a turn ends first', { options: { language: 'en' } }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 25, 8, 0) })
  const prompts: string[] = []
  const commands: string[] = []
  const toasts: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: 'D:/proj' }))
  on('command.register', () => ({ value: { command: 'handoff' } }))
  on('command.run', (_, e) => {
    commands.push(e.command)

    return { text: '' }
  })
  on('prompt.submit', (_, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })
  on('turn.complete', () => ({ text: 'done' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 60_000, window: 1_000_000 }, rateLimits: [] } }))
  let written = false
  on('fs.exists', () => ({ value: written }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'handoff',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  // The person's own turn ends before the write prompt enters: the move must survive it.
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't0' })
  expect(toasts).toEqual([])

  await clock.advance(300)
  expect(prompts.length).toBe(1)
  expect(prompts[0]).toContain('D:/proj/.handoff/handoff-')

  written = true
  await $.turn.complete({ answer: 'handoff ready', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })
  await clock.advance(300)
  expect(toasts).toEqual([])
  expect(commands).toContain('clear')
  expect(prompts.length).toBe(2)
  expect(prompts[1]).toContain('Read the handoff file')
})

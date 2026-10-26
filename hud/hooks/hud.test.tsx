import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'hud',
  component: 'PromptHint',
  requestId: 'hint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  viewport: { columns: 124, rows: 40 },
} as const

const ABOVE = {
  plugin: 'hud',
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

test('the band shows model, git, context, limits with resets and the cache timer', { options: { language: 'ru' } }, async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'open-project' } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 420_000, window: 1_000_000, percent: 42 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23, resetsAt: new Date(Date.now() + 3_600_000).toISOString() },
        { kind: 'seven_day', percentUsed: 81 },
      ],
      cost: { usd: 3.2 },
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '## main...origin/main [ahead 2]\n M a.ts\n?? b.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.every', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: 'done' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Opus 5\.5/ }))?.text).toContain('Opus 5.5')
    // The folder is a button: a click opens the picker.
    expect((await ui.find({ type: 'Button', key: 'open-project' }))?.text).toBe('D:/proj')
    // The branch is a button that opens /changes; its counts follow as text.
    expect((await ui.find({ type: 'Button', key: 'changes' }))?.text).toBe('⎇ main')
    const git = (await ui.find({ type: 'Text', text: /●2/ }))?.text ?? ''
    expect(git).toContain('↑2')
    const second = (await ui.find({ type: 'Text', text: /Контекст/ }))?.text ?? ''
    expect(second).toMatch(/^Контекст ████░░░░░░ 42% \(420k\/1\.0M\) │ Лимит 5ч ██░░░░░░░░ 23% {2}↻ через (59м|1ч 0м) · \d\d:\d\d$/)
    const third = (await ui.find({ type: 'Text', text: /Неделя/ }))?.text ?? ''
    expect(third).toMatch(/^Неделя 81% │ кэш (59|60) мин$/)
    await ui.unmount()
  }
})

test('in English the band shows model, git, context, limits with resets and the cache timer', { options: { language: 'en' } }, async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'open-project' } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 420_000, window: 1_000_000, percent: 42 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23, resetsAt: new Date(Date.now() + 3_600_000).toISOString() },
        { kind: 'seven_day', percentUsed: 81 },
      ],
      cost: { usd: 3.2 },
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '## main...origin/main [ahead 2]\n M a.ts\n?? b.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.every', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: 'done' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Opus 5\.5/ }))?.text).toContain('Opus 5.5')
    // The folder is a button: a click opens the picker.
    expect((await ui.find({ type: 'Button', key: 'open-project' }))?.text).toBe('D:/proj')
    // The branch is a button that opens /changes; its counts follow as text.
    expect((await ui.find({ type: 'Button', key: 'changes' }))?.text).toBe('⎇ main')
    const git = (await ui.find({ type: 'Text', text: /●2/ }))?.text ?? ''
    expect(git).toContain('↑2')
    const second = (await ui.find({ type: 'Text', text: /Context/ }))?.text ?? ''
    expect(second).toMatch(/^Context ████░░░░░░ 42% \(420k\/1\.0M\) │ Limit 5h ██░░░░░░░░ 23% {2}↻ in (59m|1h 0m) · \d\d:\d\d$/)
    const third = (await ui.find({ type: 'Text', text: /Week/ }))?.text ?? ''
    expect(third).toMatch(/^Week 81% │ cache (59|60)m$/)
    await ui.unmount()
  }
})

test('auto picks Russian from the Windows regional format', { options: { language: 'auto' } }, async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'open-project' } }))
  on('env.get', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200_000, percent: 1 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('process.run', (_, e) => ({
    value: {
      exitCode: e.argv[0] === 'git' ? 128 : 0,
      stdout: e.argv[0] === 'git' ? '' : 'en-US\r\nru-RU\r\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Контекст/ }))?.text).toContain('Контекст')
  await ui.unmount()
})

test('with position above the band shows model, git, context, limits with resets and the cache timer', { options: { language: 'ru', position: 'above' } }, async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'open-project' } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 420_000, window: 1_000_000, percent: 42 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23, resetsAt: new Date(Date.now() + 3_600_000).toISOString() },
        { kind: 'seven_day', percentUsed: 81 },
      ],
      cost: { usd: 3.2 },
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '## main...origin/main [ahead 2]\n M a.ts\n?? b.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.every', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: 'done' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...ABOVE, surface })
    expect((await ui.find({ type: 'Text', text: /Opus 5\.5/ }))?.text).toContain('Opus 5.5')
    // The folder is a button: a click opens the picker.
    expect((await ui.find({ type: 'Button', key: 'open-project' }))?.text).toBe('D:/proj')
    // The branch is a button that opens /changes; its counts follow as text.
    expect((await ui.find({ type: 'Button', key: 'changes' }))?.text).toBe('⎇ main')
    const git = (await ui.find({ type: 'Text', text: /●2/ }))?.text ?? ''
    expect(git).toContain('↑2')
    const second = (await ui.find({ type: 'Text', text: /Контекст/ }))?.text ?? ''
    expect(second).toMatch(/^Контекст ████░░░░░░ 42% \(420k\/1\.0M\) │ Лимит 5ч ██░░░░░░░░ 23% {2}↻ через (59м|1ч 0м) · \d\d:\d\d$/)
    const third = (await ui.find({ type: 'Text', text: /Неделя/ }))?.text ?? ''
    expect(third).toMatch(/^Неделя 81% │ кэш (59|60) мин$/)
    await ui.unmount()
  }
})


test('a click on the folder picks a folder and opens Claude Code there', { options: { language: 'en' } }, async ($, on) => {
  const runs: string[][] = []
  let picked = 'D:\\new project'
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'open-project' } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200_000, percent: 1 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    const isPicker = e.argv[0] === 'powershell.exe' && e.argv.some(a => a.includes('FolderPicker'))
    return {
      value: {
        exitCode: e.argv[0] === 'git' ? 128 : 0,
        stdout: isPicker ? `${picked}\r\n` : '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('clock.every', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'open-project' })

  const picker = runs.find(a => a.some(x => x.includes('FolderPicker')))
  expect(picker?.at(-1)).toContain("[FolderPicker]::Pick('D:\\proj', 'Open Claude Code in a folder')")
  expect(runs.find(a => a[0] === 'wt.exe')).toEqual(['wt.exe', '-w', 'new', '-d', 'D:\\new project', 'cmd.exe', '/k', 'claude'])

  // Cancelled: nothing is launched.
  runs.length = 0
  picked = ''
  await ui.press({ key: 'open-project' })
  expect(runs.some(a => a[0] === 'wt.exe')).toBe(false)
  await ui.unmount()
})

test('a click on the branch opens /changes, or says where to get it', { options: { language: 'ru' } }, async ($, on) => {
  const ran: string[] = []
  const toasts: string[] = []
  let installed = true
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'open-project' } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200_000, percent: 1 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '## main\n M a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.every', () => ({ value: undefined }))
  on('command.list', () => ({ value: installed ? [{ name: 'changes', description: '', source: 'plugin' as const }] : [] }))
  on('command.run', (_, e) => {
    ran.push(e.command)

    return { text: '' }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'changes' })
  expect(ran).toEqual(['changes'])

  installed = false
  await ui.press({ key: 'changes' })
  expect(ran).toEqual(['changes'])
  expect(toasts.at(-1)).toContain('/plugin install changes-pane')
})

import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'bg-watchdog',
  component: 'Pane',
  requestId: 'bg-watchdog',
  props: {
    title: 'bg',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const CASES = [
  { language: 'ru', empty: /Ничего не висит/, stop: 'Остановить', age: /^\d+ мин задача npm run dev$/ },
  { language: 'en', empty: /Nothing is hanging/, stop: 'Stop', age: /^\d+ min task npm run dev$/ },
] as const

for (const c of CASES) {
  test(`the pane lists a background task and stops it (${c.language})`, { options: { language: c.language } }, async ($, on) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
    on('command.register', () => ({ value: { command: 'bg-tasks' } }))
    on('clock.every', () => ({ value: undefined }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('tool.call', (_, e) =>
      e.tool === 'TaskStop' ? { result: {} } : { result: { stdout: '', backgroundTaskId: 'b1' }, text: 'started' },
    )
    on('ui.toast', () => ({ value: undefined }))

    await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: c.empty }))?.text).toMatch(c.empty)
    await ui.unmount()

    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'npm run dev', run_in_background: true })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /npm run dev/ }))?.text).toMatch(c.age)
    const stop = await ui.find({ type: 'Button', key: 'pane-stop-task:b1' })
    expect(stop?.props.label).toBe(c.stop)
    await ui.press({ key: 'pane-stop-task:b1' })
    expect((await ui.find({ type: 'Text', text: c.empty }))?.text).toMatch(c.empty)
    await ui.unmount()
  })
}

import { expect, test } from 'claude-code/testing'

const BAND = {
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

test('the band shows model, git, context, limits with resets and the cache timer', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
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
    const all = (await ui.find({ type: 'Text', text: /Opus 5\.5/ }))?.text ?? ''
    expect(all).toContain('Opus 5.5')
    expect(all).toContain('⎇ main')
    expect(all).toContain('●2')
    expect(all).toContain('↑2')
    const second = (await ui.find({ type: 'Text', text: /Контекст/ }))?.text ?? ''
    expect(second).toMatch(/^Контекст ████░░░░░░ 42% \(420k\/1\.0M\) │ Лимит 5ч ██░░░░░░░░ 23% {2}↻ через (59м|1ч 0м) · \d\d:\d\d$/)
    const third = (await ui.find({ type: 'Text', text: /Неделя/ }))?.text ?? ''
    expect(third).toMatch(/^Неделя 81% │ кэш (59|60) мин$/)
    await ui.unmount()
  }
})

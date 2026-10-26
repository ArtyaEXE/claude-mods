import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'changes-pane',
  component: 'Pane',
  requestId: 'changes-pane',
  props: {
    title: 'changes',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const RUN = { command: 'changes', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

// A repository where pre.txt was dirty before the session, src/a.ts changed during it and new.md is new.
const GIT: [RegExp, string][] = [
  [/rev-parse --show-toplevel/, 'D:/proj\n'],
  [/rev-parse HEAD/, 'abc123\n'],
  [/status --porcelain/, ' M pre.txt\0'],
  [/diff --numstat/, '3\t1\tsrc/a.ts\0' + '1\t0\tpre.txt\0'],
  [/diff --name-status/, 'M\0src/a.ts\0M\0pre.txt\0'],
  [/ls-files --others/, 'new.md\0'],
  [/diff -M abc123 -- src\/a.ts/, 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,4 @@\n-old\n+new\n+two\n+three\n keep\n'],
]

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane lists what changed in the session and unfolds a diff (${surface})`, { options: { language: 'ru' } }, async ($, on) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: 's1' }))
    on('command.register', () => ({ value: { command: 'changes' } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const opened: string[] = []
    on('process.run', (_, e) => {
      const line = e.argv.join(' ')
      if (e.argv[0] === 'cmd.exe') opened.push(line)

      return ok(GIT.find(([test]) => test.test(line))?.[1] ?? '')
    })
    on('fs.read', () => ({ value: '# title\ntext\n' }))
    on('tool.call', () => ({ result: {}, text: 'ok' }))
    on('turn.complete', (_, e) => ({ text: e.answer }))

    await $.session.start({ cwd: 'D:/proj', surface, isInteractive: true })
    await $.command.run(RUN)

    let ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /2 файла/ }))?.text).toMatch(/^2 файла \+5 −1 с начала сессии$/)
    expect((await ui.find({ type: 'Button', key: 'file:src/a.ts' }))?.props.label).toBe('src/a.ts')
    expect((await ui.find({ type: 'Button', key: 'file:new.md' }))?.props.label).toBe('new.md')
    // Dirty before the session: listed apart, dim, out of the session's count.
    expect((await ui.find({ type: 'Text', text: /до начала сессии/ }))?.text).toBe('Изменено ещё до начала сессии: 1')
    expect((await ui.find({ type: 'Button', key: 'file:pre.txt' }))?.props.dimColor).toBe(true)

    // open: VS Code's `code -g` on the file, with backslashes.
    await ui.press({ key: 'open:src/a.ts' })
    expect(opened).toEqual(['cmd.exe /d /c code -g D:\\proj\\src\\a.ts'])

    await ui.press({ key: 'file:src/a.ts' })
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('@@ -1,2 +1,4 @@\n-old\n+new\n+two\n+three\n keep\n')
    await ui.unmount()

    // Claude edits the file that was dirty before: now it is the session's too.
    await $.tool.call({ tool: 'Edit', file_path: 'D:\\proj\\pre.txt', old_string: 'a', new_string: 'b' })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })
    await $.command.run(RUN)
    ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /3 файла/ }))?.text).toMatch(/^3 файла \+6 −1 /)
    expect(await ui.find({ type: 'Text', text: /до начала сессии:/ })).toBeUndefined()
    await ui.unmount()

    // A reload of the mod starts the session again: the files changed so far stay the session's.
    await $.session.start({ cwd: 'D:/proj', surface, isInteractive: true })
    await $.command.run(RUN)
    ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /3 файла/ }))?.text).toMatch(/^3 файла /)
    await ui.unmount()
  })
}

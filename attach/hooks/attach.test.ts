import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const START = { cwd: 'D:/proj', surface: 'terminal', isInteractive: true } as const
const run = (args: string) => ({ command: 'attach', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
const submit = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

type World = { stdout: string; modes: string[]; dirs: string[]; filled: string[]; context: string[] }

// The engine beneath: Windows, a PowerShell that prints `stdout`, a prompt box that records what it takes.
function engine(on: Parameters<TestBody>[1], w: World) {
  const env: Record<string, string> = { OS: 'Windows_NT' }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('env.get', (_, e) => ({ value: env[e.name] }))
  on('command.register', () => ({ value: { command: 'attach' } }))
  on('process.run', (_, e) => {
    w.modes.push(e.init?.env?.ATTACH_MODE ?? '')
    w.dirs.push(e.init?.env?.ATTACH_DIR ?? '')

    return { value: { exitCode: 0, stdout: w.stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.fill', (_, e) => {
    w.filled.push(e.text)

    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => {
    w.context.push(...(e.context ?? []))

    return { text: e.text }
  })
}

const world = (stdout: string): World => ({ stdout, modes: [], dirs: [], filled: [], context: [] })

test('/attach puts every picked file into the prompt: project files relative, others absolute, spaces quoted', { options: { language: 'ru' } }, async ($, on) => {
  const w = world('file D:\\proj\\src\\app.ts\r\nfile C:\\Users\\me\\Downloads\\Отчёт за май.pdf\r\nfile C:\\Users\\me\\Pictures\\ui.png\r\nok\r\n')
  engine(on, w)
  await $.session.start(START)

  const answer = (await $.command.run(run(''))).text
  expect(w.modes).toEqual(['pick'])
  expect(w.dirs).toEqual(['D:\\proj'])
  const mentions = '@src/app.ts @"C:\\Users\\me\\Downloads\\Отчёт за май.pdf" @C:\\Users\\me\\Pictures\\ui.png'
  expect(w.filled).toEqual([`${mentions} `])
  expect(answer).toBe(`Файлов добавлено: 3 в промпт: ${mentions}`)

  // The sent prompt names two of them: the model is asked to open those.
  await $.prompt.submit(submit('compare @src/app.ts with @C:\\Users\\me\\Pictures\\ui.png'))
  expect(w.context).toEqual([
    'The user attached files with /attach: D:\\proj\\src\\app.ts, C:\\Users\\me\\Pictures\\ui.png. ' +
      "Unless a file's contents are already included above, open it with the Read tool (list a folder) before answering.",
  ])

  w.context.length = 0
  await $.prompt.submit(submit('just a question'))
  expect(w.context).toEqual([])
})

test('a binary file goes in by path only, and the model is told not to read it as text', { options: { language: 'en' } }, async ($, on) => {
  const w = world('file D:\\Downloads\\Red Alert 2.torrent\r\nfile D:\\Downloads\\setup.exe\r\nfile D:\\proj\\README.md\r\nok\r\n')
  engine(on, w)
  await $.session.start(START)

  const answer = (await $.command.run(run('clip'))).text
  const mentions = '"D:\\Downloads\\Red Alert 2.torrent" D:\\Downloads\\setup.exe @README.md'
  expect(w.filled).toEqual([`${mentions} `])
  expect(answer).toBe(`3 files added to the prompt: ${mentions} (binary files by path only, without @, so their bytes stay out of the context)`)

  await $.prompt.submit(submit(`what are these? ${mentions}`))
  expect(w.context).toEqual([
    "The user attached a file with /attach: D:\\proj\\README.md. Unless a file's contents are already included above, open it with the Read tool (list a folder) before answering.\n" +
      'The user pointed at binary files with /attach: D:\\Downloads\\Red Alert 2.torrent, D:\\Downloads\\setup.exe. ' +
      'They are named by path only, so their bytes are not in the context: do not read them as text; ' +
      'if the task needs what is inside, inspect them with a fitting tool (size, version info, an archive listing).',
  ])
})

test('/attach clip takes the files copied in Explorer; failures are said plainly; an unknown mode is named', { options: { language: 'en' } }, async ($, on) => {
  const w = world('file C:\\work\\notes.md\r\nok\r\n')
  engine(on, w)
  await $.session.start(START)

  expect((await $.command.run(run('clip'))).text).toBe('File added to the prompt: @C:\\work\\notes.md')
  expect(w.modes).toEqual(['clip'])

  w.stdout = 'error: no files on the clipboard\r\n'
  expect((await $.command.run(run('clip'))).text).toBe('There are no files on the clipboard: copy them in Explorer (Ctrl+C).')
  w.stdout = 'error: nothing was picked\r\n'
  expect((await $.command.run(run(''))).text).toBe('No files picked.')
  expect(w.filled).toEqual(['@C:\\work\\notes.md '])
  expect((await $.command.run(run('dir'))).text).toContain('Unknown mode "dir"')
})

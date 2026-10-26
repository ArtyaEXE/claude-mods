import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const START = { cwd: 'D:/proj', surface: 'terminal', isInteractive: true } as const
const run = (args: string) => ({ command: 'shot', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

type World = { stdout: string; modes: string[]; paths: string[]; filled: string[] }

// The engine beneath: Windows with a temp folder, a PowerShell that prints `stdout`, a prompt box that records what it takes.
function engine(on: Parameters<TestBody>[1], w: World) {
  const env: Record<string, string> = { OS: 'Windows_NT', TEMP: 'C:\\Users\\me\\AppData\\Local\\Temp' }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', (_, e) => ({ value: env[e.name] }))
  on('command.register', () => ({ value: { command: 'shot' } }))
  on('process.run', (_, e) => {
    w.modes.push(e.init?.env?.SHOT_MODE ?? '')
    w.paths.push(e.init?.env?.SHOT_PATH ?? '')

    return { value: { exitCode: 0, stdout: w.stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.fill', (_, e) => {
    w.filled.push(e.text)

    return { isFilled: true }
  })
}

test('/shot window saves the window behind the terminal and mentions it in the prompt', { options: { language: 'ru' } }, async ($, on) => {
  const w: World = { stdout: 'ok 2560x1392 chrome\r\n', modes: [], paths: [], filled: [] }
  engine(on, w)
  await $.session.start(START)

  const answer = (await $.command.run(run('window'))).text
  expect(w.modes).toEqual(['window'])
  expect(w.paths[0]).toMatch(/^C:\\Users\\me\\AppData\\Local\\Temp\\claude-shots\\shot-\d{8}-\d{6}\.png$/)
  expect(w.filled).toEqual([`@${w.paths[0]} `])
  expect(answer).toBe(`Скриншот 2560x1392 (chrome) добавлен в промпт: @${w.paths[0]}`)
})

test('a bare /shot selects a region; a failure is said plainly; an unknown mode is named', { options: { language: 'en' } }, async ($, on) => {
  const w: World = { stdout: 'error: nothing was selected\r\n', modes: [], paths: [], filled: [] }
  engine(on, w)
  await $.session.start(START)

  expect((await $.command.run(run(''))).text).toBe('No region was selected: screenshot cancelled.')
  expect(w.modes).toEqual(['select'])
  expect(w.filled).toEqual([])
  expect((await $.command.run(run('desk'))).text).toContain('Unknown mode "desk"')
})

test('a prompt naming a screenshot tells the model to open it', async ($, on) => {
  const context: string[] = []
  on('prompt.submit', (_, e) => {
    context.push(...(e.context ?? []))

    return { text: e.text }
  })

  await $.prompt.submit({ text: 'what is wrong here? @C:\\Users\\me\\AppData\\Local\\Temp\\claude-shots\\shot-20261026-133809.png', wait: false, origin: { kind: 'composer' } })
  expect(context).toEqual([
    'The user attached a screenshot with /shot: C:\\Users\\me\\AppData\\Local\\Temp\\claude-shots\\shot-20261026-133809.png. ' +
      'Unless the picture is already attached above, open each file with the Read tool to see it before answering.',
  ])

  context.length = 0
  await $.prompt.submit({ text: 'just a question', wait: false, origin: { kind: 'composer' } })
  expect(context).toEqual([])
})

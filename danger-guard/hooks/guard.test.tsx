import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const START = { cwd: 'D:/proj', surface: 'terminal', isInteractive: true } as const

const ENV: Record<string, string> = { USERPROFILE: 'C:\\Users\\me', TEMP: 'C:\\Users\\me\\AppData\\Local\\Temp', LANG: 'ru_RU.UTF-8' }

type World = { git: string[][]; asked: string[]; answer: string; ran: string[]; where?: (string | undefined)[] }

// The engine beneath: a git that answers every call, a dialog that answers `answer`, tools that record what ran.
function engine(on: Parameters<TestBody>[1], w: World) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('session.root', () => ({ value: 'D:/proj' }))
  on('env.get', (_, e) => ({ value: ENV[e.name] }))
  on('command.register', () => ({ value: { command: 'guard' } }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const args = e.argv.slice(1)
    w.git.push(args)
    w.where?.push(e.init?.cwd)
    const out =
      args[0] === 'rev-parse' && args[1] === '--git-path'
        ? '.git/danger-guard.index'
        : args[0] === 'rev-parse'
          ? 'aaaa1111bbbb2222cccc3333dddd4444eeee5555'
          : args[0] === 'write-tree'
            ? 'tree0000'
            : args[0] === 'commit-tree'
              ? 'snap1111snap2222snap3333snap4444snap5555'
              : ''

    return { value: { exitCode: 0, stdout: `${out}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // $.ui.ask is a call of the AskUserQuestion tool.
  on('tool.call', (_, e) => {
    if (e.tool === 'AskUserQuestion') {
      const question = e.questions[0]?.question ?? ''
      w.asked.push(question)

      return { result: { questions: e.questions, answers: { [question]: w.answer } } }
    }
    w.ran.push(String((e as { command?: unknown }).command))

    return { result: {}, text: 'ok' }
  })
}

const SAFE = [
  'git status',
  'git reset HEAD~1',
  'git restore --staged a.ts',
  'git checkout -b feature',
  'git push origin main',
  'git push --force-with-lease origin main',
  'git branch -d merged',
  'git clean -n',
  'rm -rf node_modules dist',
  'rm -rf ./build/*',
  'Remove-Item -Recurse -Force .\\out',
  'rm -rf "C:\\Users\\me\\AppData\\Local\\Temp\\scratch"',
  'rm -rf $TMPDIR/x',
  'git commit -m "drop table users from the docs"',
  'echo truncate table',
]

const ASKED = [
  'git push --force origin main',
  'git push -f',
  'git push origin +main',
  'git push origin --delete feature',
  'git push origin :feature',
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf ../other-project',
  'rm -rf C:/Users/me/Documents',
  'Remove-Item -Recurse -Force C:\\',
  'rd /s /q C:\\Windows\\Temp2',
  'psql -c "DROP TABLE users"',
  'terraform destroy -auto-approve',
  'kubectl delete ns prod',
  'docker system prune -a',
  'npm publish',
  'gh repo delete me/repo --yes',
  'shutdown /s /t 0',
  'cd D:/proj && rm -rf D:/elsewhere',
]

test('safe commands run untouched; irreversible ones wait for an answer', { options: { language: 'ru' } }, async ($, on) => {
  const w: World = { git: [], asked: [], answer: 'Выполнить', ran: [] }
  engine(on, w)
  await $.session.start(START)

  for (const command of SAFE) {
    await $.tool.call({ tool: 'Bash', command })
    expect({ command, asked: w.asked.length }).toEqual({ command, asked: 0 })
  }
  for (const command of ASKED) {
    w.asked.length = 0
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect({ command, asked: w.asked.length, deny: ran.deny }).toEqual({ command, asked: 1, deny: undefined })
  }
  expect(w.asked.length).toBe(1)
})

test('a declined or dismissed question means not run; "this session" stops asking for that kind', { options: { language: 'ru' } }, async ($, on) => {
  const w: World = { git: [], asked: [], answer: 'Отменить', ran: [] }
  engine(on, w)
  await $.session.start(START)

  let ran = await $.tool.call({ tool: 'Bash', command: 'git push --force' })
  expect(ran.deny).toContain('declined')
  expect(w.ran).toEqual([])
  expect(w.asked[0]).toContain('принудительный push')

  w.answer = 'Выполнять в этой сессии'
  await $.tool.call({ tool: 'Bash', command: 'git push --force' })
  ran = await $.tool.call({ tool: 'Bash', command: 'git push -f origin dev' })
  expect(ran.deny).toBeUndefined()
  expect(w.asked.length).toBe(2)
  expect(w.ran).toEqual(['git push --force', 'git push -f origin dev'])
})

test('irreversible: deny never asks', { options: { language: 'en', irreversible: 'deny' } }, async ($, on) => {
  const w: World = { git: [], asked: [], answer: 'Run', ran: [] }
  engine(on, w)
  await $.session.start(START)

  const ran = await $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse -Force C:\\Users\\me' })
  expect(ran.deny).toContain('does not let this run')
  expect(w.asked).toEqual([])
})

test('a git command that discards work runs after a snapshot of the whole tree, through an index of its own', async ($, on) => {
  const w: World = { git: [], asked: [], answer: '', ran: [] }
  engine(on, w)
  await $.session.start(START)
  w.git.length = 0

  const ran = await $.tool.call({ tool: 'Bash', command: 'git reset --hard origin/main' })
  expect(w.asked).toEqual([])
  expect(w.ran).toEqual(['git reset --hard origin/main'])
  expect(w.git.map(a => a[0])).toEqual(['rev-parse', 'rev-parse', 'read-tree', 'add', 'write-tree', 'commit-tree', 'update-ref'])
  expect(w.git.at(-1)?.[1]).toMatch(/^refs\/danger-guard\/worktree\/\d+$/)
  expect(ran.context?.at(-1)).toContain('git restore --source=snap1111snap')

  // A force-deleted branch keeps its tip.
  w.git.length = 0
  await $.tool.call({ tool: 'PowerShell', command: 'git branch -D old-idea' })
  expect(w.git.at(-1)?.slice(0, 3)).toEqual(['update-ref', '-m', 'danger-guard: git branch -D old-idea'])
  expect(w.git.at(-1)?.[3]).toMatch(/^refs\/danger-guard\/branch\/\d+\/old-idea$/)
})

test("the snapshot is taken where the command runs: after its own cd, or git's -C", async ($, on) => {
  const where: (string | undefined)[] = []
  const w: World = { git: [], asked: [], answer: '', ran: [], where }
  engine(on, w)
  await $.session.start(START)

  where.length = 0
  await $.tool.call({ tool: 'Bash', command: 'cd ../other && git reset --hard' })
  expect(new Set(where)).toEqual(new Set(['d:/other']))

  where.length = 0
  await $.tool.call({ tool: 'PowerShell', command: 'git -C D:\\work\\app clean -fd' })
  expect(new Set(where)).toEqual(new Set(['d:/work/app']))
})

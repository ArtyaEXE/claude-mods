import { expect, test } from 'claude-code/testing'

const READS: [string, string][] = [
  ['Get-Content a.txt', 'Get-Content -Encoding UTF8 a.txt'],
  ['gc a.txt | Select-Object -First 5', 'gc -Encoding UTF8 a.txt | Select-Object -First 5'],
  ['$x = Get-Content "D:\\п\\a.txt" -Raw', '$x = Get-Content -Encoding UTF8 "D:\\п\\a.txt" -Raw'],
  ['(cat a.json) | ConvertFrom-Json; type b.txt', '(cat -Encoding UTF8 a.json) | ConvertFrom-Json; type -Encoding UTF8 b.txt'],
]

const KEPT = [
  'Get-Content a.txt -Encoding Default',
  'Get-Content -Enc UTF8 a.txt',
  'Get-Content Env:PATH',
  "Write-Host 'Get-Content a.txt'",
  'Get-ChildItem -Filter *.txt',
  'npm run build # Get-Content a.txt',
]

const DENIED = [
  "Set-Content a.txt 'Привет'",
  "(Get-Content a.txt) -replace 'a', 'b' | Set-Content a.txt",
  "Add-Content log.txt \"строка\"",
]

const ALLOWED = [
  "Set-Content a.txt 'hello'",
  "Set-Content a.txt 'Привет' -Encoding UTF8",
  "Set-Content a.txt 'Привет' # encoding:off",
  "'Привет' | Out-File a.txt",
]

test('PowerShell reads get -Encoding UTF8; an explicit encoding, a non-file path, a string or a comment stay as they are', async ($, on) => {
  const ran: string[] = []
  on('tool.call', (_, e) => {
    ran.push(String((e as { command?: unknown }).command))

    return { result: {}, text: 'ok' }
  })

  for (const [command, expected] of READS) {
    await $.tool.call({ tool: 'PowerShell', command })
    expect(ran.pop()).toBe(expected)
  }
  for (const command of KEPT) {
    await $.tool.call({ tool: 'PowerShell', command })
    expect(ran.pop()).toBe(command)
  }
  // Git Bash's cat is not PowerShell's.
  await $.tool.call({ tool: 'Bash', command: 'cat a.txt' })
  expect(ran.pop()).toBe('cat a.txt')
})

test('a write that would save non-ASCII text as cp1251 is refused; others run', { options: { language: 'ru' } }, async ($, on) => {
  const toasts: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })

  for (const command of DENIED) {
    const ran = await $.tool.call({ tool: 'PowerShell', command })
    expect({ command, deny: ran.deny ?? '' }).toEqual({ command, deny: expect.stringContaining('WriteAllText') })
  }
  for (const command of ALLOWED) {
    const ran = await $.tool.call({ tool: 'PowerShell', command })
    expect({ command, deny: ran.deny }).toEqual({ command, deny: undefined })
  }
  expect(toasts[0]).toBe('encoding-guard: остановил запись, которая сохранила бы текст в cp1251')
})

test('mojibake, cp866 output, a Python encode error and octal git paths get a hint', async ($, on) => {
  const outputs: Record<string, string> = {
    'python x.py': "UnicodeEncodeError: 'charmap' codec can't encode character",
    'git status --short': '?? "\\321\\204\\320\\260\\320\\271\\320\\273.txt"',
    'cmd //c dir': 'Том в устройстве C \uFFFD\uFFFD\uFFFD \uFFFD\uFFFD',
    'node print.js': '\u0420\u045F\u0421\u0402\u0420\u0451\u0420\u0406\u0420\u00B5\u0421\u201A',
    'echo ok': 'Привет, мир',
  }
  on('tool.call', (_, e) => ({ result: {}, text: outputs[String((e as { command?: unknown }).command)] ?? '' }))

  const context = async (command: string) => (await $.tool.call({ tool: 'Bash', command })).context?.join(' ') ?? ''
  expect(await context('python x.py')).toContain('PYTHONUTF8=1')
  expect(await context('git status --short')).toContain('core.quotepath=false')
  expect(await context('cmd //c dir')).toContain('PowerShell tool')
  expect(await context('node print.js')).toContain('decoded as cp1251')
  expect(await context('echo ok')).toBe('')
})

test('a UTF-8 read of a cp1251 file says to read it as cp1251, and the first rewrite is explained once', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: '\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD' }))

  const first = (await $.tool.call({ tool: 'PowerShell', command: 'Get-Content old.txt' })).context?.join(' ') ?? ''
  expect(first).toContain('ran with `-Encoding UTF8`')
  expect(first).toContain('-Encoding Default')
  const second = (await $.tool.call({ tool: 'PowerShell', command: 'Get-Content old.txt' })).context?.join(' ') ?? ''
  expect(second).not.toContain('ran with `-Encoding UTF8`')
})

test('the session runs Python and git in UTF-8 without overriding what is set', async ($, on) => {
  const env = new Map<string, string | undefined>([['OS', 'Windows_NT'], ['PYTHONUTF8', '0']])
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', (_, e) => ({ value: env.get(e.name) }))
  on('env.set', (_, e) => {
    env.set(e.name, e.value)

    return { value: undefined }
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'en-US', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  expect(env.get('PYTHONUTF8')).toBe('0')
  expect([env.get('GIT_CONFIG_COUNT'), env.get('GIT_CONFIG_KEY_0'), env.get('GIT_CONFIG_VALUE_0')]).toEqual(['1', 'core.quotepath', 'false'])
})

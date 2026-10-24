import { expect, test } from 'claude-code/testing'

const BAD_POWERSHELL = [
  'npm run build && npm test',
  'Get-Content a.txt | head -n 5',
  'grep -r foo .',
  'rm -rf node_modules',
  'python3 script.py',
  'curl -s https://example.com',
  'FOO=1 node app.js',
  'git status 2>/dev/null',
]

const GOOD_POWERSHELL = [
  'npm run build; if ($?) { npm test }',
  'Write-Host "a && b | head"',
  'git log --format="%H || %s"',
  'Get-ChildItem -Recurse -Filter *.ts',
  'Write-Host done',
  'curl.exe -s https://example.com',
  "Select-String -Pattern 'grep' -Path a.txt",
  'npm i # win-hints:off && whatever',
]

const BAD_BASH = ['ls C:\\Users\\me', 'echo hi > NUL', 'echo %USERPROFILE%', 'python3 -V', 'Get-ChildItem .']
const GOOD_BASH = ['ls "C:\\Users\\me"', 'ls C:/Users/me', 'echo $USERPROFILE > /dev/null', 'powershell -Command "Get-ChildItem"']

test('bad lines are refused with a hint, good ones run', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: 'ok' }))

  for (const command of BAD_POWERSHELL) {
    const ran = await $.tool.call({ tool: 'PowerShell', command })
    expect({ command, denied: typeof ran.deny }).toEqual({ command, denied: 'string' })
  }
  for (const command of GOOD_POWERSHELL) {
    const ran = await $.tool.call({ tool: 'PowerShell', command })
    expect({ command, deny: ran.deny }).toEqual({ command, deny: undefined })
  }
  for (const command of BAD_BASH) {
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect({ command, denied: typeof ran.deny }).toEqual({ command, denied: 'string' })
  }
  for (const command of GOOD_BASH) {
    const ran = await $.tool.call({ tool: 'Bash', command })
    expect({ command, deny: ran.deny }).toEqual({ command, deny: undefined })
  }
})

test('a known error gets a hint for the model', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: "The term 'foo' is not recognized as the name of a cmdlet" }))
  const ran = await $.tool.call({ tool: 'PowerShell', command: 'foo' })
  expect(ran.context?.[0]).toContain('win-shell-hints')
})

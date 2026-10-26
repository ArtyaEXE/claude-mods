import type { EngineInterface, Register } from 'claude-code'

type Lang = 'ru' | 'en'

// `ru` / `en` as set; `auto`: the locale variables first, then Windows' UI language or regional format.
async function resolveLang($: EngineInterface, setting: unknown): Promise<Lang> {
  if (setting === 'ru' || setting === 'en') return setting
  const env = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  if (env) return env.toLowerCase().startsWith('ru') ? 'ru' : 'en'
  try {
    const ran = await $.process.run(
      ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', '(Get-UICulture).Name; (Get-Culture).Name'],
      { timeoutMs: 10_000 },
    )
    if (ran.exitCode === 0 && /^ru\b/im.test(ran.stdout)) return 'ru'
  } catch {
    // Not Windows: English.
  }

  return 'en'
}

// A command holding this marker is passed through untouched.
const OPT_OUT = '# win-hints:off'

type Rule = { test: RegExp; hint: string }

// Where a command word starts: the line's head or after a separator.
const HEAD = String.raw`(?:^|[;|{(\n]\s*)`

const POWERSHELL: Rule[] = [
  {
    test: /&&|\|\|/,
    hint: 'PowerShell 5.1 has no `&&` / `||`. Use `A; if ($?) { B }` (or `A; B` to run unconditionally).',
  },
  {
    test: /\d?>\s*\/dev\/null/,
    hint: '`/dev/null` does not exist here: use `2>$null`, `> $null` or `| Out-Null`.',
  },
  {
    test: /\?\?|\?\./,
    hint: 'PowerShell 5.1 has no `??` / `?.`: use `if ($null -eq $x) { ... } else { ... }`.',
  },
  {
    test: new RegExp(HEAD + String.raw`(?:if\s+\[|for\s+\w+\s+in\b|while\s+\[)`),
    hint: 'Bash control flow is a parser error in PowerShell: use `if (Test-Path x) { }`, `foreach ($x in ...) { }`.',
  },
  {
    test: new RegExp(HEAD + String.raw`(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=\S+\s+[\w.]`),
    hint: 'No inline env prefix in PowerShell: use `$env:VAR = "x"; cmd`.',
  },
  {
    test: new RegExp(HEAD + String.raw`export\s+[A-Za-z_]`),
    hint: '`export` is bash: use `$env:VAR = "value"`.',
  },
  {
    test: new RegExp(HEAD + String.raw`grep\b`),
    hint: '`grep` is not installed in this PowerShell: use the Grep tool, or `Select-String -Pattern ... -Path ...`.',
  },
  {
    test: new RegExp(HEAD + String.raw`(?:head|tail)\b`),
    hint: '`head`/`tail` are not installed: use `Get-Content f -TotalCount N` / `-Tail N`, or `| Select-Object -First N` / `-Last N`.',
  },
  {
    test: new RegExp(HEAD + String.raw`which\b`),
    hint: '`which` is not installed: use `(Get-Command name).Source`.',
  },
  {
    test: new RegExp(HEAD + String.raw`touch\b`),
    hint: '`touch` is not installed: use `if (-not (Test-Path p)) { New-Item -ItemType File p }`.',
  },
  {
    test: new RegExp(HEAD + String.raw`(?:sed|awk|wc|xargs|cut)\b`),
    hint: 'sed/awk/wc/xargs/cut are not installed in PowerShell: use the Bash tool (Git Bash) for this, or `-replace`, `Measure-Object`, `ForEach-Object`.',
  },
  {
    test: new RegExp(HEAD + String.raw`(?:rm|del|rmdir)\s+-(?:rf|fr|r\s+-f|f\s+-r)\b`),
    hint: '`rm -rf` fails in PowerShell (ambiguous parameter): use `Remove-Item -Recurse -Force path`.',
  },
  {
    test: new RegExp(HEAD + String.raw`mkdir\s+-p\b`),
    hint: '`mkdir -p` is bash: use `New-Item -ItemType Directory -Force path`.',
  },
  {
    test: new RegExp(HEAD + String.raw`curl\s+-`),
    hint: '`curl` in PowerShell 5.1 is an alias of Invoke-WebRequest and rejects curl flags: call `curl.exe ...` explicitly.',
  },
  {
    test: new RegExp(HEAD + String.raw`python3\b`),
    hint: '`python3` here is the Microsoft Store stub (WindowsApps), not a real Python: use `python`.',
  },
]

const BASH: Rule[] = [
  {
    test: /(?:^|[\s=])[A-Za-z]:\\[^\s]/,
    hint: 'Git Bash eats unquoted backslashes: write Windows paths with forward slashes (`C:/Users/...` or `/c/Users/...`) or quote them.',
  },
  {
    test: /\d?>\s*NUL\b/i,
    hint: '`NUL` is cmd.exe: in Git Bash use `/dev/null`.',
  },
  {
    test: /%[A-Za-z_][A-Za-z0-9_]*%/,
    hint: '`%VAR%` is cmd.exe: in Git Bash use `$VAR` (e.g. `$USERPROFILE`, `$APPDATA`).',
  },
  {
    test: /\$env:[A-Za-z_]/,
    hint: '`$env:VAR` is PowerShell: in Git Bash use `$VAR`.',
  },
  {
    test: new RegExp(HEAD + String.raw`python3\b`),
    hint: '`python3` here is the Microsoft Store stub (WindowsApps), not a real Python: use `python`.',
  },
  {
    test: new RegExp(HEAD + String.raw`(?:Get|Set|New|Remove|Test|Select|Where|ForEach|Copy|Move)-[A-Z][A-Za-z]+\b`),
    hint: 'This is a PowerShell cmdlet and Git Bash cannot run it: use the PowerShell tool, or the bash equivalent.',
  },
]

// Known error texts after a run, and what to do instead next time.
const AFTER: Rule[] = [
  {
    test: /is not recognized as the name of a cmdlet/,
    hint: 'That command does not exist in this PowerShell 5.1. Use the PowerShell equivalent, or run the line through the Bash tool (Git Bash).',
  },
  {
    test: /is not a valid statement separator/,
    hint: 'PowerShell 5.1: replace `&&` with `; if ($?) { ... }`.',
  },
  {
    test: /Python was not found; run without arguments to install from the Microsoft Store/,
    hint: '`python3` is the Store stub here: use `python`.',
  },
  {
    test: /NativeCommandError/,
    hint: 'PowerShell 5.1 wraps a native command\'s stderr as errors under `2>&1`: drop the redirect, stderr is captured anyway.',
  },
]

// Quoted strings and here-strings are data, not code: blank them before matching.
const codeOf = (command: string, isPowerShell: boolean): string => {
  let code = command
  if (isPowerShell) {
    code = code.replace(/@'[\s\S]*?'@|@"[\s\S]*?"@/g, '""')
    // A full-line comment is not code either.
    code = code.replace(/^\s*#.*$/gm, '')
  } else {
    code = code.replace(/<<-?\s*'?(\w+)'?[\s\S]*?\n\1\b/g, '""')
  }

  return code.replace(/'[^'\n]*'|"(?:[^"\\\n]|\\.)*"/g, '""')
}

const hintsFor = (command: string, isPowerShell: boolean): string[] => {
  if (command.includes(OPT_OUT)) return []
  const code = codeOf(command, isPowerShell)

  return (isPowerShell ? POWERSHELL : BASH).filter(r => r.test.test(code)).map(r => r.hint)
}

let lang: Lang = 'en'

const FIXED = {
  ru: (n: number) => `win-shell-hints: поправил синтаксис до запуска (${n})`,
  en: (n: number) => `win-shell-hints: fixed the syntax before it ran (${n})`,
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await resolveLang($, (options as { language?: unknown }).language)

    return started
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'PowerShell' && e.tool !== 'Bash') return next(e)
    const command = String((e as { command?: unknown }).command ?? '')
    const isPowerShell = e.tool === 'PowerShell'

    const hints = hintsFor(command, isPowerShell)
    if (hints.length > 0) {
      $.ui.toast(FIXED[lang](hints.length))

      return {
        deny:
          `Not run: this ${e.tool} line would fail on this Windows machine.\n- ` +
          hints.join('\n- ') +
          `\nRewrite it and run again. (If the line is actually correct, add \`${OPT_OUT}\` to it.)`,
      }
    }

    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const text = ran.text ?? ''
    const after = AFTER.filter(r => r.test.test(text)).map(r => r.hint)
    if (after.length === 0) return ran

    return { ...ran, context: [...(ran.context ?? []), `win-shell-hints: ${after.join(' ')}`] }
  })
}

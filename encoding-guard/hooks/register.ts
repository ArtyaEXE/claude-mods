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
const OPT_OUT = '# encoding:off'

// Where a command word starts: the line's head, after a separator, an opening bracket or an assignment.
const HEAD = String.raw`(?:^|[;|{(=\n]\s*)`

const READ = new RegExp(HEAD + String.raw`(Get-Content|gc|cat|type)(?=\s|$)`, 'gi')
const WRITE = new RegExp(HEAD + String.raw`(Set-Content|Add-Content|ac)(?=\s|$)`, 'gi')

// Any parameter that starts like -Encoding: the command already says what it means.
const HAS_ENCODING = /\s-en/i
// A provider path other than the file system, where -Encoding does not exist.
const NOT_A_FILE = /(?:^|[\s'"])(?:env|variable|function|alias|hklm|hkcu|cert|wsman):/i

// The command with quoted strings, here-strings and comments blanked to spaces, length kept,
// so an index into it is an index into the command.
function codeOf(command: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ')

  return command
    .replace(/@'[\s\S]*?'@|@"[\s\S]*?"@/g, blank)
    .replace(/'[^'\n]*'|"(?:[^"`\n]|`.)*"/g, s => s[0] + blank(s.slice(1, -1)) + s[s.length - 1])
    .replace(/(^|\s)#.*$/gm, (s, lead: string) => lead + blank(s.slice(lead.length)))
}

// From a cmdlet to the end of its pipeline stage.
function stageAt(code: string, from: number): string {
  const end = code.slice(from).search(/[;|\n}]/)

  return end === -1 ? code.slice(from) : code.slice(from, from + end)
}

// `Get-Content` and its aliases without -Encoding read UTF-8 files without a BOM as cp1251:
// the command with ` -Encoding UTF8` after each of them, or the command itself when none needed it.
function withUtf8Reads(command: string): string {
  const code = codeOf(command)
  const at: number[] = []
  for (const m of code.matchAll(READ)) {
    const name = m[1] ?? ''
    const start = (m.index ?? 0) + m[0].length - name.length
    const stage = stageAt(code, start)
    if (!HAS_ENCODING.test(stage) && !NOT_A_FILE.test(stageAt(command, start))) at.push(start + name.length)
  }

  return at.reduceRight((out, i) => `${out.slice(0, i)} -Encoding UTF8${out.slice(i)}`, command)
}

// `Set-Content` / `Add-Content` without -Encoding write cp1251: harmful when the text is not ASCII,
// or when it came from a read in the same command.
function writesAnsi(command: string): boolean {
  const code = codeOf(command)
  const risky = /[^\x00-\x7F]/.test(command) || new RegExp(READ.source, 'i').test(code)
  if (!risky) return false
  for (const m of code.matchAll(WRITE)) {
    const name = m[1] ?? ''
    const start = (m.index ?? 0) + m[0].length - name.length
    if (!HAS_ENCODING.test(stageAt(code, start))) return true
  }

  return false
}

// cp1251 bytes 0x80-0xBF as characters: the second half of every Cyrillic letter's UTF-8 bytes read as cp1251.
const CP1251_HIGH =
  'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏ' +
  'ђ‘’“”•–—™љ›њќћџ' +
  ' ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї' +
  '°±Ііґµ¶·ё№є»јЅѕї'

// Three Cyrillic letters or more in a row, each read as `Р` or `С` and one of the characters above.
const MOJIBAKE = new RegExp(`(?:[\\u0420\\u0421][${CP1251_HIGH}]){3,}`)

const REPLACEMENT = /�[^�]{0,3}�/

// Programs that print in the OEM code page (cp866 on a Russian Windows).
const OEM_TOOL =
  /(?:^|[\s;&|/\\(])(?:cmd|ipconfig|ping|netstat|tasklist|taskkill|systeminfo|where|findstr|net|schtasks|wmic|reg|robocopy|xcopy|sc|chcp|nslookup|tracert|getmac|driverquery|whoami|dir|tree)(?:\.exe)?(?=[\s"']|$)/i

const HINTS = {
  mojibake:
    'The output above contains UTF-8 text decoded as cp1251 (mojibake like `Р...С...`): it is not what the source says. ' +
    'In PowerShell 5.1 read UTF-8 files with `Get-Content -Encoding UTF8` (`Import-Csv -Encoding UTF8` likewise); ' +
    "for a program's output set `[Console]::OutputEncoding = [Text.Encoding]::UTF8` first. Never write this text back to a file.",
  notUtf8:
    'The file is not UTF-8 (the � characters), most likely cp1251: read it with `Get-Content -Encoding Default`. ' +
    'encoding-guard added `-Encoding UTF8` to the read; an explicit `-Encoding` is left alone.',
  oem:
    'This Windows program printed in the OEM code page (cp866), which Git Bash cannot decode (the � characters). ' +
    'Run it through the PowerShell tool instead: its console is UTF-8.',
  python:
    'Python wrote non-ASCII text to a cp1251 stdout. Run it in UTF-8 mode: `PYTHONUTF8=1 python ...` in Git Bash, ' +
    "`$env:PYTHONUTF8 = '1'; python ...` in PowerShell, or call `sys.stdout.reconfigure(encoding='utf-8')` in the script.",
  git: 'git printed non-ASCII paths as octal escapes: run it as `git -c core.quotepath=false ...` to see them as text.',
  reads:
    'Get-Content ran with `-Encoding UTF8`: PowerShell 5.1 otherwise reads UTF-8 files without a BOM as cp1251. ' +
    'For a file that really is cp1251, pass `-Encoding Default` yourself.',
  writes:
    'Not run: in PowerShell 5.1 `Set-Content` / `Add-Content` without `-Encoding` save text as cp1251 (ANSI), and `Get-Content` ' +
    'without `-Encoding` reads UTF-8 files as cp1251, so non-ASCII text would end up in the wrong encoding. ' +
    'Change files with the Edit or Write tool. In a script, read with `[IO.File]::ReadAllText($path)` and write UTF-8 without a BOM: ' +
    '`[IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false))`. ' +
    `If the line is right as it is, add \`${OPT_OUT}\` to it.`,
}

const STOPPED = {
  ru: 'encoding-guard: остановил запись, которая сохранила бы текст в cp1251',
  en: 'encoding-guard: stopped a write that would have saved the text as cp1251',
}

// What to tell the model about a result, given the command that produced it.
function hintsAfter(tool: 'PowerShell' | 'Bash', command: string, text: string, readsRewritten: boolean): string[] {
  const hints: string[] = []
  if (MOJIBAKE.test(text)) hints.push(HINTS.mojibake)
  if (REPLACEMENT.test(text)) {
    if (tool === 'PowerShell' && readsRewritten) hints.push(HINTS.notUtf8)
    else if (tool === 'Bash' && OEM_TOOL.test(command)) hints.push(HINTS.oem)
  }
  if (/UnicodeEncodeError: '(?:charmap|cp1251|cp866)' codec/.test(text)) hints.push(HINTS.python)
  if (/"[^"\n]*(?:\\[23][0-7]{2}){2}/.test(text) && /(?:^|[\s;&|(])git\s/.test(command)) hints.push(HINTS.git)

  return hints
}

let lang: Lang = 'en'
let toldAboutReads = false

// UTF-8 for the session's commands: Python's UTF-8 mode, git's paths as text (through GIT_CONFIG_*,
// so no config file changes). A variable the person set already is left alone.
async function setSessionEnv($: EngineInterface) {
  if ((await $.env.get('OS')) !== 'Windows_NT') return
  if ((await $.env.get('PYTHONUTF8')) === undefined) await $.env.set('PYTHONUTF8', '1')
  const count = await $.env.get('GIT_CONFIG_COUNT')
  if (count === undefined || ((await $.env.get('GIT_CONFIG_KEY_0')) === 'core.quotepath' && count === '1')) {
    await $.env.set('GIT_CONFIG_COUNT', '1')
    await $.env.set('GIT_CONFIG_KEY_0', 'core.quotepath')
    await $.env.set('GIT_CONFIG_VALUE_0', 'false')
  }
}

export const register: Register = (on, options) => {
  const o = options as { language?: unknown; sessionEnv?: unknown }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await resolveLang($, o.language)
    toldAboutReads = false
    if (o.sessionEnv !== 'off') await setSessionEnv($)

    return started
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'PowerShell' && e.tool !== 'Bash') return next(e)
    const command = String((e as { command?: unknown }).command ?? '')
    if (command.includes(OPT_OUT)) return next(e)

    let run = command
    if (e.tool === 'PowerShell') {
      if (writesAnsi(command)) {
        $.ui.toast(STOPPED[lang])

        return { deny: HINTS.writes }
      }
      run = withUtf8Reads(command)
    }
    const rewritten = run !== command

    const ran = await next(rewritten ? { ...e, command: run } : e)
    if (ran.deny !== undefined) return ran
    const hints = hintsAfter(e.tool, command, ran.text ?? '', rewritten)
    if (rewritten && !toldAboutReads) {
      toldAboutReads = true
      hints.unshift(HINTS.reads)
    }
    if (hints.length === 0) return ran

    return { ...ran, context: [...(ran.context ?? []), `encoding-guard: ${hints.join(' ')}`] }
  })
}

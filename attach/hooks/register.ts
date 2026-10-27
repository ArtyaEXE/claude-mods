import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Attached } from '../types'

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

type Mode = 'pick' | 'clip'

// Prints `file <path>` for each file, then `ok`, or the error, by ATTACH_MODE: pick (the Explorer-style open
// dialog, several files at once, owned by the window in front so it opens over the terminal; ATTACH_DIR is
// the folder it opens in, ATTACH_TITLE its title), clip (files and folders copied in Explorer).
const ATTACH = String.raw`
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
trap { [Console]::Out.WriteLine('error: ' + $_.Exception.Message); exit 1 }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace Attach -Name Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();'
if ($env:ATTACH_MODE -eq 'clip') {
  if (-not [Windows.Forms.Clipboard]::ContainsFileDropList()) { throw 'no files on the clipboard' }
  $files = @([Windows.Forms.Clipboard]::GetFileDropList())
} else {
  [Windows.Forms.Application]::EnableVisualStyles()
  $owner = New-Object Windows.Forms.NativeWindow
  $owner.AssignHandle([Attach.Win32]::GetForegroundWindow())
  $d = New-Object Windows.Forms.OpenFileDialog
  $d.Multiselect = $true
  $d.Title = $env:ATTACH_TITLE
  if ($env:ATTACH_DIR -and (Test-Path -LiteralPath $env:ATTACH_DIR)) { $d.InitialDirectory = $env:ATTACH_DIR }
  $shown = $d.ShowDialog($owner)
  $owner.ReleaseHandle()
  if ($shown -ne 'OK') { throw 'nothing was picked' }
  $files = @($d.FileNames)
}
foreach ($f in $files) { [Console]::Out.WriteLine('file ' + $f) }
[Console]::Out.WriteLine('ok')
`

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// `-EncodedCommand` takes the script as base64 UTF-16LE: Windows' argv quoting cannot strip its quotes.
function encodeCommand(script: string): string {
  const bytes: number[] = []
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i)
    bytes.push(c & 0xff, c >> 8)
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? B64.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? B64.charAt(n & 63) : '='
  }

  return out
}

const STRINGS = {
  ru: {
    command: 'Файлы в промпт: окно выбора (можно несколько), clip — файлы, скопированные в Проводнике',
    title: 'Прикрепить файлы к промпту',
    added: (n: number, mentions: string) => `${n === 1 ? 'Файл добавлен' : `Файлов добавлено: ${n}`} в промпт: ${mentions}`,
    copyIt: (mentions: string) => `Вставьте в промпт: ${mentions}`,
    binaryNote: ' (бинарные файлы — только путём, без @, чтобы их байты не попали в контекст)',
    errors: {
      'nothing was picked': 'Файлы не выбраны.',
      'no files on the clipboard': 'В буфере обмена нет файлов: скопируйте их в Проводнике (Ctrl+C).',
    } as Record<string, string>,
    failed: (why: string) => `Не получилось прикрепить файлы: ${why}`,
    notWindows: 'Окно выбора файлов работает только на Windows: упомяните файл через @.',
    unknownMode: (m: string) => `Не знаю режим «${m}». Есть: clip или пусто для окна выбора.`,
  },
  en: {
    command: 'Files into the prompt: the open dialog (several at once), clip: files copied in Explorer',
    title: 'Attach files to the prompt',
    added: (n: number, mentions: string) => `${n === 1 ? 'File' : `${n} files`} added to the prompt: ${mentions}`,
    copyIt: (mentions: string) => `Put them in the prompt: ${mentions}`,
    binaryNote: ' (binary files by path only, without @, so their bytes stay out of the context)',
    errors: {
      'nothing was picked': 'No files picked.',
      'no files on the clipboard': 'There are no files on the clipboard: copy them in Explorer (Ctrl+C).',
    } as Record<string, string>,
    failed: (why: string) => `Could not attach the files: ${why}`,
    notWindows: 'The file dialog works on Windows only: mention a file with @.',
    unknownMode: (m: string) => `Unknown mode "${m}". There is clip, or nothing for the dialog.`,
  },
}

// What the model is told about the files a sent prompt names: readable ones to open, binary ones only by path.
function forModel(readable: string[], binary: string[]): string {
  const parts: string[] = []
  if (readable.length > 0) {
    parts.push(
      `The user attached ${readable.length === 1 ? 'a file' : 'files'} with /attach: ${readable.join(', ')}. ` +
        "Unless a file's contents are already included above, open it with the Read tool (list a folder) before answering.",
    )
  }
  if (binary.length > 0) {
    parts.push(
      `The user pointed at ${binary.length === 1 ? 'a binary file' : 'binary files'} with /attach: ${binary.join(', ')}. ` +
        'They are named by path only, so their bytes are not in the context: do not read them as text; ' +
        'if the task needs what is inside, inspect them with a fitting tool (size, version info, an archive listing).',
    )
  }

  return parts.join('\n')
}

// Files whose bytes mean nothing as text: the prompt names them by path, without @, so Claude Code does not paste them in.
const BINARY = new Set(
  (
    'exe dll sys msi msix appx cab iso img vhd vhdx bin dat torrent zip 7z rar tar gz tgz bz2 xz zst jar apk war ' +
    'class pyc o obj lib a so dylib pdb wasm db sqlite sqlite3 mdb accdb doc docx xls xlsx ppt pptx odt ods odp ' +
    'mp3 wav flac ogg m4a aac mp4 mkv avi mov wmv webm psd ai sketch fig blend fbx ttf otf woff woff2 eot'
  ).split(' '),
)

const isBinary = (path: string) => BINARY.has(/\.([^.\\/]+)$/.exec(path)?.[1]?.toLowerCase() ?? '')

// Files /attach put into the prompt, so a sent prompt naming one asks the model to open it.
const attached = atom({ plugin: 'attach', key: 'attached' } as const, [] as Attached)

let lang: Lang = 'en'

const slashes = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '')

// How the prompt names a file: relative to the project when inside it, quoted when it has a space;
// an @mention, so Claude Code attaches it, unless it is binary.
function mentionOf(path: string, cwd: string): string {
  const root = slashes(cwd)
  const inside = root !== '' && path.toLowerCase().startsWith(`${root.toLowerCase()}\\`)
  const shown = inside ? path.slice(root.length + 1).replace(/\\/g, '/') : path
  const quoted = /\s/.test(shown) ? `"${shown}"` : shown

  return isBinary(path) ? quoted : `@${quoted}`
}

// Picks the files; the text the command answers with.
async function attachFiles($: EngineInterface, mode: Mode): Promise<string> {
  const L = STRINGS[lang]
  if ((await $.env.get('OS')) !== 'Windows_NT') return L.notWindows
  const cwd = await $.session.cwd()
  let lines: string[] = []
  try {
    const ran = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encodeCommand(ATTACH)], {
      env: { ATTACH_MODE: mode, ATTACH_DIR: slashes(cwd), ATTACH_TITLE: L.title },
      timeoutMs: 600_000,
    })
    lines = ran.stdout.split('\n').map(l => l.trim()).filter(l => l !== '')
  } catch (error) {
    return L.failed(String(error))
  }
  const last = lines.at(-1) ?? ''
  if (last !== 'ok') {
    const why = last.replace(/^error: /, '')

    return L.errors[why] ?? L.failed(why || 'PowerShell')
  }
  const paths = lines.filter(l => l.startsWith('file ')).map(l => l.slice(5))
  if (paths.length === 0) return L.errors['nothing was picked'] ?? ''
  await update($, attached, list => [...list.filter(p => !paths.some(q => q.toLowerCase() === p.toLowerCase())), ...paths])
  const mentions = paths.map(p => mentionOf(p, cwd)).join(' ')
  const filled = await $.prompt.fill({ text: `${mentions} `, mode: 'insert' })

  const note = paths.some(isBinary) ? L.binaryNote : ''

  return (filled.isFilled ? L.added(paths.length, mentions) : L.copyIt(mentions)) + note
}

// The files /attach added that the prompt still names, as absolute paths.
async function namedIn($: EngineInterface, text: string): Promise<string[]> {
  const list = await read($, attached)
  if (list.length === 0) return []
  const cwd = await $.session.cwd()
  const lower = text.toLowerCase()

  return list.filter(p => lower.includes(mentionOf(p, cwd).toLowerCase()))
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await resolveLang($, (options as { language?: unknown }).language)
    await $.command.register({ name: 'attach', description: STRINGS[lang].command, argumentHint: 'clip' })

    return started
  })

  // Claude Code may not attach a picture, a PDF or a folder named by @: tell the model to open each one itself,
  // and what the binary files named by path are.
  on('prompt.submit', async ($, e, next) => {
    const files = await namedIn($, e.text).catch(() => [])
    if (files.length === 0) return next(e)
    const note = forModel(files.filter(p => !isBinary(p)), files.filter(isBinary))

    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  on('command.run', { command: 'attach' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const mode: Mode | undefined = arg === '' ? 'pick' : arg === 'clip' ? 'clip' : undefined
    if (mode === undefined) return { text: STRINGS[lang].unknownMode(arg) }

    return { text: await attachFiles($, mode) }
  })
}

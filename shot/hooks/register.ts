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

type Mode = 'select' | 'window' | 'screen' | 'clip'

// Saves a picture to SHOT_PATH as PNG, by SHOT_MODE: select (the Windows snipping overlay, then the clipboard),
// window (the window behind the terminal, drawn by itself even where the terminal covers it), screen (every
// monitor), clip (the image on the clipboard). Prints `ok <width>x<height> <program>`, or the error.
const SHOT = String.raw`
$ProgressPreference = 'SilentlyContinue'
trap { [Console]::Out.WriteLine('error: ' + $_.Exception.Message); exit 1 }
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -Namespace Shot -Name Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
[DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
[DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size);
[DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
'@
[void][Shot.Win32]::SetProcessDPIAware()
$mode = $env:SHOT_MODE
$out = $env:SHOT_PATH
$bmp = $null
$from = ''

if ($mode -eq 'window') {
  # The first real window under the foreground one (the terminal) in z-order: what was in front before it.
  $fg = [Shot.Win32]::GetForegroundWindow()
  $fgPid = 0; [void][Shot.Win32]::GetWindowThreadProcessId($fg, [ref]$fgPid)
  $h = $fg
  $target = [IntPtr]::Zero
  $targetPid = 0
  for ($i = 0; $i -lt 500; $i++) {
    $h = [Shot.Win32]::GetWindow($h, 2)
    if ($h -eq [IntPtr]::Zero) { break }
    if (-not [Shot.Win32]::IsWindowVisible($h) -or [Shot.Win32]::IsIconic($h)) { continue }
    if ([Shot.Win32]::GetWindowTextLength($h) -eq 0) { continue }
    if ([Shot.Win32]::GetWindowLong($h, -20) -band 0x80) { continue }
    $cloaked = 0; [void][Shot.Win32]::DwmGetWindowAttribute($h, 14, [ref]$cloaked, 4)
    if ($cloaked -ne 0) { continue }
    $p = 0; [void][Shot.Win32]::GetWindowThreadProcessId($h, [ref]$p)
    if ($p -eq $fgPid) { continue }
    $target = $h; $targetPid = $p; break
  }
  if ($target -eq [IntPtr]::Zero) { throw 'no window behind the terminal' }
  $from = (Get-Process -Id $targetPid -ErrorAction SilentlyContinue).ProcessName
  $r = New-Object Shot.Win32+RECT
  [void][Shot.Win32]::GetWindowRect($target, [ref]$r)
  $w = $r.Right - $r.Left; $hgt = $r.Bottom - $r.Top
  $bmp = New-Object Drawing.Bitmap $w, $hgt
  $g = [Drawing.Graphics]::FromImage($bmp)
  $dc = $g.GetHdc()
  # PW_RENDERFULLCONTENT: GPU-drawn windows (browsers, editors) too.
  [void][Shot.Win32]::PrintWindow($target, $dc, 2)
  $g.ReleaseHdc($dc); $g.Dispose()
  # Trim the invisible resize border Windows 10 / 11 adds around a window.
  $f = New-Object Shot.Win32+RECT
  if ([Shot.Win32]::DwmGetWindowAttribute($target, 9, [ref]$f, 16) -eq 0) {
    $crop = New-Object Drawing.Rectangle ($f.Left - $r.Left), ($f.Top - $r.Top), ($f.Right - $f.Left), ($f.Bottom - $f.Top)
    if ($crop.Width -gt 0 -and $crop.Height -gt 0 -and $crop.Right -le $w -and $crop.Bottom -le $hgt) { $bmp = $bmp.Clone($crop, $bmp.PixelFormat) }
  }
} elseif ($mode -eq 'screen') {
  $v = [Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object Drawing.Bitmap $v.Width, $v.Height
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($v.Left, $v.Top, 0, 0, $bmp.Size); $g.Dispose()
} else {
  if ($mode -eq 'select') {
    [Windows.Forms.Clipboard]::Clear()
    Start-Process 'ms-screenclip:'
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline -and -not [Windows.Forms.Clipboard]::ContainsImage()) { Start-Sleep -Milliseconds 300 }
    if (-not [Windows.Forms.Clipboard]::ContainsImage()) { throw 'nothing was selected' }
  }
  if (-not [Windows.Forms.Clipboard]::ContainsImage()) { throw 'no image on the clipboard' }
  $bmp = [Windows.Forms.Clipboard]::GetImage()
}
[void](New-Item -ItemType Directory -Force (Split-Path $out))
$bmp.Save($out, [Drawing.Imaging.ImageFormat]::Png)
[Console]::Out.WriteLine('ok ' + $bmp.Width + 'x' + $bmp.Height + ' ' + $from)
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
    command: 'Скриншот в промпт: область (по умолчанию), window — окно за терминалом, screen — весь экран, clip — из буфера',
    added: (size: string, from: string, mention: string) => `Скриншот ${size}${from ? ` (${from})` : ''} добавлен в промпт: ${mention}`,
    copyIt: (mention: string) => `Скриншот сохранён, вставьте в промпт: ${mention}`,
    errors: {
      'no window behind the terminal': 'За терминалом нет окна, которое можно снять.',
      'nothing was selected': 'Область не выделена: скриншот отменён.',
      'no image on the clipboard': 'В буфере обмена нет картинки.',
    } as Record<string, string>,
    failed: (why: string) => `Не получилось сделать скриншот: ${why}`,
    notWindows: 'Скриншоты работают только на Windows.',
    unknownMode: (m: string) => `Не знаю режим «${m}». Есть: window, screen, clip или пусто для выделения области.`,
  },
  en: {
    command: 'Screenshot into the prompt: a region (default), window: the window behind the terminal, screen, clip: from the clipboard',
    added: (size: string, from: string, mention: string) => `Screenshot ${size}${from ? ` (${from})` : ''} added to the prompt: ${mention}`,
    copyIt: (mention: string) => `Screenshot saved; put it in the prompt: ${mention}`,
    errors: {
      'no window behind the terminal': 'There is no window behind the terminal to capture.',
      'nothing was selected': 'No region was selected: screenshot cancelled.',
      'no image on the clipboard': 'There is no image on the clipboard.',
    } as Record<string, string>,
    failed: (why: string) => `Could not take the screenshot: ${why}`,
    notWindows: 'Screenshots work on Windows only.',
    unknownMode: (m: string) => `Unknown mode "${m}". There are: window, screen, clip, or nothing to select a region.`,
  },
}

// A screenshot this mod saved, as the prompt names it (quoted or not).
const SHOT_PATH = /@?"?([A-Za-z]:[\\/][^"\n]*?[\\/]claude-shots[\\/]shot-\d{8}-\d{6}\.png)"?/g

const FOR_MODEL = (paths: string[]) =>
  `The user attached ${paths.length === 1 ? 'a screenshot' : 'screenshots'} with /shot: ${paths.join(', ')}. ` +
  'Unless the picture is already attached above, open each file with the Read tool to see it before answering.'

let lang: Lang = 'en'

const stamp = () => {
  const d = new Date()
  const two = (n: number) => String(n).padStart(2, '0')

  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
}

// Takes the picture; the text the command answers with.
async function shoot($: EngineInterface, mode: Mode): Promise<string> {
  const L = STRINGS[lang]
  const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMP'))
  if ((await $.env.get('OS')) !== 'Windows_NT' || temp === undefined) return L.notWindows
  const path = `${temp.replace(/[\\/]$/, '')}\\claude-shots\\shot-${stamp()}.png`
  let line = ''
  try {
    const ran = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encodeCommand(SHOT)], {
      env: { SHOT_MODE: mode, SHOT_PATH: path },
      timeoutMs: 120_000,
    })
    line = ran.stdout.trim().split('\n').pop()?.trim() ?? ''
  } catch (error) {
    return L.failed(String(error))
  }
  const ok = /^ok (\d+x\d+) ?(.*)$/.exec(line)
  if (ok === null) {
    const why = line.replace(/^error: /, '')

    return L.errors[why] ?? L.failed(why || 'PowerShell')
  }
  const mention = /\s/.test(path) ? `@"${path}"` : `@${path}`
  const filled = await $.prompt.fill({ text: `${mention} `, mode: 'insert' })

  return filled.isFilled ? L.added(ok[1] ?? '', ok[2] ?? '', mention) : L.copyIt(mention)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await resolveLang($, (options as { language?: unknown }).language)
    await $.command.register({ name: 'shot', description: STRINGS[lang].command, argumentHint: 'window | screen | clip' })

    return started
  })

  // An @mention of a screenshot is not attached as a picture by Claude Code: tell the model to open each one itself.
  on('prompt.submit', async ($, e, next) => {
    const shots = [...new Set([...e.text.matchAll(SHOT_PATH)].map(m => m[1] ?? ''))].filter(p => p !== '')
    if (shots.length === 0) return next(e)

    return next({ ...e, context: [...(e.context ?? []), FOR_MODEL(shots)] })
  })

  on('command.run', { command: 'shot' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const mode: Mode | undefined = arg === '' ? 'select' : arg === 'window' || arg === 'screen' || arg === 'clip' ? arg : undefined
    if (mode === undefined) return { text: STRINGS[lang].unknownMode(arg) }

    return { text: await shoot($, mode) }
  })
}

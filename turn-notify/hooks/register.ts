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

type Options = {
  language?: unknown
  toast?: unknown
  minSeconds?: unknown
  awayMinutes?: unknown
  telegramToken?: unknown
  telegramChatId?: unknown
}

// One line of JSON: whether a window of this process's ancestors (the terminal, VS Code, the desktop app)
// is in front, that window's handle, how long the keyboard and mouse have been idle, and whether Windows
// shows toasts at all (`off`: the system switch) and PowerShell's in particular (`app-off`).
const PROBE = String.raw`
$ProgressPreference = 'SilentlyContinue'
Add-Type -Namespace TurnNotify -Name Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO i);
'@
$fg = 0
[void][TurnNotify.Win32]::GetWindowThreadProcessId([TurnNotify.Win32]::GetForegroundWindow(), [ref]$fg)
$parents = @{}
Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId | ForEach-Object { $parents[[int]$_.ProcessId] = [int]$_.ParentProcessId }
$focused = $false
$hwnd = 0
$p = $parents[$PID]
for ($i = 0; $i -lt 32 -and $p -gt 0; $i++) {
  if ($p -eq $fg) { $focused = $true }
  if ($hwnd -eq 0) {
    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
    if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) { $hwnd = [long]$proc.MainWindowHandle }
  }
  $p = $parents[$p]
}
$li = New-Object TurnNotify.Win32+LASTINPUTINFO
$li.cbSize = 8
[void][TurnNotify.Win32]::GetLastInputInfo([ref]$li)
$idle = [Environment]::TickCount - [int]$li.dwTime
$k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion'
$all = (Get-ItemProperty "$k\PushNotifications" -ErrorAction SilentlyContinue).ToastEnabled -ne 0
$app = (Get-ItemProperty "$k\Notifications\Settings\{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe" -ErrorAction SilentlyContinue).Enabled -ne 0
$toasts = if (-not $all) { 'off' } elseif (-not $app) { 'app-off' } else { 'on' }
[pscustomobject]@{ focused = $focused; idleMs = $idle; toasts = $toasts; hwnd = $hwnd } | ConvertTo-Json -Compress
`

// A Windows toast from TURN_NOTIFY_TITLE and TURN_NOTIFY_BODY, under PowerShell's own app id (no registration needed).
const TOAST = String.raw`
$ProgressPreference = 'SilentlyContinue'
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$t = [Security.SecurityElement]::Escape($env:TURN_NOTIFY_TITLE)
$b = [Security.SecurityElement]::Escape($env:TURN_NOTIFY_BODY)
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>' + $t + '</text><text>' + $b + '</text></binding></visual></toast>')
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`

// Where Windows shows no toasts: the terminal's taskbar button flashes until it is brought to the front
// (FLASHW_ALL | FLASHW_TIMERNOFG), and the system notification sound plays.
const FLASH = String.raw`
$ProgressPreference = 'SilentlyContinue'
trap { [Console]::Out.WriteLine($_.Exception.Message); exit 1 }
Add-Type -Namespace TurnNotify -Name Flash -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }
[DllImport("user32.dll")] public static extern bool FlashWindowEx(ref FLASHWINFO f);
'@
$h = [long]$env:TURN_NOTIFY_HWND
if ($h -ne 0) {
  $f = New-Object TurnNotify.Flash+FLASHWINFO
  $f.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($f)
  $f.hwnd = [IntPtr]$h
  $f.dwFlags = 15
  [void][TurnNotify.Flash]::FlashWindowEx([ref]$f)
}
$wav = (Get-ItemProperty 'HKCU:\AppEvents\Schemes\Apps\.Default\Notification.Default\.Current' -ErrorAction SilentlyContinue).'(default)'
if ($wav) { $wav = [Environment]::ExpandEnvironmentVariables($wav) }
if (-not $wav -or -not (Test-Path -LiteralPath $wav)) { $wav = Join-Path ([Environment]::GetFolderPath('Windows')) 'Media\Windows Notify System Generic.wav' }
if (-not (Test-Path -LiteralPath $wav)) { throw "no notification sound: $wav" }
(New-Object System.Media.SoundPlayer $wav).PlaySync()
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

const powershell = (script: string) => ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodeCommand(script)]

type Toasts = 'on' | 'off' | 'app-off'

type Probe = { focused: boolean; idleMs: number; toasts: Toasts; hwnd: number }

// What one notification came to: shown as a toast, flashed instead (and why, and PowerShell's error if
// the flash or its sound failed), or not shown on Windows; Telegram's HTTP status when it was sent (0: the request failed).
type Outcome = { local: 'toast' | 'flash' | 'none' | 'unknown'; toasts?: Toasts; error?: string; telegram?: number }

const STRINGS = {
  ru: {
    duration: (s: number) => (s < 60 ? `${s} с` : s < 3600 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${Math.floor(s / 3600)} ч ${Math.floor(s / 60) % 60} мин`),
    done: (d: string) => `Готово за ${d}`,
    error: (d: string) => `Ход оборвался с ошибкой через ${d}`,
    refusal: 'Модель отказалась отвечать',
    permission: 'Ждёт разрешения',
    question: 'Задаёт вопрос',
    plan: 'План готов, ждёт одобрения',
    command: 'Уведомления о конце хода: /notify test | on | off',
    test: 'Проверка уведомления',
    testBody: 'Если вы это видите, уведомления работают.',
    off: {
      off: 'Уведомления Windows выключены в системе (Параметры → Система → Уведомления)',
      'app-off': 'Уведомления Windows выключены для Windows PowerShell (Параметры → Система → Уведомления → Windows PowerShell)',
    },
    fallback: 'вместо них мигаю кнопкой терминала на панели задач и подаю звук',
    warn: (why: string) => `turn-notify: ${why}. Пока они выключены, мигаю кнопкой терминала на панели задач и подаю звук.`,
    shown: {
      toast: 'Показал уведомление Windows.',
      flash: (why: string) => `${why}, поэтому мигнул кнопкой терминала на панели задач и подал звук.`,
      none: 'В Windows ничего не показал: toast = never.',
      unknown: 'В Windows ничего не показал: PowerShell не ответил (не Windows?).',
    },
    flashFailed: (error: string) => ` Но PowerShell сообщил об ошибке: ${error}`,
    telegramSent: ' Отправил в Telegram.',
    telegramFailed: (status: number) => (status === 0 ? ' Telegram недоступен.' : ` Telegram ответил ${status}: проверьте токен и ID чата.`),
    telegramFailedToast: (status: number) => `turn-notify: Telegram ответил ${status}`,
    muted: 'Уведомления выключены до конца сессии. Включить: /notify on',
    unmuted: 'Уведомления включены.',
    status: (muted: boolean, min: number, windows: string, telegram: boolean) =>
      `Уведомления ${muted ? 'выключены' : 'включены'}: ход дольше ${min} с, ожидание разрешения или ответа. ${windows}. Telegram ${telegram ? 'настроен' : 'не настроен'}. /notify test | on | off`,
    windowsOn: 'Уведомления Windows включены',
  },
  en: {
    duration: (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 3600)} h ${Math.floor(s / 60) % 60} min`),
    done: (d: string) => `Done in ${d}`,
    error: (d: string) => `The turn died on an error after ${d}`,
    refusal: 'The model refused to answer',
    permission: 'Waiting for permission',
    question: 'Asking you a question',
    plan: 'The plan is ready for approval',
    command: 'Turn notifications: /notify test | on | off',
    test: 'Test notification',
    testBody: 'If you can see this, notifications work.',
    off: {
      off: 'Windows notifications are turned off (Settings → System → Notifications)',
      'app-off': 'Windows notifications are turned off for Windows PowerShell (Settings → System → Notifications → Windows PowerShell)',
    },
    fallback: "instead I flash the terminal's taskbar button and play a sound",
    warn: (why: string) => `turn-notify: ${why}. While they are off, I flash the terminal's taskbar button and play a sound instead.`,
    shown: {
      toast: 'Showed a Windows notification.',
      flash: (why: string) => `${why}, so I flashed the terminal's taskbar button and played a sound.`,
      none: 'Showed nothing on Windows: toast = never.',
      unknown: 'Showed nothing on Windows: PowerShell did not answer (not Windows?).',
    },
    flashFailed: (error: string) => ` But PowerShell reported an error: ${error}`,
    telegramSent: ' Sent to Telegram.',
    telegramFailed: (status: number) => (status === 0 ? ' Telegram is unreachable.' : ` Telegram answered ${status}: check the token and chat id.`),
    telegramFailedToast: (status: number) => `turn-notify: Telegram answered ${status}`,
    muted: 'Notifications are off for the rest of the session. Back on: /notify on',
    unmuted: 'Notifications are on.',
    status: (muted: boolean, min: number, windows: string, telegram: boolean) =>
      `Notifications are ${muted ? 'off' : 'on'}: turns over ${min} s, waits for permission or an answer. ${windows}. Telegram ${telegram ? 'set up' : 'not set up'}. /notify test | on | off`,
    windowsOn: 'Windows notifications are on',
  },
}

// The first line of an answer that says something, without Markdown marks, cut short.
function gist(answer: string, max = 180): string {
  const line =
    answer
      .split('\n')
      .map(l => l.replace(/^\s*(#+|[-*+>]|\d+\.)\s+/, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim())
      .find(l => l !== '' && !/^```/.test(l)) ?? ''

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const folderName = (cwd: string) => cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || cwd

let lang: Lang = 'en'
let toastMode: 'unfocused' | 'always' | 'never' = 'unfocused'
let minSeconds = 30
let awayMs = 5 * 60_000
let token = ''
let chatId = ''
let interactive = true
let muted = false
let lastSentAt = 0

const hasTelegram = () => token !== '' && chatId !== ''

async function probe($: EngineInterface): Promise<Probe | undefined> {
  try {
    const ran = await $.process.run(powershell(PROBE), { timeoutMs: 15_000 })
    if (ran.exitCode !== 0) return undefined
    const parsed = JSON.parse(ran.stdout.trim()) as Partial<Probe>
    const toasts = parsed.toasts === 'off' || parsed.toasts === 'app-off' ? parsed.toasts : 'on'

    return { focused: parsed.focused === true, idleMs: Number(parsed.idleMs) || 0, toasts, hwnd: Number(parsed.hwnd) || 0 }
  } catch {
    // Not Windows, or PowerShell could not tell.
    return undefined
  }
}

async function toast($: EngineInterface, title: string, body: string) {
  try {
    await $.process.run(powershell(TOAST), {
      timeoutMs: 15_000,
      env: { TURN_NOTIFY_TITLE: title, TURN_NOTIFY_BODY: body },
    })
  } catch {
    // No toasts here: nothing to show.
  }
}

// PowerShell's error when the flash or the sound failed, '' when both went through.
async function flash($: EngineInterface, hwnd: number): Promise<string> {
  try {
    const ran = await $.process.run(powershell(FLASH), { timeoutMs: 15_000, env: { TURN_NOTIFY_HWND: String(hwnd) } })

    return ran.exitCode === 0 ? '' : ran.stdout.replace(/\s+/g, ' ').trim().slice(0, 300) || `exit ${ran.exitCode}`
  } catch (error) {
    return String(error).slice(0, 300)
  }
}

// Telegram's HTTP status, 0 when the request did not go through.
async function telegram($: EngineInterface, title: string, body: string): Promise<number> {
  try {
    const sent = await $.http.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: body ? `${title}\n${body}` : title, disable_web_page_preview: true }),
    })

    return sent.status
  } catch {
    return 0
  }
}

// Once per machine while Windows shows no toasts: say so, and that the taskbar flashes instead.
async function warnIfToastsOff($: EngineInterface) {
  const seen = await probe($)
  if (seen === undefined) return
  if (seen.toasts === 'on') {
    await $.store.delete('warnedToastsOff')

    return
  }
  if ((await $.store.get('warnedToastsOff')) === seen.toasts) return
  await $.store.set('warnedToastsOff', seen.toasts)
  $.ui.toast(STRINGS[lang].warn(STRINGS[lang].off[seen.toasts]))
}

// A toast while the terminal is not in front (the taskbar flashes where Windows shows no toasts);
// Telegram once the person has been away a while.
async function notify($: EngineInterface, headline: string, body: string, force = false): Promise<Outcome | undefined> {
  if (!force && (muted || !interactive)) return undefined
  const at = Date.now()
  // A question can raise both the tool call and the engine's own notification: one is enough.
  if (!force && at - lastSentAt < 3_000) return undefined
  lastSentAt = at

  let folder = ''
  try {
    folder = folderName(await $.session.cwd())
  } catch {
    // No folder in the title then.
  }
  const title = folder ? `Claude Code · ${folder}: ${headline}` : `Claude Code: ${headline}`
  const seen = await probe($)
  const outcome: Outcome = { local: seen === undefined ? 'unknown' : 'none', toasts: seen?.toasts }
  if (toastMode !== 'never' && seen !== undefined && (force || toastMode === 'always' || !seen.focused)) {
    if (seen.toasts === 'on') {
      await toast($, title, body)
      outcome.local = 'toast'
    } else {
      outcome.error = (await flash($, seen.hwnd)) || undefined
      outcome.local = 'flash'
    }
  }
  // Where idle time cannot be read (not Windows), Telegram is the only way to reach the person.
  if (hasTelegram() && (force || seen === undefined || seen.idleMs >= awayMs)) {
    outcome.telegram = await telegram($, title, body)
    if (!force && outcome.telegram !== 200) $.ui.toast(STRINGS[lang].telegramFailedToast(outcome.telegram))
  }

  return outcome
}

export const register: Register = (on, options) => {
  const o = options as Options
  toastMode = o.toast === 'always' || o.toast === 'never' ? o.toast : 'unfocused'
  minSeconds = typeof o.minSeconds === 'number' && o.minSeconds >= 0 ? o.minSeconds : 30
  awayMs = (typeof o.awayMinutes === 'number' && o.awayMinutes >= 0 ? o.awayMinutes : 5) * 60_000
  token = typeof o.telegramToken === 'string' ? o.telegramToken.trim() : ''
  chatId = typeof o.telegramChatId === 'string' ? o.telegramChatId.trim() : ''

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    interactive = e.isInteractive !== false
    lang = await resolveLang($, o.language)
    await $.command.register({ name: 'notify', description: STRINGS[lang].command, argumentHint: 'test | on | off' })
    if (interactive && toastMode !== 'never') void warnIfToastsOff($)

    return started
  })

  on('command.run', { command: 'notify' }, async ($, e) => {
    const L = STRINGS[lang]
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      muted = true

      return { text: L.muted }
    }
    if (arg === 'on') {
      muted = false

      return { text: L.unmuted }
    }
    if (arg === 'test') {
      const outcome = await notify($, L.test, L.testBody, true)
      if (outcome === undefined) return { text: L.shown.unknown }
      let text =
        outcome.local === 'flash' && outcome.toasts !== undefined && outcome.toasts !== 'on'
          ? L.shown.flash(L.off[outcome.toasts])
          : outcome.local === 'toast'
            ? L.shown.toast
            : outcome.local === 'none'
              ? L.shown.none
              : L.shown.unknown
      if (outcome.error !== undefined) text += L.flashFailed(outcome.error)
      if (outcome.telegram !== undefined) text += outcome.telegram === 200 ? L.telegramSent : L.telegramFailed(outcome.telegram)

      return { text }
    }

    const seen = await probe($)
    const windows = seen === undefined || seen.toasts === 'on' ? L.windowsOn : `${L.off[seen.toasts]}: ${L.fallback}`

    return { text: L.status(muted, minSeconds, windows, hasTelegram()) }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.reason === 'aborted') return done
    const L = STRINGS[lang]
    const took = L.duration(Math.round(e.durationMs / 1000))
    if (e.reason === 'refusal') void notify($, L.refusal, '')
    else if (e.reason === 'error') void notify($, L.error(took), '')
    else if (e.durationMs >= minSeconds * 1000) void notify($, L.done(took), gist(e.answer))

    return done
  })

  // The engine asks the person to allow a tool, or an MCP server asks them something.
  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' || e.notification_type === 'elicitation_dialog') {
      void notify($, STRINGS[lang].permission, e.message)
    }

    return next(e)
  })

  // A question or a plan holds the turn until the person answers: say so before it waits.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion') {
      const first = (e as { questions?: { question?: string }[] }).questions?.[0]?.question ?? ''
      void notify($, STRINGS[lang].question, gist(first))
    } else if (e.tool === 'ExitPlanMode') {
      void notify($, STRINGS[lang].plan, '')
    }

    return next(e)
  })
}

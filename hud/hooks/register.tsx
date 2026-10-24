import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import type { HudLimit, HudSnap } from '../types'
import { launchClaude, pickFolder } from './open-project'
import type { Shell } from './open-project'

const TICK_MS = 30_000

const snap = atom({ plugin: 'hud', key: 'snap' } as const, null as HudSnap | null, { shape: 'snap-1' })
const lastTurnAt = atom({ plugin: 'hud', key: 'lastTurnAt' } as const, null as number | null)
const now = atom({ plugin: 'hud', key: 'now' } as const, 0)

let cacheTtlMs = 60 * 60_000

// `claude-opus-5-5` -> `Opus 5.5`; anything else is shown as given.
const prettyModel = (id: string) => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/i.exec(id)
  if (m === null) return id
  const name = (m[1] ?? '').charAt(0).toUpperCase() + (m[1] ?? '').slice(1)

  return m[3] === undefined || m[3].length > 2 ? `${name} ${m[2]}` : `${name} ${m[2]}.${m[3]}`
}

const kTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

// The same bar claude-hud draws: █/░, 10 cells from 100 columns, 6 from 60, else 4.
const barWidth = (columns: number) => (columns >= 100 ? 10 : columns >= 60 ? 6 : 4)

const bar = (percent: number, cells: number) => {
  const full = Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)))

  return '█'.repeat(full) + '░'.repeat(cells - full)
}

const levelColor = (percent: number) => (percent >= 80 ? 'red' : percent >= 50 ? 'yellow' : 'green')

type Lang = 'ru' | 'en'

const STRINGS = {
  ru: {
    context: 'Контекст',
    cacheNone: 'кэш —',
    cacheWorking: 'кэш ● ход идёт',
    cacheCold: 'кэш остыл',
    cacheLeft: (m: number) => `кэш ${m} мин`,
    pickTitle: 'Открыть Claude Code в папке',
    openCommand: 'Выбрать папку и открыть в ней Claude Code в новом окне',
    opened: (dir: string) => `Открыл Claude Code в ${dir}`,
    openFailed: 'Не получилось открыть новое окно терминала',
    cancelled: 'Папка не выбрана',
    weekdays: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
    resetIn: (h: number, m: number, hm: string) => `через ${h > 0 ? `${h}ч ${m}м` : `${m}м`} · ${hm}`,
    limits: { five_hour: 'Лимит 5ч', seven_day: 'Неделя', spend_limit: 'Бюджет' } as Record<string, string>,
  },
  en: {
    context: 'Context',
    cacheNone: 'cache —',
    cacheWorking: 'cache ● turn running',
    cacheCold: 'cache cold',
    cacheLeft: (m: number) => `cache ${m}m`,
    pickTitle: 'Open Claude Code in a folder',
    openCommand: 'Pick a folder and open Claude Code there in a new window',
    opened: (dir: string) => `Opened Claude Code in ${dir}`,
    openFailed: 'Could not open a new terminal window',
    cancelled: 'No folder picked',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    resetIn: (h: number, m: number, hm: string) => `in ${h > 0 ? `${h}h ${m}m` : `${m}m`} · ${hm}`,
    limits: { five_hour: 'Limit 5h', seven_day: 'Week', spend_limit: 'Budget' } as Record<string, string>,
  },
}

let lang: Lang = 'en'

// `auto`: the locale variables first, then Windows' UI language or regional format.
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

// `через 1ч 12м · 20:59` / `in 1h 12m · 20:59` within a day, `пт 14:00` / `Fri 14:00` past it.
const resetLabel = (iso: string | undefined, t: number) => {
  if (iso === undefined) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const L = STRINGS[lang]
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  const left = at.getTime() - t
  if (left >= 24 * 3_600_000) return `${L.weekdays[at.getDay()]} ${hm}`
  const minutes = Math.max(0, Math.ceil(left / 60_000))

  return L.resetIn(Math.floor(minutes / 60), minutes % 60, hm)
}

async function readGit($: EngineInterface, cwd: string) {
  try {
    const ran = await $.process.run(['git', 'status', '--porcelain=v1', '--branch'], { cwd, timeoutMs: 5_000 })
    if (ran.exitCode !== 0) return { branch: null, dirty: 0, ahead: 0, behind: 0 }
    const [head = '', ...rest] = ran.stdout.split('\n')
    const branch = /^## (?:No commits yet on )?([^.\s]+)/.exec(head)?.[1] ?? 'HEAD'

    return {
      branch,
      dirty: rest.filter(line => line.trim() !== '').length,
      ahead: Number(/ahead (\d+)/.exec(head)?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(head)?.[1] ?? 0),
    }
  } catch {
    return { branch: null, dirty: 0, ahead: 0, behind: 0 }
  }
}

async function refresh($: EngineInterface) {
  const [usage, model, cwd] = await Promise.all([$.session.usage(), $.session.model(), $.session.cwd()])
  const git = await readGit($, cwd)
  const limits: HudLimit[] = usage.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: l.resetsAt }))
  const next: HudSnap = {
    model: prettyModel(model),
    cwd,
    ...git,
    ctxTokens: usage.context.tokens,
    ctxWindow: usage.context.window,
    ctxPercent: usage.context.percent,
    costUsd: usage.cost?.usd,
    limits,
  }
  await update($, snap, () => next)
  await update($, now, () => Date.now())
}

async function safeRefresh($: EngineInterface) {
  try {
    await refresh($)
  } catch {
    // A failed read keeps the last figures on screen.
  }
}

// Pick a folder in an Explorer-style dialog and start Claude Code there in a new window.
async function openProject($: EngineInterface): Promise<string> {
  const L = STRINGS[lang]
  const folder = await pickFolder($, await $.session.cwd(), L.pickTitle)
  if (folder === null) return L.cancelled
  const text = (await launchClaude($, folder, shell)) ? L.opened(folder) : L.openFailed
  $.ui.toast(text)

  return text
}

// The HUD's three rows, then `below`: whatever the site drew beneath it.
async function drawHud($: EngineInterface, e: RenderInput, s: HudSnap, columns: number, isWorking: boolean, below: RenderElement) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const L = STRINGS[lang]
  const t = (await read($, now)) || Date.now()
  const last = await read($, lastTurnAt)
  const sep = <Text dimColor> │ </Text>

  const git =
    s.branch === null ? null : (
      <Text>
        <Text color="magenta">⎇ {s.branch}</Text>
        {s.dirty > 0 && <Text color="yellow"> ●{s.dirty}</Text>}
        {s.ahead > 0 && <Text color="cyan"> ↑{s.ahead}</Text>}
        {s.behind > 0 && <Text color="cyan"> ↓{s.behind}</Text>}
      </Text>
    )

  const ctxPercent = s.ctxPercent ?? (s.ctxTokens !== undefined && s.ctxWindow > 0 ? Math.round((s.ctxTokens / s.ctxWindow) * 100) : undefined)

  let cache = <Text dimColor>{L.cacheNone}</Text>
  if (isWorking) {
    cache = <Text color="green">{L.cacheWorking}</Text>
  } else if (last !== null) {
    const left = cacheTtlMs - (t - last)
    const minutes = Math.ceil(left / 60_000)
    cache =
      left <= 0 ? (
        <Text color="red">{L.cacheCold}</Text>
      ) : (
        <Text color={minutes <= 3 ? 'red' : minutes <= 10 ? 'yellow' : 'green'}>{L.cacheLeft(minutes)}</Text>
      )
  }

  const cells = barWidth(columns)
  const order = (kind: string) => (kind === 'five_hour' ? 0 : kind === 'seven_day' ? 1 : 2)
  const limits = [...s.limits].sort((a, b) => order(a.kind) - order(b.kind))
  // The 5-hour bar shares the context bar's row, so the two bars never stack into one block.
  const fiveHour = limits.find(l => l.kind === 'five_hour')
  const others = limits.filter(l => l.kind !== 'five_hour')
  const limitView = (l: HudLimit) => (
    <Text>
      <Text dimColor>{L.limits[l.kind] ?? l.kind} </Text>
      {l.kind === 'five_hour' && (
        <Text>
          <Text color={levelColor(l.percent)}>{bar(l.percent, cells)}</Text>{' '}
        </Text>
      )}
      <Text color={levelColor(l.percent)}>{Math.round(l.percent)}%</Text>
      {l.resetsAt !== undefined && (
        <Text>
          {'  '}
          <Text color="cyan">↻ </Text>
          <Text bold>{resetLabel(l.resetsAt, t)}</Text>
        </Text>
      )}
    </Text>
  )

  const room = Math.max(10, columns - 40)
  const cwd = s.cwd.length > room ? `…${s.cwd.slice(-(room - 1))}` : s.cwd

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text>
          <Text bold color="cyan">{s.model}</Text>
          {sep}
        </Text>
        {/* A click opens a folder picker, then Claude Code in a new window there. */}
        <Button key="open-project" plain onPress={() => void openProject($)}>
          {cwd}
        </Button>
        <Text wrap="truncate">
          {git !== null && sep}
          {git}
        </Text>
      </Box>
      <Text wrap="truncate">
        <Text dimColor>{L.context} </Text>
        {ctxPercent === undefined ? (
          <Text dimColor>—</Text>
        ) : (
          <Text>
            <Text color={levelColor(ctxPercent)}>{bar(ctxPercent, cells)}</Text>{' '}
            <Text color={levelColor(ctxPercent)}>{ctxPercent}%</Text>
            <Text dimColor>
              {' '}
              ({kTokens(s.ctxTokens ?? 0)}/{kTokens(s.ctxWindow)})
            </Text>
          </Text>
        )}
        {fiveHour !== undefined && sep}
        {fiveHour !== undefined && limitView(fiveHour)}
      </Text>
      <Text wrap="truncate">
        {others.map(l => (
          <Text>
            {limitView(l)}
            {sep}
          </Text>
        ))}
        {cache}
      </Text>
      {below}
    </Box>
  )
}

let position: 'above' | 'below' = 'below'
let shell: Shell = 'cmd'

export const register: Register = (on, options) => {
  const ttl = Number((options as { cacheTtlMinutes?: unknown }).cacheTtlMinutes ?? 60)
  cacheTtlMs = (Number.isFinite(ttl) && ttl > 0 ? ttl : 60) * 60_000
  position = (options as { position?: unknown }).position === 'above' ? 'above' : 'below'
  shell = (options as { shell?: unknown }).shell === 'powershell' ? 'powershell' : 'cmd'

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await resolveLang($, (options as { language?: unknown }).language)
    await $.command.register({ name: 'open-project', description: STRINGS[lang].openCommand })
    void safeRefresh($)
    $.clock.every(TICK_MS, () => void safeRefresh($))

    return started
  })

  on('command.run', { command: 'open-project' }, async $ => ({ text: await openProject($) }))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      await update($, lastTurnAt, () => Date.now())
      void safeRefresh($)
    }

    return done
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, lastTurnAt, () => null)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const s = await read($, snap)
    if (position !== 'above' || s === null || e.props.hasSurvey || e.props.view.agentId !== undefined) return below

    return drawHud($, e, s, e.props.bodyColumns, e.props.isWorking, below)
  })

  // Under the prompt, where a status-line HUD sits: the HUD, then the engine's own hint line.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e)
    const s = await read($, snap)
    if (position !== 'below' || s === null) return below

    return drawHud($, e, s, Math.max(20, (e.viewport?.columns ?? 120) - 4), e.props.isWorking, below)
  })
}

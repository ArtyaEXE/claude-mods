import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { HudLimit, HudSnap } from '../types'

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

const bar = (percent: number, cells = 10) => {
  const full = Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)))

  return '▰'.repeat(full) + '▱'.repeat(cells - full)
}

const levelColor = (percent: number) => (percent >= 80 ? 'red' : percent >= 50 ? 'yellow' : 'green')

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

const resetLabel = (iso: string | undefined, t: number) => {
  if (iso === undefined) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

  return at.getTime() - t < 24 * 3_600_000 ? hm : `${WEEKDAYS[at.getDay()]} ${hm}`
}

const LIMIT_NAMES: Record<string, string> = { five_hour: '5ч', seven_day: 'нед', spend_limit: 'бюджет' }

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

export const register: Register = (on, options) => {
  const ttl = Number((options as { cacheTtlMinutes?: unknown }).cacheTtlMinutes ?? 60)
  cacheTtlMs = (Number.isFinite(ttl) && ttl > 0 ? ttl : 60) * 60_000

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void safeRefresh($)
    $.clock.every(TICK_MS, () => void safeRefresh($))

    return started
  })

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
    if (s === null || e.props.hasSurvey || e.props.view.agentId !== undefined) return below

    const { Box, Text } = $.ui.resolve(e)
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

    let cache = <Text dimColor>кэш —</Text>
    if (e.props.isWorking) {
      cache = <Text color="green">кэш ● ход идёт</Text>
    } else if (last !== null) {
      const left = cacheTtlMs - (t - last)
      const minutes = Math.ceil(left / 60_000)
      cache =
        left <= 0 ? (
          <Text color="red">кэш остыл</Text>
        ) : (
          <Text color={minutes <= 3 ? 'red' : minutes <= 10 ? 'yellow' : 'green'}>кэш {minutes} мин</Text>
        )
    }

    const room = Math.max(10, e.props.bodyColumns - 40)
    const cwd = s.cwd.length > room ? `…${s.cwd.slice(-(room - 1))}` : s.cwd

    return (
      <Box flexDirection="column">
        <Text wrap="truncate">
          <Text bold color="cyan">{s.model}</Text>
          {sep}
          <Text>{cwd}</Text>
          {git !== null && sep}
          {git}
        </Text>
        <Text wrap="truncate">
          {ctxPercent === undefined ? (
            <Text dimColor>контекст —</Text>
          ) : (
            <Text>
              <Text color={levelColor(ctxPercent)}>{bar(ctxPercent)}</Text> {ctxPercent}%
              <Text dimColor>
                {' '}
                ({kTokens(s.ctxTokens ?? 0)}/{kTokens(s.ctxWindow)})
              </Text>
            </Text>
          )}
          {s.costUsd !== undefined && sep}
          {s.costUsd !== undefined && <Text>${s.costUsd.toFixed(2)}</Text>}
          {s.limits.map(l => (
            <Text>
              {sep}
              {LIMIT_NAMES[l.kind] ?? l.kind} <Text color={levelColor(l.percent)}>{Math.round(l.percent)}%</Text>
              {l.resetsAt !== undefined && <Text dimColor> ↻{resetLabel(l.resetsAt, t)}</Text>}
            </Text>
          ))}
          {sep}
          {cache}
        </Text>
        {below}
      </Box>
    )
  })
}

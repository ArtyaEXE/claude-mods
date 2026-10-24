import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Watched } from '../types'

const STALE_MS = 20 * 60_000
const SNOOZE_MS = 20 * 60_000
const TICK_MS = 60_000
const PANE = 'bg-watchdog'

const items = atom({ plugin: 'bg-watchdog', key: 'items' } as const, [] as Watched[], { shape: 'items-1' })
const snoozed = atom({ plugin: 'bg-watchdog', key: 'snoozed' } as const, {} as Record<string, number>)
const now = atom({ plugin: 'bg-watchdog', key: 'now' } as const, 0)

// Listening processes of the usual dev runtimes, with their start time and ports, as JSON.
const SCAN = String.raw`
$dev = '^(node|python|pythonw|py|bun|deno|java|ruby|php|dotnet|uvicorn|go)$'
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Group-Object OwningProcess |
  ForEach-Object {
    $p = Get-Process -Id $_.Name -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -match $dev) {
      $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Name)" -ErrorAction SilentlyContinue).CommandLine
      [pscustomobject]@{
        pid   = [int]$_.Name
        name  = $p.ProcessName
        start = ([datetimeoffset]$p.StartTime).ToUnixTimeMilliseconds()
        ports = @($_.Group | ForEach-Object { $_.LocalPort } | Sort-Object -Unique)
        cmd   = "$cmd"
      }
    }
  } | ConvertTo-Json -Compress -Depth 3
`

type Scanned = { pid: number; name: string; start: number; ports: number | number[]; cmd: string }

const minutes = (ms: number) => {
  const m = Math.floor(ms / 60_000)

  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`
}

const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const describe = (w: Watched) => (w.ports?.length ? `${w.label} (порт ${w.ports.join(', ')})` : w.label)

let sessionStartedAt = 0

async function scanPorts($: EngineInterface) {
  const ran = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', SCAN], {
    timeoutMs: 20_000,
  })
  if (ran.exitCode !== 0) return
  const text = ran.stdout.trim()
  const parsed: Scanned[] = text === '' ? [] : [JSON.parse(text)].flat()
  // Only what was started while this session ran: the person's own long-lived servers are not tails.
  const fresh: Watched[] = parsed
    .filter(p => p.start >= sessionStartedAt)
    .map(p => ({
      id: `pid:${p.pid}`,
      kind: 'port',
      label: short(p.cmd.trim() || p.name),
      startedAt: p.start,
      pid: p.pid,
      ports: [p.ports].flat(),
    }))
  await update($, items, list => [...list.filter(w => w.kind === 'task'), ...fresh])
}

async function tick($: EngineInterface) {
  await update($, now, () => Date.now())
  try {
    await scanPorts($)
  } catch {
    // A failed scan keeps the last list.
  }
}

async function stop($: EngineInterface, w: Watched) {
  if (w.kind === 'task' && w.taskId !== undefined) {
    const ran = await $.tool.call({ tool: 'TaskStop', task_id: w.taskId })
    if (ran.deny !== undefined || ran.isError === true) {
      $.ui.toast(`bg-watchdog: не смог остановить задачу ${w.taskId}`)

      return
    }
  } else if (w.pid !== undefined) {
    const ran = await $.process.run(['taskkill.exe', '/PID', String(w.pid), '/T', '/F'])
    if (ran.exitCode !== 0) {
      $.ui.toast(`bg-watchdog: taskkill ${w.pid} не прошёл: ${short(ran.stderr.trim(), 120)}`)

      return
    }
  }
  await update($, items, list => list.filter(one => one.id !== w.id))
  $.ui.toast(`bg-watchdog: остановлено: ${short(w.label, 50)}`)
}

async function snooze($: EngineInterface, w: Watched, until: number) {
  await update($, snoozed, map => ({ ...map, [w.id]: until }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    sessionStartedAt = (await $.session.usage()).startedAt
    await $.command.register({ name: 'bg-tasks', description: 'Фоновые задачи и dev-серверы этой сессии' })
    void tick($)
    $.clock.every(TICK_MS, () => void tick($))

    return started
  })

  on('command.run', { command: 'bg-tasks' }, async $ => {
    void tick($)
    await $.ui.open({ id: PANE, title: 'Фоновые процессы', focus: true, closeOnEscape: true })

    return { text: 'Открыл панель фоновых процессов.' }
  })

  // A command or monitor moved to the background: remember when it started.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return ran
    if (e.tool !== 'Bash' && e.tool !== 'PowerShell' && e.tool !== 'Monitor') return ran

    const result = (ran.result ?? {}) as { backgroundTaskId?: string; taskId?: string }
    const taskId = result.backgroundTaskId ?? (e.tool === 'Monitor' ? result.taskId : undefined)
    if (taskId === undefined) return ran

    const input = e as { command?: unknown; description?: unknown }
    const label = short(String(input.description ?? input.command ?? e.tool))
    const at = Date.now()
    await update($, items, list => [
      ...list.filter(w => w.id !== `task:${taskId}`),
      { id: `task:${taskId}`, kind: 'task' as const, label, startedAt: at, taskId },
    ])

    return ran
  })

  // Each turn's end lists the work still in flight: what is not there has finished.
  on('classic.Stop', async ($, e, next) => {
    const live = e.background_tasks
    if (live !== undefined) {
      const ids = new Set(live.map(t => t.id))
      const at = Date.now()
      await update($, items, list => {
        const kept = list.filter(w => w.kind !== 'task' || (w.taskId !== undefined && ids.has(w.taskId)))
        const known = new Set(kept.map(w => w.taskId))
        const added: Watched[] = live
          .filter(t => !known.has(t.id) && (t.type === 'shell' || t.type === 'monitor'))
          .map(t => ({
            id: `task:${t.id}`,
            kind: 'task',
            label: short(t.description || t.command || t.type),
            startedAt: at,
            taskId: t.id,
          }))

        return [...kept, ...added]
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || e.props.view.agentId !== undefined) return below

    const t = (await read($, now)) || Date.now()
    const snoozes = await read($, snoozed)
    const stale = (await read($, items)).filter(w => t - w.startedAt >= STALE_MS && (snoozes[w.id] ?? 0) <= t)
    if (stale.length === 0) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const shown = stale.slice(0, 3)

    return (
      <Box flexDirection="column">
        {shown.map(w => (
          <Box flexDirection="row" gap={1}>
            <Text>
              <Text color="yellow">Висит {minutes(t - w.startedAt)}:</Text> {short(describe(w), Math.max(20, e.props.bodyColumns - 60))}
            </Text>
            <Button key={`stop-${w.id}`} variant="primary" label="Остановить" onPress={() => stop($, w)} />
            <Button key={`snooze-${w.id}`} label="Отложить 20 мин" onPress={() => snooze($, w, Date.now() + SNOOZE_MS)} />
            <Button key={`hide-${w.id}`} label="Скрыть" onPress={() => snooze($, w, Number.MAX_SAFE_INTEGER)} />
          </Box>
        ))}
        {stale.length > shown.length && <Text dimColor>…и ещё {stale.length - shown.length}, всё в /bg-tasks</Text>}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const t = (await read($, now)) || Date.now()
    const list = await read($, items)

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>Ничего не висит: фоновых задач и dev-серверов этой сессии нет.</Text>}
        {list.map(w => (
          <Box flexDirection="column">
            <Text>
              <Text color={t - w.startedAt >= STALE_MS ? 'yellow' : undefined}>{minutes(t - w.startedAt)}</Text>{' '}
              <Text dimColor>{w.kind === 'task' ? 'задача' : `PID ${w.pid}`}</Text> {short(describe(w), Math.max(20, e.props.bodyColumns - 20))}
            </Text>
            <Button key={`pane-stop-${w.id}`} label="Остановить" onPress={() => stop($, w)} />
          </Box>
        ))}
        <Button key="refresh" plain label="Обновить" onPress={() => tick($)} />
      </Box>
    )
  })
}

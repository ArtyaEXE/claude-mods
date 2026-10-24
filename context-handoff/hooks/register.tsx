import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { HandoffOffer, HandoffPhase } from '../types'

const THRESHOLDS = [350_000, 600_000, 800_000]

const offer = atom({ plugin: 'context-handoff', key: 'offer' } as const, null as HandoffOffer | null)
// The highest threshold already offered (or declined) in this context.
const passed = atom({ plugin: 'context-handoff', key: 'passed' } as const, 0)
const phase = atom({ plugin: 'context-handoff', key: 'phase' } as const, { kind: 'idle' } as HandoffPhase)

const kTokens = (n: number) => `${Math.round(n / 1000)}k`

const stamp = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')

  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

const writePrompt = (path: string) => `Контекст этой сессии разросся, переезжаем в чистую сессию. Запиши handoff-файл для следующего агента: ${path}

Это единственное, что увидит новый агент, поэтому пиши так, чтобы он продолжил без вопросов:
1. Цель: что мы делаем и зачем, в 2-3 предложениях.
2. Что уже сделано: ключевые изменения, с полными путями файлов.
3. Где остановились: текущий шаг и что именно осталось.
4. Решения и договорённости с пользователем, которые нельзя потерять (и почему так решили).
5. Грабли: что не сработало, ошибки, особенности окружения.
6. Следующие шаги: конкретный список по порядку.
7. Важные команды, пути, URL, имена.

Только факты, без воды. Создай папку, если её нет. Больше ничего не делай, после записи коротко ответь "handoff готов".`

const resumePrompt = (path: string) =>
  `Ты продолжаешь работу предыдущей сессии. Прочитай handoff-файл ${path} целиком и продолжи с места, где там указано, что мы остановились. Сначала в 2-3 строках скажи, как ты понял текущий шаг.`

async function startHandoff($: EngineInterface) {
  const root = (await $.session.root()).replace(/\\/g, '/')
  const path = `${root}/.handoff/handoff-${stamp(await $.clock.now())}.md`
  await update($, offer, () => null)
  await update($, phase, () => ({ kind: 'writing', path }) as HandoffPhase)
  void $.prompt.submit({ text: writePrompt(path) })
}

// Runs from a timer: /clear cannot run inside a hook the turn waits on.
async function move($: EngineInterface, path: string) {
  try {
    await $.command.run({ command: 'clear', args: '' })
    await update($, passed, () => 0)
    await update($, phase, () => ({ kind: 'idle' }) as HandoffPhase)
    await $.prompt.submit({ text: resumePrompt(path) })
  } catch (error) {
    await update($, phase, () => ({ kind: 'idle' }) as HandoffPhase)
    $.ui.toast(`context-handoff: не смог очистить чат (${String(error)}). Сделай /clear вручную и попроси прочитать ${path}`, {
      timeoutMs: 15000,
    })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff',
      description: 'Переехать в чистую сессию через handoff-файл прямо сейчас',
    })

    return next(e)
  })

  on('command.run', { command: 'handoff' }, async $ => {
    await startHandoff($)

    return { text: 'Готовлю handoff: агент запишет файл, потом чат очистится и новый агент продолжит.' }
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, passed, () => 0)
      await update($, offer, () => null)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done

    const now = await read($, phase)
    if (now.kind === 'writing') {
      if (await $.fs.exists(now.path)) {
        await update($, phase, () => ({ kind: 'moving', path: now.path }) as HandoffPhase)
        $.clock.after(300, () => void move($, now.path))
      } else {
        await update($, phase, () => ({ kind: 'idle' }) as HandoffPhase)
        $.ui.toast(`context-handoff: файл ${now.path} не появился, переезд отменён`, { timeoutMs: 10000 })
      }

      return done
    }
    if (now.kind === 'moving') return done

    const tokens = (await $.session.usage()).context.tokens ?? 0
    const already = await read($, passed)
    const crossed = THRESHOLDS.filter(t => t <= tokens && t > already).at(-1)
    if (crossed !== undefined) await update($, offer, () => ({ tokens, threshold: crossed }))

    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const shown = await read($, offer)
    if (shown === null || e.props.hasSurvey || e.props.isWorking || e.props.view.agentId !== undefined) {
      return below
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const later = async () => {
      await update($, passed, () => shown.threshold)
      await update($, offer, () => null)
    }
    const never = async () => {
      await update($, passed, () => Number.MAX_SAFE_INTEGER)
      await update($, offer, () => null)
    }

    return (
      <Box flexDirection="column">
        <Text>
          <Text color="yellow">Контекст {kTokens(shown.tokens)} токенов.</Text> Дальше агент начинает «плыть». Переехать в
          чистую сессию через handoff-файл?
        </Text>
        <Box flexDirection="row" gap={1}>
          <Button key="move" variant="primary" label="Переехать" onPress={() => startHandoff($)} />
          <Button key="later" label="Позже" onPress={later} />
          <Button key="never" label="Не предлагать в этой сессии" onPress={never} />
        </Box>
        {below}
      </Box>
    )
  })
}

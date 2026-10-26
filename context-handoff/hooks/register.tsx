import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { HandoffOffer, HandoffPhase } from '../types'

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

const STRINGS = {
  ru: {
    writePrompt: (path: string) => `Контекст этой сессии разросся, переезжаем в чистую сессию. Запиши handoff-файл для следующего агента: ${path}

Это единственное, что увидит новый агент, поэтому пиши так, чтобы он продолжил без вопросов:
1. Цель: что мы делаем и зачем, в 2-3 предложениях.
2. Что уже сделано: ключевые изменения, с полными путями файлов.
3. Где остановились: текущий шаг и что именно осталось.
4. Решения и договорённости с пользователем, которые нельзя потерять (и почему так решили).
5. Грабли: что не сработало, ошибки, особенности окружения.
6. Следующие шаги: конкретный список по порядку.
7. Важные команды, пути, URL, имена.

Только факты, без воды. Создай папку, если её нет. Больше ничего не делай, после записи коротко ответь "handoff готов".`,
    resumePrompt: (path: string) =>
      `Ты продолжаешь работу предыдущей сессии. Прочитай handoff-файл ${path} целиком и продолжи с места, где там указано, что мы остановились. Сначала в 2-3 строках скажи, как ты понял текущий шаг.`,
    clearFailed: (error: string, path: string) =>
      `context-handoff: не смог очистить чат (${error}). Сделай /clear вручную и попроси прочитать ${path}`,
    noFile: (path: string) => `context-handoff: файл ${path} не появился, переезд отменён`,
    command: 'Переехать в чистую сессию через handoff-файл прямо сейчас',
    started: 'Готовлю handoff: агент запишет файл, потом чат очистится и новый агент продолжит.',
    bandTitle: (tokens: string) => `Контекст ${tokens} токенов.`,
    bandBody: ' Дальше агент начинает «плыть». Переехать в чистую сессию через handoff-файл?',
    move: 'Переехать',
    later: 'Позже',
    never: 'Не предлагать в этой сессии',
  },
  en: {
    writePrompt: (path: string) => `This session's context has grown large, so we are moving to a fresh session. Write a handoff file for the next agent: ${path}

It is the only thing the new agent will see, so write it so that it can continue without asking:
1. Goal: what we are doing and why, in 2-3 sentences.
2. Done so far: the key changes, with full file paths.
3. Where we stopped: the current step and exactly what is left.
4. Decisions and agreements with the user that must not be lost (and why they were made).
5. Pitfalls: what did not work, errors, quirks of the environment.
6. Next steps: a concrete ordered list.
7. Important commands, paths, URLs, names.

Facts only, no filler. Create the folder if it does not exist. Do nothing else; once written, reply briefly "handoff ready".`,
    resumePrompt: (path: string) =>
      `You are continuing the previous session's work. Read the handoff file ${path} in full and continue from where it says we stopped. First say in 2-3 lines how you understand the current step.`,
    clearFailed: (error: string, path: string) =>
      `context-handoff: could not clear the chat (${error}). Run /clear yourself and ask to read ${path}`,
    noFile: (path: string) => `context-handoff: ${path} did not appear, the move is cancelled`,
    command: 'Move to a fresh session through a handoff file right now',
    started: 'Preparing the handoff: the agent writes the file, then the chat clears and a fresh agent continues.',
    bandTitle: (tokens: string) => `Context at ${tokens} tokens.`,
    bandBody: ' From here the agent starts to drift. Move to a fresh session through a handoff file?',
    move: 'Move',
    later: 'Later',
    never: 'Not in this session',
  },
}

let lang: Lang = 'en'

async function startHandoff($: EngineInterface) {
  const root = (await $.session.root()).replace(/\\/g, '/')
  const path = `${root}/.handoff/handoff-${stamp(await $.clock.now())}.md`
  await update($, offer, () => null)
  // 'requested' until the prompt actually enters: a turn that ends before it must not cancel the move.
  await update($, phase, () => ({ kind: 'requested', path }) as HandoffPhase)
  const sent = await $.prompt.submit({ text: STRINGS[lang].writePrompt(path) })
  if (sent.drop !== undefined) {
    await update($, phase, () => ({ kind: 'idle' }) as HandoffPhase)
    $.ui.toast(STRINGS[lang].noFile(path), { timeoutMs: 10000 })

    return
  }
  // The writing turn may already be over by the time the submit resolves.
  if (await $.fs.exists(path)) {
    await update($, phase, () => ({ kind: 'moving', path }) as HandoffPhase)
    $.clock.after(300, () => void move($, path))
  } else {
    await update($, phase, () => ({ kind: 'writing', path }) as HandoffPhase)
  }
}

// Runs from a timer: /clear cannot run inside a hook the turn waits on.
async function move($: EngineInterface, path: string) {
  try {
    await $.command.run({ command: 'clear', args: '' })
    await update($, passed, () => 0)
    await update($, phase, () => ({ kind: 'idle' }) as HandoffPhase)
    await $.prompt.submit({ text: STRINGS[lang].resumePrompt(path) })
  } catch (error) {
    await update($, phase, () => ({ kind: 'idle' }) as HandoffPhase)
    $.ui.toast(STRINGS[lang].clearFailed(String(error), path), { timeoutMs: 15000 })
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    lang = await resolveLang($, (options as { language?: unknown }).language)
    await $.command.register({ name: 'handoff', description: STRINGS[lang].command })

    return next(e)
  })

  // Submitted from a timer: a prompt submitted while the command itself is running gets lost.
  on('command.run', { command: 'handoff' }, async $ => {
    $.clock.after(300, () => void startHandoff($))

    return { text: STRINGS[lang].started }
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
        $.ui.toast(STRINGS[lang].noFile(now.path), { timeoutMs: 10000 })
      }

      return done
    }
    if (now.kind === 'moving' || now.kind === 'requested') return done

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
    const L = STRINGS[lang]
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
          <Text color="yellow">{L.bandTitle(kTokens(shown.tokens))}</Text>
          {L.bandBody}
        </Text>
        <Box flexDirection="row" gap={1}>
          <Button key="move" variant="primary" label={L.move} onPress={() => startHandoff($)} />
          <Button key="later" label={L.later} onPress={later} />
          <Button key="never" label={L.never} onPress={never} />
        </Box>
        {below}
      </Box>
    )
  })
}

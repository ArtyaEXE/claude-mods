import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// The test runtime has timers; the hooks environment's types do not declare them.
declare const setTimeout: (run: () => void, ms: number) => unknown

type Sent = { kind: 'toast' | 'flash' | 'telegram' | 'warning'; title: string; body: string }

type Seen = { focused: boolean; idleMs: number; toasts?: 'on' | 'off' | 'app-off'; hwnd?: number }

const OK = { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

// The engine beneath the mod: a probe answering `seen`; toasts, flashes, Telegram messages and the mod's
// own warnings recorded in `sent`; a store in `store`.
function engine(on: Parameters<TestBody>[1], seen: Seen, sent: Sent[], store = new Map<string, unknown>()) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'D:/Dev/proj' }))
  on('command.register', () => ({ value: { command: 'notify' } }))
  on('ui.toast', (_, e) => {
    sent.push({ kind: 'warning', title: e.text, body: '' })

    return { value: undefined }
  })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('process.run', (_, e) => {
    const env = e.init?.env
    if (env?.TURN_NOTIFY_TITLE !== undefined) {
      sent.push({ kind: 'toast', title: env.TURN_NOTIFY_TITLE, body: env.TURN_NOTIFY_BODY ?? '' })

      return { value: { ...OK, stdout: '' } }
    }
    if (env?.TURN_NOTIFY_HWND !== undefined) {
      sent.push({ kind: 'flash', title: env.TURN_NOTIFY_HWND, body: '' })

      return { value: { ...OK, stdout: '' } }
    }

    return { value: { ...OK, stdout: JSON.stringify({ toasts: 'on', hwnd: 7, ...seen }) } }
  })
  on('http.fetch', (_, e) => {
    const { text } = JSON.parse(e.init?.body ?? '{}') as { text: string }
    const [title, ...rest] = text.split('\n')
    sent.push({ kind: 'telegram', title: title ?? '', body: rest.join('\n') })

    return { value: { status: 200, ok: true, headers: {}, text: '{"ok":true}' } }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('classic.Notification', () => ({}))
  on('tool.call', () => ({ result: { answers: {} }, text: 'answered' }))
}

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 50))

const run = (args: string) => ({ command: 'notify', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

const START = { cwd: 'D:/Dev/proj', surface: 'terminal', isInteractive: true } as const

test('a long turn ends with a toast while the terminal is in the background', { options: { language: 'ru' } }, async ($, on) => {
  const sent: Sent[] = []
  engine(on, { focused: false, idleMs: 1_000 }, sent)
  await $.session.start(START)

  await $.turn.complete({ answer: '## Итог\n\n**Готово**: тесты зелёные.', durationMs: 192_000, isAborted: false, reason: 'answer', turnId: 't1' })
  await settle()
  expect(sent).toEqual([{ kind: 'toast', title: 'Claude Code · proj: Готово за 3 мин 12 с', body: 'Итог' }])
})

test('nothing is sent for a short turn, an interrupted one, or while the terminal is in front', { options: { language: 'en' } }, async ($, on) => {
  const sent: Sent[] = []
  const seen = { focused: false, idleMs: 0 }
  engine(on, seen, sent)
  await $.session.start(START)

  await $.turn.complete({ answer: 'ok', durationMs: 5_000, isAborted: false, reason: 'answer', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 90_000, isAborted: true, reason: 'aborted', turnId: 't2' })
  seen.focused = true
  await $.turn.complete({ answer: 'ok', durationMs: 90_000, isAborted: false, reason: 'answer', turnId: 't3' })
  await settle()
  expect(sent).toEqual([])
})

test('a question waits: toast, and Telegram once the person is away', {
  options: { language: 'en', telegramToken: '123:abc', telegramChatId: '42', awayMinutes: 5 },
}, async ($, on) => {
  const sent: Sent[] = []
  engine(on, { focused: false, idleMs: 6 * 60_000 }, sent)
  await $.session.start(START)

  await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Which **database**?', header: 'DB', options: [{ label: 'a', description: 'a' }, { label: 'b', description: 'b' }], multiSelect: false }] })
  await settle()
  expect(sent).toEqual([
    { kind: 'toast', title: 'Claude Code · proj: Asking you a question', body: 'Which database?' },
    { kind: 'telegram', title: 'Claude Code · proj: Asking you a question', body: 'Which database?' },
  ])
})

test('/notify off mutes, /notify test still sends', { options: { language: 'ru' } }, async ($, on) => {
  const sent: Sent[] = []
  engine(on, { focused: true, idleMs: 0 }, sent)
  await $.session.start(START)

  expect((await $.command.run(run('off'))).text).toMatch(/выключены/)
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  await settle()
  expect(sent).toEqual([])

  expect((await $.command.run(run('test'))).text).toBe('Показал уведомление Windows.')
  expect(sent).toEqual([{ kind: 'toast', title: 'Claude Code · proj: Проверка уведомления', body: 'Если вы это видите, уведомления работают.' }])
})

test('with Windows notifications off: one warning, then the taskbar flashes instead', { options: { language: 'ru' } }, async ($, on) => {
  const sent: Sent[] = []
  const store = new Map<string, unknown>()
  engine(on, { focused: false, idleMs: 0, toasts: 'off', hwnd: 1050064 }, sent, store)
  await $.session.start(START)
  await settle()
  expect(sent).toEqual([
    {
      kind: 'warning',
      title: 'turn-notify: Уведомления Windows выключены в системе (Параметры → Система → Уведомления). Пока они выключены, мигаю кнопкой терминала на панели задач и подаю звук.',
      body: '',
    },
  ])

  // The next session says nothing: the warning was given.
  sent.length = 0
  await $.session.start(START)
  await settle()
  expect(sent).toEqual([])

  await $.turn.complete({ answer: 'ok', durationMs: 60_000, isAborted: false, reason: 'answer', turnId: 't1' })
  await settle()
  expect(sent).toEqual([{ kind: 'flash', title: '1050064', body: '' }])

  expect((await $.command.run(run('test'))).text).toBe(
    'Уведомления Windows выключены в системе (Параметры → Система → Уведомления), поэтому мигнул кнопкой терминала на панели задач и подал звук.',
  )
  expect((await $.command.run(run(''))).text).toMatch(/выключены в системе .*: вместо них мигаю кнопкой терминала/)
})

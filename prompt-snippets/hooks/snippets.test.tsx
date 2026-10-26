import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const START = { cwd: 'D:/proj', surface: 'terminal', isInteractive: true } as const
const run = (args: string) => ({ command: 'snip', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

const PANE = {
  plugin: 'prompt-snippets',
  component: 'Pane',
  requestId: 'prompt-snippets',
  props: { title: 's', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

type World = { sent: string[]; filled: string[] }

// The engine beneath: a store, a prompt that records what reaches the model, a box that records what it takes.
function engine(on: Parameters<TestBody>[1], w: World) {
  const store = new Map<string, unknown>()
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'snip' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('prompt.submit', (_, e) => {
    w.sent.push(e.text)

    return { text: e.text }
  })
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  on('prompt.fill', (_, e) => {
    w.filled.push(e.text)

    return { isFilled: true }
  })
}

test('the last prompt is saved by name, then ;name expands: as a suggestion and when sent as it is', { options: { language: 'ru' } }, async ($, on) => {
  const w: World = { sent: [], filled: [] }
  engine(on, w)
  await $.session.start(START)

  expect((await $.command.run(run('save ревью'))).text).toContain('Пока нечего сохранять')
  await $.prompt.submit(typed('Сделай ревью диффа:\n- баги\n- упрощения'))
  expect((await $.command.run(run('save ревью'))).text).toBe('Сохранил ;ревью (38 симв.). В промпте: ;ревью')

  // The kit raises prompt.autocomplete like any event; its typings leave it off the prompt noun.
  const prompt = $.prompt as unknown as { autocomplete: (e: { text: string; cursor: number; token: string; start: number }) => Promise<{ suggestions: unknown[] }> }
  const rows = (await prompt.autocomplete({ text: 'ну ;ре', cursor: 6, token: ';ре', start: 3 })).suggestions
  expect(rows).toEqual([{ text: 'Сделай ревью диффа:\n- баги\n- упрощения', label: ';ревью', description: 'Сделай ревью диффа:' }])

  await $.prompt.submit(typed(';ревью для файла a.ts; и ;нет такого'))
  expect(w.sent.at(-1)).toBe('Сделай ревью диффа:\n- баги\n- упрощения для файла a.ts; и ;нет такого')
})

test('/snip save with text, the pane inserts without touching the draft and deletes; rm and bad names', { options: { language: 'en' } }, async ($, on) => {
  const w: World = { sent: [], filled: [] }
  engine(on, w)
  await $.session.start(START)

  expect((await $.command.run(run('save fix   Fix the failing test,\nthen run it again.'))).text).toBe('Saved ;fix (40 chars). In a prompt: ;fix')
  expect((await $.command.run(run('save bad/name text'))).text).toContain('will not do as a name')
  // A name that also occurs in the word `save` must not cut the text short.
  await $.command.run(run('save a all good'))
  await $.command.run(run(''))
  const panel = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await panel.press({ key: 'insert:a' })
  expect(w.filled).toEqual(['all good'])
  await panel.press({ key: 'remove:a' })
  await panel.unmount()
  w.filled.length = 0

  await $.command.run(run(''))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'insert:fix' })
  expect(w.filled).toEqual(['Fix the failing test,\nthen run it again.'])
  await ui.press({ key: 'remove:fix' })
  expect((await ui.find({ type: 'Text', text: /No snippets yet/ }))?.text).toContain('No snippets yet')
  await ui.unmount()

  expect((await $.command.run(run('rm fix'))).text).toBe('There is no ;fix.')
})

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snippet } from '../types'

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

const PANE = 'prompt-snippets'
const list = atom({ plugin: 'prompt-snippets', key: 'list' } as const, [] as Snippet[], { shape: 'list-1' })

// A snippet's name: letters (any script), digits, `_` and `-`.
const NAME = /^[\p{L}\p{N}_-]+$/u
// `;name` standing alone in a prompt: at the start or after whitespace, up to whitespace or the end.
const MENTION = /(^|\s);([\p{L}\p{N}_-]+)(?=\s|$)/gu

const STRINGS = {
  ru: {
    command: 'Сниппеты промптов: ;имя в промпте; /snip save имя [текст] | rm имя',
    paneTitle: 'Сниппеты',
    opened: 'Открыл панель сниппетов.',
    empty: 'Сниппетов нет. Отправьте промпт и сохраните его: /snip save имя — или сразу с текстом: /snip save имя текст.',
    hint: 'В промпте: ;имя — подсказка подставит текст',
    insert: 'Вставить',
    remove: 'Удалить',
    saved: (name: string, n: number) => `Сохранил ;${name} (${n} симв.). В промпте: ;${name}`,
    replaced: (name: string) => `Перезаписал ;${name}.`,
    removed: (name: string) => `Удалил ;${name}.`,
    noSuch: (name: string) => `Сниппета ;${name} нет.`,
    noLast: 'Пока нечего сохранять: отправьте промпт, затем /snip save имя. Или: /snip save имя текст.',
    badName: (name: string) => `Имя «${name}» не подходит: только буквы, цифры, _ и -.`,
    usage: 'Использование: /snip, /snip save имя [текст], /snip rm имя',
  },
  en: {
    command: 'Prompt snippets: ;name in the prompt; /snip save name [text] | rm name',
    paneTitle: 'Snippets',
    opened: 'Opened the snippets pane.',
    empty: 'No snippets yet. Send a prompt and keep it: /snip save name — or with the text right away: /snip save name text.',
    hint: 'In a prompt: ;name — the suggestion puts the text in',
    insert: 'Insert',
    remove: 'Delete',
    saved: (name: string, n: number) => `Saved ;${name} (${n} chars). In a prompt: ;${name}`,
    replaced: (name: string) => `Replaced ;${name}.`,
    removed: (name: string) => `Deleted ;${name}.`,
    noSuch: (name: string) => `There is no ;${name}.`,
    noLast: 'Nothing to save yet: send a prompt, then /snip save name. Or: /snip save name text.',
    badName: (name: string) => `"${name}" will not do as a name: letters, digits, _ and - only.`,
    usage: 'Usage: /snip, /snip save name [text], /snip rm name',
  },
}

let lang: Lang = 'en'

type Saved = Record<string, string>

async function load($: EngineInterface): Promise<Saved> {
  const raw = await $.store.get('snippets')

  return raw !== null && typeof raw === 'object' ? (raw as Saved) : {}
}

async function store($: EngineInterface, saved: Saved) {
  await $.store.set('snippets', saved)
  await update($, list, () =>
    Object.entries(saved)
      .map(([name, text]) => ({ name, text }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
}

const firstLine = (text: string, n = 70) => {
  const line = text.split('\n').find(l => l.trim() !== '')?.trim() ?? ''

  return line.length > n ? `${line.slice(0, n - 1)}…` : line
}

async function remove($: EngineInterface, name: string) {
  const saved = await load($)
  delete saved[name]
  await store($, saved)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await resolveLang($, (options as { language?: unknown }).language)
    await $.command.register({ name: 'snip', description: STRINGS[lang].command, argumentHint: 'save <name> [text] | rm <name>' })
    await store($, await load($))

    return started
  })

  on('command.run', { command: 'snip' }, async ($, e) => {
    const L = STRINGS[lang]
    const [verb = '', name = '', ...rest] = e.args.trim().split(/\s+/)
    if (verb === '') {
      await $.ui.open({ id: PANE, title: L.paneTitle, focus: true, closeOnEscape: true })

      return { text: L.opened }
    }
    if (verb !== 'save' && verb !== 'rm') return { text: L.usage }
    if (!NAME.test(name)) return { text: name === '' ? L.usage : L.badName(name) }

    const saved = await load($)
    if (verb === 'rm') {
      if (saved[name] === undefined) return { text: L.noSuch(name) }
      await remove($, name)

      return { text: L.removed(name) }
    }
    // The text after the name as typed (spacing and lines kept), else the last prompt sent.
    const given = rest.length > 0 ? e.args.trim().replace(/^\S+\s+\S+\s*/, '') : ''
    const last = await $.store.get('lastPrompt')
    const text = given !== '' ? given : typeof last === 'string' ? last : ''
    if (text === '') return { text: L.noLast }
    const existed = saved[name] !== undefined
    await store($, { ...saved, [name]: text })

    return { text: existed ? L.replaced(name) : L.saved(name, text.length) }
  })

  // `;na…` while typing: the snippets whose names start so, each writing its whole text in place of the token.
  on('prompt.autocomplete', { token: /^;/ }, async ($, e, next) => {
    const below = await next(e)
    const typed = e.token.slice(1).toLowerCase()
    const mine = (await read($, list))
      .filter(s => s.name.toLowerCase().startsWith(typed))
      .map(s => ({ text: s.text, label: `;${s.name}`, description: firstLine(s.text) }))

    return { suggestions: [...mine, ...below.suggestions] }
  })

  // A `;name` sent as it is expands to its text; a prompt typed by the person is kept as the last one, for /snip save.
  on('prompt.submit', async ($, e, next) => {
    // The person's own words: typed here, or sent from the phone through Remote Control.
    if ((e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') || e.text.trimStart().startsWith('/')) return next(e)
    const saved = await load($)
    const text = e.text.replace(MENTION, (whole, lead: string, name: string) => (saved[name] === undefined ? whole : `${lead}${saved[name]}`))
    await $.store.set('lastPrompt', e.text)

    return next(text === e.text ? e : { ...e, text })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const L = STRINGS[lang]
    const snippets = await read($, list)
    const width = Math.max(20, e.props.bodyColumns - 30)

    return (
      <Box flexDirection="column">
        {snippets.length === 0 ? <Text dimColor>{L.empty}</Text> : <Text dimColor>{L.hint}</Text>}
        {snippets.map(s => (
          <Box flexDirection="row" gap={1}>
            <Text color="cyan">;{s.name}</Text>
            <Text dimColor wrap="truncate">
              {firstLine(s.text, width)}
            </Text>
            <Button key={`insert:${s.name}`} plain label={L.insert} onPress={() => void $.prompt.fill({ text: s.text, mode: 'insert' })} />
            <Button key={`remove:${s.name}`} plain dimColor label={L.remove} onPress={() => remove($, s.name)} />
          </Box>
        ))}
      </Box>
    )
  })
}

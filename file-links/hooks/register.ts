import type { EngineInterface, Register } from 'claude-code'

// A mention is either `inline code` that looks like a path, or a bare
// absolute Windows path. A `:12` or `:12:3` line suffix is kept outside the link.
const CODE_MENTION = /`([^`\n]{2,260})`/g
const BARE_ABSOLUTE = /(?<![\w/\\`(\[])([A-Za-z]:[\\/][^\s`<>"'()\[\]*|?]+)/g
const LINE_SUFFIX = /:(\d+)(?::\d+)?$/

// Path-shaped: has a separator or a file extension, and nothing a command has.
const looksLikePath = (s: string) =>
  !/\s{2}|[<>|"*?]|^\w+\(|=/.test(s) && (/[\\/]/.test(s) || /\.[A-Za-z0-9]{1,8}$/.test(s)) && !/^https?:/i.test(s)

const isAbsolute = (s: string) => /^[A-Za-z]:[\\/]/.test(s) || s.startsWith('/') || s.startsWith('~')

const fileUrl = (abs: string) =>
  'file:///' +
  abs
    .replace(/\\/g, '/')
    .split('/')
    .map((part, i) => (i === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join('/')

const MAX_CACHE = 2000
const found = new Map<string, string | null>()

const resolve = async ($: EngineInterface, mention: string, home: string, bases: string[]): Promise<string | null> => {
  const key = `${bases.join('|')}::${mention}`
  if (found.has(key)) return found.get(key) ?? null

  const raw = mention.replace(/^~(?=[\\/])/, home)
  const candidates = isAbsolute(raw) && !raw.startsWith('~') ? [raw] : bases.map(b => `${b}/${raw.replace(/^\.[\\/]/, '')}`)
  let hit: string | null = null
  for (const candidate of candidates) {
    try {
      if (await $.fs.exists(candidate)) {
        const stat = await $.fs.stat(candidate, { resolve: true })
        hit = (stat.realPath ?? candidate).replace(/\//g, '\\')
        break
      }
    } catch {
      // Unreadable spot: try the next base.
    }
  }

  if (found.size >= MAX_CACHE) found.clear()
  found.set(key, hit)

  return hit
}

// Fenced code blocks and existing markdown links stay as written.
const SKIP = /```[\s\S]*?(?:```|$)|\[[^\]\n]*\]\([^)\n]*\)/g

const linkify = async ($: EngineInterface, text: string): Promise<string> => {
  if (!/`|[A-Za-z]:[\\/]/.test(text)) return text

  const cwd = (await $.session.cwd()).replace(/\\/g, '/')
  const root = (await $.session.root()).replace(/\\/g, '/')
  const home = String((await $.env.get('USERPROFILE')) ?? '').replace(/\\/g, '/')
  const bases = [...new Set([cwd, root])]

  const linkOne = async (shown: string, mention: string) => {
    const bare = mention.replace(LINE_SUFFIX, '')
    if (!looksLikePath(bare)) return null
    const abs = await resolve($, bare, home, bases)

    return abs === null ? null : `[${shown}](${fileUrl(abs)})`
  }

  const pieces: string[] = []
  let at = 0
  for (const skip of text.matchAll(SKIP)) {
    pieces.push(await linkPlain(text.slice(at, skip.index), linkOne))
    pieces.push(skip[0])
    at = skip.index + skip[0].length
  }
  pieces.push(await linkPlain(text.slice(at), linkOne))

  return pieces.join('')
}

const linkPlain = async (
  part: string,
  linkOne: (shown: string, mention: string) => Promise<string | null>,
): Promise<string> => {
  let out = ''
  let at = 0
  // Inline code first; bare paths only in the text between code spans.
  for (const m of part.matchAll(CODE_MENTION)) {
    out += await linkBare(part.slice(at, m.index), linkOne)
    out += (await linkOne(m[0], m[1] ?? "")) ?? m[0]
    at = m.index + m[0].length
  }

  return out + (await linkBare(part.slice(at), linkOne))
}

const linkBare = async (
  part: string,
  linkOne: (shown: string, mention: string) => Promise<string | null>,
): Promise<string> => {
  let out = ''
  let at = 0
  for (const m of part.matchAll(BARE_ABSOLUTE)) {
    // A sentence's closing punctuation is not part of the path.
    const mention = (m[1] ?? "").replace(/[.,;:!]+$/, '')
    out += part.slice(at, m.index)
    out += (await linkOne(mention, mention)) ?? mention
    at = m.index + mention.length
  }

  return out + part.slice(at)
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text = await linkify($, e.props.text)
    if (text === e.props.text) return next(e)

    return next({ ...e, props: { ...e.props, text } })
  })
}

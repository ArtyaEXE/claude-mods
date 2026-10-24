import { expect, test } from 'claude-code/testing'

test('a mention of an existing file becomes a link, others stay', async ($, on) => {
  const asked: string[] = []
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('session.root', () => ({ value: 'D:/proj' }))
  on('env.get', () => ({ value: 'C:/Users/me' }))
  on('fs.exists', (_, e) => {
    asked.push(e.path)

    return { value: e.path.split('\\').join('/').endsWith('/src/app.ts') || e.path === 'C:\\x\\notes.md' }
  })
  on('fs.stat', (_, e) => ({
    value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path.replace(/\\/g, '/') },
  }))

  let drawn = ''
  on('ui.render', ($, e) => {
    drawn = (e.props as { text: string }).text
    const { Text } = $.ui.resolve(e)

    return <Text>{drawn}</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'file-links',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'm1',
    props: { text: 'See `src/app.ts:12`, `missing.ts` and C:\\x\\notes.md.\n```\nsrc/app.ts\n```', isFirstOfReply: true },
  })

  expect(asked).toContain('D:\\proj\\src\\app.ts')
  expect(drawn).toMatch(/\[`src\/app\.ts:12`\]\(file:\/\/\/.*\/src\/app\.ts\)/)
  expect(drawn).toContain('`missing.ts` and')
  expect(drawn).toContain('[C:\\x\\notes.md](file:///C:/x/notes.md).')
  expect(drawn).toContain('```\nsrc/app.ts\n```')
  await ui.unmount()
})

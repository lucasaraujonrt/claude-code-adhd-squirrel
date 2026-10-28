import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'squirrel',
  component: 'Pane',
  requestId: 'squirrel',
  props: {
    title: 'Squirrel',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const DUMP =
  'então tipo eu queria ver aquele negócio do relatório né e aí também pensei que seria legal mudar a cor do botão e sei lá talvez escrever um post sobre isso também enfim acho que o principal é o relatório'

test('a dump gets the instructions, capture parks nuts, a short message gets the focus reminder', async ($, on) => {
  const seen: string[][] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: 1_000 }))
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_, e) => {
    store.set((e as { key: string }).key, (e as { value: unknown }).value)
    return { value: undefined } as never
  })
  on('ui.status', () => ({ value: undefined }) as never)
  on('prompt.submit', (_, e) => {
    seen.push([...(e.context ?? [])])
    return { text: e.text }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.prompt.submit({ text: DUMP })
  expect(seen.at(-1)?.[0]).toContain('[Squirrel] The user dictated this')

  await $.tool.call({
    tool: 'mcp__squirrel__capture',
    focus: 'Revisar o relatório',
    next_action: 'Abrir o relatório de outubro',
    side_quests: ['Mudar a cor do botão', 'Escrever um post sobre o relatório'],
  } as never)

  await $.prompt.submit({ text: 'ok, abre ele' })
  expect(seen.at(-1)?.[0]).toContain('Current focus: Revisar o relatório')

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    expect((await pane.find({ type: 'Text', text: /Revisar o relatório/ }))?.text).toBe('Revisar o relatório')
    expect((await pane.find({ type: 'Text', text: /NOZES GUARDADAS/ }))?.text).toBe('NOZES GUARDADAS · 2')
    expect((await pane.find({ type: 'Text', text: /cor do botão/ }))?.text).toBe('🌰 Mudar a cor do botão')
    await pane.unmount()
  }
})

test('a short plain message with no focus passes untouched', async ($, on) => {
  const seen: (readonly string[] | undefined)[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }) as never)
  on('store.get', () => ({ value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('prompt.submit', (_, e) => {
    seen.push(e.context)
    return { text: e.text }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'roda os testes' })
  expect(seen.at(-1)).toBeUndefined()
})

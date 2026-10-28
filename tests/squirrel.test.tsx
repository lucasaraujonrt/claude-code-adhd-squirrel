import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'

const PANE = {
  plugin: 'squirrel',
  component: 'Pane',
  requestId: 'squirrel',
  surface: 'terminal',
  props: { title: 'Squirrel', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const DUMP =
  'então tipo eu queria ver aquele negócio do relatório né e aí também pensei que seria legal mudar a cor do botão enfim acho que o principal é o relatório'

function world(on: On) {
  const store = new Map<string, unknown>()
  const sent: string[] = []
  const status: (string | undefined)[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }) as never)
  on('ui.status', (_, e) => {
    status.push((e as { text?: string }).text)
    return { value: undefined } as never
  })
  on('clock.now', () => ({ value: 1_000 }))
  on('store.get', (_, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_, e) => {
    store.set((e as { key: string }).key, (e as { value: unknown }).value)
    return { value: undefined } as never
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'core', scope: 'shared' }] }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  return { store, sent, status }
}

test('a long dump reaches Claude as typed, and the system prompt carries the ADHD guide', async ($, on) => {
  const { sent } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(await $.prompt.submit({ text: DUMP })).toEqual({ text: DUMP })
  expect(sent).toEqual([DUMP])

  const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(sections.map(s => s.id)).toEqual(['intro', 'squirrel:adhd'])
  expect(sections.at(-1)?.scope).toBe('session')
})

test('capture sets the focus and parks tangents; no arguments reads them back; crack removes one', async ($, on) => {
  const { store } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await $.tool.call({
    tool: 'mcp__squirrel__capture',
    focus: 'Revisar o relatório',
    next_action: 'Abrir o relatório de outubro',
    side_quests: ['Mudar a cor do botão', 'Mudar a cor do botão'],
  } as never)
  const nuts = store.get('nuts') as { id: string; text: string }[]
  expect(nuts.map(n => n.text)).toEqual(['Mudar a cor do botão'])

  const read = (await $.tool.call({ tool: 'mcp__squirrel__capture' } as never)) as { result?: string }
  expect(read.result).toContain('Focus: Revisar o relatório → Abrir o relatório de outubro')
  expect(read.result).toContain('Mudar a cor do botão')

  await $.tool.call({ tool: 'mcp__squirrel__crack', ids: [nuts[0]?.id] } as never)
  expect(store.get('nuts')).toEqual([])
})

test('the pane shows the focus; bringing a nut back parks the old focus and starts on the nut', async ($, on) => {
  const { store, sent } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__squirrel__capture', focus: 'Revisar o relatório', side_quests: ['Escrever o post'] } as never)

  const pane = await $.ui.mount(PANE as never)
  expect((await pane.find({ type: 'Text', text: /Revisar o relatório/ }))?.text).toBe('Revisar o relatório')
  const nut = (store.get('nuts') as { id: string }[])[0]
  await pane.press({ key: `bring-${nut?.id}` } as never)
  expect((await pane.find({ type: 'Text', text: /Escrever o post/ }))?.text).toBe('Escrever o post')
  expect((store.get('nuts') as { text: string }[]).map(n => n.text)).toEqual(['Revisar o relatório'])
  expect(sent).toEqual(['Vamos pegar esta: Escrever o post'])
  await pane.unmount()
})

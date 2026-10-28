import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'

const BAND = {
  plugin: 'squirrel',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 80 },
} as const

const DUMP =
  'então tipo eu queria ver aquele negócio do relatório né e aí também pensei que seria legal mudar a cor do botão e sei lá talvez escrever um post sobre isso também mas não sei se o relatório é o de outubro ou o do trimestre enfim acho que o principal é o relatório'

const READ_REPLY = {
  language: 'pt-BR',
  focus: 'Revisar o relatório',
  is_new_topic: false,
  side_quests: ['Mudar a cor do botão', 'Escrever um post sobre o relatório'],
  questions: [
    { title: 'Qual relatório?', detail: '"o de outubro ou o do trimestre"', options: ['Outubro', 'Trimestre'] },
  ],
}

const WRITE_REPLY = {
  next_action: 'Abrir o relatório de outubro',
  job: ['Revisar o relatório de outubro', 'Conferir os números de vendas'],
  why: 'É o principal agora.',
  guardrails: ['Não mexer no botão agora'],
  done: ['Resumo de 3 linhas no chat'],
}

function world(on: On) {
  const clock = mock.clock(on)
  const store = new Map<string, unknown>()
  const sent: { text: string; context: readonly string[] }[] = []
  const asked: string[] = []
  const filled: string[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  // The engine draws nothing of its own above the prompt here.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('store.get', (_, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_, e) => {
    store.set((e as { key: string }).key, (e as { value: unknown }).value)
    return { value: undefined } as never
  })
  on('model.complete', (_, e) => {
    asked.push(e.prompt)
    const reply = e.system?.startsWith('You read') ? READ_REPLY : WRITE_REPLY
    return { value: { isAnswered: true, text: `Aqui:\n${JSON.stringify(reply)}`, usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  on('prompt.submit', (_, e) => {
    sent.push({ text: e.text, context: e.context ?? [] })
    return { text: e.text }
  })

  // The engine's question dialog: answers with the first option, or is dismissed.
  const questions: { question: string; header: string }[] = []
  let isDismissed = false
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    const q = e.questions[0]
    if (q) questions.push({ question: q.question, header: q.header })
    if (isDismissed) return { deny: 'dismissed' } as never
    return { result: { ...e, answers: { [q?.question ?? '']: q?.options[0]?.label ?? '' } } } as never
  })

  return { clock, store, sent, asked, filled, questions, dismiss: () => (isDismissed = true) }
}

test('a dump is held, asks what clashes, and puts the rewrite in the prompt box', async ($, on) => {
  const { clock, store, sent, asked, filled, questions } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const held = await $.prompt.submit({ text: DUMP })
  expect(held).toEqual({ drop: expect.stringContaining('Brain dump') })
  expect(sent).toHaveLength(0)

  await clock.advance(400)
  await clock.advance(400)
  expect(questions).toEqual([{ question: '"o de outubro ou o do trimestre"\nQual relatório?', header: 'Dúvida 1/1' }])
  expect(store.get('nuts')).toHaveLength(2)
  expect(asked.at(-1)).toContain('Outubro')
  expect(filled.at(-1)).toContain('**PRÓXIMA AÇÃO:** Abrir o relatório de outubro')
  expect(filled.at(-1)).toContain('- Não mexer no botão agora')

  // Sending the rewrite from the box goes through, not held a second time.
  await $.prompt.submit({ text: filled.at(-1) ?? '' })
  expect(sent).toHaveLength(1)
})

test('a short reply goes through; a dismissed question puts the dump back in the box', async ($, on) => {
  const { clock, sent, filled, dismiss } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await $.prompt.submit({ text: 'roda os testes' })
  expect(sent).toHaveLength(1)
  expect(sent[0]?.context).toEqual([])

  dismiss()
  await $.prompt.submit({ text: DUMP })
  await clock.advance(400)
  await clock.advance(400)
  expect(filled).toEqual([DUMP])
  expect(sent).toHaveLength(1)
})

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Analysis, Dump, Focus, Nut, Question, Rewrite } from '../types'

const PANE = 'squirrel'
const CAPTURE = 'mcp__squirrel__capture'
const STORE_KEY = 'nuts'
// Under this many words a message is a reply ("ok", "pode"), not a dump: it goes straight through.
const MIN_WORDS = 8
const LABEL_BG = '#f2d16b'
const LABEL_FG = '#3a2f00'

const focus = atom({ plugin: 'squirrel', key: 'focus' } as const, null)
const nuts = atom({ plugin: 'squirrel', key: 'nuts' } as const, [])
const dump = atom({ plugin: 'squirrel', key: 'dump' } as const, { stage: 'none' })

const FILLERS = /\b(é|tipo|né|então|aí|sei lá|enfim|basicamente|um|uh|like|so|you know|basically|anyway|i mean)\b/gi

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// In auto mode, a message reads as a dictated dump when it is long, rambles with fillers, or runs on without punctuation.
function isBrainDump(text: string): boolean {
  const t = text.trim()
  if (t.length >= 280) return true
  if (t.length >= 80 && (t.match(FILLERS) ?? []).length >= 3) return true
  return t.length >= 160 && t.split(/[.!?]+/).filter(s => s.trim()).length <= 1
}

function nutList(list: Nut[]): string {
  return list.length === 0 ? 'none' : list.map(n => `- [${n.id}] ${n.text}`).join('\n')
}

// The first JSON object in a reply, or null.
function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function strings(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, max) : []
}

const READ_SYSTEM = `You read voice brain dumps from a person with ADHD and find what blocks turning them into one clear request. Reply with JSON only.`

function readPrompt(original: string, current: Focus, list: Nut[]): string {
  return `Current focus: ${current ? current.goal : 'none'}
Parked side quests:
${nutList(list)}

The dump, as dictated:
"""
${original}
"""

Return JSON:
{
  "language": "the dump's language, as a BCP 47 tag",
  "focus": "the goal of the dump, at most 8 words, in its language",
  "is_new_topic": true when there is a current focus and the dump is about something else, else false,
  "side_quests": ["ideas in the dump that are not about its goal, each a short standalone sentence"],
  "questions": [
    { "title": "a short question, e.g. Two asks clash. Which one wins?", "detail": "quote the user's own words that clash or are unclear", "options": ["2 or 3 concrete answers"] }
  ]
}
Questions: at most 3, in the dump's language, only for two asks that clash, a goal with two readings that lead to different work, or a missing detail the assistant cannot look up. None for what the assistant can decide. An empty list is the usual answer.`
}

const WRITE_SYSTEM = `You rewrite a voice brain dump into one clear request for an AI coding and research assistant. Keep every concrete detail (names, numbers, paths, limits); drop filler and repetition; invent nothing. Reply with JSON only.`

function writePrompt(original: string, analysis: Analysis, answers: string[]): string {
  const resolved = analysis.questions
    .map((q, i) => `- ${q.title} ${q.detail} → ${answers[i] ?? '(no answer)'}`)
    .join('\n')
  return `The dump:
"""
${original}
"""

The user's answers to what was unclear:
${resolved || 'none'}

Parked for later (leave out of the request): ${analysis.sideQuests.join('; ') || 'none'}

Return JSON, in the dump's language, short lines:
{
  "next_action": "the one concrete thing to do first",
  "job": ["one line saying the job", "then the steps, at most 5"],
  "why": "one or two sentences: why it matters, from the dump",
  "guardrails": ["limits, what not to do, budgets"],
  "done": ["what finished looks like: files, where they go, the summary wanted"]
}`
}

function labels(isPortuguese: boolean) {
  return isPortuguese
    ? { next: 'PRÓXIMA AÇÃO', job: 'O TRABALHO', why: 'O PORQUÊ', guardrails: 'LIMITES', done: 'PRONTO QUANDO' }
    : { next: 'NEXT ACTION', job: 'THE JOB', why: 'THE WHY', guardrails: 'THE GUARDRAILS', done: 'DONE MEANS' }
}

// The prompt that is sent: the same sections the card shows, as Markdown.
function promptText(rewrite: Rewrite, isPortuguese: boolean): string {
  const l = labels(isPortuguese)
  const bullets = (list: string[]) => list.map(s => (s.startsWith('-') ? s : `- ${s}`)).join('\n')
  const [first, ...steps] = rewrite.job
  return [
    `**${l.next}:** ${rewrite.nextAction}`,
    `**${l.job}**\n${first ?? ''}${steps.length ? `\n${bullets(steps)}` : ''}`,
    rewrite.why ? `**${l.why}**\n${rewrite.why}` : '',
    rewrite.guardrails.length ? `**${l.guardrails}**\n${bullets(rewrite.guardrails)}` : '',
    rewrite.done.length ? `**${l.done}**\n${bullets(rewrite.done)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function saveNuts($: EngineInterface, list: Nut[]) {
  await $.store.set(STORE_KEY, list)
  await update($, nuts, () => list)
}

async function parkNuts($: EngineInterface, texts: string[], from: string) {
  const list = await read($, nuts)
  const known = new Set(list.map(n => n.text.toLowerCase()))
  const now = await $.clock.now()
  const fresh = texts
    .map(s => s.trim())
    .filter(s => s && !known.has(s.toLowerCase()))
    .map(text => ({ id: crypto.randomUUID().slice(0, 6), text, from, at: now }))
  await saveNuts($, [...list, ...fresh])
  return fresh.length
}

async function showStatus($: EngineInterface) {
  const current = await read($, focus)
  const count = (await read($, nuts)).length
  const parts = [current ? `🐿️ ${current.goal}` : '🐿️', count > 0 ? `${count} noz${count === 1 ? '' : 'es'}` : '']
  $.ui.status(parts.filter(Boolean).join(' · '))
}

// Random, not a counter: a counter starts over on reload and could match a dump still in the slot.
function nextId(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
}

async function isCurrent($: EngineInterface, id: number) {
  const d = await read($, dump)
  return d.stage !== 'none' && d.id === id
}

// Writes the slot only while it still holds dump `id`: a step that outlived its dump (a newer message replaced it) changes nothing.
async function settle($: EngineInterface, id: number, value: Dump) {
  await update($, dump, (v): Dump => (v.stage !== 'none' && v.id === id ? value : v))
}

async function fail($: EngineInterface, d: { id: number; original: string; words: number }, reason: string) {
  await settle($, d.id, { stage: 'failed', id: d.id, original: d.original, words: d.words, reason })
}

// One dump end to end, run from a timer so the model calls and the questions outlive the prompt hook that held it.
async function readDump($: EngineInterface, model: string) {
  const d = await read($, dump)
  if (d.stage !== 'queued') return
  await settle($, d.id, { stage: 'reading', id: d.id, original: d.original, words: d.words })
  const current = await read($, focus)
  const reply = await $.model.complete({ model, system: READ_SYSTEM, prompt: readPrompt(d.original, current, await read($, nuts)), maxTokens: 1500 })
  if (!(await isCurrent($, d.id))) return
  if (!reply.isAnswered) return fail($, d, reply.reason)
  const json = parseJson(reply.text)
  if (!json) return fail($, d, 'unreadable reply')

  const questions: Question[] = (Array.isArray(json.questions) ? json.questions : [])
    .slice(0, 3)
    .map((q: { title?: unknown; detail?: unknown; options?: unknown }) => ({
      title: String(q.title ?? ''),
      detail: String(q.detail ?? ''),
      options: strings(q.options, 3),
    }))
    .filter(q => q.title && q.options.length > 0)
  const isPortuguese = String(json.language ?? '').toLowerCase().startsWith('pt')
  const goal = String(json.focus ?? '').trim()
  if (json.is_new_topic === true && current) {
    questions.unshift(
      isPortuguese
        ? { title: 'Novo assunto. E o foco atual?', detail: `Agora: "${current.goal}". Novo: "${goal}".`, options: [`Trocar: guardar "${current.goal}" como noz`, 'Guardar o novo como noz e seguir no atual'], isSwitch: true }
        : { title: 'New topic. What about the current focus?', detail: `Now: "${current.goal}". New: "${goal}".`, options: [`Switch: park "${current.goal}" as a nut`, 'Park the new one and stay on the current'], isSwitch: true },
    )
  }
  const analysis: Analysis = { isPortuguese, focus: goal, sideQuests: strings(json.side_quests, 10), questions: questions.slice(0, 3) }
  await parkNuts($, analysis.sideQuests, goal)
  await showStatus($)

  await settle($, d.id, { stage: 'asking', id: d.id, original: d.original, words: d.words, analysis })
  const answers = await askAll($, analysis, d.id, d.original)
  if (!answers || !(await isCurrent($, d.id))) return
  const writing = { stage: 'writing', id: d.id, original: d.original, words: d.words, analysis, answers } as const
  await settle($, d.id, writing)
  await composeRewrite($, model, writing)
}

// One question at a time in the engine's own question dialog, as Claude asks; null when the dump ended here.
async function askAll($: EngineInterface, analysis: Analysis, id: number, original: string): Promise<string[] | null> {
  const answers: string[] = []
  for (const [i, q] of analysis.questions.entries()) {
    let value: string
    try {
      value = await $.ui.ask(q.detail ? `${q.detail}\n${q.title}` : q.title, {
        options: q.options,
        header: `${analysis.isPortuguese ? 'Dúvida' : 'Question'} ${i + 1}/${analysis.questions.length}`,
      })
    } catch {
      // Dismissed: nothing is lost, the dump goes back to the box as typed (unless a newer message took its place).
      if (!(await isCurrent($, id))) return null
      await settle($, id, { stage: 'none' })
      await $.prompt.fill({ text: original, mode: 'replace' })
      return null
    }
    if (!(await isCurrent($, id))) return null
    // Parking the new topic ends the dump: it becomes a nut and the current focus stays.
    if (q.isSwitch && value === q.options[1]) {
      await parkNuts($, [analysis.focus], (await read($, focus))?.goal ?? '')
      await settle($, id, { stage: 'none' })
      await showStatus($)
      $.ui.toast(analysis.isPortuguese ? '🐿️ Guardado como noz.' : '🐿️ Parked as a nut.')
      return null
    }
    if (q.isSwitch && value === q.options[0]) {
      const old = await read($, focus)
      if (old) await parkNuts($, [old.goal], analysis.focus)
    }
    answers.push(value)
  }
  return answers
}

async function composeRewrite($: EngineInterface, model: string, d: Extract<Dump, { stage: 'writing' }>) {
  const reply = await $.model.complete({ model, system: WRITE_SYSTEM, prompt: writePrompt(d.original, d.analysis, d.answers), maxTokens: 2000 })
  // A newer message took the slot while this was written: it must not land in the box over that one.
  if (!(await isCurrent($, d.id))) return
  if (!reply.isAnswered) return fail($, d, reply.reason)
  const json = parseJson(reply.text)
  if (!json) return fail($, d, 'unreadable reply')
  const rewrite: Rewrite = {
    nextAction: String(json.next_action ?? '').trim(),
    job: strings(json.job, 6),
    why: String(json.why ?? '').trim(),
    guardrails: strings(json.guardrails, 6),
    done: strings(json.done, 5),
  }
  const text = promptText(rewrite, d.analysis.isPortuguese)
  // The rewrite lands in the prompt box for the person to read, tweak and send; the card is the fallback where no box takes it.
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (filled.isFilled) {
    await update($, focus, () => ({ goal: d.analysis.focus, nextAction: rewrite.nextAction }))
    await settle($, d.id, { stage: 'none' })
    await showStatus($)
    $.ui.toast(d.analysis.isPortuguese ? '🐿️ Prompt organizado no campo: revise e envie.' : '🐿️ Prompt organized in the box: review and send.')
    return
  }
  await settle($, d.id, { stage: 'ready', id: d.id, original: d.original, words: d.words, analysis: d.analysis, rewrite, text })
}

async function send($: EngineInterface, text: string) {
  const d = await read($, dump)
  // The focus moves only once the person sends the rewrite they saw.
  if (d.stage === 'ready' && text === d.text) {
    await update($, focus, () => ({ goal: d.analysis.focus, nextAction: d.rewrite.nextAction }))
    await showStatus($)
  }
  await update($, dump, (): Dump => ({ stage: 'none' }))
  void $.prompt.submit({ text, asUser: true })
}

export const register: Register = (on, options) => {
  const mode = String(options.mode ?? 'always')
  const model = String(options.model ?? 'sonnet')

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    const saved = (await $.store.get(STORE_KEY)) as Nut[] | undefined
    await update($, nuts, () => (Array.isArray(saved) ? saved : []))
    await $.tool.register({
      name: 'capture',
      description:
        'Squirrel: record the focus of the conversation and park side quests (tangents) for later. Call it when the user switches topic (park the old focus as a side quest) or mentions an idea that is not about the focus.',
      inputSchema: {
        type: 'object',
        properties: {
          focus: { type: 'string', description: 'The goal now, at most 8 words' },
          next_action: { type: 'string', description: 'The one concrete thing to do next' },
          side_quests: { type: 'array', items: { type: 'string' }, description: 'Tangents to park, each a short standalone sentence' },
        },
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'crack',
      description: 'Squirrel: remove parked side quests by id once they are done or dropped.',
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
      isDeferred: false,
    })
    await $.command.register({ name: 'squirrel', description: 'Show your focus and the parked side quests (nuts)' })
    await $.command.register({ name: 'dump', description: 'Restructure what follows as a brain dump: /dump <your thoughts>' })
    // A reload drops the timer that was working on a dump; its state stays, so start that dump over.
    await update($, dump, (v): Dump =>
      v.stage === 'reading' || v.stage === 'asking' || v.stage === 'writing'
        ? { stage: 'queued', id: v.id, original: v.original, words: v.words }
        : v,
    )
    $.clock.every(400, () => readDump($, model))
    await showStatus($)

    return ran
  })

  on('command.run', { command: 'squirrel' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Squirrel' })
    return { text: 'Squirrel: pane opened.' }
  })

  on('command.run', { command: 'dump' }, async ($, e) => {
    const text = e.args.trim()
    if (!text) return { text: 'Use: /dump <your thoughts>' }
    await update($, dump, (): Dump => ({ stage: 'queued', id: nextId(), original: text, words: wordCount(text) }))
    return { text: '🐿️ Organizing your dump above the prompt…' }
  })

  on('prompt.submit', async ($, e, next) => {
    // Only what the person typed is held: a plugin's prompt (the confirmed rewrite included) goes through.
    if (e.command || e.isMeta || e.origin?.kind === 'plugin') return next(e)
    // A rewrite Squirrel put in the box (edited or not) is already organized.
    if (/^\*\*(PRÓXIMA AÇÃO|NEXT ACTION):\*\*/.test(e.text.trim())) return next(e)
    const current = await read($, focus)

    const words = wordCount(e.text)
    const isDump = mode === 'always' ? words >= MIN_WORDS : mode === 'auto' && isBrainDump(e.text)
    if (isDump) {
      await update($, dump, (): Dump => ({ stage: 'queued', id: nextId(), original: e.text, words }))
      return { drop: `🐿️ Brain dump, ${words} words: organizing it above the prompt before sending` }
    }
    if (current && mode !== 'off') {
      const reminder = `[Squirrel] Current focus: ${current.goal}. If this message starts a different topic, ask first with AskUserQuestion whether to switch (park "${current.goal}" with ${CAPTURE}) or park the new topic. Same topic: just answer.`
      return next({ ...e, context: [...(e.context ?? []), reminder] })
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: CAPTURE }, async ($, e) => {
    const input = e as unknown as { focus?: unknown; next_action?: unknown; side_quests?: unknown }
    const goal = typeof input.focus === 'string' ? input.focus.trim() : ''
    const nextAction = typeof input.next_action === 'string' ? input.next_action.trim() : ''
    if (goal) await update($, focus, () => ({ goal, nextAction }))
    const added = await parkNuts($, strings(input.side_quests, 20), goal)
    await showStatus($)
    const all = await read($, nuts)

    return { result: `Focus: ${goal || '(unchanged)'}. Parked ${added} new side quest(s); ${all.length} parked in total.\n${nutList(all)}` }
  })

  on('tool.call', { tool: 'mcp__squirrel__crack' }, async ($, e) => {
    const ids = (e as unknown as { ids?: unknown }).ids
    const drop = new Set(Array.isArray(ids) ? ids.map(String) : [])
    await saveNuts($, (await read($, nuts)).filter(n => !drop.has(n.id)))
    await showStatus($)

    return { result: `${(await read($, nuts)).length} side quest(s) still parked.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const d = await read($, dump)
    if (d.stage === 'none' || e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const pt = 'analysis' in d ? d.analysis.isPortuguese : /[ãõçáéíóú]|\b(é|né|tipo|então|você)\b/i.test(d.original)
    const original = (
      <Button key="squirrel-original" plain dimColor label={pt ? 'Enviar o original' : 'Send the original'} onPress={() => send($, d.original)} />
    )
    const cancel = (
      <Button key="squirrel-cancel" plain dimColor label={pt ? 'Descartar' : 'Discard'} onPress={() => update($, dump, (): Dump => ({ stage: 'none' }))} />
    )
    const below = await next(e)
    let card

    if (d.stage === 'queued' || d.stage === 'reading' || d.stage === 'writing') {
      const doing = d.stage === 'writing' ? (pt ? 'Escrevendo o prompt' : 'Writing the prompt') : pt ? 'Lendo seu dump' : 'Reading your dump'
      card = (
        <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
          <Text>{`🐿️ ${doing} (${d.words} ${pt ? 'palavras' : 'words'})…`}</Text>
          <Box flexDirection="row" gap={2}>
            {original}
            {cancel}
          </Box>
        </Box>
      )
    } else if (d.stage === 'asking') {
      // The engine's question dialog asks; the band stays out of its way.
      return below
    } else if (d.stage === 'ready') {
      const l = labels(pt)
      const section = (title: string, lines: string[]) =>
        lines.length === 0 ? null : (
          <Box key={title} flexDirection="column">
            <Text backgroundColor={LABEL_BG} color={LABEL_FG} bold>{` ${title} `}</Text>
            {lines.map((line, i) => (
              <Text key={`${title}-${i}`}>{line}</Text>
            ))}
          </Box>
        )
      const [first, ...steps] = d.rewrite.job
      card = (
        <Box flexDirection="column" gap={1} paddingX={1} borderStyle="round" borderDimColor>
          {section(l.next, [d.rewrite.nextAction])}
          {section(l.job, [first ?? '', ...steps.map(s => (s.startsWith('-') ? s : `- ${s}`))].filter(Boolean))}
          {section(l.why, d.rewrite.why ? [d.rewrite.why] : [])}
          {section(l.guardrails, d.rewrite.guardrails.map(s => `- ${s}`))}
          {section(l.done, d.rewrite.done.map(s => `- ${s}`))}
          {d.analysis.sideQuests.length > 0 ? (
            <Text dimColor>{`🌰 ${pt ? 'Guardado pra depois' : 'Parked for later'}: ${d.analysis.sideQuests.join(' · ')}`}</Text>
          ) : null}
          <Box flexDirection="row" gap={2}>
            <Button key="squirrel-send" variant="primary" label={pt ? 'Enviar' : 'Send'} onPress={() => send($, d.text)} />
            <Button
              key="squirrel-edit"
              plain
              dimColor
              label={pt ? 'Editar antes' : 'Edit first'}
              onPress={async () => {
                await update($, dump, (): Dump => ({ stage: 'none' }))
                await $.prompt.fill({ text: d.text, mode: 'replace' })
              }}
            />
            {original}
            {cancel}
          </Box>
        </Box>
      )
    } else if (d.stage === 'failed') {
      card = (
        <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
          <Text color="#d9603b">{`🐿️ ${pt ? 'Não consegui organizar' : 'Could not organize it'} (${d.reason}).`}</Text>
          <Box flexDirection="row" gap={2}>
            {original}
            {cancel}
          </Box>
        </Box>
      )
    } else {
      return below
    }

    return (
      <Box flexDirection="column" gap={1}>
        {card}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, focus)
    const list = await read($, nuts)

    const bring = async (nut: Nut) => {
      const rest = (await read($, nuts)).filter(n => n.id !== nut.id)
      const old = await read($, focus)
      // Bringing a nut back parks the focus it replaces, so nothing is lost.
      const parked = old ? [...rest, { id: crypto.randomUUID().slice(0, 6), text: old.goal, from: nut.text, at: await $.clock.now() }] : rest
      await saveNuts($, parked)
      await update($, focus, () => ({ goal: nut.text, nextAction: '' }))
      await showStatus($)
      void $.prompt.submit({ text: `Vamos pegar esta: ${nut.text}`, asUser: true })
    }
    const crack = async (nut: Nut) => {
      await saveNuts($, (await read($, nuts)).filter(n => n.id !== nut.id))
      await showStatus($)
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text dimColor size="caption">FOCO AGORA</Text>
          <Text bold>{current ? current.goal : 'Nenhum ainda. Fale à vontade: eu organizo.'}</Text>
          {current?.nextAction ? <Text>{`→ ${current.nextAction}`}</Text> : null}
        </Box>
        <Text dimColor size="caption">{`NOZES GUARDADAS · ${list.length}`}</Text>
        {list.length === 0 && <Text dimColor>Nenhuma tangente estacionada.</Text>}
        {list.map(nut => (
          <Box key={nut.id} flexDirection="column">
            <Text>{`🌰 ${nut.text}`}</Text>
            <Box flexDirection="row" gap={1}>
              <Button key={`bring-${nut.id}`} plain dimColor label="Trazer pro foco" onPress={() => bring(nut)} />
              <Button key={`crack-${nut.id}`} plain dimColor label="Feito ✓" onPress={() => crack(nut)} />
            </Box>
          </Box>
        ))}
        {current && (
          <Button key="squirrel-clear" plain dimColor label="Limpar foco" onPress={async () => { await update($, focus, () => null); await showStatus($) }} />
        )}
      </Box>
    )
  })
}

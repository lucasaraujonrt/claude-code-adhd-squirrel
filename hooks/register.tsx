import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Focus, Nut } from '../types'

const PANE = 'squirrel'
const CAPTURE = 'mcp__squirrel__capture'
const CRACK = 'mcp__squirrel__crack'
const STORE_KEY = 'nuts'

const focus = atom({ plugin: 'squirrel', key: 'focus' } as const, null)
const nuts = atom({ plugin: 'squirrel', key: 'nuts' } as const, [])
const isForced = atom({ plugin: 'squirrel', key: 'isForced' } as const, false)

const FILLERS = /\b(é|tipo|né|então|aí|sei lá|enfim|basicamente|um|uh|like|so|you know|basically|anyway|i mean)\b/gi

// A message reads as a dictated brain dump when it is long, rambles with fillers, or runs on without punctuation.
function isBrainDump(text: string): boolean {
  const t = text.trim()
  if (t.length >= 280) return true
  const fillers = (t.match(FILLERS) ?? []).length
  if (t.length >= 80 && fillers >= 3) return true
  const sentences = t.split(/[.!?]+/).filter(s => s.trim()).length
  return t.length >= 160 && sentences <= 1
}

function nutList(list: Nut[]): string {
  return list.length === 0 ? 'none' : list.map(n => `- [${n.id}] ${n.text}`).join('\n')
}

function dumpInstructions(current: Focus, list: Nut[]): string {
  return `[Squirrel] The user dictated this by voice and has ADHD: it may be a messy brain dump that jumps between topics or buries the request. Before acting:
1. Restructure it, in the user's language, as:
   - Next action: the one concrete thing to do now (first line).
   - Goal: one sentence.
   - Tasks: at most 5, in order.
   - Side quests: ideas in the message that are not about the goal.
2. Only if something blocks acting (an ambiguous goal, two readings that lead to different work, a missing detail you cannot find yourself), ask at most 3 short questions with AskUserQuestion, each with options, and wait for the answers. Never ask what you can decide or look up.
3. Call ${CAPTURE} with focus (the goal in at most 8 words), next_action, and side_quests (each one short standalone sentence). Side quests are parked for later, not done now.
4. Show the restructured version in at most 6 lines, then work on the next action only.
Current focus: ${current ? current.goal : 'none'}.${current ? ' If this message is about something else, ask first with AskUserQuestion: switch (park the current focus as a side quest) or park the new topic.' : ''}
Parked side quests:
${nutList(list)}`
}

function focusReminder(current: NonNullable<Focus>): string {
  return `[Squirrel] Current focus: ${current.goal} (next: ${current.nextAction}). If this message starts a different topic, ask first with AskUserQuestion whether to switch (park "${current.goal}" with ${CAPTURE}) or park the new topic, before doing anything else. Same topic: just answer.`
}

async function saveNuts($: EngineInterface, list: Nut[]) {
  await $.store.set(STORE_KEY, list)
  await update($, nuts, () => list)
}

async function showStatus($: EngineInterface) {
  const current = await read($, focus)
  const count = (await read($, nuts)).length
  const parts = [current ? `🐿️ ${current.goal}` : '🐿️', count > 0 ? `${count} noz${count === 1 ? '' : 'es'}` : '']
  $.ui.status(parts.filter(Boolean).join(' · '))
}

export const register: Register = (on, options) => {
  const mode = String(options.mode ?? 'auto')

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    const saved = (await $.store.get(STORE_KEY)) as Nut[] | undefined
    await update($, nuts, () => (Array.isArray(saved) ? saved : []))
    await $.tool.register({
      name: 'capture',
      description:
        'Squirrel: record the focus of the conversation and park side quests (tangents) for later. Call it after restructuring a brain dump, and when the user switches topic (park the old focus as a side quest).',
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
      inputSchema: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'string' } } },
        required: ['ids'],
      },
      isDeferred: false,
    })
    await $.command.register({ name: 'squirrel', description: 'Show your focus and the parked side quests (nuts)' })
    await $.command.register({ name: 'dump', description: 'Restructure what follows as a brain dump: /dump <your thoughts>' })
    await showStatus($)

    return ran
  })

  on('command.run', { command: 'squirrel' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Squirrel' })
    return { text: 'Squirrel: pane opened.' }
  })

  on('command.run', { command: 'dump' }, async ($, e) => {
    if (!e.args.trim()) return { text: 'Use: /dump <your thoughts>' }
    await update($, isForced, () => true)
    void $.prompt.submit({ text: e.args, asUser: true })
    return { text: '🐿️ Organizing your dump…' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) return next(e)
    const forced = await read($, isForced)
    if (forced) await update($, isForced, () => false)
    const current = await read($, focus)
    const isDump = forced || (mode === 'always' || (mode === 'auto' && isBrainDump(e.text)))

    if (isDump) {
      $.ui.status('🐿️ organizando seu dump…')
      return next({ ...e, context: [...(e.context ?? []), dumpInstructions(current, await read($, nuts))] })
    }
    if (current && mode !== 'off') return next({ ...e, context: [...(e.context ?? []), focusReminder(current)] })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: CAPTURE }, async ($, e) => {
    const input = e as unknown as { focus?: unknown; next_action?: unknown; side_quests?: unknown }
    const goal = typeof input.focus === 'string' ? input.focus.trim() : ''
    const nextAction = typeof input.next_action === 'string' ? input.next_action.trim() : ''
    if (goal) await update($, focus, () => ({ goal, nextAction }))

    const now = await $.clock.now()
    const list = await read($, nuts)
    const known = new Set(list.map(n => n.text.toLowerCase()))
    const fresh: Nut[] = (Array.isArray(input.side_quests) ? input.side_quests : [])
      .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      .map(s => s.trim())
      .filter(s => !known.has(s.toLowerCase()))
      .map(text => ({ id: crypto.randomUUID().slice(0, 6), text, from: goal, at: now }))
    const all = [...list, ...fresh]
    await saveNuts($, all)
    await showStatus($)

    return {
      result: `Focus: ${goal || '(unchanged)'}. Parked ${fresh.length} new side quest(s); ${all.length} parked in total.\n${nutList(all)}`,
    }
  })

  on('tool.call', { tool: CRACK }, async ($, e) => {
    const ids = (e as unknown as { ids?: unknown }).ids
    const drop = new Set(Array.isArray(ids) ? ids.map(String) : [])
    const list = (await read($, nuts)).filter(n => !drop.has(n.id))
    await saveNuts($, list)
    await showStatus($)

    return { result: `${list.length} side quest(s) still parked.` }
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

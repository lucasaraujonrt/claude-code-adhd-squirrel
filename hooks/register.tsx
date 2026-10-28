import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Nut } from '../types'

const PANE = 'squirrel'
const CAPTURE = 'mcp__squirrel__capture'
const STORE_KEY = 'nuts'

const focus = atom({ plugin: 'squirrel', key: 'focus' } as const, null)
const nuts = atom({ plugin: 'squirrel', key: 'nuts' } as const, [])

// Static, so the prompt cache holds: the focus itself is read through `capture`, not written here.
const GUIDE = `# Squirrel (ADHD)
The person has ADHD: they often dictate messy brain dumps and jump between topics. Messages reach you as sent; nothing organizes them first.
- Read past the filler and find the one goal. Never ask them to rephrase.
- When a message sets or changes the goal, call ${CAPTURE} with the focus, the next action, and every idea that is not about the goal as side_quests, so tangents are parked, not lost. Say in one line what you parked.
- Call ${CAPTURE} with no arguments to read the current focus and the parked side quests. When a message starts a topic other than the focus, ask once with AskUserQuestion: switch (park the current focus) or park the new topic.
- Ask only when two asks clash or a detail cannot be looked up, one question at a time.
- Open the answer with the next action.`

function nutList(list: Nut[]): string {
  return list.length === 0 ? 'none' : list.map(n => `- [${n.id}] ${n.text}`).join('\n')
}

function strings(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, max) : []
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
    .filter(s => s && !known.has(s.toLowerCase()) && known.add(s.toLowerCase()))
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    const saved = (await $.store.get(STORE_KEY)) as Nut[] | undefined
    await update($, nuts, () => (Array.isArray(saved) ? saved : []))
    await $.tool.register({
      name: 'capture',
      description:
        'Squirrel: record the focus of the conversation and park side quests (tangents) for later. Call it when the user switches topic (park the old focus as a side quest) or mentions an idea that is not about the focus. With no arguments it returns the current focus and the parked side quests.',
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
    await showStatus($)

    return ran
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return { sections: [...composed.sections, { id: 'squirrel:adhd', text: GUIDE, scope: 'session' }] }
  })

  on('command.run', { command: 'squirrel' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Squirrel' })
    return { text: 'Squirrel: pane opened.' }
  })

  on('tool.call', { tool: CAPTURE }, async ($, e) => {
    const input = e as unknown as { focus?: unknown; next_action?: unknown; side_quests?: unknown }
    const goal = typeof input.focus === 'string' ? input.focus.trim() : ''
    const nextAction = typeof input.next_action === 'string' ? input.next_action.trim() : ''
    if (goal) await update($, focus, () => ({ goal, nextAction }))
    const current = await read($, focus)
    const added = await parkNuts($, strings(input.side_quests, 20), current?.goal ?? '')
    await showStatus($)
    const all = await read($, nuts)
    const now = current ? `${current.goal}${current.nextAction ? ` → ${current.nextAction}` : ''}` : 'none'

    return { result: `Focus: ${now}. Parked ${added} new side quest(s); ${all.length} parked in total.\n${nutList(all)}` }
  })

  on('tool.call', { tool: 'mcp__squirrel__crack' }, async ($, e) => {
    const ids = (e as unknown as { ids?: unknown }).ids
    const drop = new Set(Array.isArray(ids) ? ids.map(String) : [])
    await saveNuts($, (await read($, nuts)).filter(n => !drop.has(n.id)))
    await showStatus($)

    return { result: `${(await read($, nuts)).length} side quest(s) still parked.` }
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

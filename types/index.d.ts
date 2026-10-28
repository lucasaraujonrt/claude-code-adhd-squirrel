// A parked tangent: an idea that was not about the focus when it came up.
export type Nut = { id: string; text: string; from: string; at: number }

export type Focus = { goal: string; nextAction: string } | null

// One thing the dump leaves open: a clash, an ambiguity, or a topic switch.
export type Question = { title: string; detail: string; options: string[]; isSwitch?: boolean }

export type Rewrite = {
  nextAction: string
  job: string[]
  why: string
  guardrails: string[]
  done: string[]
}

export type Analysis = {
  isPortuguese: boolean
  focus: string
  sideQuests: string[]
  questions: Question[]
}

// A held dump moves queued → reading → asking → writing → ready; failed keeps the original to send as is.
export type Dump =
  | { stage: 'none' }
  | { stage: 'queued' | 'reading'; original: string; words: number }
  | { stage: 'asking'; original: string; words: number; analysis: Analysis }
  | { stage: 'writing'; original: string; words: number; analysis: Analysis; answers: string[] }
  | { stage: 'ready'; original: string; words: number; analysis: Analysis; rewrite: Rewrite; text: string }
  | { stage: 'failed'; original: string; words: number; reason: string }

declare module 'claude-code' {
  interface PluginState {
    squirrel: {
      focus: Focus
      // The cross-session list lives in $.store; this copy is what the pane draws.
      nuts: Nut[]
      dump: Dump
    }
  }
}

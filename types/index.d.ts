// A parked tangent: an idea that was not about the focus when it came up.
export type Nut = { id: string; text: string; from: string; at: number }

export type Focus = { goal: string; nextAction: string } | null

declare module 'claude-code' {
  interface PluginState {
    squirrel: {
      focus: Focus
      // The cross-session list lives in $.store; this copy is what the pane draws.
      nuts: Nut[]
    }
  }
}

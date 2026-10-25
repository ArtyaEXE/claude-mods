export type HandoffOffer = { tokens: number; threshold: number }
export type HandoffPhase =
  | { kind: 'idle' }
  | { kind: 'requested'; path: string }
  | { kind: 'writing'; path: string }
  | { kind: 'moving'; path: string }

declare module 'claude-code' {
  interface PluginState {
    'context-handoff': {
      offer: HandoffOffer | null
      passed: number
      phase: HandoffPhase
    }
  }
}

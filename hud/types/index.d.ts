export type HudLimit = { kind: string; percent: number; resetsAt?: string }

export type HudSnap = {
  model: string
  cwd: string
  branch: string | null
  dirty: number
  ahead: number
  behind: number
  ctxTokens?: number
  ctxWindow: number
  ctxPercent?: number
  costUsd?: number
  limits: HudLimit[]
}

declare module 'claude-code' {
  interface PluginState {
    hud: {
      snap: Shaped<HudSnap | null>
      // When the main loop's last turn ended: the cache's clock starts there.
      lastTurnAt: number | null
      now: number
    }
  }
}

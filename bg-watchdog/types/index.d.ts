export type Watched = {
  // `task:<taskId>` for a background task of this session, `pid:<pid>` for a listening process.
  id: string
  kind: 'task' | 'port'
  label: string
  startedAt: number
  taskId?: string
  pid?: number
  ports?: number[]
}

declare module 'claude-code' {
  interface PluginState {
    'bg-watchdog': {
      items: Shaped<Watched[]>
      // id -> until when it is snoozed (ms since epoch).
      snoozed: Record<string, number>
      now: number
    }
  }
}

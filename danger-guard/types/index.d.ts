export type Snapshot = {
  // The ref that keeps it: refs/danger-guard/<kind>/<time>[/<branch>].
  ref: string
  sha: string
  // Seconds since the epoch.
  at: number
  // worktree: the files before a command that discards changes; branch: a deleted branch's tip; stash: a dropped stash entry.
  kind: 'worktree' | 'branch' | 'stash'
  // The command it was taken before.
  command: string
  // The branch's name, for kind branch.
  name: string
}

declare module 'claude-code' {
  interface PluginState {
    'danger-guard': {
      snapshots: Shaped<Snapshot[]>
    }
  }
}

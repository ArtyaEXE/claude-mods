export type Changed = {
  // Relative to the repository root (or absolute outside it), forward slashes.
  path: string
  abs: string
  // git's letter: M, A, D, R, or ? for a new file git does not track yet, ~ for one outside git.
  status: string
  added: number | null
  removed: number | null
  // Already changed when the session started, and not touched by Claude since.
  isBefore: boolean
}

// What the session started from, kept across reloads of the mod.
export type Baseline = {
  sessionId: string
  // The repository root with forward slashes, '' outside git.
  root: string
  // The commit the session started on (git's empty tree in a repository with no commit).
  base: string
  // Files with uncommitted changes at the start, lower-cased paths relative to the root.
  dirty: string[]
  // Files Claude changed through Edit, Write or NotebookEdit, lower-cased absolute paths with forward slashes.
  touched: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'changes-pane': {
      files: Shaped<Changed[]>
      baseline: Shaped<Baseline>
      // The file whose diff is unfolded, '' for none.
      selected: string
      diff: string
    }
  }
}

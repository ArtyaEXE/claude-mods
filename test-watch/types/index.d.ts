export type TestRun = {
  // idle: nothing to show; ask: waiting for the person's yes / no for this project.
  state: 'idle' | 'ask' | 'running' | 'passed' | 'failed' | 'stopped'
  // What runs (or would run), as shown.
  command: string
  startedAt: number
  durationMs: number
  exitCode: number | null
  // The line that best says what failed, '' when none.
  summary: string
  // The last lines of the output.
  tail: string
}

declare module 'claude-code' {
  interface PluginState {
    'test-watch': {
      run: Shaped<TestRun>
      now: number
    }
  }
}

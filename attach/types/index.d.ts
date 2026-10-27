// Files /attach put into the prompt this session, absolute Windows paths.
export type Attached = string[]

declare module 'claude-code' {
  interface PluginState {
    attach: {
      attached: Attached
    }
  }
}

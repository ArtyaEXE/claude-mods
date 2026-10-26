export type Snippet = { name: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-snippets': {
      // The saved snippets as the pane draws them, by name.
      list: Shaped<Snippet[]>
    }
  }
}

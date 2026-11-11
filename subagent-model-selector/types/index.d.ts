export type Assign = { agent: string; model: string; role: string }

declare module 'claude-code' {
  interface PluginState {
    'subagent-model-selector': { last: Assign | null }
  }
}

export type Pick = { effort: 'low' | 'medium' | 'high'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'effort-optimizer': { last: Pick | null }
  }
}

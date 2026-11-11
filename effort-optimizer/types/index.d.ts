export type Level = 'low' | 'medium' | 'high'
export type Pick = { effort: Level; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'effort-optimizer': { last: Pick | null; isAuto: boolean }
  }
}

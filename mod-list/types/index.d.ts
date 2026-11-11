export type Kind = 'mod' | 'mcp' | 'skill' | 'agent' | 'plugin'
export type Row = {
  id: string
  name: string
  version: string
  scope: string
  isEnabled: boolean
  description: string
  kind: Kind
  command: string
}
export type Listing = {
  rows: Row[]
  error: string | null
  isLoaded: boolean
  needsRestart: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'mod-list': { listing: Shaped<Listing> }
  }
}

export type Row = { id: string; version: string; scope: string }
export type Listing = { rows: Row[]; error: string | null; isLoaded: boolean }

declare module 'claude-code' {
  interface PluginState {
    'mod-list': { listing: Shaped<Listing> }
  }
}

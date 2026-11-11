import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Listing, Row } from '../types'

const PANE = 'mod-list'
// Change the tag when Listing's fields change: it declines what an earlier
// version stored, which outlives a reload.
const listing = atom(
  { plugin: 'mod-list', key: 'listing' } as const,
  { rows: [], error: null, isLoaded: false } as Listing,
  { shape: 'listing-1' },
)

function parse(stdout: string): Row[] {
  const data: unknown = JSON.parse(stdout)
  if (!Array.isArray(data)) throw new Error('unexpected output')
  return data
    .filter(p => p && p.enabled === true && typeof p.id === 'string')
    .map(p => ({ id: p.id, version: String(p.version ?? '?'), scope: String(p.scope ?? '?') }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function load($: EngineInterface) {
  try {
    const r = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 20000 })
    if (r.exitCode !== 0) throw new Error(r.stderr.trim().slice(0, 120) || `exit ${r.exitCode}`)
    const rows = parse(r.stdout)
    await update($, listing, () => ({ rows, error: null, isLoaded: true }))
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await update($, listing, () => ({ rows: [], error, isLoaded: true }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mod-list',
      description: 'Show the enabled plugins in a side pane',
    })
    return next(e)
  })

  on('command.run', { command: 'mod-list' }, async $ => {
    await load($)
    await $.ui.open({ id: PANE, title: 'Mods' })
    return { text: 'Mod list opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const l = await read($, listing)

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>{l.rows.length} enabled </Text>
          <Button key="refresh" label="Refresh" onPress={() => load($)} />
        </Box>
        {l.error !== null && <Text color="red">Could not list: {l.error}</Text>}
        {l.error === null && l.isLoaded && l.rows.length === 0 && (
          <Text dimColor>No enabled plugins.</Text>
        )}
        {l.rows.map(r => (
          <Text key={r.id}>
            {r.id} <Text dimColor>{r.version} · {r.scope}</Text>
          </Text>
        ))}
      </Box>
    )
  })
}

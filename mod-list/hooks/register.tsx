import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Kind, Listing, Row } from '../types'

const PANE = 'mod-list'
// Change the tag when Listing's fields change: it declines what an earlier
// version stored, which outlives a reload.
const listing = atom(
  { plugin: 'mod-list', key: 'listing' } as const,
  { rows: [], error: null, isLoaded: false, needsRestart: false } as Listing,
  { shape: 'listing-2' },
)

// The command that opens a mod, by plugin name. Add the mods you use here;
// a name that is not listed shows no command.
const COMMANDS: Record<string, string> = {
  'mod-list': '/mod-list',
}

const STROKE = '#6b7280'
const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${STROKE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const ICONS: Record<Kind, string> = {
  mod: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  mcp: svg('<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>'),
  skill: svg('<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>'),
  agent: svg('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13v2M15 13v2"/>'),
  plugin: svg('<path d="M21 8 12 3 3 8l9 5zM3 8v8l9 5 9-5V8M12 13v8"/>'),
}
const GLYPHS: Record<Kind, string> = { mod: '⚡', mcp: '⌁', skill: '★', agent: '◍', plugin: '▣' }

const toggleSvg = (isOn: boolean): string =>
  isOn
    ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 20"><rect width="36" height="20" rx="10" fill="#22c55e"/><circle cx="26" cy="10" r="8" fill="#fff"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 20"><rect width="36" height="20" rx="10" fill="#d1d5db"/><circle cx="10" cy="10" r="8" fill="#fff"/></svg>'

function short(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 90 ? `${t.slice(0, 89)}…` : t
}

async function describe($: EngineInterface, root: string, hasMcp: boolean) {
  let description = ''
  let kind: Kind = hasMcp ? 'mcp' : 'plugin'
  try {
    const names = (await $.fs.list(root)).map(f => f.name)
    if (names.includes('hooks')) kind = 'mod'
    else if (!hasMcp && names.includes('skills')) kind = 'skill'
    else if (!hasMcp && names.includes('agents')) kind = 'agent'
    else if (!hasMcp && names.includes('commands')) kind = 'skill'
    const manifest = JSON.parse(await $.fs.read(`${root}/.claude-plugin/plugin.json`))
    if (typeof manifest.description === 'string') description = short(manifest.description)
  } catch {
    // No manifest or folder: show the row without a description.
  }
  return { description, kind }
}

async function load($: EngineInterface, needsRestart?: boolean) {
  try {
    const r = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 20000 })
    if (r.exitCode !== 0) throw new Error(r.stderr.trim().slice(0, 120) || `exit ${r.exitCode}`)
    const data: unknown = JSON.parse(r.stdout)
    if (!Array.isArray(data)) throw new Error('unexpected output')

    const rows: Row[] = []
    for (const p of data) {
      if (!p || typeof p.id !== 'string') continue
      const name = p.id.split('@')[0]
      const { description, kind } = await describe($, String(p.installPath ?? ''), !!p.mcpServers)
      rows.push({
        id: p.id,
        name,
        version: String(p.version ?? '?'),
        scope: String(p.scope ?? '?'),
        isEnabled: p.enabled === true,
        description,
        kind,
        command: COMMANDS[name] ?? '',
      })
    }
    rows.sort((a, b) => Number(b.isEnabled) - Number(a.isEnabled) || a.name.localeCompare(b.name))
    await update($, listing, l => ({
      rows,
      error: null,
      isLoaded: true,
      needsRestart: needsRestart ?? l.needsRestart,
    }))
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await update($, listing, l => ({ ...l, rows: [], error, isLoaded: true }))
  }
}

async function toggle($: EngineInterface, row: Row) {
  const verb = row.isEnabled ? 'disable' : 'enable'
  const r = await $.process.run(['claude', 'plugin', verb, row.id, '--scope', row.scope], {
    timeoutMs: 30000,
  })
  if (r.exitCode !== 0) {
    $.ui.toast(`Could not ${verb} ${row.name}: ${r.stderr.trim().slice(0, 80) || `exit ${r.exitCode}`}`)
    return
  }
  await load($, true)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mod-list',
      description: 'Show your plugins in a side pane, with on/off switches',
    })
    return next(e)
  })

  on('command.run', { command: 'mod-list' }, async $ => {
    await load($)
    await $.ui.open({ id: PANE, title: 'Mods' })
    return { text: 'Mod list opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const l = await read($, listing)
    const count = l.rows.filter(r => r.isEnabled).length

    if (e.surface === 'terminal') {
      const { Box, Text, Button } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Box>
            <Text bold>
              {count} of {l.rows.length} enabled{' '}
            </Text>
            <Button key="refresh" label="Refresh" onPress={() => load($)} />
          </Box>
          {l.needsRestart && <Text color="yellow">Restart the session to apply changes.</Text>}
          {l.error !== null && <Text color="red">Could not list: {l.error}</Text>}
          {l.rows.map(r => (
            <Box key={r.id} flexDirection="column">
              <Box>
                <Text dimColor={!r.isEnabled}>
                  {GLYPHS[r.kind]} {r.name} <Text dimColor>{r.version}</Text>{' '}
                </Text>
                <Button
                  key={`t:${r.id}`}
                  label={r.isEnabled ? '[on]' : '[off]'}
                  onPress={() => toggle($, r)}
                />
              </Box>
              {r.description !== '' && <Text dimColor>  {r.description}</Text>}
              {r.command !== '' && <Text dimColor>  {r.command}</Text>}
            </Box>
          ))}
        </Box>
      )
    }

    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" gap={1}>
        <Box justifyContent="space-between">
          <Text bold>
            {count} of {l.rows.length} enabled
          </Text>
          <Button key="refresh" label="Refresh" onPress={() => load($)} />
        </Box>
        {l.needsRestart && <Text color="yellow">Restart the session to apply changes.</Text>}
        {l.error !== null && <Text color="red">Could not list: {l.error}</Text>}
        {l.error === null && l.isLoaded && l.rows.length === 0 && (
          <Text dimColor>No plugins installed.</Text>
        )}
        {l.rows.map(r => (
          <Box key={r.id} gap={2} alignItems="flex-start">
            <Svg source={ICONS[r.kind]} alt={r.kind} width={20} height={20} />
            <Box flexDirection="column" flexGrow={1}>
              <Text bold dimColor={!r.isEnabled}>
                {r.name}{' '}
                <Text dimColor>
                  {r.version} · {r.scope}
                </Text>
              </Text>
              {r.description !== '' && <Text dimColor>{r.description}</Text>}
              {r.command !== '' && (
                <Text italic dimColor>
                  {r.command} to open
                </Text>
              )}
            </Box>
            <Button
              key={`t:${r.id}`}
              label={`${r.isEnabled ? 'Disable' : 'Enable'} ${r.name}`}
              onPress={() => toggle($, r)}
            >
              <Svg
                source={toggleSvg(r.isEnabled)}
                alt={r.isEnabled ? 'On' : 'Off'}
                width={36}
                height={20}
              />
            </Button>
          </Box>
        ))}
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Assign } from '../types'

const last = atom({ plugin: 'subagent-model-selector', key: 'last' } as const, null)

type Role = 'explorer' | 'mechanic' | 'implementer' | 'reviewer'

const REVIEW = /review|audit|security|critic|verif|rà soát|kiểm định|phản biện/i
const MECHANIC =
  /\b(rename|bulk|batch|replace all|find and replace|format|codemod|convert|migrate imports|reformat)\b|hàng loạt|đổi tên|chuyển đổi/i
const EXPLORE = /explore|search|find|locate|survey|scan|list|tìm|khám phá|liệt kê/i

export function classify(type: string, description: string, prompt: string): Role {
  if (REVIEW.test(type)) return 'reviewer'
  if (/explor|search|research/i.test(type)) return 'explorer'
  if (REVIEW.test(description)) return 'reviewer'
  if (MECHANIC.test(description)) return 'mechanic'
  if (EXPLORE.test(description)) return 'explorer'
  if (MECHANIC.test(prompt.slice(0, 600)) && prompt.length < 400) return 'mechanic'
  return 'implementer'
}

const MODEL: Record<Role, string> = {
  explorer: 'haiku',
  mechanic: 'haiku',
  implementer: 'sonnet',
  reviewer: 'opus',
}

export const register: Register = on => {
  const effortFor = new Map<string, 'high'>()

  on('agent.spawn', async ($, e, next) => {
    // Forks inherit the parent; a caller's explicit model choice stands.
    if (e.fork || e.isTeammate || e.resume !== undefined || e.model !== undefined) return next(e)

    const role = classify(e.subagentType, e.description, e.prompt)
    const model = MODEL[role]
    const res = await next({ ...e, model })

    if (res.deny === undefined) {
      if (role === 'reviewer' && res.agentId !== undefined) effortFor.set(res.agentId, 'high')
      const a: Assign = { agent: e.subagentType, model, role }
      await update($, last, () => a)
      $.ui.toast(`subagent ${e.subagentType} → ${model} (${role})`)
    }
    return res
  })

  on('turn.step', async function* ($, e, next) {
    const effort = e.agentId === undefined ? undefined : effortFor.get(e.agentId)
    if (effort !== undefined && e.effort !== undefined) return yield* next({ ...e, effort })
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const a = await read($, last)
    if (e.props.hasSurvey || a === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>
          Subagent: {a.agent} → {a.model} ({a.role})
        </Text>
      </Box>
    )
  })
}

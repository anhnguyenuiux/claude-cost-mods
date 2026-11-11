import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Pick } from '../types'

const last = atom({ plugin: 'effort-optimizer', key: 'last' } as const, null)

// High stakes: wrong answers are expensive, so think hard.
const HIGH =
  /\b(auth|oauth|jwt|password|secret|security|vulnerab|production|prod|deploy|migrat|payment|billing|race condition|deadlock|architecture|root cause|data loss|delete all|rm -rf|force.push)\b|bảo mật|xác thực|thanh toán|kiến trúc|nguyên nhân gốc|triển khai|xoá hết|xóa hết/i
// Mechanical or lookup: low effort is enough.
const LOW =
  /\b(typo|rename|format|lint|what is|what does|explain|show me|list|where is|git (status|log|diff)|print|cat|ls|open|read)\b|sửa lỗi chính tả|đổi tên|giải thích|liệt kê|ở đâu|là gì|mở file|đọc file/i
// Real engineering work: default to medium or above.
const WORK =
  /\b(implement|refactor|debug|fix|build|design|optimi[sz]e|review|test|port|integrate)\b|triển khai|viết|sửa|thiết kế|tối ưu|kiểm thử/i

export function pickEffort(text: string): Pick {
  const t = text.trim()
  const files = (t.match(/[\w./\\-]+\.(tsx?|jsx?|css|json|md|py|go|rs)\b/g) ?? []).length

  if (HIGH.test(t)) return { effort: 'high', reason: 'high-stakes keyword' }
  if (t.length > 1200 || files >= 4) return { effort: 'high', reason: 'large or multi-file task' }
  if (t.length < 100 && LOW.test(t) && !WORK.test(t)) {
    return { effort: 'low', reason: 'short lookup/mechanical' }
  }
  if (t.length < 40 && files === 0) return { effort: 'low', reason: 'very short prompt' }
  return { effort: 'medium', reason: WORK.test(t) ? 'engineering task' : 'default' }
}

export const register: Register = on => {
  const picks = new Map<string, Pick>()

  on('turn.start', ($, e, next) => {
    // Main loop only; a subagent's effort is not this mod's business.
    if (e.agentId === undefined && e.text !== '') picks.set(e.turnId, pickEffort(e.text))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const pick = e.agentId === undefined ? picks.get(e.turnId) : undefined
    // No pick (continuation turn), or the model takes no effort: leave it.
    if (pick === undefined || e.effort === undefined) return yield* next(e)

    if (e.index === 0) {
      await update($, last, () => pick)
      if (pick.effort !== e.effort) {
        $.ui.toast(`effort ${e.effort} → ${pick.effort} (${pick.reason})`)
      }
    }
    return yield* next({ ...e, effort: pick.effort })
  })

  on('turn.complete', ($, e, next) => {
    picks.delete(e.turnId)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const pick = await read($, last)
    if (e.props.hasSurvey || pick === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>
          Effort: {pick.effort} ({pick.reason})
        </Text>
      </Box>
    )
  })
}

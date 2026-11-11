import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Level, Pick } from '../types'

const last = atom({ plugin: 'effort-optimizer', key: 'last' } as const, null)
// Set by "Switch, and auto-adjust from now": the session applies picks unasked.
const isAuto = atom({ plugin: 'effort-optimizer', key: 'isAuto' } as const, false)

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
  const files = (t.match(/[\w./\-]+\.(tsx?|jsx?|css|json|md|py|go|rs)\b/g) ?? []).length

  if (HIGH.test(t)) return { effort: 'high', reason: 'high-stakes keyword' }
  if (t.length > 1200 || files >= 4) return { effort: 'high', reason: 'large or multi-file task' }
  if (t.length < 100 && LOW.test(t) && !WORK.test(t)) {
    return { effort: 'low', reason: 'short lookup or mechanical task' }
  }
  if (t.length < 40 && files === 0) return { effort: 'low', reason: 'very short prompt' }
  return { effort: 'medium', reason: WORK.test(t) ? 'engineering task' : 'default' }
}

const label = (level: string): string => level.charAt(0).toUpperCase() + level.slice(1)

export const register: Register = on => {
  // Picks the person accepted, by turn. Module variables restart on reload,
  // which only costs one more question.
  const picks = new Map<string, Pick>()
  // The effort the session itself runs at, as last seen before any rewrite.
  let sessionEffort: string | undefined

  on('turn.start', async ($, e, next) => {
    // Main loop only, and only a typed prompt.
    if (e.agentId !== undefined || e.text === '') return next(e)

    const pick = pickEffort(e.text)
    if (pick.effort === sessionEffort) return next(e)

    if (await read($, isAuto)) {
      picks.set(e.turnId, pick)
      return next(e)
    }

    const keep = sessionEffort === undefined ? 'Keep current' : `Keep ${label(sessionEffort)}`
    const switchTo = `Switch to ${label(pick.effort)}`
    const switchAuto = 'Switch, and auto-adjust from now'
    try {
      const answer = await $.ui.ask(
        `This looks like a ${label(pick.effort)} effort task: ${pick.reason}. Switch before Claude starts?`,
        { header: 'Effort', options: [switchTo, switchAuto, keep] },
      )
      if (answer === switchTo || answer === switchAuto) picks.set(e.turnId, pick)
      if (answer === switchAuto) await update($, isAuto, () => true)
    } catch {
      // Dismissed, or nobody to ask: keep the session's effort.
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    if (e.index === 0 && e.effort !== undefined) sessionEffort = String(e.effort)

    const pick = picks.get(e.turnId)
    if (pick === undefined || e.effort === undefined) return yield* next(e)

    if (e.index === 0) await update($, last, () => pick)
    return yield* next({ ...e, effort: pick.effort as Level })
  })

  on('turn.complete', ($, e, next) => {
    picks.delete(e.turnId)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const pick = await read($, last)
    if (e.props.hasSurvey || pick === null) return next(e)

    const auto = await read($, isAuto)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>
          Effort: {pick.effort} ({pick.reason}){auto ? ' · auto' : ''}
        </Text>
      </Box>
    )
  })
}

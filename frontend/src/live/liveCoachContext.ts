import type { LiveCoachContext } from '../api/skills'

function strCtx(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

function truncateJson(detail: Record<string, unknown>, max = 400): string {
  try {
    const s = JSON.stringify(detail)
    if (s.length <= max) return s
    return `${s.slice(0, max)}…`
  } catch {
    return '[detail]'
  }
}

/**
 * Human-readable block appended to the base Live coach system instruction.
 * Built from SQLite-backed skill, research dossier, and progress events.
 */
export function formatLiveCoachContextForSystemInstruction(
  ctx: LiveCoachContext,
): string {
  const s = ctx.skill
  const goal = strCtx(s.context?.goal) || (s.notes?.trim() ?? '')
  const level = strCtx(s.context?.level)
  const category = strCtx(s.context?.category)
  const practiceMin = Math.round(s.stats_practice_seconds / 60)
  const lastAt = s.last_practice_at
    ? new Date(s.last_practice_at).toISOString().slice(0, 10)
    : 'never'

  let out = `## Learner profile (from app database — stay aligned with this skill)\n`
  out += `You are coaching **one specific skill** the learner chose on their dashboard.\n\n`
  out += `### Skill\n`
  out += `- **Title:** ${s.title}\n`
  if (goal) out += `- **Goal / notes:** ${goal}\n`
  if (level) out += `- **Declared experience level:** ${level}\n`
  if (category) out += `- **Focus area tag:** ${category}\n`
  out += `\n### Progress stats (authoritative for pacing and encouragement)\n`
  out += `- **Level:** ${s.stats_level} — **${Math.round(s.stats_progress_percent)}%** progress toward the next level\n`
  out += `- **Completed sessions (recorded):** ${s.stats_sessions}\n`
  out += `- **Total practice time (recorded):** ${s.stats_practice_seconds}s (~${practiceMin} min)\n`
  out += `- **Mastered items count:** ${s.stats_mastered}\n`
  out += `- **Current practice streak:** ${s.stats_day_streak} day(s)\n`
  out += `- **Last practice date (UTC date):** ${lastAt}\n`

  if (ctx.research) {
    out += `\n### Stored research dossier (use for drills, terminology, safety, and milestones)\n`
    if (ctx.research.title?.trim()) {
      out += `**Dossier title:** ${ctx.research.title.trim()}\n\n`
    }
    out += ctx.research.content.trim()
    out += `\n`
  } else {
    out += `\n### Stored research dossier\n`
    out += `_No research dossier on file yet — rely on the learner’s goal and what you see on camera._\n`
  }

  if (ctx.progress_events.length > 0) {
    out += `\n### Recent progress log (newest first; includes sessions and milestones)\n`
    for (const e of ctx.progress_events) {
      const label = e.label?.trim() || e.kind
      let line = `- **[${e.kind}]** ${label}`
      if (e.metric_value != null) {
        line += ` (metric: ${e.metric_value})`
      }
      if (e.detail && Object.keys(e.detail).length > 0) {
        line += ` — ${truncateJson(e.detail)}`
      }
      out += `${line}\n`
    }
  } else {
    out += `\n### Recent progress log\n`
    out += `_No events yet — treat this as an early coaching relationship._\n`
  }

  out += `\nAnchor spoken feedback to the **skill title** and **goal** above. Reference research when it helps, and celebrate stats honestly (do not invent session counts or levels).`
  return out
}

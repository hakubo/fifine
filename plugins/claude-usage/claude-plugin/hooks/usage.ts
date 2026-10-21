import type { SessionRateLimit } from 'claude-code'

export type UsageWindow = { percent: number; resetsAt: number | null }
export type UsageFile = { fiveHour: UsageWindow | null; sevenDay: UsageWindow | null; updatedAt: number }

function window(limits: readonly SessionRateLimit[], kind: string): UsageWindow | null {
  const limit = limits.find(l => l.kind === kind)
  if (!limit) return null
  const resetsAt = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  return { percent: limit.percentUsed, resetsAt: Number.isNaN(resetsAt) ? null : resetsAt }
}

// The file the Claude Usage key reads, or null when the session reported no subscription limits.
export function toUsageFile(limits: readonly SessionRateLimit[], now: number): UsageFile | null {
  const fiveHour = window(limits, 'five_hour')
  const sevenDay = window(limits, 'seven_day')
  if (!fiveHour && !sevenDay) return null
  return { fiveHour, sevenDay, updatedAt: now }
}

// Writes the account's rate-limit usage to ~/.claude/fifine/usage.json, where the Claude Usage
// key on the fifine Control Deck reads it. Runs in every session, `claude rc` ones included.
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import { toUsageFile } from './usage'

async function record($: EngineInterface, rateLimits: readonly SessionRateLimit[]) {
  const usage = toUsageFile(rateLimits, await $.clock.now())
  // API-key, Bedrock and Vertex sessions report no limits; keep the last subscription reading
  if (!usage) return
  const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  await $.fs.write(`${home}/fifine/usage.json`, JSON.stringify(usage))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await record($, (await $.session.usage()).rateLimits).catch(() => {})
    return ran
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await record($, e.rateLimits).catch(() => {})
    return next(e)
  })
}

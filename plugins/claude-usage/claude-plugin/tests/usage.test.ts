import { expect, test } from 'claude-code/testing'

import { toUsageFile } from '../hooks/usage'

test('maps the engine readings to the usage file', () => {
  const file = toUsageFile(
    [
      { kind: 'five_hour', percentUsed: 42.5, resetsAt: '2026-10-12T15:00:00Z' },
      { kind: 'seven_day', percentUsed: 93 },
    ],
    1000,
  )
  expect(file).toEqual({
    fiveHour: { percent: 42.5, resetsAt: Date.parse('2026-10-12T15:00:00Z') },
    sevenDay: { percent: 93, resetsAt: null },
    updatedAt: 1000,
  })
})

test('no subscription limits, no file', () => {
  expect(toUsageFile([], 1000)).toBeNull()
  expect(toUsageFile([{ kind: 'spend_limit', percentUsed: 10 }], 1000)).toBeNull()
})

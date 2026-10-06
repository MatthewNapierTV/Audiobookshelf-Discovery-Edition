/**
 * Daily reading/listening goal & streak helpers (Apple Books style "reading goals").
 * Pure functions so they're easy to test; persistence lives on the user's extraData.
 */

const DEFAULT_GOAL_MINUTES = 30
const MAX_DAYS_KEPT = 400

/**
 * Local calendar date as YYYY-MM-DD (matches playbackSession.date)
 * @param {Date} [date]
 * @returns {string}
 */
function toDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {string} key YYYY-MM-DD
 * @param {number} days
 * @returns {string}
 */
function shiftDateKey(key, days) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/**
 * Add seconds to a per-day map, pruning old days
 * @param {Record<string, number>} days
 * @param {string} dateKey
 * @param {number} seconds
 * @returns {Record<string, number>}
 */
function addToDay(days, dateKey, seconds) {
  const out = { ...(days || {}) }
  out[dateKey] = (Number(out[dateKey]) || 0) + seconds
  const keys = Object.keys(out).sort()
  while (keys.length > MAX_DAYS_KEPT) delete out[keys.shift()]
  return out
}

/**
 * Current & best streak of consecutive days meeting the goal. Today only breaks the streak once
 * it's over, so an in-progress day doesn't reset a streak to zero in the morning.
 *
 * @param {Record<string, number>} secondsByDay
 * @param {number} goalMinutes
 * @param {string} todayKey
 * @returns {{ current: number, best: number }}
 */
function computeStreak(secondsByDay, goalMinutes, todayKey) {
  const goalSeconds = Math.max(1, goalMinutes) * 60
  const met = (key) => (Number(secondsByDay[key]) || 0) >= goalSeconds

  let current = 0
  let cursor = met(todayKey) ? todayKey : shiftDateKey(todayKey, -1)
  while (met(cursor)) {
    current++
    cursor = shiftDateKey(cursor, -1)
  }

  let best = 0
  let run = 0
  let prev = null
  for (const key of Object.keys(secondsByDay).sort()) {
    if (!met(key)) {
      run = 0
      prev = key
      continue
    }
    run = prev && shiftDateKey(prev, 1) === key && run > 0 ? run + 1 : 1
    best = Math.max(best, run)
    prev = key
  }
  return { current, best: Math.max(best, current) }
}

module.exports = { DEFAULT_GOAL_MINUTES, toDateKey, shiftDateKey, addToDay, computeStreak }

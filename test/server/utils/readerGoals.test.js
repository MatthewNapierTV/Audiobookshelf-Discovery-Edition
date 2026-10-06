const { expect } = require('chai')
const { computeStreak, addToDay, shiftDateKey, toDateKey } = require('../../../server/utils/readerGoals')

describe('readerGoals', () => {
  const today = '2026-10-06'
  const mins = (n) => n * 60

  it('shifts date keys across month boundaries', () => {
    expect(shiftDateKey('2026-10-01', -1)).to.equal('2026-09-30')
    expect(toDateKey(new Date(2026, 0, 5))).to.equal('2026-01-05')
  })

  it('counts consecutive days meeting the goal, including today', () => {
    const days = { '2026-10-04': mins(30), '2026-10-05': mins(45), '2026-10-06': mins(31) }
    expect(computeStreak(days, 30, today)).to.deep.equal({ current: 3, best: 3 })
  })

  it('does not break the streak while today is still in progress', () => {
    const days = { '2026-10-04': mins(30), '2026-10-05': mins(30), '2026-10-06': mins(5) }
    expect(computeStreak(days, 30, today).current).to.equal(2)
  })

  it('resets after a missed day and tracks the best streak', () => {
    const days = { '2026-09-01': mins(40), '2026-09-02': mins(40), '2026-09-03': mins(40), '2026-10-05': mins(10), '2026-10-06': mins(30) }
    expect(computeStreak(days, 30, today)).to.deep.equal({ current: 1, best: 3 })
  })

  it('accumulates seconds per day', () => {
    const days = addToDay(addToDay({}, today, 20), today, 40)
    expect(days[today]).to.equal(60)
  })
})

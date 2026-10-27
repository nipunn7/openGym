import { describe, it, expect } from 'vitest'
import { weekReview, mondayOf, plannedFor } from './review.js'

const MON = '2026-10-26'
const w = (d, entries, extra = {}) => ({ d, start: 0, end: 50 * 60000, vol: 1000, entries, ...extra })
const e = (id, wt, n = 3) => ({ id, sets: Array.from({ length: n }, () => ({ w: wt, r: 10, done: true })) })
const base = extra => ({ workouts: [], week: {}, dayPlan: {}, coach: { on: true, days: [1, 2, 3, 4, 5, 6] }, ...extra })

describe('weekReview', () => {
  it('finds the Monday of any day', () => {
    expect(mondayOf('2026-11-01')).toBe(MON)   // Sunday
    expect(mondayOf(MON)).toBe(MON)
  })
  it('counts planned sessions from coach days, minus days set to rest', () => {
    expect(plannedFor(base(), MON)).toBe(6)
    expect(plannedFor(base({ dayPlan: { '2026-10-28': 'rest' } }), MON)).toBe(5)
    expect(plannedFor(base({ coach: { on: false }, week: { 1: 'a', 3: 'b' } }), MON)).toBe(2)
  })
  it('reports lifts that went up against everything before the week', () => {
    const S = base({ workouts: [w('2026-10-20', [e('0025', 40), e('0043', 60)]), w('2026-10-27', [e('0025', 42.5), e('0043', 60), e('0085', 50)])] })
    const r = weekReview(S, MON, '2026-10-28')
    expect(r.sessions).toBe(1)
    expect(r.improved).toEqual([{ id: '0025', from: 40, to: 42.5 }])
    expect(r.firsts).toEqual(['0085'])
    expect(r.sets).toEqual({ chest: 3, 'upper legs': 6 })
    expect(r.minutes).toBe(50)
  })
  it('names major body parts with no sets', () => {
    const r = weekReview(base({ workouts: [w('2026-10-27', [e('0025', 40)])] }), MON, '2026-10-28')
    expect(r.missing).toEqual(['back', 'upper legs', 'shoulders'])
    expect(r.tip[0]).toMatch(/No sets for/)
  })
  it('after a short week, aims for one more session next week', () => {
    const S = base({ workouts: [w('2026-10-27', [e('0025', 40)]), w('2026-10-28', [e('0027', 40), e('0043', 60), e('0091', 30)])] })
    const r = weekReview(S, MON, '2026-11-03')
    expect(r.over).toBe(true)
    expect(r.tip).toEqual(['{0} of {1} sessions. Next week, aim for {2} — one more than this week.', 2, 6, 3])
  })
  it('handles an empty week', () => {
    expect(weekReview(base(), MON, '2026-10-27').tip[0]).toMatch(/Nothing logged yet/)
  })
})

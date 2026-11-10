import { describe, it, expect } from 'vitest'
import { todayPlan, chooseAlternative, undoAlternative, completeActivity, ensureBuiltins, BUILTIN, HOME_ID, walkOptions } from './trainer.js'
import { generatePlan, GEAR, coachRoutineId, missedDays, upcoming } from './coach.js'
import { effectiveRoutineId } from './history.js'
import { weekReview } from './review.js'
import { EXIDX } from './exercises.js'

const MON = '2026-11-09', TUE = '2026-11-10', WED = '2026-11-11', SUN = '2026-11-15'
const PROFILE = { sex: 'male', age: 30, experience: 'beginner', goal: 'general', minutes: 60 }

const state = (extra = {}) => {
  const plan = generatePlan({ profile: PROFILE, gear: GEAR.map(g => g.key), days: [1, 2, 3, 4, 5, 6], bodyweight: 80 })
  return {
    unit: 'kg', dayPlan: {}, week: {}, workouts: [], bodyweight: [], exWeights: {}, activities: [], active: null,
    routines: plan.routines,
    coach: { on: true, profile: PROFILE, days: [1, 2, 3, 4, 5, 6], gear: [], rotation: plan.rotation, checkins: {}, walkDays: { 0: 60 } },
    ...extra,
  }
}
const did = (S, d, rid) => S.workouts.push({ id: d + rid, d, end: 1, routineId: rid, entries: [] })

describe('built-in sessions', () => {
  it('only use exercises that exist', () => {
    for (const r of Object.values(BUILTIN)) for (const e of r.ex) expect(EXIDX[e.id], e.id).toBeTruthy()
  })
  it('are added once', () => {
    const S = { routines: [] }
    ensureBuiltins(S); ensureBuiltins(S)
    expect(S.routines.map(r => r.id)).toEqual(Object.keys(BUILTIN))
  })
})

describe('todayPlan', () => {
  it('asks for setup without a plan', () => {
    expect(todayPlan({ workouts: [], routines: [], coach: { on: false } }, TUE).kind).toBe('setup')
  })
  it('serves the next gym session on a training day', () => {
    const S = state()
    expect(todayPlan(S, MON)).toMatchObject({ kind: 'gym', routineId: S.coach.rotation[0], suggestWalk: false })
  })
  it('serves the planned walk on a rest day with a walk', () => {
    expect(todayPlan(state(), SUN)).toEqual({ kind: 'walk', min: 60 })
  })
  it('is a rest day otherwise', () => {
    const S = state()
    S.coach.walkDays = {}
    expect(todayPlan(S, SUN).kind).toBe('rest')
  })
  it('suggests a walk when recovery is poor', () => {
    const S = state()
    S.coach.checkins[MON] = { sleep: 4, energy: 1 }
    expect(todayPlan(S, MON).suggestWalk).toBe(true)
  })
  it('says done once a workout is logged', () => {
    const S = state()
    did(S, MON, S.coach.rotation[0])
    expect(todayPlan(S, MON).kind).toBe('done')
  })
})

describe('choosing a walk instead', () => {
  it('moves the gym session to the next training day instead of losing it', () => {
    const S = state()
    did(S, MON, S.coach.rotation[0])
    expect(coachRoutineId(S, TUE, TUE)).toBe(S.coach.rotation[1])
    chooseAlternative(S, 'walk', 60, TUE)
    expect(todayPlan(S, TUE)).toMatchObject({ kind: 'alt', activity: { kind: 'walk', min: 60, done: false } })
    expect(effectiveRoutineId(S, TUE)).toBe(null)
    expect(coachRoutineId(S, WED, TUE)).toBe(S.coach.rotation[1])     // Pull A waits for Wednesday
    expect(upcoming(S, 2, TUE).map(x => x.d)).toEqual([WED, '2026-11-12'])
  })
  it('is not counted as a missed day', () => {
    const S = state()
    did(S, MON, S.coach.rotation[0])
    chooseAlternative(S, 'walk', 45, TUE)
    completeActivity(S, { kind: 'walk', min: 50 }, TUE)
    expect(missedDays(S, WED)).toBe(0)
    expect(todayPlan(S, TUE).kind).toBe('done')
    expect(S.activities).toEqual([{ d: TUE, kind: 'walk', min: 50, done: true, src: 'manual' }])
  })
  it('can be undone before it is done', () => {
    const S = state()
    chooseAlternative(S, 'walk', 60, MON)
    undoAlternative(S, MON)
    expect(todayPlan(S, MON).kind).toBe('gym')
    expect(S.activities).toEqual([])
  })
  it('a home workout counts as done once that session is logged, and adds the session', () => {
    const S = state()
    chooseAlternative(S, 'home', null, MON)
    expect(S.routines.some(r => r.id === HOME_ID)).toBe(true)
    expect(todayPlan(S, MON).kind).toBe('alt')
    did(S, MON, HOME_ID)
    expect(todayPlan(S, MON).kind).toBe('done')
    expect(coachRoutineId(S, '2026-11-10', MON)).toBe(S.coach.rotation[0])   // gym program untouched
  })
  it('rest is done immediately', () => {
    const S = state()
    chooseAlternative(S, 'rest', null, MON)
    expect(todayPlan(S, MON).kind).toBe('done')
  })
  it('walks show up in the weekly review', () => {
    const S = state()
    completeActivity(S, { kind: 'walk', min: 60 }, TUE)
    completeActivity(S, { kind: 'walk', min: 30 }, WED)
    expect(weekReview(S, MON, SUN)).toMatchObject({ walks: 2, walkMin: 90 })
  })
  it('offers longer walks for fat loss', () => {
    expect(walkOptions({ goal: 'fatloss' })).toEqual([45, 60, 90])
    expect(walkOptions({ goal: 'strength' })).toEqual([30, 45, 60])
  })
})

import { applyHealth } from './trainer.js'
describe('Apple Health', () => {
  it('fills the check-in but never overwrites what you typed', () => {
    const S = state()
    S.coach.checkins[MON] = { sleep: 6 }
    const ch = applyHealth(S, { sleepHours: 7.43, rhr: 54.6, hrv: 61.2, steps: 4321.7 }, {}, MON)
    expect(S.coach.checkins[MON]).toMatchObject({ sleep: 6, rhr: 55, hrv: 61, steps: 4322, auto: ['rhr', 'hrv'] })
    expect(ch).toEqual(['rhr', 'hrv'])
    applyHealth(S, { rhr: 52 }, {}, MON)
    expect(S.coach.checkins[MON].rhr).toBe(52)                 // still Health's, so refreshed
  })
  it('logs today’s weight once, in the profile unit', () => {
    const S = state({ unit: 'lb' })
    applyHealth(S, { weightKg: 80 }, { unit: 'lb' }, MON)
    applyHealth(S, { weightKg: 79 }, { unit: 'lb' }, MON)
    expect(S.bodyweight).toEqual([expect.objectContaining({ d: MON, w: 176.4 })])
  })
  it('ticks off a planned walk at 80 % of its length', () => {
    const S = state()
    applyHealth(S, { walkMinutes: 40 }, {}, SUN)               // 60-min walk day
    expect(todayPlan(S, SUN).kind).toBe('walk')
    expect(S.coach.checkins[SUN].walkMin).toBe(40)
    applyHealth(S, { walkMinutes: 49 }, {}, SUN)
    expect(todayPlan(S, SUN).kind).toBe('done')
    applyHealth(S, { walkMinutes: 65 }, {}, SUN)
    expect(S.activities).toEqual([{ d: SUN, kind: 'walk', min: 65, done: true, src: 'health' }])
  })
  it('a walk on a gym day counts, but the workout is still waiting', () => {
    const S = state()
    applyHealth(S, { walkMinutes: 25 }, {}, MON)
    expect(todayPlan(S, MON).kind).toBe('gym')
    expect(weekReview(S, MON, SUN)).toMatchObject({ walks: 1, walkMin: 25 })
  })
  it('completes a walk chosen instead of the gym', () => {
    const S = state()
    chooseAlternative(S, 'walk', 60, MON)
    applyHealth(S, { walkMinutes: 58 }, {}, MON)
    expect(todayPlan(S, MON).kind).toBe('done')
    expect(coachRoutineId(S, TUE, MON)).toBe(S.coach.rotation[0])
  })
})

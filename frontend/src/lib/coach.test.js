import { describe, it, expect } from 'vitest'
import {
  SLOTS, GEAR, optionsFor, generatePlan, startWeight, coachRoutineId, missedDays, upcoming,
  readiness, sessionAdjust, adjustEntries, parseVitals, daysSinceWorkout,
} from './coach.js'
import { EXIDX } from './exercises.js'
import { effectiveRoutineId } from './history.js'

const ALL_GEAR = GEAR.map(g => g.key)
const PROFILE = { sex: 'male', age: 30, experience: 'beginner', goal: 'muscle', minutes: 60 }
const MON_SAT = [1, 2, 3, 4, 5, 6]

// 2026-10-26 is a Monday.
const MON = '2026-10-26', TUE = '2026-10-27', WED = '2026-10-28', THU = '2026-10-29', SAT = '2026-10-31', SUN = '2026-11-01'

const coachState = (extra = {}) => {
  const plan = generatePlan({ profile: PROFILE, gear: ALL_GEAR, days: MON_SAT, bodyweight: 80 })
  return {
    unit: 'kg', dayPlan: {}, week: {}, workouts: [], bodyweight: [], exWeights: {},
    routines: plan.routines,
    coach: { on: true, profile: PROFILE, days: MON_SAT, gear: ALL_GEAR, rotation: plan.rotation, checkins: {} },
    ...extra,
  }
}
const did = (S, d, idx) => S.workouts.push({ id: d + idx, d, end: 1, routineId: S.coach.rotation[idx], entries: [] })

describe('exercise slots', () => {
  it('only reference exercises that exist in the library', () => {
    for (const [slot, cands] of Object.entries(SLOTS)) {
      for (const [id] of cands) expect(EXIDX[id], `${slot}: ${id}`).toBeTruthy()
    }
  })
  it('only need gear the setup screen offers', () => {
    for (const cands of Object.values(SLOTS)) {
      for (const [, need] of cands) if (need !== null) expect(ALL_GEAR).toContain(need)
    }
  })
  it('puts machines first for beginners and free weights first for others', () => {
    expect(optionsFor('hpress', ALL_GEAR, 'beginner')[0].kind).toBe('machine')
    expect(optionsFor('hpress', ALL_GEAR, 'intermediate')[0].id).toBe('0025')
  })
  it('falls back to bodyweight when the gym has nothing for a slot', () => {
    expect(optionsFor('hpress', [], 'beginner').map(o => o.id)).toEqual(['0662'])
  })
})

describe('generatePlan', () => {
  it('makes a push/pull/legs ×2 rotation for six days', () => {
    const p = generatePlan({ profile: PROFILE, gear: ALL_GEAR, days: MON_SAT, bodyweight: 80 })
    expect(p.routines.map(r => r.name)).toEqual(['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'])
    expect(p.rotation).toEqual(p.routines.map(r => r.id))
  })
  it('picks the split from the number of days', () => {
    const n = days => generatePlan({ profile: PROFILE, gear: ALL_GEAR, days, bodyweight: 80 }).routines.length
    expect(n([1, 3, 5])).toBe(3)
    expect(n([1, 2, 4, 5])).toBe(4)
    expect(n([1, 2, 3, 4, 5])).toBe(5)
  })
  it('only uses equipment the gym has', () => {
    const gear = ['dumbbell']
    const p = generatePlan({ profile: PROFILE, gear, days: MON_SAT, bodyweight: 80 })
    for (const r of p.routines) for (const e of r.ex) expect(['dumbbell', 'body weight']).toContain(EXIDX[e.id].eq)
    expect(p.notes).toContain('leg curl')
  })
  it('never repeats an exercise within one day and varies the B day', () => {
    const p = generatePlan({ profile: { ...PROFILE, experience: 'intermediate' }, gear: ALL_GEAR, days: MON_SAT, bodyweight: 80 })
    for (const r of p.routines) expect(new Set(r.ex.map(e => e.id)).size).toBe(r.ex.length)
    expect(p.routines[0].ex[0].id).not.toBe(p.routines[3].ex[0].id)
  })
  it('fits the exercise count to the session length', () => {
    const short = generatePlan({ profile: { ...PROFILE, minutes: 45 }, gear: ALL_GEAR, days: MON_SAT, bodyweight: 80 })
    const long = generatePlan({ profile: { ...PROFILE, minutes: 90 }, gear: ALL_GEAR, days: MON_SAT, bodyweight: 80 })
    expect(short.routines[0].ex.length).toBe(4)
    expect(long.routines[0].ex.length).toBe(6)
  })
  it('adds a cardio finisher for fat loss when there is a cardio machine', () => {
    const p = generatePlan({ profile: { ...PROFILE, goal: 'fatloss' }, gear: ALL_GEAR, days: MON_SAT, bodyweight: 80 })
    const last = p.routines[0].ex[p.routines[0].ex.length - 1]
    expect(last.mode).toBe('cardio')
    expect(last.min).toBe(20)
  })
  it('uses linear 5-rep work on the main lifts for strength', () => {
    const p = generatePlan({ profile: { ...PROFILE, goal: 'strength' }, gear: ALL_GEAR, days: MON_SAT, bodyweight: 80 })
    expect(p.routines[0].ex[0]).toMatchObject({ reps: 5, prog: 'linear' })
  })
  it('flags a missing body weight and leaves weights at 0', () => {
    const p = generatePlan({ profile: PROFILE, gear: ALL_GEAR, days: MON_SAT, bodyweight: null })
    expect(p.notes).toContain('__nobw')
    expect(p.routines[0].ex.every(e => !e.weight)).toBe(true)
  })
})

describe('startWeight', () => {
  const base = { ratio: 0.45, exId: '0025', reps: 10, bodyweight: 80, profile: PROFILE }
  it('lands on a loadable barbell weight, never below the bar', () => {
    const w = startWeight(base)
    expect(w % 2.5).toBe(0)
    expect(w).toBeGreaterThanOrEqual(20)
    expect(startWeight({ ...base, bodyweight: 40, profile: { ...PROFILE, sex: 'female' } })).toBe(20)
  })
  it('is heavier for fewer reps and for more experience', () => {
    expect(startWeight({ ...base, reps: 5 })).toBeGreaterThan(startWeight(base))
    expect(startWeight({ ...base, profile: { ...PROFILE, experience: 'advanced' } })).toBeGreaterThan(startWeight(base))
  })
  it('returns 0 for bodyweight moves or without a body weight', () => {
    expect(startWeight({ ...base, ratio: 0 })).toBe(0)
    expect(startWeight({ ...base, bodyweight: null })).toBe(0)
  })
})

describe('rotation', () => {
  it('serves the first session on the first training day', () => {
    const S = coachState()
    expect(coachRoutineId(S, MON, MON)).toBe(S.coach.rotation[0])
  })
  it('a missed day does not skip a session — the next day picks it up', () => {
    const S = coachState()
    did(S, MON, 0)                          // Monday: Push A done; Tuesday (Pull A) missed
    expect(coachRoutineId(S, WED, WED)).toBe(S.coach.rotation[1])
    expect(missedDays(S, WED)).toBe(1)
  })
  it('projects future days one queue step per training day', () => {
    const S = coachState()
    did(S, MON, 0)
    expect(coachRoutineId(S, TUE, TUE)).toBe(S.coach.rotation[1])
    expect(coachRoutineId(S, WED, TUE)).toBe(S.coach.rotation[2])
    expect(coachRoutineId(S, SAT, TUE)).toBe(S.coach.rotation[5])
    expect(coachRoutineId(S, SUN, TUE)).toBe(null)                 // not a training day
  })
  it('shows what was done today, and moves on from it', () => {
    const S = coachState()
    did(S, TUE, 3)
    expect(coachRoutineId(S, TUE, TUE)).toBe(S.coach.rotation[3])
    expect(coachRoutineId(S, WED, TUE)).toBe(S.coach.rotation[4])
  })
  it('wraps around after the last session', () => {
    const S = coachState()
    did(S, MON, 5)
    expect(coachRoutineId(S, TUE, TUE)).toBe(S.coach.rotation[0])
  })
  it('a day rescheduled by hand does not consume a queue step', () => {
    const S = coachState({ dayPlan: { [WED]: 'rest' } })
    did(S, MON, 0)
    expect(coachRoutineId(S, THU, TUE)).toBe(S.coach.rotation[2])
    expect(upcoming(S, 3, TUE).map(x => x.d)).toEqual([TUE, THU, '2026-10-30'])
  })
  it('drives effectiveRoutineId only while the coach is on', () => {
    const S = coachState({ week: { 2: 'weekly' } })
    expect(effectiveRoutineId(S, TUE)).toBe(coachRoutineId(S, TUE))
    S.coach.on = false
    expect(effectiveRoutineId(S, TUE)).toBe('weekly')
  })
  it('ignores routines deleted from the plan', () => {
    const S = coachState()
    S.routines = S.routines.filter(r => r.id !== S.coach.rotation[0])
    expect(coachRoutineId(S, MON, MON)).toBe(S.coach.rotation[1])
  })
})

describe('readiness', () => {
  const withCheckins = (today, history) => coachState({ coach: { ...coachState().coach, checkins: { ...history, [TUE]: today } } })
  const normal = { '2026-10-20': { rhr: 55, hrv: 60 }, '2026-10-21': { rhr: 56, hrv: 62 }, '2026-10-22': { rhr: 54, hrv: 58 }, '2026-10-23': { rhr: 55, hrv: 60 } }

  it('is null without a check-in', () => {
    expect(readiness(coachState(), TUE)).toBe(null)
  })
  it('says go on a normal day', () => {
    expect(readiness(withCheckins({ sleep: 8, energy: 4, rhr: 55, hrv: 61 }, normal), TUE).level).toBe('go')
  })
  it('goes lighter on short sleep', () => {
    expect(readiness(withCheckins({ sleep: 6 }, {}), TUE).level).toBe('light')
  })
  it('suggests rest when several signals stack up', () => {
    const r = readiness(withCheckins({ sleep: 5.5, rhr: 63, hrv: 45 }, normal), TUE)
    expect(r.level).toBe('rest')
    expect(r.reasons.length).toBe(3)
  })
  it('ignores heart numbers until there is a personal baseline', () => {
    expect(readiness(withCheckins({ rhr: 80, hrv: 20 }, {}), TUE).level).toBe('go')
  })
})

describe('session adjustments', () => {
  const entry = (sets, w, mode = 'reps') => ({ id: '0025', target: { sets, mode }, sets: Array.from({ length: sets }, () => ({ w, r: 10, done: false })) })

  it('drops one set but never below two, and keeps the target in step', () => {
    const out = adjustEntries([entry(3, 60), entry(2, 60)], { dropSet: true })
    expect(out[0].sets.length).toBe(2)
    expect(out[0].target.sets).toBe(2)
    expect(out[1].sets.length).toBe(2)
  })
  it('eases loads to a loadable weight', () => {
    expect(adjustEntries([entry(3, 60)], { ease: 0.9 })[0].sets[0].w).toBe(55)
  })
  it('leaves cardio alone', () => {
    const c = { id: '3666', target: { mode: 'cardio' }, sets: [{ min: 20 }] }
    expect(adjustEntries([c], { dropSet: true, ease: 0.9 })[0]).toBe(c)
  })
  it('applies after a poor check-in or a long break, only to coach sessions', () => {
    const S = coachState()
    const rid = S.coach.rotation[0]
    expect(sessionAdjust(S, rid, TUE)).toBe(null)
    S.coach.checkins[TUE] = { sleep: 4 }
    expect(sessionAdjust(S, rid, TUE)).toMatchObject({ dropSet: true })
    expect(sessionAdjust(S, 'not-coach', TUE)).toBe(null)
    S.coach.checkins = {}
    S.workouts.push({ d: '2026-10-01', routineId: rid, entries: [] })
    expect(daysSinceWorkout(S, TUE)).toBe(26)
    expect(sessionAdjust(S, rid, TUE)).toMatchObject({ ease: 0.9 })
  })
})

describe('parseVitals', () => {
  it('reads a query string from a Shortcut', () => {
    expect(parseVitals('sleep=7.5&rhr=54&hrv=62&weight=80.2')).toEqual({ sleep: 7.5, rhr: 54, hrv: 62, weight: 80.2 })
  })
  it('reads a full URL', () => {
    expect(parseVitals('https://gym.example/#/coach?rhr=50')).toEqual({ rhr: 50 })
  })
  it('reads loose text with comma decimals and other key names', () => {
    expect(parseVitals('Sleep: 7,5\nResting HR: 52\nBody mass: 81,4')).toEqual({ sleep: 7.5, rhr: 52, weight: 81.4 })
  })
  it('turns sleep minutes into hours and drops nonsense', () => {
    expect(parseVitals('sleep=450&rhr=900&foo=3')).toEqual({ sleep: 7.5 })
  })
})

// Coach mode.
//
// Three jobs, all pure functions of the state object so they can be tested and re-derived:
//
//  1. Build a program from who you are (experience, goal, body weight, sex, age), how many
//     days a week you train, and the equipment your gym actually has. The output is ordinary
//     routines — the workout screen, the progression engine (progression.js), stats and the
//     routine editor all work on them unchanged. The coach only decides the *starting point*;
//     from the second session on, every weight comes from what you actually logged.
//
//  2. Schedule by rotation instead of by weekday. The routines form a queue (Push A, Pull A,
//     Legs A, …) and each training day serves the next one in line. Miss Tuesday and
//     Wednesday serves Tuesday's session — nothing is skipped, the cycle just shifts.
//
//  3. Read a daily check-in (sleep, energy, soreness, resting heart rate, HRV — typed in or
//     sent from an iOS Shortcut that reads Apple Health / Apple Watch) and turn it into a
//     go / lighter / rest call. Thresholds are rules of thumb, not medicine: resting HR well
//     above, or HRV well below, your *own* recent baseline are the standard signs of
//     incomplete recovery, so both are compared against your history, never a population.

import { EXIDX } from './exercises.js'
import { isoOf, todayISO } from './format.js'

/* ------------------------------------------------------------- equipment -- */

// What a gym can have. `group` only orders the setup screen.
export const GEAR = [
  { key: 'barbell', group: 'Free weights', label: 'Barbell, rack & bench' },
  { key: 'dumbbell', group: 'Free weights', label: 'Dumbbells & bench' },
  { key: 'ezbar', group: 'Free weights', label: 'EZ curl bar' },
  { key: 'cable', group: 'Machines', label: 'Cable station / crossover' },
  { key: 'smith', group: 'Machines', label: 'Smith machine' },
  { key: 'legpress', group: 'Machines', label: 'Leg press' },
  { key: 'hacksquat', group: 'Machines', label: 'Hack squat' },
  { key: 'legext', group: 'Machines', label: 'Leg extension' },
  { key: 'legcurl', group: 'Machines', label: 'Leg curl' },
  { key: 'calfmachine', group: 'Machines', label: 'Calf raise machine' },
  { key: 'chestpress', group: 'Machines', label: 'Chest press machine' },
  { key: 'pecdeck', group: 'Machines', label: 'Pec deck / fly machine' },
  { key: 'shoulderpress', group: 'Machines', label: 'Shoulder press machine' },
  { key: 'latpulldown', group: 'Machines', label: 'Lat pulldown' },
  { key: 'seatedrow', group: 'Machines', label: 'Seated row machine' },
  { key: 'curlmachine', group: 'Machines', label: 'Biceps curl machine' },
  { key: 'pullupbar', group: 'Bodyweight stations', label: 'Pull-up bar' },
  { key: 'dips', group: 'Bodyweight stations', label: 'Dip station' },
  { key: 'hyper', group: 'Bodyweight stations', label: 'Back extension bench' },
  { key: 'treadmill', group: 'Cardio', label: 'Treadmill' },
  { key: 'bike', group: 'Cardio', label: 'Exercise bike' },
  { key: 'elliptical', group: 'Cardio', label: 'Elliptical' },
  { key: 'stepmill', group: 'Cardio', label: 'Stair climber' },
  { key: 'rope', group: 'Cardio', label: 'Jump rope' },
]
export const GEAR_GROUPS = [...new Set(GEAR.map(g => g.group))]

/* ----------------------------------------------------------------- slots -- */

// One movement each. Candidates are [exerciseId, gear needed (null = nothing), ratio, kind]:
//   ratio — a conservative ~10-rep working weight for an untrained man, as a fraction of body
//           weight (per hand for dumbbells). Only ever used for the very first session.
//   kind  — 'free' | 'machine' | 'bw', which decides the order for a given experience level.
// Every id is checked against the exercise library by the tests.
export const SLOTS = {
  hpress: [['0025', 'barbell', 0.45, 'free'], ['0289', 'dumbbell', 0.16, 'free'], ['0577', 'chestpress', 0.4, 'machine'], ['0748', 'smith', 0.4, 'machine'], ['0662', null, 0, 'bw']],
  incpress: [['0047', 'barbell', 0.35, 'free'], ['0314', 'dumbbell', 0.13, 'free'], ['1299', 'chestpress', 0.35, 'machine'], ['0757', 'smith', 0.35, 'machine'], ['0662', null, 0, 'bw']],
  ohp: [['0091', 'barbell', 0.3, 'free'], ['0405', 'dumbbell', 0.1, 'free'], ['0603', 'shoulderpress', 0.25, 'machine']],
  row: [['0027', 'barbell', 0.4, 'free'], ['0293', 'dumbbell', 0.18, 'free'], ['0861', 'cable', 0.4, 'machine'], ['1350', 'seatedrow', 0.4, 'machine']],
  vpull: [['2330', 'latpulldown', 0.45, 'machine'], ['0579', 'latpulldown', 0.45, 'machine'], ['2330', 'cable', 0.45, 'machine'], ['0652', 'pullupbar', 0, 'bw']],
  squat: [['0043', 'barbell', 0.55, 'free'], ['1760', 'dumbbell', 0.2, 'free'], ['1463', 'legpress', 1.2, 'machine'], ['0743', 'hacksquat', 0.6, 'machine'], ['0770', 'smith', 0.5, 'machine']],
  hinge: [['0085', 'barbell', 0.5, 'free'], ['1459', 'dumbbell', 0.2, 'free'], ['0196', 'cable', 0.3, 'machine'], ['0489', 'hyper', 0, 'bw']],
  lunge: [['0336', 'dumbbell', 0.1, 'free'], ['0054', 'barbell', 0.3, 'free'], ['0410', 'dumbbell', 0.1, 'free']],
  legcurl: [['0599', 'legcurl', 0.3, 'machine'], ['0586', 'legcurl', 0.25, 'machine']],
  legext: [['0585', 'legext', 0.35, 'machine']],
  calf: [['2289', 'calfmachine', 0.6, 'machine'], ['1385', 'legpress', 0.8, 'machine'], ['1375', 'cable', 0.4, 'machine'], ['1372', 'barbell', 0.5, 'free'], ['1373', null, 0, 'bw']],
  fly: [['0596', 'pecdeck', 0.3, 'machine'], ['0188', 'cable', 0.12, 'machine'], ['0308', 'dumbbell', 0.08, 'free']],
  lateral: [['0334', 'dumbbell', 0.06, 'free'], ['0178', 'cable', 0.05, 'machine']],
  reardelt: [['0203', 'cable', 0.15, 'machine'], ['0380', 'dumbbell', 0.05, 'free']],
  biceps: [['0294', 'dumbbell', 0.1, 'free'], ['0447', 'ezbar', 0.25, 'free'], ['0031', 'barbell', 0.25, 'free'], ['0868', 'cable', 0.2, 'machine'], ['0575', 'curlmachine', 0.2, 'machine']],
  triceps: [['0200', 'cable', 0.2, 'machine'], ['0201', 'cable', 0.25, 'machine'], ['0060', 'ezbar', 0.2, 'free'], ['0060', 'barbell', 0.2, 'free'], ['0814', 'dips', 0, 'bw']],
  abs: [['0472', 'pullupbar', 0, 'bw'], ['0175', 'cable', 0.3, 'machine'], ['0274', null, 0, 'bw']],
  cardio: [['3666', 'treadmill', 0, 'cardio'], ['0798', 'bike', 0, 'cardio'], ['2141', 'elliptical', 0, 'cardio'], ['2311', 'stepmill', 0, 'cardio'], ['2612', 'rope', 0, 'cardio']],
}
// Speed the cardio log starts at (km/h) — just a sensible first value, edited in the workout.
const CARDIO_SPEED = { '3666': 5, '0798': 20, '2141': 8, '2311': 4, '2612': 0 }
// Bodyweight moves where 10 reps is not a beginner's number.
const HARD_BW = ['0652', '0472', '0814']

/* ------------------------------------------------------------- templates -- */

// A training day = a list of [slot, role]. 'main' lifts come first, so trimming a day to fit
// the session length only ever drops accessories.
const DAYS = {
  pushA: ['Push A', 'barbell', [['hpress', 'main'], ['ohp', 'main'], ['incpress', 'acc'], ['lateral', 'acc'], ['triceps', 'acc'], ['fly', 'acc']]],
  pushB: ['Push B', 'barbell', [['ohp', 'main'], ['incpress', 'main'], ['hpress', 'acc'], ['lateral', 'acc'], ['triceps', 'acc'], ['fly', 'acc']]],
  pullA: ['Pull A', 'pullup', [['row', 'main'], ['vpull', 'main'], ['hinge', 'acc'], ['reardelt', 'acc'], ['biceps', 'acc'], ['abs', 'acc']]],
  pullB: ['Pull B', 'pullup', [['vpull', 'main'], ['row', 'main'], ['reardelt', 'acc'], ['biceps', 'acc'], ['hinge', 'acc'], ['abs', 'acc']]],
  legsA: ['Legs A', 'legs', [['squat', 'main'], ['hinge', 'main'], ['legext', 'acc'], ['legcurl', 'acc'], ['calf', 'acc'], ['abs', 'acc']]],
  legsB: ['Legs B', 'legs', [['hinge', 'main'], ['squat', 'main'], ['lunge', 'acc'], ['legcurl', 'acc'], ['calf', 'acc'], ['abs', 'acc']]],
  upperA: ['Upper A', 'arm', [['hpress', 'main'], ['row', 'main'], ['ohp', 'acc'], ['vpull', 'acc'], ['biceps', 'acc'], ['triceps', 'acc']]],
  upperB: ['Upper B', 'arm', [['ohp', 'main'], ['vpull', 'main'], ['incpress', 'acc'], ['row', 'acc'], ['lateral', 'acc'], ['biceps', 'acc']]],
  lowerA: ['Lower A', 'legs', [['squat', 'main'], ['hinge', 'acc'], ['legcurl', 'acc'], ['legext', 'acc'], ['calf', 'acc'], ['abs', 'acc']]],
  lowerB: ['Lower B', 'legs', [['hinge', 'main'], ['squat', 'acc'], ['lunge', 'acc'], ['legcurl', 'acc'], ['calf', 'acc'], ['abs', 'acc']]],
  fullA: ['Full Body A', 'figureStrength', [['squat', 'main'], ['hpress', 'main'], ['row', 'main'], ['lateral', 'acc'], ['biceps', 'acc'], ['abs', 'acc']]],
  fullB: ['Full Body B', 'figureStrength', [['hinge', 'main'], ['ohp', 'main'], ['vpull', 'main'], ['lunge', 'acc'], ['triceps', 'acc'], ['calf', 'acc']]],
  fullC: ['Full Body C', 'figureStrength', [['squat', 'main'], ['incpress', 'main'], ['row', 'main'], ['legcurl', 'acc'], ['reardelt', 'acc'], ['abs', 'acc']]],
}
// Which variant (0 = first choice, 1 = second…) a day draws from each slot, so the B day
// is not a copy of the A day — Push B benches with dumbbells if A used the barbell.
const VARIANT = { pushB: 1, pullB: 1, legsB: 1, upperB: 1, lowerB: 1, fullB: 1, fullC: 1 }

// Days per week → the rotation.
export const SPLITS = {
  1: ['fullA'],
  2: ['fullA', 'fullB'],
  3: ['fullA', 'fullB', 'fullC'],
  4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
  5: ['upperA', 'lowerA', 'pushA', 'pullA', 'legsA'],
  6: ['pushA', 'pullA', 'legsA', 'pushB', 'pullB', 'legsB'],
}
export const splitFor = n => SPLITS[Math.max(1, Math.min(6, n || 3))]

/* --------------------------------------------------------------- profile -- */

export const GOALS = {
  strength: 'Get stronger',
  muscle: 'Build muscle',
  fatloss: 'Lose fat',
  general: 'General fitness',
}
export const LEVELS = {
  beginner: 'Beginner (under 6 months)',
  intermediate: 'Intermediate (6 months – 2 years)',
  advanced: 'Advanced (2+ years)',
}
export const DEFAULT_COACH = {
  on: false,
  profile: { sex: 'male', age: null, height: null, experience: 'beginner', goal: 'muscle', minutes: 60 },
  days: [1, 2, 3, 4, 5, 6],     // Mon–Sat
  gear: [],
  rotation: [],
  checkins: {},
}
// A coach block from any source (old backup, a half-filled setup) with every field present.
export function coachOf(S) {
  const c = (S && S.coach) || {}
  return {
    ...DEFAULT_COACH, ...c,
    profile: { ...DEFAULT_COACH.profile, ...(c.profile || {}) },
    days: Array.isArray(c.days) ? c.days : DEFAULT_COACH.days,
    gear: Array.isArray(c.gear) ? c.gear : [],
    rotation: Array.isArray(c.rotation) ? c.rotation : [],
    checkins: c.checkins || {},
  }
}

/* -------------------------------------------------------------- program -- */

const KIND_ORDER = {
  // Machines first for a beginner: a fixed path is easier to learn alone and safer to push
  // close to failure without a spotter. Free weights first once the basics are there.
  beginner: { machine: 0, free: 1, bw: 2, cardio: 3 },
  intermediate: { free: 0, machine: 1, bw: 2, cardio: 3 },
  advanced: { free: 0, machine: 1, bw: 2, cardio: 3 },
}

/** The candidates for one slot your gear allows, best first. */
export function optionsFor(slot, gear, experience = 'beginner') {
  const have = new Set(gear || [])
  const order = KIND_ORDER[experience] || KIND_ORDER.beginner
  const seen = new Set()
  return (SLOTS[slot] || [])
    .map((c, i) => ({ id: c[0], need: c[1], ratio: c[2], kind: c[3], i }))
    .filter(c => (c.need === null || have.has(c.need)) && EXIDX[c.id])
    .sort((a, b) => (order[a.kind] - order[b.kind]) || (a.i - b.i))
    .filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)))
}

/** Sets / reps / progression rule for a role under a goal and level. */
export function dosage(goal, experience, role) {
  const beg = experience === 'beginner'
  const adv = experience === 'advanced'
  if (goal === 'strength') {
    return role === 'main'
      ? { sets: beg ? 3 : adv ? 5 : 4, reps: 5, prog: 'linear' }
      : { sets: 3, reps: 10, repsMin: 8, prog: 'double' }
  }
  if (goal === 'muscle') {
    return role === 'main'
      ? { sets: adv ? 4 : 3, reps: 10, repsMin: 6, prog: 'double' }
      : { sets: beg ? 2 : 3, reps: 15, repsMin: 10, prog: 'double' }
  }
  // fat loss / general fitness: moderate reps, fewer sets, cardio afterwards
  return role === 'main'
    ? { sets: 3, reps: 12, repsMin: 8, prog: 'double' }
    : { sets: beg ? 2 : 3, reps: 15, repsMin: 12, prog: 'double' }
}

// How much a weight can move in one step on this kind of equipment.
export function loadStep(exId, unit = 'kg') {
  const eq = (EXIDX[exId] || {}).eq || ''
  const lb = unit === 'lb'
  if (eq === 'dumbbell' || eq === 'kettlebell') return lb ? 5 : 2
  if (eq === 'barbell' || eq === 'ez barbell' || eq === 'olympic barbell') return lb ? 5 : 2.5
  return lb ? 10 : 5
}
const LOWER = ['upper legs', 'lower legs']

/**
 * A first-session weight. Deliberately on the light side — the first session is calibration:
 * if the last set still had 3+ reps in the tank, the progression rules move it up next time,
 * and a guess that is too heavy is the one mistake that costs something.
 * Returns 0 when there is nothing to base a guess on (no body weight, bodyweight exercise).
 */
export function startWeight({ ratio, exId, reps, bodyweight, profile, unit = 'kg' }) {
  if (!(ratio > 0) || !(bodyweight > 0)) return 0
  const p = profile || {}
  const ex = EXIDX[exId] || {}
  let w = ratio * bodyweight
  w *= { beginner: 1, intermediate: 1.35, advanced: 1.7 }[p.experience] || 1
  if (p.sex === 'female') w *= LOWER.includes(ex.bp) ? 0.75 : 0.6
  if (p.age >= 60) w *= 0.75
  else if (p.age >= 50) w *= 0.85
  // The ratios are ~10-rep weights; shift along the Epley curve to the prescribed reps.
  const r = Math.max(1, reps || 10)
  w *= (1 + 10 / 30) / (1 + r / 30)
  w *= 0.9                                               // the calibration cushion
  const step = loadStep(exId, unit)
  const bar = ex.eq === 'barbell' ? (unit === 'lb' ? 45 : 20) : step
  return Math.max(bar, Math.round(w / step) * step)
}

/**
 * Build the whole program. Pure: same inputs, same plan.
 * Returns { routines, rotation, notes } — `notes` lists anything that could not be fitted.
 */
export function generatePlan({ profile, gear, days, bodyweight, unit = 'kg' }) {
  const p = { ...DEFAULT_COACH.profile, ...(profile || {}) }
  const count = Math.max(1, Math.min(6, (days || []).length || 3))
  const split = splitFor(count)
  const maxLifts = Math.max(3, Math.min(6, Math.floor((p.minutes || 60) / 10)))
  const wantCardio = p.goal === 'fatloss' || p.goal === 'general'
  const cardio = optionsFor('cardio', gear, p.experience)[0]
  const notes = []
  const missing = new Set()

  const routines = split.map(key => {
    const [name, emoji, slots] = DAYS[key]
    const variant = VARIANT[key] || 0
    const used = new Set()
    const ex = []
    // a cardio finisher costs one lift's worth of time
    const liftCap = wantCardio && cardio ? Math.max(3, maxLifts - 1) : maxLifts
    for (const [slot, role] of slots) {
      if (ex.length >= liftCap) break
      const opts = optionsFor(slot, gear, p.experience).filter(o => !used.has(o.id))
      if (!opts.length) { missing.add(slot); continue }
      const pick = opts[variant % opts.length]
      used.add(pick.id)
      const d = dosage(p.goal, p.experience, role)
      if (pick.kind === 'bw') {
        const hard = HARD_BW.includes(pick.id)
        const reps = p.experience === 'beginner' ? (hard ? 5 : 8) : (hard ? 8 : 12)
        ex.push({ id: pick.id, sets: d.sets, reps, repsMax: hard ? 12 : 20, weight: 0, mode: 'reps', bodyweight: true, prog: 'double' })
        continue
      }
      const weight = startWeight({ ratio: pick.ratio, exId: pick.id, reps: d.reps, bodyweight, profile: p, unit })
      const cfg = { id: pick.id, sets: d.sets, reps: d.reps, weight, mode: 'reps', prog: d.prog }
      if (d.repsMin) cfg.repsMin = d.repsMin
      ex.push(cfg)
    }
    if (wantCardio && cardio) {
      ex.push({ id: cardio.id, sets: 1, min: p.goal === 'fatloss' ? 20 : 15, speed: CARDIO_SPEED[cardio.id] ?? 8, mode: 'cardio' })
    }
    return { id: 'coach-' + key, name, emoji, coach: key, ex }
  })

  const label = { hpress: 'chest press', incpress: 'incline press', ohp: 'shoulder press', row: 'row', vpull: 'pulldown / pull-up', squat: 'squat / leg press', hinge: 'hip hinge', lunge: 'lunge', legcurl: 'leg curl', legext: 'leg extension', calf: 'calf raise', fly: 'chest fly', lateral: 'lateral raise', reardelt: 'rear delts', biceps: 'biceps', triceps: 'triceps', abs: 'abs' }
  missing.forEach(s => notes.push(label[s] || s))
  if (!(bodyweight > 0)) notes.push('__nobw')
  return { routines, rotation: routines.map(r => r.id), notes }
}

/* ------------------------------------------------------------ rotation -- */

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const weekday = iso => new Date(iso + 'T12:00:00').getDay()
export const isTrainingDay = (C, iso) => (C.days || []).includes(weekday(iso))

// The rotation, minus anything deleted from the Plan tab since.
const liveRotation = S => {
  const C = coachOf(S)
  return C.rotation.filter(id => (S.routines || []).some(r => r.id === id))
}

// Latest workout (on or before `iso`) that belonged to the rotation.
function lastRotationWorkout(S, rot, iso) {
  let best = null
  for (const w of S.workouts || []) {
    if (w.d > iso || !rot.includes(w.routineId)) continue
    if (!best || w.d > best.d || (w.d === best.d && (w.end || 0) >= (best.end || 0))) best = w
  }
  return best
}

/**
 * Which routine the coach serves on `iso` (null = rest).
 *  past days  → what you actually did there, if it was a rotation session
 *  today      → today's session if already done, else the next one in the queue
 *  future     → projected: one queue step per training day between now and then
 * A day with its own override (Plan → reschedule) is handled by the caller and never
 * consumes a queue step.
 */
export function coachRoutineId(S, iso, today = todayISO()) {
  const rot = liveRotation(S)
  if (!rot.length) return null
  const doneOn = d => {
    const ws = (S.workouts || []).filter(w => w.d === d && rot.includes(w.routineId))
    return ws.length ? ws[ws.length - 1].routineId : null
  }
  if (iso < today) return doneOn(iso)
  const doneToday = doneOn(today)
  if (iso === today && doneToday) return doneToday
  const C = coachOf(S)
  if (!isTrainingDay(C, iso)) return null

  const last = lastRotationWorkout(S, rot, today)
  let p = last ? rot.indexOf(last.routineId) + 1 : 0
  const dayPlan = S.dayPlan || {}
  const consumes = d => isTrainingDay(C, d) && dayPlan[d] === undefined
  for (let d = today, guard = 0; d < iso && guard < 800; d = addDays(d, 1), guard++) {
    if (d === today && doneToday) continue
    if (consumes(d)) p++
  }
  return rot[p % rot.length]
}

/** Training days since your last rotation session that came and went without one. */
export function missedDays(S, today = todayISO()) {
  const rot = liveRotation(S)
  if (!rot.length) return 0
  const last = lastRotationWorkout(S, rot, addDays(today, -1))
  if (!last) return 0
  const C = coachOf(S)
  const trained = new Set((S.workouts || []).map(w => w.d))
  let n = 0
  for (let d = addDays(last.d, 1), guard = 0; d < today && guard < 800; d = addDays(d, 1), guard++) {
    if (isTrainingDay(C, d) && !trained.has(d) && (S.dayPlan || {})[d] !== 'rest') n++
  }
  return n
}

/** Whole days since the last workout of any kind (null if there has never been one). */
export function daysSinceWorkout(S, today = todayISO()) {
  const ds = (S.workouts || []).map(w => w.d).filter(d => d < today).sort()
  if (!ds.length) return null
  const a = new Date(ds[ds.length - 1] + 'T12:00:00'), b = new Date(today + 'T12:00:00')
  return Math.round((b - a) / 86400000)
}

/** The next `n` training sessions from today: [{ d, id }]. */
export function upcoming(S, n = 6, today = todayISO()) {
  const out = []
  const dayPlan = S.dayPlan || {}
  for (let d = today, guard = 0; out.length < n && guard < 60; d = addDays(d, 1), guard++) {
    const ov = dayPlan[d]
    const id = ov === 'rest' ? null : (ov && (S.routines || []).some(r => r.id === ov)) ? ov : coachRoutineId(S, d, today)
    if (id) out.push({ d, id })
  }
  return out
}

/* ----------------------------------------------------------- readiness -- */

const median = xs => {
  const a = [...xs].sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
// Your own normal for a metric: the median of up to 30 earlier check-ins. Needs at least
// four, or a single odd reading would become "normal".
export function baseline(S, key, iso, min = 4) {
  const C = coachOf(S)
  const vals = Object.keys(C.checkins).filter(d => d < iso).sort().slice(-30)
    .map(d => C.checkins[d][key]).filter(v => v > 0)
  return vals.length >= min ? median(vals) : null
}

/**
 * Today's call from the check-in.
 * Returns null without a check-in, else { level: 'go'|'light'|'rest', score, reasons }.
 * `reasons` are [template, ...args] pairs for t().
 */
export function readiness(S, iso = todayISO()) {
  const c = coachOf(S).checkins[iso]
  if (!c) return null
  let score = 0
  const reasons = []
  if (c.sleep > 0) {
    if (c.sleep < 5) { score -= 2; reasons.push(['Only {0} h of sleep', c.sleep]) }
    else if (c.sleep < 6.5) { score -= 1; reasons.push(['Short sleep ({0} h)', c.sleep]) }
  }
  if (c.energy > 0) {
    if (c.energy <= 1) { score -= 2; reasons.push(['Very low energy']) }
    else if (c.energy === 2) { score -= 1; reasons.push(['Low energy']) }
  }
  if (c.soreness >= 5) { score -= 2; reasons.push(['Very sore']) }
  else if (c.soreness === 4) { score -= 1; reasons.push(['Quite sore']) }
  const rhr0 = baseline(S, 'rhr', iso)
  if (c.rhr > 0 && rhr0) {
    const up = Math.round(c.rhr - rhr0)
    if (up >= 7) { score -= 2; reasons.push(['Resting heart rate {0} bpm above your normal', up]) }
    else if (up >= 4) { score -= 1; reasons.push(['Resting heart rate {0} bpm above your normal', up]) }
  }
  const hrv0 = baseline(S, 'hrv', iso)
  if (c.hrv > 0 && hrv0) {
    const pct = Math.round((1 - c.hrv / hrv0) * 100)
    if (pct >= 20) { score -= 2; reasons.push(['HRV {0}% below your normal', pct]) }
    else if (pct >= 10) { score -= 1; reasons.push(['HRV {0}% below your normal', pct]) }
  }
  const level = score <= -3 ? 'rest' : score <= -1 ? 'light' : 'go'
  return { level, score, reasons }
}

/** What to change about today's session, for beginWorkout. */
export function sessionAdjust(S, routineId, iso = todayISO()) {
  if (!coachOf(S).on || !liveRotation(S).includes(routineId)) return null
  const r = readiness(S, iso)
  const gap = daysSinceWorkout(S, iso)
  const adj = { dropSet: !!r && r.level !== 'go', ease: gap != null && gap >= 14 ? 0.9 : null }
  return adj.dropSet || adj.ease ? adj : null
}

/**
 * Apply an adjustment to freshly built workout entries (beginWorkout's output).
 *   dropSet — one set fewer per lift (never below 2); `target.sets` follows, so hitting
 *             every rep still counts as a success and progression carries on normally.
 *   ease    — scale the load (after a long break), snapped to the equipment's step.
 */
export function adjustEntries(entries, adj, unit = 'kg') {
  if (!adj) return entries
  return entries.map(e => {
    const mode = (e.target && e.target.mode) || 'reps'
    if (mode === 'cardio') return e
    let sets = e.sets
    if (adj.dropSet && sets.length > 2) sets = sets.slice(0, sets.length - 1)
    if (adj.ease && mode === 'reps') {
      const step = loadStep(e.id, unit)
      sets = sets.map(s => (s.done || !(s.w > 0) ? s : { ...s, w: Math.max(step, Math.round((s.w * adj.ease) / step) * step) }))
    }
    if (sets === e.sets) return e
    return { ...e, sets, target: { ...e.target, sets: sets.length } }
  })
}

/* ------------------------------------------------------------- vitals -- */

const VITAL_KEYS = {
  sleep: 'sleep', s: 'sleep',
  rhr: 'rhr', resting: 'rhr', restinghr: 'rhr', restingheartrate: 'rhr',
  hrv: 'hrv',
  weight: 'weight', w: 'weight', bw: 'weight', bodyweight: 'weight', bodymass: 'weight',
  energy: 'energy', soreness: 'soreness', sore: 'soreness',
}
const RANGE = { sleep: [0, 24], rhr: [25, 220], hrv: [1, 300], weight: [20, 400], energy: [1, 5], soreness: [1, 5] }

/**
 * Read vitals out of whatever a Shortcut (or a person) sends:
 *   "sleep=7.5&rhr=54&hrv=62&weight=80.2" · "sleep: 7,5; rhr: 54" · one per line…
 * Unknown keys and out-of-range values are dropped. Sleep above 24 is taken as minutes.
 */
export function parseVitals(input) {
  const out = {}
  const s = String(input || '').replace(/^[^?]*\?/, '')
  for (const part of s.split(/[&;\n\r]+|,\s+(?=[a-z])/i)) {
    const m = /^\s*([a-z_ ]+?)\s*[=:]\s*(-?[\d.,]+)/i.exec(part)
    if (!m) continue
    const key = VITAL_KEYS[m[1].toLowerCase().replace(/[\s_]/g, '')]
    if (!key) continue
    let v = parseFloat(m[2].replace(',', '.'))
    if (!isFinite(v)) continue
    if (key === 'sleep' && v > 24) v = v / 60
    v = Math.round(v * 10) / 10
    const [lo, hi] = RANGE[key]
    if (v < lo || v > hi) continue
    out[key] = key === 'energy' || key === 'soreness' ? Math.round(v) : v
  }
  return out
}

/* ---------------------------------------------------------------- swap -- */

// Equipment strings in the library that each gear key covers, for exercises the coach
// did not pick (your own routines): a cable row is fine if you ticked the cable station.
const GEAR_EQ = { barbell: ['barbell', 'olympic barbell', 'trap bar'], dumbbell: ['dumbbell'], ezbar: ['ez barbell'], cable: ['cable'], smith: ['smith machine'], legpress: ['sled machine'], hacksquat: ['sled machine'] }

/**
 * Other exercises for the same job — "the leg press is taken, what else?".
 * Coach exercises: the other options for that movement your gym has, best first.
 * Anything else: same target muscle and body part, preferring equipment you have.
 * Returns [{ id, fits }] — `fits` is false for options needing gear you haven't ticked.
 */
export function alternativesFor(exId, gear, experience = 'beginner', limit = 8) {
  const slots = Object.keys(SLOTS).filter(k => k !== 'cardio' && SLOTS[k].some(c => c[0] === exId))
  if (slots.length) {
    const seen = new Set([exId])
    const out = []
    for (const s of slots) for (const o of optionsFor(s, gear, experience)) {
      if (!seen.has(o.id)) { seen.add(o.id); out.push({ id: o.id, fits: true }) }
    }
    return out.slice(0, limit)
  }
  const ex = EXIDX[exId]
  if (!ex) return []
  const eqs = new Set(['body weight', ...(gear || []).flatMap(g => GEAR_EQ[g] || [])])
  const hasGear = (gear || []).length > 0
  return Object.values(EXIDX)
    .filter(e => e.id !== exId && e.tg === ex.tg && e.bp === ex.bp && !e.missing)
    .map(e => ({ id: e.id, fits: !hasGear || eqs.has(e.eq) }))
    .sort((a, b) => (b.fits - a.fits) || (EXIDX[a.id].n < EXIDX[b.id].n ? -1 : 1))
    .slice(0, limit)
}

/**
 * The plan entry for `newId` replacing `cfg`: same sets, reps and progression rule, and a
 * first-session weight guess if the coach knows the exercise (0 otherwise). History beats
 * the guess anyway — buildSets starts from your last logged weight when there is one.
 */
export function swapConfig(cfg, newId, { bodyweight, profile, unit = 'kg' } = {}) {
  const ex = EXIDX[newId] || {}
  const out = { ...cfg, id: newId }
  delete out.sg
  if (ex.eq === 'body weight') {
    out.bodyweight = true
    out.weight = 0
    if (!out.repsMax) out.repsMax = HARD_BW.includes(newId) ? 12 : 20
    return out
  }
  delete out.bodyweight
  const cand = Object.values(SLOTS).flat().find(c => c[0] === newId)
  out.weight = cand ? startWeight({ ratio: cand[2], exId: newId, reps: cfg.reps, bodyweight, profile, unit }) : 0
  return out
}

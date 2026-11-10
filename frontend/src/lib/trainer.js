// The trainer's day: what to do today, and what to do instead when the gym isn't happening.
//
// Builds on coach.js (rotation, readiness) and adds:
//   · alternatives — a walk, a short home session, mobility, or a proper rest. Choosing one
//     marks the day 'alt' in dayPlan, which the rotation treats like a rest day: today's gym
//     session is not consumed and simply waits for the next training day.
//   · walk days — rest days the plan fills with a walk of a set length.
//   · activities — S.activities [{ d, kind, min, done, src }], the log of non-gym days.
// Pure functions over S, like the rest of lib/.

import { coachOf, readiness, coachRoutineId } from './coach.js'
import { todayISO } from './format.js'

/* ------------------------------------------------------- built-in sessions -- */

// Two small sessions that live alongside the gym program but outside its rotation, so
// doing one never moves the program on. Timed holds log seconds; the rest log reps.
export const HOME_ID = 'trainer-home'
export const MOBILITY_ID = 'trainer-mobility'
export const BUILTIN = {
  [HOME_ID]: {
    id: HOME_ID, name: 'Home bodyweight', emoji: 'figureStrength', builtin: true,
    ex: [
      { id: '0662', sets: 3, reps: 10, repsMax: 20, weight: 0, mode: 'reps', bodyweight: true, prog: 'double' },
      { id: '1685', sets: 3, reps: 15, repsMax: 25, weight: 0, mode: 'reps', bodyweight: true, prog: 'double' },
      { id: '2368', sets: 2, reps: 16, repsMax: 24, weight: 0, mode: 'reps', bodyweight: true, side: true, prog: 'double' },
      { id: '3013', sets: 3, reps: 15, repsMax: 25, weight: 0, mode: 'reps', bodyweight: true, prog: 'double' },
      { id: '0274', sets: 2, reps: 15, repsMax: 25, weight: 0, mode: 'reps', bodyweight: true, prog: 'double' },
      { id: '0464', sets: 2, sec: 30, weight: 0, mode: 'time', bodyweight: true, prog: 'time' },
      { id: '0630', sets: 2, sec: 30, weight: 0, mode: 'time', bodyweight: true, prog: 'off' },
    ],
  },
  [MOBILITY_ID]: {
    id: MOBILITY_ID, name: 'Mobility & stretching', emoji: 'stretch', builtin: true,
    ex: ['1604', '1511', '1363', '1271', '1512', '1377'].map(id => ({ id, sets: 2, sec: 40, weight: 0, mode: 'time', bodyweight: true, prog: 'off' })),
  },
}
/** Make sure the built-in sessions exist in S.routines (call inside update()). */
export function ensureBuiltins(S) {
  S.routines = S.routines || []
  for (const r of Object.values(BUILTIN)) {
    if (!S.routines.some(x => x.id === r.id)) S.routines.push(JSON.parse(JSON.stringify(r)))
  }
}

/* --------------------------------------------------------- alternatives -- */

/** Walk lengths to offer, longest last. Fat loss gets the longer options. */
export function walkOptions(profile) {
  const g = (profile || {}).goal
  return g === 'fatloss' || g === 'general' ? [45, 60, 90] : [30, 45, 60]
}

export const ALT = {
  walk: { icon: 'figureRun', title: 'Go for a walk', sub: 'Brisk pace — you can talk, but not sing.' },
  home: { icon: 'figureStrength', title: 'Home workout · 20 min', sub: 'Bodyweight only, no equipment.' },
  mobility: { icon: 'stretch', title: 'Mobility · 15 min', sub: 'Stretch out stiff hips, back and shoulders.' },
  rest: { icon: 'moon', title: 'Full rest', sub: 'Sleep, eat well, recover. Back at it tomorrow.' },
}

/**
 * Swap today's plan for an alternative. The gym session stays in the queue for the next
 * training day. `min` is the walk length. Mutates S (call inside update()).
 */
export function chooseAlternative(S, kind, min, iso = todayISO()) {
  S.activities = (S.activities || []).filter(a => !(a.d === iso && !a.done))
  S.dayPlan = S.dayPlan || {}
  S.dayPlan[iso] = 'alt'
  S.activities.push({ d: iso, kind, ...(kind === 'walk' ? { min } : {}), done: kind === 'rest' })
  if (kind === 'home' || kind === 'mobility') ensureBuiltins(S)
}

/** Back to the original plan for the day (only removes what hasn't been done). */
export function undoAlternative(S, iso = todayISO()) {
  S.activities = (S.activities || []).filter(a => !(a.d === iso && !a.done) && !(a.d === iso && a.kind === 'rest'))
  if (S.dayPlan && S.dayPlan[iso] === 'alt') delete S.dayPlan[iso]
}

/** Log a finished walk (or other activity). Merges into today's planned one if there is one. */
export function completeActivity(S, { kind = 'walk', min, src = 'manual' }, iso = todayISO()) {
  S.activities = S.activities || []
  const open = S.activities.find(a => a.d === iso && a.kind === kind && !a.done)
  if (open) Object.assign(open, { done: true, min: min || open.min, src })
  else S.activities.push({ d: iso, kind, min, done: true, src })
}

export const activitiesOn = (S, iso) => (S.activities || []).filter(a => a.d === iso)

/* ----------------------------------------------------------------- today -- */

/**
 * What the trainer says about `iso` (normally today). One of:
 *   { kind: 'active' }                                   workout in progress
 *   { kind: 'done', workouts, activities }               something was done today already
 *   { kind: 'alt', activity }                            an alternative was chosen, not done yet
 *   { kind: 'gym', routineId, suggestWalk }             a gym session; suggestWalk when recovery is poor
 *   { kind: 'walk', min }                               a planned walk day
 *   { kind: 'rest' }                                    a rest day
 *   { kind: 'setup' }                                   no plan yet
 */
export function todayPlan(S, iso = todayISO()) {
  const C = coachOf(S)
  if (S.active) return { kind: 'active' }
  const acts = activitiesOn(S, iso)
  const ws = (S.workouts || []).filter(w => w.d === iso)
  const openAlt = acts.find(a => !a.done)
  if (openAlt) {
    const builtinDone = ws.some(w => w.routineId === (openAlt.kind === 'home' ? HOME_ID : MOBILITY_ID))
    if (!builtinDone) return { kind: 'alt', activity: openAlt }
  }
  if (ws.length || acts.some(a => a.done)) return { kind: 'done', workouts: ws, activities: acts.filter(a => a.done || a.kind === 'rest') }
  if (!C.on || !C.rotation.length) return { kind: 'setup' }

  const ov = (S.dayPlan || {})[iso]
  const routineId = ov && ov !== 'rest' && ov !== 'alt' && (S.routines || []).some(r => r.id === ov) ? ov
    : ov ? null : coachRoutineId(S, iso, iso)
  if (routineId) {
    const r = readiness(S, iso)
    return { kind: 'gym', routineId, suggestWalk: !!r && r.level === 'rest' }
  }
  const walk = (C.walkDays || {})[new Date(iso + 'T12:00:00').getDay()]
  if (walk > 0) return { kind: 'walk', min: walk }
  return { kind: 'rest' }
}

/** A short greeting line in the trainer's voice. */
export function greeting(now = new Date()) {
  const h = now.getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

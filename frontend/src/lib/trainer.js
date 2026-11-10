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
  // An extra walk (recorded by the Watch on a gym day) doesn't stand in for the day's plan.
  if (ws.length || acts.some(a => a.done && !a.extra)) return { kind: 'done', workouts: ws, activities: acts.filter(a => a.done || a.kind === 'rest') }
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

/* ---------------------------------------------------------- Apple Health -- */

/**
 * Fold what Apple Health knows about `iso` into S (call inside update()).
 * `h` is the native plugin's readDay(): { sleepHours, rhr, hrv, weightKg, steps, walkMinutes }.
 *   · sleep / resting HR / HRV fill today's check-in — never over a value you typed yourself
 *   · a body weight recorded today is logged once, unless you already weighed in today
 *   · a recorded walk ticks off a planned walk once it reaches 80 % of the planned length;
 *     on any other day it is logged as an extra walk that counts in the weekly review but
 *     doesn't mark the day's workout as done
 * Returns a short list of what changed, for a toast.
 */
export function applyHealth(S, h, { unit = 'kg' } = {}, iso = todayISO()) {
  if (!h) return []
  const changed = []
  const C = coachOf(S)
  const r1 = x => Math.round(x * 10) / 10
  const check = { ...(C.checkins[iso] || {}) }
  const auto = new Set(check.auto || [])
  const fill = (k, v) => {
    if (!(v > 0)) return
    if (check[k] != null && !auto.has(k)) return          // typed by hand — leave it
    if (check[k] !== v) changed.push(k)
    check[k] = v; auto.add(k)
  }
  fill('sleep', h.sleepHours > 0 ? r1(h.sleepHours) : null)
  fill('rhr', h.rhr > 0 ? Math.round(h.rhr) : null)
  fill('hrv', h.hrv > 0 ? Math.round(h.hrv) : null)
  if (h.steps > 0) check.steps = Math.round(h.steps)
  if (auto.size) check.auto = [...auto]

  if (h.weightKg > 0 && !(S.bodyweight || []).some(b => b.d === iso)) {
    const w = r1(unit === 'lb' ? h.weightKg * 2.20462 : h.weightKg)
    S.bodyweight = [...(S.bodyweight || []), { d: iso, w, t: Date.now() }].sort((a, b) => (a.d < b.d ? -1 : 1))
    changed.push('weight')
  }

  const walked = Math.round(h.walkMinutes || 0)
  if (walked >= 5) {
    S.activities = S.activities || []
    const plan = todayPlan(S, iso)
    const planned = plan.kind === 'walk' ? plan.min : plan.kind === 'alt' && plan.activity.kind === 'walk' ? plan.activity.min : null
    const logged = S.activities.find(a => a.d === iso && a.kind === 'walk' && a.done && a.src === 'health')
    if (logged) {
      if (walked > (logged.min || 0)) { logged.min = walked; changed.push('walk') }
    } else if (planned != null) {
      if (walked >= planned * 0.8) { completeActivity(S, { kind: 'walk', min: walked, src: 'health' }, iso); changed.push('walk') }
      else check.walkMin = walked
    } else if (walked >= 10) {
      S.activities.push({ d: iso, kind: 'walk', min: walked, done: true, src: 'health', extra: true })
      changed.push('walk')
    }
  }
  // Written last: the walk step above can add progress (walkMin) to today's check-in.
  if (Object.keys(check).length) S.coach = { ...coachOf(S), checkins: { ...coachOf(S).checkins, [iso]: check } }
  return changed
}

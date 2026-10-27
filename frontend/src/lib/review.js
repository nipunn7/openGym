// The weekly review: what a week of training actually added up to. Pure, like the rest of
// lib/ — it reads the workout log and never stores anything of its own.

import { EXIDX } from './exercises.js'
import { isoOf, todayISO } from './format.js'
import { coachOf } from './coach.js'

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
export const mondayOf = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d) }

// The body parts a balanced week should touch at least once.
export const MAJOR = ['chest', 'back', 'upper legs', 'shoulders']

const topWeight = e => Math.max(0, ...e.sets.filter(s => s.done).map(s => s.w || 0))

/** Sessions you meant to do in that week: coach training days, else weekly-plan days. */
export function plannedFor(S, monday) {
  const dayPlan = S.dayPlan || {}
  const C = coachOf(S)
  let n = 0
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i)
    const wd = new Date(d + 'T12:00:00').getDay()
    const ov = dayPlan[d]
    if (ov === 'rest') continue
    if (ov) { n++; continue }
    if (C.on ? C.days.includes(wd) : !!(S.week || {})[wd]) n++
  }
  return n
}

/**
 * Review of the week starting `monday`.
 * Returns { from, to, sessions, planned, minutes, volume, improved:[{id,from,to}],
 *           firsts:[id], sets:{bodyPart:n}, missing:[bodyPart], tip:[template,...args], over }
 */
export function weekReview(S, monday, today = todayISO()) {
  const to = addDays(monday, 6)
  const ws = (S.workouts || []).filter(w => w.d >= monday && w.d <= to)
  const before = (S.workouts || []).filter(w => w.d < monday)
  const prevBest = {}
  before.forEach(w => w.entries.forEach(e => { prevBest[e.id] = Math.max(prevBest[e.id] || 0, topWeight(e), e.topW || 0) }))

  const weekBest = {}
  const sets = {}
  let minutes = 0, volume = 0
  ws.forEach(w => {
    if (w.end > w.start) minutes += Math.round((w.end - w.start) / 60000)
    volume += w.vol || 0
    w.entries.forEach(e => {
      weekBest[e.id] = Math.max(weekBest[e.id] || 0, topWeight(e))
      const bp = (EXIDX[e.id] || {}).bp
      const n = e.sets.filter(s => s.done).length
      if (bp && bp !== 'cardio' && n) sets[bp] = (sets[bp] || 0) + n
    })
  })
  const improved = [], firsts = []
  Object.keys(weekBest).forEach(id => {
    if (!(id in prevBest)) firsts.push(id)
    else if (weekBest[id] > 0 && weekBest[id] > prevBest[id]) improved.push({ id, from: prevBest[id], to: weekBest[id] })
  })
  improved.sort((a, b) => (b.to - b.from) / b.from - (a.to - a.from) / a.from)

  const planned = plannedFor(S, monday)
  const sessions = ws.length
  const over = today > to
  const missing = sessions ? MAJOR.filter(bp => !sets[bp]) : []

  // One thing to do next — the most useful, not a list.
  let tip
  if (!sessions) tip = over ? ['A quiet week. Next week, just get the first session done — momentum comes after.'] : ['Nothing logged yet this week. One session today and the week is moving.']
  else if (over && planned && sessions < planned) tip = ['{0} of {1} sessions. Next week, aim for {2} — one more than this week.', sessions, planned, Math.min(planned, sessions + 1)]
  else if (missing.length) tip = ['No sets for {0} this week — fit some in next session.', missing.join(', ')]
  else if (improved.length) tip = ['Stronger on {0} lifts. Keep logging honestly and it keeps coming.', improved.length]
  else if (!over && planned && sessions < planned) tip = ['{0} of {1} done — {2} to go this week.', sessions, planned, planned - sessions]
  else tip = ['Every planned session done. Sleep and protein do the rest.']

  return { from: monday, to, sessions, planned, minutes, volume, improved, firsts, sets, missing, tip, over }
}

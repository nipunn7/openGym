import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { buildSets, modeOf } from '../lib/history.js'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { coachOf, readiness, sessionAdjust, adjustEntries, missedDays, upcoming, swapConfig } from '../lib/coach.js'
import { todayPlan, chooseAlternative, undoAlternative, completeActivity, walkOptions, greeting, ALT, HOME_ID, MOBILITY_ID } from '../lib/trainer.js'
import { weekReview, mondayOf } from '../lib/review.js'
import { lastBW } from '../lib/history.js'
import { fmtDate, todayISO, DAYN } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { startFlow, swapSheet, exerciseDetailSheet } from '../sheets.jsx'
import { CheckIn, Verdict, sessionLine } from './Coach.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()

// Rough session length: ~2.5 min per working set (set + rest) plus a 5-minute warm-up.
export const estMinutes = entries => 5 + Math.round(entries.reduce((n, e) =>
  n + (modeOf(e.target) === 'cardio' ? (e.sets[0]?.min || e.target.min || 15) : e.sets.length * 2.5), 0) / 5) * 5

/** Exactly what the workout will prescribe today, after any lighter-day trim. */
export function previewEntries(S, routine) {
  const built = routine.ex.map(cfg => {
    const plan = nextPrescription(S, cfg, routine)
    return { id: cfg.id, target: { ...cfg }, plan, sets: applyPrescription(buildSets(S, cfg), plan) }
  })
  return adjustEntries(built, sessionAdjust(S, routine.id), S.unit)
}

/* ---------- "not feeling the gym?" ---------- */
function AltSheet({ close, iso }) {
  const S = useStore(s => s.S)
  const C = coachOf(S)
  const walks = walkOptions(C.profile)
  const [min, setMin] = useState(walks[1])
  const pick = kind => {
    update(s => chooseAlternative(s, kind, min, iso))
    close()
    if (kind === 'home') startFlow(HOME_ID)
    else if (kind === 'mobility') startFlow(MOBILITY_ID)
    else ui().toast(kind === 'rest' ? t('Rest day it is. Your session waits for tomorrow.') : t('Enjoy the walk. Your gym session moves to the next training day.'))
  }
  return <>
    <h3>{t('Not feeling the gym today?')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('That’s fine — moving still counts. Today’s gym session isn’t lost, it moves to your next training day.')}</div>
    <div className="t-alt">
      <div className="t-alt-row" onClick={() => pick('walk')}>
        <span className="t-alt-i"><Icon name={ALT.walk.icon} /></span>
        <div className="grow"><div className="tt">{t(ALT.walk.title)}</div><div className="ss">{t(ALT.walk.sub)}</div>
          <div className="t-chips" onClick={e => e.stopPropagation()}>
            {walks.map(m => <button key={m} className={'chip nocap' + (min === m ? ' on' : '')} onClick={() => setMin(m)}>{m} min</button>)}
          </div></div>
        <Icon name="chevronRight" className="chev" />
      </div>
      {['home', 'mobility', 'rest'].map(k => <div key={k} className="t-alt-row" onClick={() => pick(k)}>
        <span className="t-alt-i"><Icon name={ALT[k].icon} /></span>
        <div className="grow"><div className="tt">{t(ALT[k].title)}</div><div className="ss">{t(ALT[k].sub)}</div></div>
        <Icon name="chevronRight" className="chev" />
      </div>)}
    </div>
  </>
}
const altSheet = iso => ui().openSheet(close => <AltSheet close={close} iso={iso} />)

/* ---------- log a walk ---------- */
function WalkDoneSheet({ close, planned }) {
  const [min, setMin] = useState(planned || 45)
  return <>
    <h3>{t('Walk done?')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('How long did you walk?')}</div>
    <div className="t-chips" style={{ justifyContent: 'center', marginBottom: 16 }}>
      {[20, 30, 45, 60, 75, 90, 120].map(m => <button key={m} className={'chip nocap' + (min === m ? ' on' : '')} onClick={() => setMin(m)}>{m} min</button>)}
    </div>
    <Button variant="primary" icon="check" onClick={() => { update(s => completeActivity(s, { kind: 'walk', min })); close(); ui().toast(t('Nice — {0} minutes logged.', min)) }}>{t('Log walk')}</Button>
  </>
}
const walkDoneSheet = planned => ui().openSheet(close => <WalkDoneSheet close={close} planned={planned} />)

/* ---------- the hero card ---------- */
function Hero({ plan, iso }) {
  const S = useStore(s => s.S)
  const nav = useNavigate()
  const [open, setOpen] = useState(false)

  if (plan.kind === 'setup') return <div className="t-hero">
    <div className="t-eyebrow">{t('Let’s get started')}</div>
    <div className="t-title">{t('Build your plan')}</div>
    <p className="t-body">{t('Tell me your goal, your days and what’s in your gym. I’ll plan every session and tell you what to do each day.')}</p>
    <Button variant="primary" onClick={() => nav('/setup')}>{t('Start')}</Button>
  </div>

  if (plan.kind === 'active') return <div className="t-hero">
    <div className="t-eyebrow" style={{ color: 'var(--orange)' }}>{t('In progress')}</div>
    <div className="t-title">{S.active.name}</div>
    <Button variant="primary" icon="play" onClick={() => nav('/workout')}>{t('Resume')}</Button>
  </div>

  if (plan.kind === 'done') {
    const next = upcoming(S, 3).find(x => x.d > iso)
    const nr = next && S.routines.find(r => r.id === next.id)
    return <div className="t-hero">
      <div className="t-done-i"><Icon name="checkCircle" /></div>
      <div className="t-title">{t('Done for today')}</div>
      <p className="t-body">{[
        ...plan.workouts.map(w => w.name),
        ...plan.activities.map(a => a.kind === 'walk' ? t('Walk · {0} min', a.min) : a.kind === 'rest' ? t('Rest day') : t(ALT[a.kind]?.title || a.kind)),
      ].join(' · ')}</p>
      {nr && <div className="t-next">{t('Next')}: <b>{nr.name}</b> · {fmtDate(next.d, true)}</div>}
    </div>
  }

  if (plan.kind === 'alt') {
    const a = plan.activity
    return <div className="t-hero">
      <div className="t-eyebrow">{t('Today’s plan')}</div>
      <div className="t-title">{a.kind === 'walk' ? t('Walk {0} minutes', a.min) : t(ALT[a.kind].title)}</div>
      <p className="t-body">{t(ALT[a.kind].sub)}</p>
      {a.kind === 'walk' ? <Button variant="primary" icon="check" onClick={() => walkDoneSheet(a.min)}>{t('I’ve done it')}</Button>
        : <Button variant="primary" icon="play" onClick={() => startFlow(a.kind === 'home' ? HOME_ID : MOBILITY_ID)}>{t('Start')}</Button>}
      <button className="t-link" onClick={() => update(s => undoAlternative(s))}>{t('Changed my mind — back to the plan')}</button>
    </div>
  }

  if (plan.kind === 'walk' || plan.kind === 'rest') return <div className="t-hero">
    <div className="t-eyebrow">{t('Rest day')}</div>
    <div className="t-title">{plan.kind === 'walk' ? t('Walk {0} minutes', plan.min) : t('Recover today')}</div>
    <p className="t-body">{plan.kind === 'walk' ? t('An easy, steady walk keeps you moving and helps you recover. Brisk enough to breathe a little harder.') : t('No training planned. A short walk or some stretching is plenty — or just rest.')}</p>
    {plan.kind === 'walk' ? <Button variant="primary" icon="check" onClick={() => walkDoneSheet(plan.min)}>{t('I’ve done it')}</Button>
      : <Button icon="figureRun" onClick={() => walkDoneSheet(30)}>{t('I went for a walk')}</Button>}
  </div>

  // a gym day
  const routine = S.routines.find(r => r.id === plan.routineId)
  if (!routine) return null
  const entries = previewEntries(S, routine)
  const missed = missedDays(S, iso)
  const r = readiness(S, iso)
  const swap = i => swapSheet(routine.ex[i].id, id => update(s => {
    const rr = s.routines.find(x => x.id === routine.id)
    if (!rr || !rr.ex[i]) return
    const sg = rr.ex[i].sg
    rr.ex[i] = { ...swapConfig(rr.ex[i], id, { bodyweight: lastBW(s)?.w, profile: coachOf(s).profile, unit: s.unit }), ...(sg ? { sg } : {}) }
  }), false)

  return <div className="t-hero">
    <div className="t-eyebrow">{t('Today’s workout')}</div>
    <div className="t-title">{routine.name}</div>
    <div className="t-meta">{t('{0} exercises', entries.length)} · ~{estMinutes(entries)} min</div>
    {missed > 0 && <div className="t-note">{t(missed === 1 ? 'You missed a day — no problem, we pick up where you left off.' : 'You missed {0} days — no problem, we pick up where you left off.', missed)}</div>}
    {r && r.level !== 'go' && <Verdict r={r} />}

    <div className="t-list">
      {(open ? entries : entries.slice(0, 3)).map((e, i) => {
        const ex = exOr(e.id)
        return <div key={i} className="t-ex" onClick={() => !ex.missing && exerciseDetailSheet(ex)}>
          <div className="grow"><div className="t-ex-n">{ex.n}</div><div className="t-ex-m">{ex.eq}</div></div>
          <div className="t-ex-d">{sessionLine(e.target, e.sets, S.unit)}</div>
          {modeOf(e.target) !== 'cardio' && <button className="t-swap" aria-label={t('Swap exercise')} onClick={ev => { ev.stopPropagation(); swap(i) }}><Icon name="shuffle" /></button>}
        </div>
      })}
      {entries.length > 3 && <button className="t-more" onClick={() => setOpen(o => !o)}>{open ? t('Show less') : t('+{0} more', entries.length - 3)}</button>}
    </div>

    {plan.suggestWalk ? <>
      <Button variant="primary" icon="figureRun" onClick={() => { update(s => chooseAlternative(s, 'walk', 30)); ui().toast(t('Recovery walk today. Your session moves to the next training day.')) }}>{t('Recovery walk instead')}</Button>
      <div style={{ height: 8 }} />
      <Button onClick={() => startFlow(routine.id)}>{t('Train anyway (lighter)')}</Button>
    </> : <Button variant="primary" icon="play" onClick={() => startFlow(routine.id)}>{t('Start workout')}</Button>}
  </div>
}

/* ---------- this week, at a glance ---------- */
function WeekDots() {
  const S = useStore(s => s.S)
  const R = weekReview(S, mondayOf(todayISO()))
  if (!R.planned && !R.walks) return null
  return <div className="t-week">
    <div className="t-dots">{Array.from({ length: Math.max(R.planned, R.sessions) }, (_, i) => <i key={i} className={i < R.sessions ? 'on' : ''} />)}</div>
    <div className="small muted">{t('{0} of {1} workouts this week', R.sessions, R.planned)}{R.walks ? ' · ' + t(R.walks === 1 ? '1 walk' : '{0} walks', R.walks) : ''}</div>
  </div>
}

export default function TodayView() {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const nav = useNavigate()
  const iso = todayISO()
  const plan = todayPlan(S, iso)
  const canAlt = plan.kind === 'gym' || plan.kind === 'walk' || plan.kind === 'rest'
  const C = coachOf(S)

  return <div className="narrow t-page">
    <div className="t-head">
      <div>
        <div className="t-date">{new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>{t(greeting())}{user ? ', ' + user.name : ''}</h1>
      </div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>

    {C.on && plan.kind !== 'active' && <CheckIn iso={iso} collapsible />}
    <Hero plan={plan} iso={iso} />
    {canAlt && plan.kind === 'gym' && !plan.suggestWalk && <button className="t-alt-btn" onClick={() => altSheet(iso)}>
      <Icon name="figureRun" /> {t('Not feeling the gym today?')}
    </button>}
    {C.on && <WeekDots />}
  </div>
}

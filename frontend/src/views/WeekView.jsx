import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { lastBW, modeOf } from '../lib/history.js'
import { coachOf, coachRoutineId, isTrainingDay, swapConfig, GOALS } from '../lib/coach.js'
import { chooseAlternative, undoAlternative, activitiesOn, walkOptions, ALT } from '../lib/trainer.js'
import { fmtDate, todayISO, isoOf, DAYN } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { swapSheet } from '../sheets.jsx'
import { sessionLine } from './Coach.jsx'
import { previewEntries, estMinutes } from './TodayView.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf } from '../lib/glyphs.js'

const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }

/** What a day holds: { label, sub, icon, kind } */
function dayInfo(S, d, today) {
  const C = coachOf(S)
  const ov = (S.dayPlan || {})[d]
  const act = activitiesOn(S, d)[0]
  const done = (S.workouts || []).filter(w => w.d === d)
  if (done.length) return { kind: 'done', label: done.map(w => w.name).join(' + '), sub: t('Done'), icon: 'checkCircle' }
  if (ov === 'alt' && act) return { kind: 'alt', label: act.kind === 'walk' ? t('Walk {0} min', act.min) : t(ALT[act.kind].title), sub: act.done ? t('Done') : t('Instead of the gym'), icon: ALT[act.kind].icon }
  const rid = ov && ov !== 'rest' && ov !== 'alt' ? ov : ov ? null : coachRoutineId(S, d, today)
  const r = rid && S.routines.find(x => x.id === rid)
  if (r) return { kind: 'gym', label: r.name, sub: ov ? t('Moved here by you') : t('{0} exercises', r.ex.length), icon: glyphOf(r.emoji), rid }
  const walk = (C.walkDays || {})[new Date(d + 'T12:00:00').getDay()]
  if (walk && ov !== 'rest') return { kind: 'walk', label: t('Walk {0} min', walk), sub: t('Rest day'), icon: 'figureRun' }
  return { kind: 'rest', label: t('Rest'), sub: '', icon: 'moon' }
}

function DaySheet({ d, close }) {
  const S = useStore(s => s.S)
  const C = coachOf(S)
  const info = dayInfo(S, d, todayISO())
  const rot = C.rotation.map(id => S.routines.find(r => r.id === id)).filter(Boolean)
  const walks = walkOptions(C.profile)
  const act = (fn, msg) => { update(fn); close(); if (msg) ui().toast(msg) }
  const changed = (S.dayPlan || {})[d] !== undefined
  return <>
    <h3>{fmtDate(d, true)}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Planned: {0}', info.label)}{isTrainingDay(C, d) ? '' : ' · ' + t('not one of your gym days')}</div>
    <div className="t-sec">{t('Instead')}</div>
    <div className="t-alt">
      {walks.map(m => <div key={m} className="t-alt-row" onClick={() => act(s => chooseAlternative(s, 'walk', m, d), t('Walk planned. The gym session moves to the next training day.'))}>
        <span className="t-alt-i"><Icon name="figureRun" /></span><div className="grow"><div className="tt">{t('Walk {0} min', m)}</div></div></div>)}
      <div className="t-alt-row" onClick={() => act(s => chooseAlternative(s, 'rest', null, d), t('Rest day planned.'))}>
        <span className="t-alt-i"><Icon name="moon" /></span><div className="grow"><div className="tt">{t('Rest')}</div></div></div>
    </div>
    {rot.length > 0 && <>
      <div className="t-sec">{t('Or train')}</div>
      <div className="t-alt">{rot.map(r => <div key={r.id} className="t-alt-row" onClick={() => act(s => { undoAlternative(s, d); s.dayPlan[d] = r.id }, t('{0} planned for {1}', r.name, fmtDate(d)))}>
        <span className="t-alt-i"><Icon name={glyphOf(r.emoji)} /></span><div className="grow"><div className="tt">{r.name}</div></div>
        {info.rid === r.id && <Icon name="check" className="accent" />}</div>)}</div>
    </>}
    {changed && <><div style={{ height: 12 }} /><Button icon="reset" onClick={() => act(s => { undoAlternative(s, d); delete s.dayPlan[d] }, t('Back to the plan'))}>{t('Back to the plan')}</Button></>}
  </>
}

function Session({ r }) {
  const S = useStore(s => s.S)
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const entries = previewEntries(S, r)
  const swap = i => swapSheet(r.ex[i].id, id => update(s => {
    const rr = s.routines.find(x => x.id === r.id)
    if (!rr || !rr.ex[i]) return
    const sg = rr.ex[i].sg
    rr.ex[i] = { ...swapConfig(rr.ex[i], id, { bodyweight: lastBW(s)?.w, profile: coachOf(s).profile, unit: s.unit }), ...(sg ? { sg } : {}) }
  }), false)
  return <div className="t-card">
    <button className="t-sess" onClick={() => setOpen(o => !o)}>
      <span className="t-alt-i"><Icon name={glyphOf(r.emoji)} /></span>
      <div className="grow"><div className="tt">{r.name}</div><div className="ss">{t('{0} exercises', r.ex.length)} · ~{estMinutes(entries)} min</div></div>
      <Icon name={open ? 'chevronUp' : 'chevronDown'} className="chev" />
    </button>
    {open && <>
      <div className="t-list" style={{ marginTop: 4 }}>{entries.map((e, i) => {
        const ex = exOr(e.id)
        return <div key={i} className="t-ex">
          <div className="grow"><div className="t-ex-n">{ex.n}</div><div className="t-ex-m">{ex.eq}</div></div>
          <div className="t-ex-d">{sessionLine(e.target, e.sets, S.unit)}</div>
          {modeOf(e.target) !== 'cardio' && <button className="t-swap" aria-label={t('Swap exercise')} onClick={() => swap(i)}><Icon name="shuffle" /></button>}
        </div>
      })}</div>
      <button className="t-link" onClick={() => nav('/plan/r/' + r.id)}>{t('Edit sets, reps & order')}</button>
    </>}
  </div>
}

export default function WeekView() {
  const S = useStore(s => s.S)
  const nav = useNavigate()
  const [params] = useSearchParams()
  const C = coachOf(S)
  const today = todayISO()
  if (!C.on || !C.rotation.length) return <div className="narrow t-page">
    <div className="t-head"><h1>{t('Plan')}</h1></div>
    <div className="t-hero"><div className="t-title">{t('No plan yet')}</div>
      <p className="t-body">{t('Answer a few questions and I’ll build your week.')}</p>
      <Button variant="primary" onClick={() => nav('/setup')}>{t('Build my plan')}</Button></div>
  </div>

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const rot = C.rotation.map(id => S.routines.find(r => r.id === id)).filter(Boolean)
  const restDays = [1, 2, 3, 4, 5, 6, 0].filter(d => !C.days.includes(d))
  const setWalk = (wd, m) => update(s => { const c = coachOf(s); const w = { ...c.walkDays }; if (m) w[wd] = m; else delete w[wd]; s.coach = { ...c, walkDays: w } })

  return <div className="narrow t-page">
    <div className="t-head">
      <div><h1>{t('Your plan')}</h1><div className="t-date">{t(GOALS[C.profile.goal])} · {t('{0} gym days', C.days.length)} · {C.profile.minutes} min</div></div>
      <button className="iconbtn" onClick={() => nav('/setup')} aria-label={t('Change plan')}><Icon name="pencil" /></button>
    </div>

    {params.get('new') && <div className="t-hero" style={{ marginBottom: 14 }}>
      <div className="t-eyebrow">{t('Your plan is ready')}</div>
      <p className="t-body">{t('Here’s your week. Tap a day to change it, open a session to swap any exercise for one your gym has. When it looks right, head to Today.')}</p>
      <Button variant="primary" onClick={() => nav('/today')}>{t('Looks good — let’s go')}</Button>
    </div>}

    <div className="t-sec">{t('Next 7 days')}</div>
    <div className="t-card t-days">{days.map(d => {
      const info = dayInfo(S, d, today)
      return <button key={d} className={'t-day k-' + info.kind + (d === today ? ' today' : '')} onClick={() => ui().openSheet(close => <DaySheet d={d} close={close} />)}>
        <div className="t-day-d"><span>{d === today ? t('Today') : t(DAYN[new Date(d + 'T12:00:00').getDay()]).slice(0, 3)}</span><b>{new Date(d + 'T12:00:00').getDate()}</b></div>
        <span className="t-day-i"><Icon name={info.icon} /></span>
        <div className="grow"><div className="tt">{info.label}</div>{info.sub && <div className="ss">{info.sub}</div>}</div>
        <Icon name="chevronRight" className="chev" />
      </button>
    })}</div>
    <p className="t-foot">{t('Sessions run in order. Skip a day and everything slides back by one — nothing is lost.')}</p>

    <div className="t-sec">{t('Your sessions')}</div>
    {rot.map(r => <Session key={r.id} r={r} />)}

    {restDays.length > 0 && <>
      <div className="t-sec">{t('Walks on rest days')}</div>
      <div className="t-card">{restDays.map(wd => <div key={wd} className="t-walkrow">
        <div className="grow">{t(DAYN[wd])}</div>
        <div className="t-chips">{[0, 30, 45, 60, 90].map(m => <button key={m} className={'chip' + (((C.walkDays || {})[wd] || 0) === m ? ' on' : '')} onClick={() => setWalk(wd, m)}>{m ? m + "'" : t('Off')}</button>)}</div>
      </div>)}</div>
    </>}

    <div className="t-sec">{t('More')}</div>
    <div className="t-card">
      <button className="t-sess" onClick={() => nav('/setup')}><span className="t-alt-i"><Icon name="pencil" /></span><div className="grow"><div className="tt">{t('Change goal, days or equipment')}</div></div><Icon name="chevronRight" className="chev" /></button>
      <button className="t-sess" onClick={() => nav('/library')}><span className="t-alt-i"><Icon name="list" /></span><div className="grow"><div className="tt">{t('Exercise library')}</div></div><Icon name="chevronRight" className="chev" /></button>
      <button className="t-sess" onClick={() => nav('/routines')}><span className="t-alt-i"><Icon name="clipboard" /></span><div className="grow"><div className="tt">{t('All routines (advanced)')}</div></div><Icon name="chevronRight" className="chev" /></button>
    </div>
  </div>
}

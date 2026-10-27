import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { buildSets, effectiveRoutine, lastBW, modeOf, isBw } from '../lib/history.js'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import {
  GEAR, GEAR_GROUPS, GOALS, LEVELS, coachOf, generatePlan, splitFor, readiness, sessionAdjust, adjustEntries,
  missedDays, daysSinceWorkout, upcoming, parseVitals, baseline,
} from '../lib/coach.js'
import { fmtNum, fmtDate, todayISO, DAYS, DAYN } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { startFlow, bwSheet, confirmSheet, exerciseDetailSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Segmented, TextArea } from '../components/ui.jsx'
import { glyphOf } from '../lib/glyphs.js'

const WEEK = [1, 2, 3, 4, 5, 6, 0]
const tr = arr => t(arr[0], ...arr.slice(1))

// Saves vitals for a day: the check-in fields go to coach.checkins, a weight goes to the
// body-weight log exactly like a manual weigh-in. Keeps ~4 months of check-ins.
function saveVitals(update, iso, v) {
  update(s => {
    const c = coachOf(s)
    const { weight, ...rest } = v
    if (Object.keys(rest).length) c.checkins = { ...c.checkins, [iso]: { ...(c.checkins[iso] || {}), ...rest } }
    const keep = Object.keys(c.checkins).sort().slice(-120)
    c.checkins = Object.fromEntries(keep.map(d => [d, c.checkins[d]]))
    s.coach = c
    if (weight > 0) {
      const ex = s.bodyweight.find(b => b.d === iso)
      if (ex) { ex.w = weight; ex.t = Date.now() } else s.bodyweight.push({ d: iso, w: weight, t: Date.now() })
      s.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1))
    }
  })
}

/* ============================ setup ============================ */
function Setup({ onDone }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const C = coachOf(S)
  const [p, setP] = useState(C.profile)
  const [days, setDays] = useState(C.days)
  const [gear, setGear] = useState(C.gear)
  const [bw, setBw] = useState(lastBW(S)?.w || null)
  const set = (k, v) => setP(o => ({ ...o, [k]: v }))
  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const split = splitFor(days.length).length

  const build = () => {
    if (!days.length) { useUI.getState().toast(t('Pick at least one training day')); return }
    const plan = generatePlan({ profile: p, gear, days, bodyweight: bw, unit: S.unit })
    const apply = () => {
      update(s => {
        s.routines = s.routines.filter(r => !r.coach).concat(plan.routines)
        s.coach = { ...coachOf(s), on: true, profile: p, days: [...days].sort(), gear, rotation: plan.rotation }
        if (bw > 0 && !s.bodyweight.some(b => b.d === todayISO())) s.bodyweight.push({ d: todayISO(), w: bw, t: Date.now() })
      })
      onDone(plan.notes)
    }
    if (S.routines.some(r => r.coach)) {
      confirmSheet({
        title: t('Rebuild your plan?'),
        message: t('Your coach routines are replaced with new ones. Your workout history and weights are kept — the next session still starts from what you last lifted.'),
        confirmText: t('Rebuild'), onConfirm: apply,
      })
    } else apply()
  }

  const bmi = bw > 0 && p.height > 0 && S.unit === 'kg' ? bw / Math.pow(p.height / 100, 2) : null

  return <>
    <h4 className="sec">{t('About you')}</h4>
    <div className="card">
      <div className="small muted" style={{ marginBottom: 6 }}>{t('Sex')}</div>
      <Segmented options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} value={p.sex} onChange={v => set('sex', v)} />
      <div className="coach-grid">
        <label><span>{t('Age')}</span><NumberField decimal={false} nullable value={p.age} onChange={v => set('age', v)} className="field" placeholder="—" /></label>
        <label><span>{t('Height (cm)')}</span><NumberField decimal={false} nullable value={p.height} onChange={v => set('height', v)} className="field" placeholder="—" /></label>
        <label><span>{t('Weight ({0})', S.unit)}</span><NumberField nullable value={bw} onChange={setBw} className="field" placeholder="—" /></label>
      </div>
      {bmi && <div className="small dim" style={{ marginTop: 6 }}>BMI {fmtNum(bmi)} · {t('a rough guide only — it can’t tell muscle from fat')}</div>}
      <div className="small muted" style={{ margin: '14px 0 6px' }}>{t('Training experience')}</div>
      <div className="chips wrap">{Object.keys(LEVELS).map(k => <button key={k} className={'chip nocap' + (p.experience === k ? ' on' : '')} onClick={() => set('experience', k)}>{t(LEVELS[k])}</button>)}</div>
      <div className="small muted" style={{ margin: '14px 0 6px' }}>{t('Main goal')}</div>
      <div className="chips wrap">{Object.keys(GOALS).map(k => <button key={k} className={'chip nocap' + (p.goal === k ? ' on' : '')} onClick={() => set('goal', k)}>{t(GOALS[k])}</button>)}</div>
    </div>

    <h4 className="sec">{t('Schedule')}</h4>
    <div className="card">
      <div className="small muted" style={{ marginBottom: 6 }}>{t('Days you can train')}</div>
      <div className="chips wrap">{WEEK.map(d => <button key={d} className={'chip' + (days.includes(d) ? ' on' : '')} onClick={() => toggle(days, setDays, d)}>{t(DAYS[d])}</button>)}</div>
      <div className="small dim" style={{ marginTop: 6 }}>{t('{0} days → a {1}-session rotation. Miss a day and the next day picks up the missed session — nothing gets skipped.', days.length, split)}</div>
      <div className="small muted" style={{ margin: '14px 0 6px' }}>{t('Time per session')}</div>
      <Segmented options={[45, 60, 75, 90].map(m => ({ value: m, label: m + "'" }))} value={p.minutes} onChange={v => set('minutes', v)} />
    </div>

    <h4 className="sec">{t('Your gym')}</h4>
    <div className="card">
      <div className="small dim" style={{ marginBottom: 10 }}>{t('Tap everything your gym has. The coach only picks exercises you can actually do there.')}</div>
      {GEAR_GROUPS.map(g => <div key={g} style={{ marginBottom: 12 }}>
        <div className="small muted" style={{ marginBottom: 6 }}>{t(g)}</div>
        <div className="chips wrap">{GEAR.filter(x => x.group === g).map(x => <button key={x.key} className={'chip nocap' + (gear.includes(x.key) ? ' on' : '')} onClick={() => toggle(gear, setGear, x.key)}>{t(x.label)}</button>)}</div>
      </div>)}
    </div>

    <Button variant="primary" icon="sparkles" onClick={build}>{S.routines.some(r => r.coach) ? t('Rebuild my plan') : t('Build my plan')}</Button>
    <div className="small dim" style={{ textAlign: 'center', margin: '10px 0 4px' }}>{t('First-session weights are deliberately light guesses. Log honestly and the progression rules take it from there.')}</div>
  </>
}

/* ============================ check-in ============================ */
function Scale({ value, onChange, lo, hi }) {
  return <div className="chips" style={{ gap: 6 }}>
    {[1, 2, 3, 4, 5].map(v => <button key={v} className={'chip' + (value === v ? ' on' : '')} style={{ minWidth: 40 }} onClick={() => onChange(value === v ? null : v)}>{v}</button>)}
    <span className="small dim" style={{ alignSelf: 'center', marginLeft: 4 }}>{lo} → {hi}</span>
  </div>
}

function CheckIn({ iso }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const saved = coachOf(S).checkins[iso] || {}
  const [v, setV] = useState(saved)
  const [paste, setPaste] = useState(null)
  useEffect(() => { setV(saved) }, [JSON.stringify(saved)])
  const set = (k, x) => setV(o => { const n = { ...o }; if (x == null || x === 0) delete n[k]; else n[k] = x; return n })
  const save = () => { saveVitals(update, iso, v); toast(t('Check-in saved')) }

  const importText = txt => {
    const got = parseVitals(txt)
    if (!Object.keys(got).length) { toast(t('No vitals found in that text')); return }
    saveVitals(update, iso, got)
    setPaste(null)
    toast(t('Imported: {0}', Object.keys(got).join(', ')))
  }
  const fromClipboard = async () => {
    try { importText(await navigator.clipboard.readText()) }
    catch { setPaste('') }   // clipboard blocked → let them paste by hand
  }
  const rhr0 = baseline(S, 'rhr', iso), hrv0 = baseline(S, 'hrv', iso)

  return <div className="card">
    <div className="row between" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t('Morning check-in')}</h2>
      <Button size="sm" icon="heart" onClick={fromClipboard}>{t('From Health')}</Button>
    </div>
    {paste !== null && <div style={{ marginBottom: 10 }}>
      <TextArea value={paste} onChange={e => setPaste(e.target.value)} placeholder="sleep=7.5&rhr=54&hrv=62&weight=80.2" />
      <div style={{ height: 6 }} /><Button size="sm" variant="tinted" onClick={() => importText(paste)}>{t('Import')}</Button>
    </div>}
    <div className="coach-grid">
      <label><span>{t('Sleep (h)')}</span><NumberField nullable value={v.sleep} onChange={x => set('sleep', x)} className="field" placeholder="—" /></label>
      <label><span>{t('Resting HR')}</span><NumberField decimal={false} nullable value={v.rhr} onChange={x => set('rhr', x)} className="field" placeholder={rhr0 ? String(Math.round(rhr0)) : '—'} /></label>
      <label><span>{t('HRV (ms)')}</span><NumberField decimal={false} nullable value={v.hrv} onChange={x => set('hrv', x)} className="field" placeholder={hrv0 ? String(Math.round(hrv0)) : '—'} /></label>
    </div>
    <div className="small muted" style={{ margin: '12px 0 6px' }}>{t('Energy')}</div>
    <Scale value={v.energy} onChange={x => set('energy', x)} lo={t('drained')} hi={t('great')} />
    <div className="small muted" style={{ margin: '12px 0 6px' }}>{t('Muscle soreness')}</div>
    <Scale value={v.soreness} onChange={x => set('soreness', x)} lo={t('none')} hi={t('very sore')} />
    <div style={{ height: 12 }} />
    <div className="row" style={{ gap: 8 }}>
      <Button variant="tinted" icon="check" onClick={save}>{t('Save check-in')}</Button>
      <Button icon="scale" onClick={() => bwSheet()}>{t('Weigh in')}</Button>
    </div>
    <div className="small dim" style={{ marginTop: 8 }}>{(rhr0 || hrv0) ? t('Heart numbers are compared with your own normal (median of recent check-ins).') : t('Heart numbers start counting after 4 check-ins — they’re compared with your own normal, not an average person’s.')}</div>
  </div>
}

/* ============================ today ============================ */
function Verdict({ r }) {
  if (!r) return null
  const look = {
    go: ['var(--acc)', 'checkCircle', t('Good to go — train as planned.')],
    light: ['var(--yellow)', 'info', t('Lighter day: same weights, one set less per exercise.')],
    rest: ['var(--orange)', 'moon', t('Your body is asking for rest. Take today off or do 20–30 min easy walking. Your session waits for you tomorrow.')],
  }[r.level]
  return <div className="coach-verdict" style={{ '--tint': look[0] }}>
    <Icon name={look[1]} style={{ color: look[0], fontSize: 18, flex: 'none' }} />
    <div><div style={{ fontWeight: 600 }}>{look[2]}</div>
      {r.reasons.length > 0 && <div className="small muted">{r.reasons.map(tr).join(' · ')}</div>}</div>
  </div>
}

function sessionLine(cfg, sets, unit) {
  const mode = modeOf(cfg)
  const first = sets[0] || {}
  if (mode === 'cardio') return `${first.min || cfg.min || 20} min`
  if (mode === 'time') return `${sets.length} × ${first.sec || cfg.sec}s`
  const load = first.w > 0 ? ` · ${isBw(cfg) ? '+' : ''}${fmtNum(first.w)} ${unit}` : isBw(cfg) ? ' · ' + t('bodyweight') : ''
  return `${sets.length} × ${first.r || cfg.reps}${load}`
}

function Today() {
  const S = useStore(s => s.S)
  const nav = useNavigate()
  const iso = todayISO()
  const routine = effectiveRoutine(S, iso)
  const done = S.workouts.some(w => w.d === iso)
  const r = readiness(S, iso)
  const missed = missedDays(S, iso)
  const gap = daysSinceWorkout(S, iso)
  const adj = routine ? sessionAdjust(S, routine.id, iso) : null

  if (S.active) return <div className="card" style={{ borderColor: 'var(--orange)' }}>
    <h2>{t('In progress')}</h2>
    <Button variant="primary" icon="play" onClick={() => nav('/workout')}>{t('Resume {0}', S.active.name)}</Button>
  </div>

  if (!routine) return <div className="card">
    <div className="row" style={{ gap: 10 }}>
      <span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="moon" /></span>
      <div><div style={{ fontWeight: 600 }}>{done ? t('Done for today — nice work.') : t('Rest day')}</div>
        <div className="small muted">{done ? t('Eat well and sleep — that’s when you actually get stronger.') : t('Recovery is part of the plan. A walk or some stretching is plenty.')}</div></div>
    </div>
  </div>

  // Preview exactly what the workout screen will prescribe.
  const built = routine.ex.map(cfg => {
    const plan = nextPrescription(S, cfg, routine)
    return { id: cfg.id, target: { ...cfg }, plan, sets: applyPrescription(buildSets(S, cfg), plan) }
  })
  const entries = adjustEntries(built, adj, S.unit)
  const doneToday = done && S.workouts.some(w => w.d === iso && w.routineId === routine.id)

  return <div className="card" style={{ borderColor: doneToday ? undefined : 'var(--acc)' }}>
    <div className="row between" style={{ marginBottom: 4 }}>
      <div>
        <div className="small accent" style={{ fontWeight: 600 }}>{doneToday ? t('Done today') : t('Today’s session')}</div>
        <div className="big">{routine.name}</div>
      </div>
      <span className="lrow-i" style={{ width: 38, height: 38, borderRadius: 9, fontSize: 22 }}><Icon name={glyphOf(routine.emoji)} /></span>
    </div>
    {!doneToday && missed > 0 && <div className="small" style={{ color: 'var(--orange)', marginBottom: 6 }}>{t(missed === 1 ? 'You missed 1 training day — no problem, today picks up where you left off.' : 'You missed {0} training days — no problem, today picks up where you left off.', missed)}</div>}
    {!doneToday && gap >= 14 && <div className="small" style={{ color: 'var(--orange)', marginBottom: 6 }}>{t('{0} days since your last workout — weights are eased 10% for this session.', gap)}</div>}
    {!doneToday && <Verdict r={r} />}
    {!doneToday && entries.some(e => e.plan && e.plan.kind === 'first') && <div className="small dim">{t('First time on some of these — the weights are starting guesses. If the last set felt like 3+ reps to spare, the coach moves you up next time.')}</div>}
    <div className="list" style={{ gap: 0, margin: '8px 0 12px' }}>
      {entries.map((e, i) => {
        const ex = exOr(e.id)
        const why = e.plan && e.plan.kind !== 'first' && e.plan.why
        return <div key={i} className="coach-ex" onClick={() => !ex.missing && exerciseDetailSheet(ex)}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="capitalize" style={{ fontWeight: 500 }}>{ex.n}</div>
            <div className="small dim capitalize">{[ex.eq, ex.tg].filter(Boolean).join(' · ')}</div>
            {why && <div className="small muted">{tr(why)}</div>}
          </div>
          <div className="coach-dose">{sessionLine(e.target, e.sets, S.unit)}</div>
        </div>
      })}
    </div>
    {!doneToday && <Button variant="primary" icon="play" onClick={() => startFlow(routine.id)}>{r && r.level === 'rest' ? t('Train anyway (lighter)') : t('Start {0}', routine.name)}</Button>}
  </div>
}

/* ============================ page ============================ */
export default function Coach() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const C = coachOf(S)
  const [editing, setEditing] = useState(false)
  const [notes, setNotes] = useState(null)

  // Vitals sent in the link, e.g. from an iOS Shortcut: #/coach?sleep=7.5&rhr=54&hrv=62
  useEffect(() => {
    const q = params.toString()
    if (!q) return
    const v = parseVitals(q)
    if (Object.keys(v).length) { saveVitals(update, todayISO(), v); toast(t('Imported: {0}', Object.keys(v).join(', '))) }
    setParams({}, { replace: true })
  }, [params])

  const showSetup = editing || !C.on
  const next = C.on ? upcoming(S, 7).filter(x => x.d !== todayISO()).slice(0, 6) : []
  const rid = id => S.routines.find(r => r.id === id)

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Coach')}</h1><div className="sub">{showSetup ? t('Tell me about you and your gym') : new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      {C.on && !editing && <button className="iconbtn" onClick={() => setEditing(true)} aria-label={t('Edit')}><Icon name="pencil" /></button>}
      {editing && <button className="iconbtn" onClick={() => setEditing(false)} aria-label={t('Close')}><Icon name="xmark" /></button>}
    </div>

    {!C.on && !editing && C.rotation.some(id => rid(id)) && <div className="card">
      <div className="small muted" style={{ marginBottom: 8 }}>{t('The coach is off. Your previous coach plan is still there.')}</div>
      <Button variant="tinted" icon="play" onClick={() => update(s => { s.coach = { ...coachOf(s), on: true } })}>{t('Turn the coach back on')}</Button>
    </div>}

    {showSetup ? <Setup onDone={n => { setEditing(false); setNotes(n); toast(t('Your plan is ready')) }} /> : <>
      {notes && notes.length > 0 && <div className="card" style={{ borderColor: 'var(--yellow)' }}>
        <div className="row between"><b>{t('Heads-up')}</b><button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => setNotes(null)} aria-label={t('Close')}><Icon name="xmark" /></button></div>
        {notes.includes('__nobw') && <div className="small muted">{t('No body weight entered, so starting weights are blank — pick a weight you can lift for the reps with 2–3 to spare.')}</div>}
        {notes.filter(n => n !== '__nobw').length > 0 && <div className="small muted">{t('Nothing in your gym list for: {0}. Those slots were left out — add equipment to fill them.', notes.filter(n => n !== '__nobw').map(n => t(n)).join(', '))}</div>}
      </div>}

      <CheckIn iso={todayISO()} />
      <Today />

      {next.length > 0 && <>
        <h4 className="sec">{t('Coming up')}</h4>
        <div className="list">{next.map(x => {
          const r = rid(x.id)
          return r && <div key={x.d} className="item" onClick={() => nav('/plan/r/' + r.id)}>
            <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
            <div className="grow"><div className="tt">{r.name}</div><div className="ss">{fmtDate(x.d, true)}</div></div>
            <Icon name="chevronRight" className="chev" />
          </div>
        })}</div>
        <div className="small dim" style={{ marginTop: 6 }}>{t('Projected — if you skip a day, everything slides back by one session.')}</div>
      </>}

      <h4 className="sec">{t('Your setup')}</h4>
      <div className="card small muted">
        <div>{t(GOALS[C.profile.goal])} · {t(LEVELS[C.profile.experience])}</div>
        <div>{C.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => t(DAYN[d]).slice(0, 3)).join(' ')} · {C.profile.minutes} min</div>
        <div>{t('{0} pieces of equipment', C.gear.length)}</div>
        <div style={{ height: 10 }} />
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" icon="pencil" onClick={() => setEditing(true)}>{t('Edit & rebuild')}</Button>
          <Button size="sm" variant="ghost" onClick={() => confirmSheet({
            title: t('Turn the coach off?'),
            message: t('Days go back to your weekly plan in the Plan tab. Coach routines and history stay; you can turn it back on anytime.'),
            confirmText: t('Turn off'), onConfirm: () => update(s => { s.coach = { ...coachOf(s), on: false } }),
          })}>{t('Turn off')}</Button>
        </div>
      </div>
    </>}
  </div>
}

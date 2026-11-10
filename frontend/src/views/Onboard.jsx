import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { GEAR, GEAR_GROUPS, GOALS, coachOf, generatePlan, splitFor } from '../lib/coach.js'
import { ensureBuiltins } from '../lib/trainer.js'
import { lastBW } from '../lib/history.js'
import { todayISO, DAYN } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Segmented } from '../components/ui.jsx'

const WEEK = [1, 2, 3, 4, 5, 6, 0]
const GOAL_SUB = {
  strength: 'Lift heavier, week by week',
  muscle: 'Look and feel more muscular',
  fatloss: 'Lose fat, keep the muscle',
  general: 'Feel fitter and more energetic',
}
const LEVEL = {
  beginner: ['New to this', 'Under 6 months of regular training'],
  intermediate: ['Some experience', '6 months to 2 years'],
  advanced: ['Experienced', 'More than 2 years'],
}
// What a typical housing-society gym has — a sensible starting point to edit, not a guess
// about yours.
const SOCIETY_GYM = ['dumbbell', 'cable', 'legpress', 'latpulldown', 'chestpress', 'treadmill', 'bike']

function Choice({ on, title, sub, onClick }) {
  return <button className={'ob-choice' + (on ? ' on' : '')} onClick={onClick}>
    <div><div className="ob-ct">{title}</div>{sub && <div className="ob-cs">{sub}</div>}</div>
    <span className="ob-tick">{on && <Icon name="check" />}</span>
  </button>
}

export default function Onboard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const C = coachOf(S)
  const editing = C.rotation.length > 0
  const [step, setStep] = useState(0)
  const [p, setP] = useState(C.profile)
  const [days, setDays] = useState(C.days)
  const [gear, setGear] = useState(C.gear.length ? C.gear : SOCIETY_GYM)
  const [walk, setWalk] = useState(() => Object.values(C.walkDays || {})[0] || (C.profile.goal === 'strength' ? 0 : 45))
  const [bw, setBw] = useState(lastBW(S)?.w || null)
  const set = (k, v) => setP(o => ({ ...o, [k]: v }))
  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  const build = () => {
    const plan = generatePlan({ profile: p, gear, days, bodyweight: bw, unit: S.unit })
    const walkDays = {}
    if (walk > 0) WEEK.filter(d => !days.includes(d)).forEach(d => { walkDays[d] = walk })
    update(s => {
      s.routines = s.routines.filter(r => !r.coach).concat(plan.routines)
      s.coach = { ...coachOf(s), on: true, profile: p, days: [...days].sort(), gear, rotation: plan.rotation, walkDays }
      ensureBuiltins(s)
      if (bw > 0 && !s.bodyweight.some(b => b.d === todayISO())) s.bodyweight.push({ d: todayISO(), w: bw, t: Date.now() })
    })
    nav('/plan?new=1')
  }

  const steps = [
    {
      q: editing ? t('What’s your goal now?') : t('Hi! I’m your trainer. What do you want to achieve?'),
      ok: !!p.goal,
      body: Object.keys(GOALS).map(k => <Choice key={k} on={p.goal === k} title={t(GOALS[k])} sub={t(GOAL_SUB[k])} onClick={() => set('goal', k)} />),
    },
    {
      q: t('How much have you trained before?'),
      ok: !!p.experience,
      body: Object.keys(LEVEL).map(k => <Choice key={k} on={p.experience === k} title={t(LEVEL[k][0])} sub={t(LEVEL[k][1])} onClick={() => set('experience', k)} />),
    },
    {
      q: t('Which days can you get to the gym?'),
      ok: days.length > 0,
      body: <>
        <div className="ob-days">{WEEK.map(d => <button key={d} className={'ob-day' + (days.includes(d) ? ' on' : '')} onClick={() => toggle(days, setDays, d)}>{t(DAYN[d]).slice(0, 3)}</button>)}</div>
        <p className="ob-hint">{days.length ? t('{0} days a week → {1} different sessions that rotate. Miss a day and the next day picks up the missed session.', days.length, splitFor(days.length).length) : t('Pick at least one day.')}</p>
        <div className="ob-sub">{t('How long can you train each time?')}</div>
        <Segmented options={[30, 45, 60, 75, 90].map(m => ({ value: m, label: m + ' min' }))} value={p.minutes} onChange={v => set('minutes', v)} />
      </>,
    },
    {
      q: t('What’s in your gym?'),
      ok: true,
      body: <>
        <p className="ob-hint">{editing ? t('Tap to add or remove.') : t('I’ve ticked what most society gyms have. Tap to change it to match yours.')}</p>
        {GEAR_GROUPS.map(g => <div key={g} className="ob-group">
          <div className="ob-sub">{t(g)}</div>
          <div className="ob-gear">{GEAR.filter(x => x.group === g).map(x => <button key={x.key} className={'ob-g' + (gear.includes(x.key) ? ' on' : '')} onClick={() => toggle(gear, setGear, x.key)}>{gear.includes(x.key) && <Icon name="check" />}{t(x.label)}</button>)}</div>
        </div>)}
      </>,
    },
    {
      q: t('On rest days, shall I plan a walk?'),
      ok: true,
      body: <>
        {[0, 30, 45, 60, 90].map(m => <Choice key={m} on={walk === m} title={m ? t('Yes, {0} minutes', m) : t('No, just rest')} sub={m === 45 ? t('A good default for most people') : null} onClick={() => setWalk(m)} />)}
        <p className="ob-hint">{t('On any day you can also swap the gym for a walk — I’ll move the session to the next day.')}</p>
      </>,
    },
    {
      q: t('Last thing — a bit about you'),
      ok: true,
      body: <>
        <p className="ob-hint">{t('Used for your starting weights and body-fat estimate. All optional, and it stays on your phone.')}</p>
        <Segmented options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} value={p.sex} onChange={v => set('sex', v)} />
        <div className="ob-fields">
          <label><span>{t('Age')}</span><NumberField decimal={false} nullable value={p.age} onChange={v => set('age', v)} className="field" placeholder="—" /></label>
          <label><span>{t('Height (cm)')}</span><NumberField decimal={false} nullable value={p.height} onChange={v => set('height', v)} className="field" placeholder="—" /></label>
          <label><span>{t('Weight ({0})', S.unit)}</span><NumberField nullable value={bw} onChange={setBw} className="field" placeholder="—" /></label>
        </div>
      </>,
    },
  ]
  const cur = steps[step]
  const last = step === steps.length - 1

  return <div className="narrow ob">
    <div className="ob-top">
      <button className="iconbtn" aria-label={t('Back')} onClick={() => (step ? setStep(step - 1) : nav(-1))}><Icon name={step ? 'chevronLeft' : 'xmark'} /></button>
      <div className="ob-prog">{steps.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      <span style={{ width: 36 }} />
    </div>
    <h1 className="ob-q">{cur.q}</h1>
    <div className="ob-body" key={step}>{cur.body}</div>
    <div className="ob-foot">
      <Button variant="primary" disabled={!cur.ok} onClick={() => (last ? build() : setStep(step + 1))}>{last ? (editing ? t('Rebuild my plan') : t('Make my plan')) : t('Continue')}</Button>
      {editing && !last && <button className="t-link" onClick={build}>{t('Rebuild with these answers')}</button>}
    </div>
  </div>
}

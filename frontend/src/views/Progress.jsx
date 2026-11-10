import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { lastBW } from '../lib/history.js'
import { coachOf } from '../lib/coach.js'
import { measureSummary, bodyFatSeries, lenUnit, toShow } from '../lib/body.js'
import { fmtNum, fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { bwSheet } from '../sheets.jsx'
import { WeekReview } from './Coach.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// Each exercise's heaviest set in its first and its latest session — the plainest possible
// answer to "am I getting stronger?". Top 6 by relative gain.
export function strengthGains(S) {
  const by = {}
  for (const w of S.workouts || []) for (const e of w.entries) {
    const top = Math.max(0, ...e.sets.filter(s => s.done).map(s => s.w || 0))
    if (!(top > 0)) continue
    const x = by[e.id] || (by[e.id] = { id: e.id, first: top, firstD: w.d, last: top, lastD: w.d, n: 0 })
    if (w.d < x.firstD) { x.first = top; x.firstD = w.d }
    if (w.d >= x.lastD) { x.last = top; x.lastD = w.d }
    x.n++
  }
  return Object.values(by).filter(x => x.n > 1)
    .map(x => ({ ...x, gain: (x.last - x.first) / x.first }))
    .sort((a, b) => b.gain - a.gain).slice(0, 6)
}

export default function Progress() {
  const S = useStore(s => s.S)
  const nav = useNavigate()
  const bw = lastBW(S)
  const first = S.bodyweight[0]
  const gains = strengthGains(S)
  const waist = measureSummary(S, 'waist')
  const bf = bodyFatSeries(S, coachOf(S).profile)
  const u = lenUnit(S.unit)

  return <div className="narrow t-page">
    <div className="t-head"><div><h1>{t('Progress')}</h1><div className="t-date">{t('{0} workouts so far', S.workouts.length)}</div></div></div>

    <WeekReview />

    <div className="t-sec">{t('Getting stronger')}</div>
    <div className="t-card">
      {gains.length ? gains.map(g => <div key={g.id} className="t-ex">
        <div className="grow"><div className="t-ex-n">{exOr(g.id).n}</div><div className="t-ex-m">{t('since {0}', fmtDate(g.firstD))}</div></div>
        <div className="t-ex-d">{fmtNum(g.first)} → {fmtNum(g.last)} {S.unit}</div>
        <span className="t-gain" style={{ color: g.gain > 0 ? 'var(--acc)' : 'var(--label-3)' }}>{g.gain > 0 ? '+' + Math.round(g.gain * 100) + '%' : '='}</span>
      </div>) : <p className="t-body" style={{ margin: 0 }}>{t('After your second session of an exercise, its progress shows here.')}</p>}
    </div>

    <div className="t-sec">{t('Body weight')}</div>
    <div className="t-card">
      <div className="row between">
        <div>{bw ? <><span className="t-big">{fmtNum(bw.w)}</span> <span className="muted">{S.unit}</span>
          {first && first !== bw && <span className="small muted"> · {bw.w - first.w > 0 ? '+' : '−'}{fmtNum(Math.abs(bw.w - first.w))} {t('since {0}', fmtDate(first.d))}</span>}</> : <span className="muted">{t('Not logged yet')}</span>}</div>
        <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
      </div>
      {S.bodyweight.length > 1 && <div className="chart" style={{ marginTop: 10 }}><LineChart points={S.bodyweight.slice(-60).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))} h={120} unit={S.unit} goal={S.targetW} /></div>}
    </div>

    <div className="t-sec">{t('Body')}</div>
    <button className="t-card t-sess" onClick={() => nav('/body')}>
      <span className="t-alt-i"><Icon name="figureStrength" /></span>
      <div className="grow"><div className="tt">{t('Measurements & photos')}</div>
        <div className="ss">{waist || bf.length ? [waist && t('Waist {0}', fmtNum(toShow(waist.v, S.unit)) + ' ' + u), bf.length && t('~{0}% body fat', fmtNum(bf[bf.length - 1].bf))].filter(Boolean).join(' · ') : t('See the changes the scale misses')}</div></div>
      <Icon name="chevronRight" className="chev" />
    </button>

    <div className="t-sec">{t('History')}</div>
    <div className="t-card">
      <button className="t-sess" onClick={() => nav('/history')}><span className="t-alt-i"><Icon name="history" /></span><div className="grow"><div className="tt">{t('All workouts')}</div></div><Icon name="chevronRight" className="chev" /></button>
      <button className="t-sess" onClick={() => nav('/stats')}><span className="t-alt-i"><Icon name="chart" /></span><div className="grow"><div className="tt">{t('Detailed stats')}</div></div><Icon name="chevronRight" className="chev" /></button>
    </div>
  </div>
}

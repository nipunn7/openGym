import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { MEASURES, lenUnit, toShow, fromShow, seriesOf, measureSummary, bodyFatSeries, bodyFatNeeds, saveMeasures, daysSince } from '../lib/body.js'
import { photosSupported, listPhotos, addPhoto, deletePhoto } from '../lib/photos.js'
import { coachOf } from '../lib/coach.js'
import { fmtNum, fmtDate, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { confirmSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Segmented } from '../components/ui.jsx'

const POSES = ['front', 'side', 'back']
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmtNum(Math.abs(n))

/* ============================ log sheet ============================ */
function MeasureSheet({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const u = lenUnit(S.unit)
  const [v, setV] = useState({})
  const save = () => {
    const cm = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromShow(x, S.unit)]))
    let ok = false
    update(s => { ok = saveMeasures(s, todayISO(), cm) })
    close()
    useUI.getState().toast(ok ? t('Measurements saved') : t('Nothing entered'))
  }
  return <>
    <h3>{t('Measurements')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Same time of day each time (morning, before eating), tape snug but not tight. Fill in only what you measured.')}</div>
    {MEASURES.map(m => {
      const last = measureSummary(S, m.key)
      return <div key={m.key} className="body-in">
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{t(m.label)}</div>
          <div className="small dim">{t(m.hint)}</div>
        </div>
        <NumberField nullable value={v[m.key]} onChange={x => setV(o => ({ ...o, [m.key]: x }))} className="field" placeholder={last ? String(toShow(last.v, S.unit)) : u} />
      </div>
    })}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}

/* ============================ photos ============================ */
function usePhotos() {
  const [list, setList] = useState(null)
  const urls = useRef({})
  const load = async () => {
    try {
      const ps = await listPhotos()
      const next = {}
      ps.forEach(p => { next[p.id] = urls.current[p.id] || URL.createObjectURL(p.blob) })
      Object.keys(urls.current).forEach(id => { if (!next[id]) URL.revokeObjectURL(urls.current[id]) })
      urls.current = next
      setList(ps.map(p => ({ ...p, url: next[p.id] })))
    } catch { setList([]) }
  }
  useEffect(() => { load(); return () => Object.values(urls.current).forEach(u => URL.revokeObjectURL(u)) }, [])
  return [list, load]
}

function Photos() {
  const [list, reload] = usePhotos()
  const [pose, setPose] = useState('front')
  const [pick, setPick] = useState([])
  const fileRef = useRef(null)
  const toast = useUI(s => s.toast)
  if (!photosSupported()) return null

  const onFile = async ev => {
    const f = ev.target.files[0]
    ev.target.value = ''
    if (!f) return
    try { await addPhoto(f, todayISO(), pose); await reload(); toast(t('Photo saved on this device')) }
    catch (e) { toast(t('Could not save the photo: {0}', e.message)) }
  }
  const shown = (list || []).filter(p => p.pose === pose)
  const last = (list || [])[0]
  const gap = last ? daysSince(last.d, todayISO()) : null
  const toggle = id => setPick(p => (p.includes(id) ? p.filter(x => x !== id) : [...p.slice(-1), id]))
  const pair = pick.map(id => shown.find(p => p.id === id)).filter(Boolean).sort((a, b) => (a.d < b.d ? -1 : 1))

  const view = p => useUI.getState().openSheet(close => <>
    <h3>{fmtDate(p.d, true)} · {t(p.pose)}</h3>
    <img src={p.url} alt="" className="body-full" />
    <div style={{ height: 10 }} />
    <Button variant="danger" onClick={() => confirmSheet({ title: t('Delete photo?'), message: t('It’s only stored on this device, so this can’t be undone.'), confirmText: t('Delete'), danger: true, onConfirm: async () => { await deletePhoto(p.id); close(); reload() } })}>{t('Delete photo')}</Button>
  </>)

  return <div className="card">
    <div className="row between" style={{ marginBottom: 10 }}>
      <h2 style={{ margin: 0 }}>{t('Progress photos')}</h2>
      <Button size="sm" icon="plus" onClick={() => fileRef.current.click()}>{t('Add')}</Button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
    <Segmented options={POSES.map(p => ({ value: p, label: t(p[0].toUpperCase() + p.slice(1)) }))} value={pose} onChange={p => { setPose(p); setPick([]) }} />
    {(gap == null || gap >= 28) && <div className="small" style={{ color: 'var(--orange)', marginTop: 8 }}>{gap == null ? t('Take a first set (front, side, back) — in a month you’ll be glad you did.') : t('{0} days since your last photo — time for this month’s set.', gap)}</div>}
    {pair.length === 2 && <div className="body-compare">
      {pair.map(p => <figure key={p.id}><img src={p.url} alt="" /><figcaption>{fmtDate(p.d)}</figcaption></figure>)}
      <div className="small dim" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>{t('{0} days apart', daysSince(pair[0].d, pair[1].d))}</div>
    </div>}
    {shown.length > 0 ? <div className="body-grid">
      {shown.map(p => <button key={p.id} className={'body-thumb' + (pick.includes(p.id) ? ' on' : '')} onClick={() => toggle(p.id)} onDoubleClick={() => view(p)}>
        <img src={p.url} alt="" /><span>{fmtDate(p.d)}</span>
        <i onClick={ev => { ev.stopPropagation(); view(p) }}><Icon name="expand" /></i>
      </button>)}
    </div> : list && <div className="small muted" style={{ marginTop: 10 }}>{t('No {0} photos yet.', t(pose))}</div>}
    {shown.length > 1 && pair.length < 2 && <div className="small dim" style={{ marginTop: 8 }}>{t('Tap two photos to compare them side by side.')}</div>}
    <div className="small dim" style={{ marginTop: 8 }}><Icon name="lock" style={{ fontSize: 12 }} /> {t('Photos stay on this device only — not synced and not in backups.')}</div>
  </div>
}

/* ============================ page ============================ */
export default function Body() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [open, setOpen] = useState('waist')
  const u = lenUnit(S.unit)
  const profile = coachOf(S).profile
  const bf = bodyFatSeries(S, profile)
  const needs = bodyFatNeeds(S, profile)
  const lastM = (S.measures || []).length ? S.measures[S.measures.length - 1].d : null
  const gapM = daysSince(lastM, todayISO())
  const logSheet = () => useUI.getState().openSheet(close => <MeasureSheet close={close} />)

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Body')}</h1><div className="sub">{t('What the scale can’t show')}</div></div>
    </div>

    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Measurements')}</h2>
        <Button size="sm" icon="plus" onClick={logSheet}>{t('Log')}</Button>
      </div>
      {(gapM == null || gapM >= 14) && <div className="small" style={{ color: 'var(--orange)', marginBottom: 6 }}>{gapM == null ? t('Start with your waist — it’s the most telling one.') : t('{0} days since you last measured — every 2–4 weeks is enough.', gapM)}</div>}
      {MEASURES.map(m => {
        const sm = measureSummary(S, m.key)
        if (!sm) return null
        // Only the waist has a direction that is good for everyone; the rest are just shown.
        const tone = m.key === 'waist' && sm.sinceFirst ? (sm.sinceFirst < 0 ? 'var(--acc)' : 'var(--orange)') : 'var(--label-2)'
        return <div key={m.key}>
          <div className="coach-ex" onClick={() => setOpen(o => (o === m.key ? null : m.key))}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{t(m.label)}</div>
              {sm.sinceFirst != null && <div className="small" style={{ color: tone }}>{signed(toShow(sm.sinceFirst, S.unit))} {u} {t('since {0}', fmtDate(sm.firstD))}</div>}
            </div>
            <div className="coach-dose">{fmtNum(toShow(sm.v, S.unit))} {u}</div>
            {sm.count > 1 && <Icon name={open === m.key ? 'chevronUp' : 'chevronDown'} className="chev" />}
          </div>
          {open === m.key && sm.count > 1 && <div className="chart" style={{ margin: '6px 0 10px' }}>
            <LineChart points={seriesOf(S, m.key).map(x => ({ t: new Date(x.d + 'T12:00:00').getTime(), y: toShow(x.v, S.unit), d: x.d }))} h={120} unit={u} />
          </div>}
        </div>
      })}
    </div>

    <div className="card">
      <h2>{t('Body fat (estimate)')}</h2>
      {bf.length ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <div className="big">{fmtNum(bf[bf.length - 1].bf)}<span className="muted" style={{ fontSize: '1rem' }}> %</span></div>
          {bf.length > 1 && <span className="small" style={{ color: bf[bf.length - 1].bf <= bf[0].bf ? 'var(--acc)' : 'var(--orange)' }}>{signed(Math.round((bf[bf.length - 1].bf - bf[0].bf) * 10) / 10)} {t('since {0}', fmtDate(bf[0].d))}</span>}
        </div>
        {bf.length > 1 && <div className="chart" style={{ marginTop: 8 }}><LineChart points={bf.map(x => ({ t: new Date(x.d + 'T12:00:00').getTime(), y: x.bf, d: x.d }))} h={110} unit="%" /></div>}
      </> : <div className="small muted">{t('Needs: {0}.', needs.map(k => k === 'height' ? t('your height') : t(MEASURES.find(m => m.key === k).label).toLowerCase()).join(', '))}</div>}
      {needs.includes('height') && <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <span className="small muted">{t('Height (cm)')}</span>
        <NumberField decimal={false} nullable value={profile.height} className="field" style={{ maxWidth: 90 }} placeholder="—"
          onChange={h => update(s => { const c = coachOf(s); s.coach = { ...c, profile: { ...c.profile, height: h } } })} />
      </div>}
      <div className="small dim" style={{ marginTop: 8 }}>{t('US Navy tape method (waist, neck, height{0}). It can be a few percent off for any one person — measured the same way each time, the trend is what to watch.', profile.sex === 'female' ? ', ' + t('hips') : '')}</div>
    </div>

    <Photos />
  </div>
}

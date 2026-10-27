// Body measurements and a body-fat estimate. Pure functions over S.measures.
//
// The scale can't tell fat from muscle: lose 2 kg of fat while gaining 2 kg of muscle and the
// curve is flat while your waist shrinks. A tape measure sees it. Measurements are always
// stored in centimetres (one unit in the log, no mixed history) and shown in inches for a
// pound profile.

export const MEASURES = [
  { key: 'waist', label: 'Waist', hint: 'At the navel, relaxed, after breathing out' },
  { key: 'chest', label: 'Chest', hint: 'Across the nipples, arms down' },
  { key: 'arms', label: 'Arm', hint: 'Biggest point of the upper arm, flexed' },
  { key: 'hips', label: 'Hips', hint: 'Widest point of the buttocks' },
  { key: 'thighs', label: 'Thigh', hint: 'Widest point, standing' },
  { key: 'neck', label: 'Neck', hint: 'Just below the Adam’s apple' },
]
export const lenUnit = unit => (unit === 'lb' ? 'in' : 'cm')
const IN = 2.54
export const toShow = (cm, unit) => (cm == null ? null : unit === 'lb' ? Math.round((cm / IN) * 10) / 10 : Math.round(cm * 10) / 10)
export const fromShow = (v, unit) => (v == null || !(v > 0) ? null : unit === 'lb' ? Math.round(v * IN * 10) / 10 : Math.round(v * 10) / 10)

/** Entries holding `key`, oldest first: [{ d, v }] in cm. */
export function seriesOf(S, key) {
  return (S.measures || []).filter(m => m[key] > 0).map(m => ({ d: m.d, v: m[key] })).sort((a, b) => (a.d < b.d ? -1 : 1))
}

/** Latest value, and the change since the first entry and since the one before. */
export function measureSummary(S, key) {
  const s = seriesOf(S, key)
  if (!s.length) return null
  const last = s[s.length - 1]
  return {
    d: last.d, v: last.v, count: s.length,
    sinceFirst: s.length > 1 ? Math.round((last.v - s[0].v) * 10) / 10 : null,
    firstD: s[0].d,
    sinceLast: s.length > 1 ? Math.round((last.v - s[s.length - 2].v) * 10) / 10 : null,
  }
}

/**
 * U.S. Navy circumference method (Hodgdon & Beckett), all lengths in cm.
 *   men:   495 / (1.0324 − 0.19077·log10(waist − neck) + 0.15456·log10(height)) − 450
 *   women: 495 / (1.29579 − 0.35004·log10(waist + hips − neck) + 0.22100·log10(height)) − 450
 * An estimate — off by a few percent for many people — but measured the same way each time,
 * its *trend* is useful. Returns null when an input is missing or the result is implausible.
 */
export function navyBodyFat({ sex, height, neck, waist, hips }) {
  if (!(height > 0 && neck > 0 && waist > 0)) return null
  let bf
  if (sex === 'female') {
    if (!(hips > 0) || waist + hips - neck <= 0) return null
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(height)) - 450
  } else {
    if (waist - neck <= 0) return null
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450
  }
  return bf > 2 && bf < 70 ? Math.round(bf * 10) / 10 : null
}

/**
 * Body fat for each measurement day that has what the formula needs, oldest first.
 * Uses the latest neck/hips known on or before that day, since those barely move and
 * people rarely re-measure them every time.
 */
export function bodyFatSeries(S, profile) {
  const p = profile || {}
  if (!(p.height > 0)) return []
  const ms = [...(S.measures || [])].sort((a, b) => (a.d < b.d ? -1 : 1))
  let neck = null, hips = null
  const out = []
  for (const m of ms) {
    if (m.neck > 0) neck = m.neck
    if (m.hips > 0) hips = m.hips
    if (!(m.waist > 0)) continue
    const bf = navyBodyFat({ sex: p.sex, height: p.height, neck, waist: m.waist, hips })
    if (bf != null) out.push({ d: m.d, bf })
  }
  return out
}

/** What the formula still needs from you, as measure keys (plus 'height'). */
export function bodyFatNeeds(S, profile) {
  const p = profile || {}
  const need = []
  if (!(p.height > 0)) need.push('height')
  const has = k => (S.measures || []).some(m => m[k] > 0)
  if (!has('waist')) need.push('waist')
  if (!has('neck')) need.push('neck')
  if (p.sex === 'female' && !has('hips')) need.push('hips')
  return need
}

/** Merge one day's measurements (cm) into S. Empty fields leave earlier values alone. */
export function saveMeasures(S, iso, vals) {
  const clean = {}
  for (const { key } of MEASURES) if (vals[key] > 0) clean[key] = vals[key]
  if (!Object.keys(clean).length) return false
  S.measures = S.measures || []
  const ex = S.measures.find(m => m.d === iso)
  if (ex) Object.assign(ex, clean)
  else S.measures.push({ d: iso, ...clean })
  S.measures.sort((a, b) => (a.d < b.d ? -1 : 1))
  return true
}

/** Days since a date (null if none). */
export const daysSince = (iso, today) =>
  iso ? Math.round((new Date(today + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 86400000) : null

import { describe, it, expect } from 'vitest'
import { navyBodyFat, bodyFatSeries, bodyFatNeeds, measureSummary, saveMeasures, toShow, fromShow } from './body.js'

describe('navyBodyFat', () => {
  it('matches the published formula for men', () => {
    // 495 / (1.0324 − 0.19077·log10(47) + 0.15456·log10(178)) − 450 ≈ 16.4
    expect(navyBodyFat({ sex: 'male', height: 178, neck: 38, waist: 85 })).toBeCloseTo(16.4, 1)
  })
  it('matches the published formula for women', () => {
    expect(navyBodyFat({ sex: 'female', height: 165, neck: 32, waist: 72, hips: 98 })).toBeCloseTo(27.4, 1)
  })
  it('a smaller waist reads leaner', () => {
    const a = navyBodyFat({ sex: 'male', height: 178, neck: 38, waist: 90 })
    const b = navyBodyFat({ sex: 'male', height: 178, neck: 38, waist: 84 })
    expect(b).toBeLessThan(a)
  })
  it('refuses missing or impossible inputs', () => {
    expect(navyBodyFat({ sex: 'male', height: 178, neck: 38 })).toBe(null)
    expect(navyBodyFat({ sex: 'female', height: 165, neck: 32, waist: 72 })).toBe(null)
    expect(navyBodyFat({ sex: 'male', height: 178, neck: 40, waist: 39 })).toBe(null)
  })
})

describe('measurements', () => {
  const S = { measures: [] }
  it('merges a day and keeps earlier values when a field is left empty', () => {
    saveMeasures(S, '2026-10-01', { waist: 90, neck: 38, chest: 0 })
    saveMeasures(S, '2026-10-01', { arms: 35 })
    saveMeasures(S, '2026-10-29', { waist: 87.5 })
    expect(S.measures).toEqual([{ d: '2026-10-01', waist: 90, neck: 38, arms: 35 }, { d: '2026-10-29', waist: 87.5 }])
    expect(saveMeasures(S, '2026-10-30', {})).toBe(false)
  })
  it('summarises change since the first entry', () => {
    expect(measureSummary(S, 'waist')).toMatchObject({ v: 87.5, sinceFirst: -2.5, count: 2 })
    expect(measureSummary(S, 'hips')).toBe(null)
  })
  it('carries the last neck forward into later body-fat estimates', () => {
    const bf = bodyFatSeries(S, { sex: 'male', height: 178 })
    expect(bf.map(x => x.d)).toEqual(['2026-10-01', '2026-10-29'])
    expect(bf[1].bf).toBeLessThan(bf[0].bf)
  })
  it('says what is missing for an estimate', () => {
    expect(bodyFatNeeds({ measures: [] }, { sex: 'female' })).toEqual(['height', 'waist', 'neck', 'hips'])
    expect(bodyFatNeeds(S, { sex: 'male', height: 178 })).toEqual([])
  })
  it('stores centimetres and shows inches for a pound profile', () => {
    expect(fromShow(34, 'lb')).toBe(86.4)
    expect(toShow(86.4, 'lb')).toBe(34)
    expect(toShow(86.4, 'kg')).toBe(86.4)
  })
})

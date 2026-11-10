// Apple Health, through the app's own native plugin (ios/App/App/TrainerHealthPlugin.swift).
// Only the iPhone build can reach HealthKit; in the browser and the web build every call here
// is a no-op, and the plugin is imported only behind MOBILE so web bundles never carry it.
import { MOBILE } from './mobile.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { applyHealth } from './trainer.js'
import { coachOf } from './coach.js'
import { t } from './i18n.js'

let plugin = null
async function native() {
  if (!MOBILE) return null
  if (plugin) return plugin
  const { Capacitor, registerPlugin } = await import('@capacitor/core')
  if (Capacitor.getPlatform() !== 'ios') return null
  plugin = registerPlugin('TrainerHealth')
  return plugin
}

/** True in the iPhone app (where HealthKit can be asked). */
export const healthPossible = () => MOBILE && /iPhone|iPad|iPod/.test(navigator.userAgent)

/** Show Apple's permission sheet, then pull today's data. */
export async function connectHealth() {
  const p = await native()
  if (!p) return false
  const { available } = await p.isAvailable()
  if (!available) throw new Error(t('Apple Health isn’t available on this device'))
  await p.requestAuthorization()
  useStore.getState().update(s => { s.coach = { ...coachOf(s), health: true } })
  await syncHealth({ quiet: false })
  return true
}

let busy = false
/** Read today's numbers from Health and fold them in (see applyHealth). */
export async function syncHealth({ quiet = true } = {}) {
  if (busy || !coachOf(useStore.getState().S).health) return
  const p = await native()
  if (!p) return
  busy = true
  try {
    const h = await p.readDay()
    let changed = []
    useStore.getState().update(s => { changed = applyHealth(s, h, { unit: s.unit }) })
    const toast = useUI.getState().toast
    if (changed.includes('walk')) toast(t('Walk from Apple Health logged'))
    else if (!quiet) toast(changed.length ? t('Updated from Apple Health') : t('Nothing new in Apple Health yet'))
  } catch (e) {
    if (!quiet) useUI.getState().toast(t('Couldn’t read Apple Health: {0}', e.message || e))
  } finally { busy = false }
}

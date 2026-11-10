import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// Three places, nothing else: what to do today, the plan, and how it's going. Everything
// deeper (library, history, stats, settings) is reached from inside those.
const TABS = [
  { k: 'today', icon: 'house', label: 'Today', also: ['workout', 'settings'] },
  { k: 'plan', icon: 'calendar', label: 'Plan', also: ['routines', 'library'] },
  { k: 'progress', icon: 'chart', label: 'Progress', also: ['stats', 'history', 'body'] },
]

export default function TabBar() {
  const nav = useNavigate()
  const loc = useLocation()
  const active = useStore(s => !!s.S.active)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  if (!user && !isGuest) return null
  const cur = loc.pathname.split('/')[1] || 'today'
  return (
    <nav id="tabbar" className="t-tabs">
      {TABS.map(x => {
        const on = cur === x.k || x.also.includes(cur)
        return <button key={x.k} className={on ? 'on' : ''} onClick={() => nav(x.k === 'today' && active ? '/workout' : '/' + x.k)}>
          <Icon name={x.k === 'today' && active ? 'timer' : x.icon} /><span>{t(x.label)}</span>
        </button>
      })}
    </nav>
  )
}

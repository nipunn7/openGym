import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { setLang, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { useWakeLock } from './lib/wakelock.js'
import Icon from './components/Icon.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import RestTimer from './components/RestTimer.jsx'
import Login from './views/Login.jsx'
import Plan from './views/Plan.jsx'
import RoutineEdit from './views/RoutineEdit.jsx'
import Workout from './views/Workout.jsx'
import Stats from './views/Stats.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import Settings from './views/Settings.jsx'
import Admin from './views/Admin.jsx'
import Body from './views/Body.jsx'
import TodayView from './views/TodayView.jsx'
import WeekView from './views/WeekView.jsx'
import Progress from './views/Progress.jsx'
import Onboard from './views/Onboard.jsx'

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

// 'auto' follows the phone's light/dark setting (and keeps following it while open).
const darkMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
function applyPrefs(theme, accent) {
  const de = document.documentElement
  const resolved = theme === 'light' || theme === 'dark' ? theme : (darkMQ && !darkMQ.matches ? 'light' : 'dark')
  de.dataset.theme = resolved
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f2f2f7' : '#000000'
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, user, ready } = useStore()
  const isGuest = useStore(s => s.isGuest())
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => {
    applyPrefs(S.theme, S.accent)
    if (!darkMQ) return
    const on = () => applyPrefs(S.theme, S.accent)
    darkMQ.addEventListener('change', on)
    return () => darkMQ.removeEventListener('change', on)
  }, [S.theme, S.accent])
  // One-time move to the redesign's default: follow the phone. A choice made after that sticks.
  useEffect(() => { if (S.themeV !== 2) useStore.getState().update(s => { s.theme = 'auto'; s.themeV = 2 }) }, [S.themeV])
  useEffect(() => { setLang(S.lang || 'en') }, [S.lang])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(!!S.active && S.keepAwake !== false)

  const authed = user || isGuest
  if (!ready && !authed) return (
    <div id="app">
      <div style={{ paddingTop: '44vh', display: 'flex', justifyContent: 'center', fontSize: 34, color: 'var(--label-3)' }}>
        <Icon name="dumbbell" />
      </div>
    </div>
  )

  return (
    <>
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out */}
      <div id="app" className="vfade" key={loc.pathname}>
        <ErrorBoundary>
          {!authed ? <Login /> : (
            <Routes>
              <Route path="/today" element={<TodayView />} />
              <Route path="/home" element={<Navigate to="/today" replace />} />
              <Route path="/coach" element={<Navigate to="/today" replace />} />
              <Route path="/setup" element={<Onboard />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/routines" element={<Plan />} />
              <Route path="/body" element={<Body />} />
              <Route path="/plan" element={<WeekView />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={user?.admin ? <Admin /> : <Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </div>
      {loc.pathname !== '/setup' && <TabBar />}
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  return <HashRouter><Shell /></HashRouter>
}

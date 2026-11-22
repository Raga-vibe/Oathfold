import { useEffect, useState } from 'react'
import { brandCopy } from './brand'
import { loadDemoRecords, loadLiveRecords } from './lib/store'
import { verifyHub, type HubVerification } from './lib/chain/xlayer'
import type { OathRecord } from './lib/records'
import type { WalletState } from './lib/wallet'
import { connectWallet, switchToXLayer } from './lib/wallet'
import {
  transitionWallet,
  transitionRoute,
  deriveWalletState,
  deriveHubState,
  hubStateLabel,
  walletPhaseLabel,
  type RouteMachineState,
  type WalletFlight,
  type WalletPhase,
} from './lib/machines'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Create from './pages/Create'
import RecordDetail from './pages/RecordDetail'
import Review from './pages/Review'
import Live from './pages/Live'
import Trust from './pages/Trust'
import Onboarding from './pages/Onboarding'
import { HUB_STATE_PLAIN } from './lib/plain'

export type Route =
  | { name: 'landing' }
  | { name: 'dashboard' }
  | { name: 'create' }
  | { name: 'record'; id: string }
  | { name: 'review' }
  | { name: 'live' }
  | { name: 'trust' }
  | { name: 'onboarding' }

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '')
  if (h.startsWith('/record/')) return { name: 'record', id: decodeURIComponent(h.slice('/record/'.length)) }
  if (h === '/dashboard' || h === 'dashboard') return { name: 'dashboard' }
  if (h === '/create' || h === 'create') return { name: 'create' }
  if (h === '/review' || h === 'review') return { name: 'review' }
  if (h === '/live' || h === 'live') return { name: 'live' }
  if (h === '/trust' || h === 'trust') return { name: 'trust' }
  if (h === '/onboarding' || h === 'onboarding') return { name: 'onboarding' }
  return { name: 'landing' }
}

export function routeHref(route: string): string {
  return `#${route}`
}

/** The Route union from a route machine state. Exhaustive, so a new route
 * name fails the build here instead of rendering nothing. */
export function routeFromMachine(s: RouteMachineState): Route {
  if (s.route === 'record' && s.recordId) return { name: 'record', id: s.recordId }
  switch (s.route) {
    case 'landing': return { name: 'landing' }
    case 'dashboard': return { name: 'dashboard' }
    case 'create': return { name: 'create' }
    case 'review': return { name: 'review' }
    case 'live': return { name: 'live' }
    case 'trust': return { name: 'trust' }
    case 'onboarding': return { name: 'onboarding' }
    default: return { name: 'landing' }
  }
}

export interface AppState {
  demoRecords: OathRecord[]
  setDemoRecords: (r: OathRecord[]) => void
  liveRecords: OathRecord[]
  setLiveRecords: (r: OathRecord[]) => void
  liveMeta: { fromBlock: string; toBlock: string; safeBlock: string | null; scannedAt: number; chunks: number; discarded: { reason: string; count: number }[] } | null
  setLiveMeta: (m: AppState['liveMeta']) => void
  hub: HubVerification | null
  wallet: WalletState
  setWallet: (w: WalletState) => void
  connect: () => Promise<WalletState>
}

const NAV: { href: string; label: string; route: Route['name'] }[] = [
  { href: '#/dashboard', label: 'Promises', route: 'dashboard' },
  { href: '#/create', label: 'Make a promise', route: 'create' },
  { href: '#/review', label: 'Judge', route: 'review' },
  { href: '#/live', label: 'Advanced', route: 'live' },
]

export default function App() {
  // Route + mobile menu are one machine (src/lib/machines.ts): navigation
  // and the menu move together, and an unknown hash lands on landing by a
  // named rule instead of silently.
  const [routeState, setRouteState] = useState<RouteMachineState>(() => {
    const r = parseHash(window.location.hash)
    return { route: r.name, recordId: r.name === 'record' ? r.id : null, menu: 'closed' }
  })
  const route = routeFromMachine(routeState)
  const [demoRecords, setDemoRecords] = useState<OathRecord[]>(() => loadDemoRecords())
  const [liveState, setLiveState] = useState(() => loadLiveRecords())
  const [liveMeta, setLiveMeta] = useState<AppState['liveMeta']>(liveState.meta)
  const [hub, setHub] = useState<HubVerification | null>(null)
  const [wallet, setWallet] = useState<WalletState>({ address: null, chainId: null, connected: false })
  const [walletFlight, setWalletFlight] = useState<WalletFlight>('idle')

  // Wallet phase is a named machine state, derived from the stored wallet
  // plus the in-flight action (src/lib/machines.ts). The Connect button is
  // disabled while a connect or switch is in flight.
  const walletPhase: WalletPhase = deriveWalletState(wallet, walletFlight)

  useEffect(() => {
    const onHash = () => setRouteState((s) => {
      const h = window.location.hash.replace(/^#/, '')
      const known = h === '' || h === '/' || h.startsWith('/record/') ||
        ['/dashboard', 'dashboard', '/create', 'create', '/review', 'review', '/live', 'live', '/trust', 'trust', '/onboarding', 'onboarding'].includes(h)
      const parsed = parseHash(window.location.hash)
      const r = known
        ? transitionRoute(s, { type: 'navigate', route: parsed.name, recordId: parsed.name === 'record' ? parsed.id : undefined })
        : transitionRoute(s, { type: 'unknown-hash' })
      return r.ok ? r.state : s
    })
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let cancelled = false
    verifyHub().then((v) => {
      if (!cancelled) setHub(v)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const connect = async (): Promise<WalletState> => {
    const start = transitionWallet(walletPhase, { type: 'connect-start' })
    if (!start.ok) return wallet
    setWalletFlight('connecting')
    const w = await connectWallet()
    setWallet(w)
    if (!w.connected || !w.address) {
      transitionWallet('connecting', { type: 'connect-fail', error: w.error ?? 'connect failed' })
      setWalletFlight('idle')
      return w
    }
    const connected = transitionWallet('connecting', { type: 'connect-ok', chainId: w.chainId ?? 0 })
    if (connected.state === 'ready') {
      setWalletFlight('idle')
      return w
    }
    // Wrong chain: switch, guarded by the machine.
    const swStart = transitionWallet('connected-wrong-chain', { type: 'switch-start' })
    if (!swStart.ok) {
      setWalletFlight('idle')
      return w
    }
    setWalletFlight('switching')
    const sw = await switchToXLayer()
    if (!sw.ok) {
      transitionWallet('switching', { type: 'switch-fail', error: sw.error ?? 'switch failed' })
      const withErr = { ...w, error: sw.error }
      setWallet(withErr)
      setWalletFlight('idle')
      return withErr
    }
    transitionWallet('switching', { type: 'switch-ok' })
    const switched = { ...w, chainId: 196, error: undefined }
    setWallet(switched)
    setWalletFlight('idle')
    return switched
  }

  const state: AppState = {
    demoRecords,
    setDemoRecords,
    liveRecords: liveState.records,
    setLiveRecords: (r) => setLiveState((s) => ({ ...s, records: r })),
    liveMeta,
    setLiveMeta,
    hub,
    wallet,
    setWallet,
    connect,
  }

  const allRecords = [...liveState.records, ...demoRecords]
  const hubState = deriveHubState(hub, false)
  const menuOpen = routeState.menu === 'open'
  const toggleMenu = () => setRouteState((s) => {
    const r = transitionRoute(s, { type: 'toggle-menu' })
    return r.ok ? r.state : s
  })
  const closeMenu = () => setRouteState((s) => {
    const r = transitionRoute(s, { type: 'close-menu' })
    return r.ok ? r.state : s
  })
  const walletBusy = walletPhase === 'connecting' || walletPhase === 'switching'
  // One calm line for the record book, plus the block it was read at when the
  // check succeeded. A mismatch is not shouted here; Advanced explains it.
  const hubLine = HUB_STATE_PLAIN[hubState] ?? hubStateLabel(hubState)
  const hubBlock = (hubState === 'verified-sealed' || hubState === 'verified-unsealed') &&
    hub?.blockNumber != null && hub.blockNumber > 0
    ? ` · block ${hub.blockNumber}`
    : ''

  return (
    <div>
      <header className="topbar">
        <div className="topbar__inner">
          <a className="brand" href="#/">
            <span className="brand-seal" aria-hidden="true" />
            Oathfold
          </a>
          <button
            className="menu-btn"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={toggleMenu}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
          <nav id="main-nav" className={`nav${menuOpen ? ' open' : ''}`} aria-label="Main">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className={route.name === n.route ? 'active' : ''}
                onClick={closeMenu}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="walletbar">
            {walletPhase === 'ready' && wallet.address ? (
              <span className="small mono">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)} (X Layer)
              </span>
            ) : (
              <span className="small">{walletPhaseLabel(walletPhase)}</span>
            )}
            <a className="btn small header-cta" href="#/create">Make a promise</a>
            <button className="btn ghost small" type="button" onClick={connect} disabled={walletBusy}>
              {walletBusy ? walletPhaseLabel(walletPhase) : wallet.connected ? 'Reconnect wallet' : 'Connect wallet'}
            </button>
          </div>
        </div>
      </header>

      <div className="status-strip">
        <div className="status-strip__inner" aria-live="polite">
          <b>X Layer 196</b> · {hubLine}
          {hubBlock} ·{' '}
          {walletPhase === 'ready' && wallet.address
            ? `Wallet ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
            : walletPhaseLabel(walletPhase)}{' '}
          · <a href="#/live">Advanced</a>
        </div>
      </div>

      <main className="wrap">
        {route.name === 'landing' && <Landing state={state} />}
        {route.name === 'dashboard' && <Dashboard records={allRecords} />}
        {route.name === 'create' && <Create state={state} />}
        {route.name === 'record' && <RecordDetail id={route.id} records={allRecords} />}
        {route.name === 'review' && <Review records={allRecords} />}
        {route.name === 'live' && <Live state={state} />}
        {route.name === 'trust' && <Trust />}
        {route.name === 'onboarding' && <Onboarding state={state} />}
        <footer className="footer">
          <p>
            {brandCopy.footerIntro}{' '}
            <a href="#/live">Advanced</a> · <a href="#/trust">Trust and limits</a>
          </p>
        </footer>
      </main>
    </div>
  )
}

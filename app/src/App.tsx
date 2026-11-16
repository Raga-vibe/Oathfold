import { useEffect, useState } from 'react'
import { brandCopy } from './brand'
import { loadDemoRecords, loadLiveRecords } from './lib/store'
import { verifyHub, type HubVerification } from './lib/chain/xlayer'
import type { OathRecord } from './lib/records'
import type { WalletState } from './lib/wallet'
import { connectWallet, switchToXLayer } from './lib/wallet'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Create from './pages/Create'
import RecordDetail from './pages/RecordDetail'
import Review from './pages/Review'
import Live from './pages/Live'
import Trust from './pages/Trust'

export type Route =
  | { name: 'landing' }
  | { name: 'dashboard' }
  | { name: 'create' }
  | { name: 'record'; id: string }
  | { name: 'review' }
  | { name: 'live' }
  | { name: 'trust' }

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '')
  if (h.startsWith('/record/')) return { name: 'record', id: decodeURIComponent(h.slice('/record/'.length)) }
  if (h === '/dashboard' || h === 'dashboard') return { name: 'dashboard' }
  if (h === '/create' || h === 'create') return { name: 'create' }
  if (h === '/review' || h === 'review') return { name: 'review' }
  if (h === '/live' || h === 'live') return { name: 'live' }
  if (h === '/trust' || h === 'trust') return { name: 'trust' }
  return { name: 'landing' }
}

export function routeHref(route: string): string {
  return `#${route}`
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
  { href: '#/', label: 'Home', route: 'landing' },
  { href: '#/dashboard', label: 'Dashboard', route: 'dashboard' },
  { href: '#/create', label: 'Create', route: 'create' },
  { href: '#/review', label: 'Review', route: 'review' },
  { href: '#/live', label: 'Live chain', route: 'live' },
  { href: '#/trust', label: 'Trust', route: 'trust' },
]

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [menuOpen, setMenuOpen] = useState(false)
  const [demoRecords, setDemoRecords] = useState<OathRecord[]>(() => loadDemoRecords())
  const [liveState, setLiveState] = useState(() => loadLiveRecords())
  const [liveMeta, setLiveMeta] = useState<AppState['liveMeta']>(liveState.meta)
  const [hub, setHub] = useState<HubVerification | null>(null)
  const [wallet, setWallet] = useState<WalletState>({ address: null, chainId: null, connected: false })

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
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
    const w = await connectWallet()
    setWallet(w)
    if (w.connected && w.chainId !== 196) {
      const sw = await switchToXLayer()
      if (!sw.ok) {
        const withErr = { ...w, error: sw.error }
        setWallet(withErr)
        return withErr
      }
      const switched = { ...w, chainId: 196, error: undefined }
      setWallet(switched)
      return switched
    }
    return w
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
  const hubState = hub === null ? 'Hub check pending' : hub.isSealed ? 'Hub sealed' : 'Hub not sealed'

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
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
          <nav id="main-nav" className={`nav${menuOpen ? ' open' : ''}`} aria-label="Main">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className={route.name === n.route ? 'active' : ''}
                onClick={() => setMenuOpen(false)}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="walletbar">
            {wallet.connected && wallet.address ? (
              <span className="small mono">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                {wallet.chainId === 196 ? ' (X Layer)' : ` (chain ${wallet.chainId}, not X Layer)`}
              </span>
            ) : (
              <span className="small">Wallet not connected</span>
            )}
            <button className="btn secondary small" type="button" onClick={connect}>
              {wallet.connected ? 'Reconnect wallet' : 'Connect wallet'}
            </button>
          </div>
        </div>
      </header>

      <div className="status-strip">
        <div className="status-strip__inner">
          <b>X Layer 196</b> · {hubState} ·{' '}
          {wallet.connected && wallet.address
            ? `Wallet ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
            : 'No wallet'}{' '}
          · <a href="#/live">Live chain</a>
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
        <footer className="footer">
          <p>
            {brandCopy.footerIntro} Hub <span className="mono">0xe61A...25ee</span> on X Layer (196).
          </p>
        </footer>
      </main>
    </div>
  )
}

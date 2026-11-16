import { useEffect, useState } from 'react'
import { BRAND, brandCopy } from './brand'
import { loadDemoRecords, loadLiveRecords } from './lib/store'
import { verifyHub, type HubVerification } from './lib/chain/xlayer'
import type { OathRecord } from './lib/records'
import type { WalletState } from './lib/wallet'
import { connectWallet, hasWallet, switchToXLayer } from './lib/wallet'
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

  return (
    <div>
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true" />
          Oath<span>fold</span>
        </a>
        <span className="brand-tagline">{BRAND.tagline}</span>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={route.name === n.route ? 'active' : ''}>
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
      </header>

      {hub && hub.isSealed === false && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <div className="callout" role="alert">
            <strong>Warning: the X Layer hub is not sealed.</strong> The hub owner can still
            replace the hub implementation, which could change identity checks. Oathfold shows
            this on every page until the hub is sealed. Hub owner:{' '}
            <span className="mono">{hub.owner}</span>. See the Live chain page for the full check.
          </div>
        </div>
      )}
      {!hasWallet() && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <div className="callout info">
            No EIP-1193 wallet was detected in this browser. You can still explore the demo
            records and the live chain data. A wallet is only needed to publish a key or send
            a live commitment.
          </div>
        </div>
      )}

      <main className="wrap">
        {route.name === 'landing' && <Landing state={state} />}
        {route.name === 'dashboard' && <Dashboard records={allRecords} />}
        {route.name === 'create' && <Create state={state} />}
        {route.name === 'record' && <RecordDetail id={route.id} records={allRecords} />}
        {route.name === 'review' && <Review records={allRecords} />}
        {route.name === 'live' && <Live state={state} />}
        {route.name === 'trust' && <Trust />}
        <footer className="footer">
          <p>{brandCopy.footerIntro}</p>
          <p>
            {brandCopy.footerAttribution} Hub:{' '}
            <span className="mono">0xe61A9C7213a6Aa616C246a2B569e555B417b25ee</span> on
            X Layer (chain 196).
          </p>
        </footer>
      </main>
    </div>
  )
}

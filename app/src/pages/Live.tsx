import { useRef, useState } from 'react'
import type { AppState } from '../App'
import { Callout, Kv, Copy } from '../components/ui'
import {
  verifyHub,
  resolveEndpoint,
  keyFor,
  inboxCount,
  outboxCount,
  HUB_ADDRESS,
  HUB_IMPLEMENTATION_XLAYER,
  HUB_OWNER,
  FACTORY_ADDRESS,
  XLAYER_CHAIN_ID,
  formatTime,
} from '../lib/chain/xlayer'
import { scanSentLogs, buildRecords, latestBlockNumber } from '../lib/indexer'
import { saveLiveRecords, clearLiveCache } from '../lib/store'
import type { EndpointResolution } from '../lib/chain/xlayer'
import {
  transitionScan,
  transitionHub,
  transitionLookup,
  deriveHubState,
  deriveLiveCacheState,
  hubStateLabel,
  scanProgressLabel,
  type ScanState,
  type ScanContext,
  type LookupState,
  type LookupReport,
} from '../lib/machines'

export default function Live({ state }: { state: AppState }) {
  const [hub, setHub] = useState(state.hub)
  const [hubBusy, setHubBusy] = useState(false)
  const [lookupInput, setLookupInput] = useState('')
  const [lookup, setLookup] = useState<EndpointResolution | null>(null)
  const [lookupState, setLookupState] = useState<LookupState>('idle')
  const [lookupKey, setLookupKey] = useState<Awaited<ReturnType<typeof keyFor>> | null>(null)
  const [lookupInbox, setLookupInbox] = useState<string | null>(null)
  const [lookupOutbox, setLookupOutbox] = useState<string | null>(null)
  const [scanRange, setScanRange] = useState('2000')
  // Scan, hub and lookup are named machines (src/lib/machines.ts). Busy flags
  // and progress strings are derived from the state, never stored separately.
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanCtx, setScanCtx] = useState<ScanContext>({ done: 0, total: 0, chunks: 0 })
  const [scanLog, setScanLog] = useState<string[]>([])

  // The local hub copy starts from App state; App's mount-time check may
  // land after this page mounts, so fall back to the App value until the
  // local re-check replaces it. One hub state, two readers, no divergence.
  const shownHub = hub ?? state.hub
  const hubState = deriveHubState(shownHub, hubBusy)
  const cacheState = deriveLiveCacheState(state.liveMeta)
  const scanBusy = scanState === 'scanning' || scanState === 'verifying'
  const lookupBusy = lookupState === 'looking'

  function goScan(event: Parameters<typeof transitionScan>[1]) {
    const r = transitionScan(scanStateRef.current, event)
    if (r.ok) {
      scanStateRef.current = r.state
      setScanState(r.state)
    }
    return r.ok
  }
  const scanStateRef = useRef<ScanState>('idle')

  async function recheckHub() {
    const start = transitionHub(hubState, { type: 'check-start' })
    if (!start.ok) return
    setHubBusy(true)
    try {
      const v = await verifyHub()
      setHub(v)
      const done = transitionHub('checking', { type: 'checked', verification: v })
      if (done.ok) setHub(v)
    } catch {
      transitionHub('checking', { type: 'check-fail' })
    }
    setHubBusy(false)
  }

  async function doLookup() {
    const start = transitionLookup(lookupState, { type: 'lookup-start' })
    if (!start.ok) return
    setLookupState('looking')
    setLookup(null)
    setLookupKey(null)
    setLookupInbox(null)
    setLookupOutbox(null)
    const report: LookupReport = { keyOk: false, inboxOk: false, outboxOk: false }
    let failed = false
    try {
      const res = await resolveEndpoint(lookupInput)
      setLookup(res)
      if (res.circuits && res.tokenId !== undefined) {
        try {
          const k = await keyFor(res.circuits, res.tokenId)
          setLookupKey(k)
          report.keyOk = true
        } catch {
          setLookupKey(null)
        }
      }
      if (res.endpoint) {
        try {
          const c = await inboxCount(res.endpoint as `0x${string}`)
          setLookupInbox(c.toString())
          report.inboxOk = true
        } catch {
          setLookupInbox('read failed')
        }
      }
      if (res.container) {
        try {
          const c = await outboxCount(res.container)
          setLookupOutbox(c.toString())
          report.outboxOk = true
        } catch {
          setLookupOutbox('read failed')
        }
      }
    } catch {
      failed = true
    }
    if (failed) {
      const r = transitionLookup('looking', { type: 'lookup-fail' })
      if (r.ok) setLookupState(r.state)
    } else {
      const r = transitionLookup('looking', { type: 'lookup-done', report })
      if (r.ok) setLookupState(r.state)
    }
  }

  async function runScan() {
    if (!goScan({ type: 'start' })) return
    setScanLog([])
    setScanCtx({ done: 0, total: 0, chunks: 0 })
    const add = (s: string) => setScanLog((l) => [...l, s])
    try {
      const latestNum = await latestBlockNumber()
      const range = Math.max(100, Math.min(100000, Number(scanRange) || 2000))
      const from = latestNum - BigInt(range) + 1n
      add(`Latest block ${latestNum}. Scanning ${from} to ${latestNum} (${range} blocks) in 100-block chunks.`)
      const result = await scanSentLogs({
        fromBlock: from,
        toBlock: latestNum,
        onProgress: (done, total) => {
          setScanCtx((c) => ({ ...c, done, total }))
          goScan({ type: 'progress', done, total })
        },
      })
      add(`Chunks: ${result.chunks}. Raw Sent logs in range: ${result.messages.length}. Safe block: ${result.safeBlock?.toString() ?? 'unknown'}.`)
      setScanCtx((c) => ({ ...c, chunks: result.chunks }))
      goScan({ type: 'verified', chunks: result.chunks })
      const now = result.safeTimestamp ?? Math.floor(Date.now() / 1000)
      const { records, discarded } = await buildRecords(result.messages, result.safeBlock, now)
      add(`Verified TAP-12 records: ${records.length}.`)
      for (const d of discarded) add(`Discarded: ${d.count} x ${d.reason}`)
      const meta = {
        fromBlock: from.toString(),
        toBlock: latestNum.toString(),
        safeBlock: result.safeBlock?.toString() ?? null,
        scannedAt: Math.floor(Date.now() / 1000),
        chunks: result.chunks,
        discarded,
      }
      saveLiveRecords(records, meta)
      state.setLiveRecords(records)
      state.setLiveMeta(meta)
      add('Saved to the live cache. Open the dashboard to see the records.')
      goScan({ type: 'complete' })
    } catch (e: any) {
      add(`Scan failed: ${e?.shortMessage ?? e?.message ?? String(e)}`)
      goScan({ type: 'fail' })
    }
  }

  return (
    <div>
      <h1>Live chain: X Layer</h1>
      <p>
        Direct reads against the X Layer hub. No indexer is trusted: every record is verified
        against inboxAt and its digest, and only messages at or below the safe block count.
      </p>

      <h2>Hub verification</h2>
      <div className="card">
        <p className="small">State: {hubStateLabel(hubState)}</p>
        {hubState === 'error' && (
          <Callout kind="bad">
            Hub check failed{shownHub?.error ? `: ${shownHub.error}` : ''}. Try re-checking.
          </Callout>
        )}
        {hubState === 'mismatch' && (
          <Callout kind="bad">
            The hub implementation does not match the pinned value. Do not trust records until this is resolved.
          </Callout>
        )}
        {shownHub && (hubState === 'verified-sealed' || hubState === 'verified-unsealed') && (
          <div>
            <Kv rows={[
              ['Chain', `X Layer (${shownHub.chainId})`],
              ['Hub (proxy)', HUB_ADDRESS],
              ['Latest block', shownHub.blockNumber?.toString() ?? 'unknown'],
              ['Safe block', shownHub.safeBlockNumber?.toString() ?? 'unknown'],
              ['Safe block time', shownHub.safeBlockTimestamp ? formatTime(shownHub.safeBlockTimestamp) : 'unknown'],
              ['Implementation (ERC-1967 slot)', shownHub.implementation ?? 'could not read'],
              ['Expected implementation', HUB_IMPLEMENTATION_XLAYER],
              ['Implementation match', shownHub.implementationMatches === null ? 'unknown' : shownHub.implementationMatches ? 'YES' : 'NO'],
              ['isSealed()', shownHub.isSealed === null ? 'unknown' : shownHub.isSealed ? 'true' : 'false'],
              ['Owner', shownHub.owner ?? 'unknown'],
              ['Expected owner', HUB_OWNER],
            ]} />
            {shownHub.error && <p className="field-error">Read error: {shownHub.error}</p>}
            {shownHub.isSealed === false && (
              <Callout>
                <strong>Warning: the hub is NOT sealed.</strong> The owner can still replace the
                hub implementation. Records inherit the trust assumptions in TAP-10 section 13.8
                until the factory and hub seals are in effect.
              </Callout>
            )}
            {shownHub.implementationMatches && shownHub.isSealed && (
              <Callout kind="ok">Implementation matches the pinned value and the hub is sealed.</Callout>
            )}
          </div>
        )}
        {(hubState === 'checking' || hubState === 'unknown') && <p>Reading the hub...</p>}
        <p>
          <button className="btn secondary small" type="button" onClick={recheckHub} disabled={hubBusy}>
            {hubBusy ? 'Checking...' : 'Re-check hub now'}
          </button>
        </p>
      </div>

      <h2>Sent log scan</h2>
      <div className="card">
        <p>
          Scans hub Sent logs over a recent range, in 100-block chunks. Only SCV1 refs are kept,
          and each is verified against inboxAt before it becomes a record.
        </p>
        <label htmlFor="range">Range (blocks, most recent)</label>
        <input id="range" inputMode="numeric" value={scanRange} onChange={(e) => setScanRange(e.target.value)} />
        <p style={{ marginTop: 10 }}>
          <button className="btn" type="button" onClick={runScan} disabled={scanBusy}>
            {scanBusy ? 'Scanning...' : 'Scan now'}
          </button>{' '}
          <button className="btn secondary" type="button" onClick={() => { clearLiveCache(); state.setLiveRecords([]); state.setLiveMeta(null); setScanLog(['Live cache cleared.']) }}>
            Clear live cache
          </button>
        </p>
        <p className="small">
          Scan: {scanState}
          {scanState === 'scanning' ? ` — ${scanProgressLabel(scanCtx)}` : ''}
          {scanState === 'done' ? ` — ${scanCtx.chunks} chunks` : ''}
        </p>
        {scanLog.length > 0 && (
          <ol>{scanLog.map((s, i) => <li key={i} className="small mono">{s}</li>)}</ol>
        )}
        {cacheState === 'cached' && state.liveMeta && (
          <div style={{ marginTop: 12 }}>
            <h3>Last scan</h3>
            <Kv rows={[
              ['Range', `${state.liveMeta.fromBlock} to ${state.liveMeta.toBlock}`],
              ['Safe block', state.liveMeta.safeBlock ?? 'unknown'],
              ['Scanned at', formatTime(state.liveMeta.scannedAt)],
              ['Chunks', String(state.liveMeta.chunks)],
              ['Live records found', String(state.liveRecords.length)],
            ]} />
            <p><a href="#/dashboard">View live records on the dashboard</a></p>
          </div>
        )}
      </div>

      <h2>Endpoint and key lookup</h2>
      <div className="card">
        <p>
          Look up any X Layer endpoint, e.g. <span className="mono">#1@2.344</span> or{' '}
          <span className="mono">#168@2.1</span>, and read its hub key record.
        </p>
        <label htmlFor="lookup">Endpoint name</label>
        <input
          id="lookup"
          className="mono"
          value={lookupInput}
          onChange={(e) => setLookupInput(e.target.value)}
          placeholder="#1@2.344"
        />
        <p style={{ marginTop: 10 }}>
          <button className="btn" type="button" onClick={doLookup} disabled={lookupBusy || !lookupInput.trim()}>
            {lookupBusy ? 'Looking up...' : 'Look up'}
          </button>
        </p>
        {lookupState !== 'idle' && (
          <p className="small">
            Lookup: {lookupState}
            {lookupState === 'partial' ? ' — some reads failed, see below' : ''}
          </p>
        )}
        {lookup && (
          <div>
            <Kv rows={[
              ['Status', `${lookup.status}${lookup.error ? `: ${lookup.error}` : ''}`],
              ['Label', lookup.label ?? '-'],
              ['Processor contract', lookup.circuits ?? '-'],
              ['Container', lookup.container ?? '-'],
              ['Holder', lookup.holder ?? '-'],
              ['Opened (paid)', lookup.opened === undefined ? '-' : String(lookup.opened)],
              ['Paid (payments.paid)', lookup.paid === undefined ? 'could not read' : String(lookup.paid)],
              ['Endpoint id', lookup.endpoint ?? '-'],
              ['Inbox count', lookupInbox ?? '-'],
              ['Outbox count', lookupOutbox ?? '-'],
            ]} />
            {lookupKey && (
              <div style={{ marginTop: 12 }}>
                <h3>hub keyFor</h3>
                <Kv rows={[
                  ['Usable', String(lookupKey.usable)],
                  ['Suite', String(lookupKey.suite)],
                  ['Key index', String(lookupKey.keyIndex)],
                  ['Key', lookupKey.usable ? lookupKey.key : '(not returned when unusable)'],
                  ['Current holder', lookupKey.current],
                  ['Version', String(lookupKey.version)],
                  ['Chains bitmap', lookupKey.chains.toString()],
                ]} />
                {!lookupKey.usable && (
                  <Callout>
                    No usable key. A sealed message cannot be built for this endpoint until its
                    holder publishes a key.
                  </Callout>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <h2>Known factory state (verified 2026-11-16)</h2>
      <div className="card">
        <Kv rows={[
          ['Factory', FACTORY_ADDRESS],
          ['Chain', `X Layer (${XLAYER_CHAIN_ID})`],
          ['Processor 1', '0x0565EA48CA41Ae559d8d491dbb0a9ec945DB551b'],
          ['Processor 168', '0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282'],
        ]} />
        <p className="small">
          Processor 1 tokens #1 to #12 were all held by{' '}
          <span className="mono">0xa2e4592ebbd0a08cf49dc306358b064587ab3362</span>, opened=false,
          usable=false. No usable X Layer endpoint was found in that sample. That is the live
          send blocker: a founder-owned opened container with a published TapeSend key does not
          exist yet. Re-check with the lookup above before assuming it still holds.
        </p>
        <p><Copy text={FACTORY_ADDRESS} label="Copy factory address" /></p>
      </div>
    </div>
  )
}

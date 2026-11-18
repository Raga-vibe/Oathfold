// Container onboarding (Commit 1): walk a holder through the exact steps in
// docs/container-onboarding.md. Connect the wallet, resolve the account name,
// check it is opened, check hub keyFor is usable, derive the TapeSend key from
// a wallet signature, and publish it. Every read reuses src/lib/chain/xlayer.ts
// (resolveEndpoint / keyFor); every derive or publish reuses src/lib/wallet.ts
// (deriveAuthorKey / buildPublishKeyCalldata). No new crypto, and no change to
// the live send flow in Create.tsx.
//
// This page never seals or sends a commitment. Publishing a key is a key-setup
// transaction, and the copy says so; nothing here claims a promise was sent.
import { useRef, useState } from 'react'
import type { AppState } from '../App'
import { Callout, Kv } from '../components/ui'
import {
  resolveEndpoint,
  primaryClient,
  shortAddress,
  type EndpointResolution,
} from '../lib/chain/xlayer'
import {
  deriveAuthorKey,
  buildPublishKeyCalldata,
  sendTransaction,
  xlayerExplorerTx,
} from '../lib/wallet'
import {
  deriveWalletState,
  transitionOnboarding,
  onboardingIsBusy,
  deriveOnboardingSteps,
  onboardingResolveBlocker,
  type OnboardingEvent,
  type OnboardingState,
  type OnboardingStepStatus,
} from '../lib/machines'

interface LogLine {
  time: string
  text: string
  ok: boolean
}

function StepBadge({ status }: { status: OnboardingStepStatus }) {
  const text = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'WAIT'
  return (
    <span className="badge">
      <span className="dot" aria-hidden="true" />
      {text}
    </span>
  )
}

export default function Onboarding({ state }: { state: AppState }) {
  const [endpointInput, setEndpointInput] = useState('')
  const [resolution, setResolution] = useState<EndpointResolution | null>(null)
  const [flow, setFlow] = useState<OnboardingState>('idle')
  const flowRef = useRef<OnboardingState>('idle')
  const [blocker, setBlocker] = useState('')
  const [keyMatches, setKeyMatches] = useState<boolean | null>(null)
  const [derivedHex, setDerivedHex] = useState<string | null>(null)
  const [published, setPublished] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [logs, setLogs] = useState<LogLine[]>([])

  const busy = onboardingIsBusy(flow)
  const walletPhase = deriveWalletState(state.wallet, 'idle')
  const walletReady =
    state.wallet.connected && !!state.wallet.address && state.wallet.chainId === 196

  const steps = deriveOnboardingSteps({ wallet: walletPhase, resolution, keyMatches, published })

  function go(event: OnboardingEvent): boolean {
    const r = transitionOnboarding(flowRef.current, event)
    if (r.ok) {
      flowRef.current = r.state
      setFlow(r.state)
    }
    return r.ok
  }

  const log = (text: string, ok = true) =>
    setLogs((l) => [...l, { time: new Date().toISOString().slice(11, 19), text, ok }])

  function block(reason: string) {
    setBlocker(reason)
    go({ type: 'block', reason })
    log(`Blocked: ${reason}`, false)
  }

  async function connect() {
    if (!go({ type: 'connect-start' })) return
    log('Connecting wallet…')
    const w = await state.connect()
    if (!w.connected || !w.address) {
      block(w.error ?? 'The wallet is not connected. Connect it and try again.')
      return
    }
    if (w.chainId !== 196) {
      block(`The wallet is on chain ${w.chainId}, not X Layer (196). Switch networks in the wallet and try again.`)
      return
    }
    go({ type: 'connect-done' })
    log(`Wallet connected: ${shortAddress(w.address)} on X Layer.`)
  }

  async function resolve() {
    const input = endpointInput.trim()
    if (!input) {
      block('Enter your account name first, for example #1@2.344.')
      return
    }
    if (!go({ type: 'resolve-start' })) return
    setBlocker('')
    setResolution(null)
    setKeyMatches(null)
    setDerivedHex(null)
    setPublished(false)
    setTxHash('')
    log(`Resolving ${input}…`)
    const res = await resolveEndpoint(input)
    setResolution(res)
    const hard = onboardingResolveBlocker(res)
    if (hard) {
      block(hard)
      return
    }
    if (state.wallet.address && res.holder && res.holder.toLowerCase() !== state.wallet.address.toLowerCase()) {
      block(`This account belongs to ${res.holder}, not the connected wallet ${state.wallet.address}. Connect the holder wallet to set up this account.`)
      return
    }
    go({ type: 'resolve-done' })
    log(
      `${res.label ?? res.input} is opened.${res.key?.usable ? ' It has a usable TapeSend key.' : ' It has no usable TapeSend key yet.'}`,
    )
  }

  async function derive() {
    if (!resolution || resolution.status !== 'ok') {
      block('Find your account first, and make sure it is opened.')
      return
    }
    if (!state.wallet.address) {
      block('Connect your wallet first. Your TapeSend key is derived from your wallet signature.')
      return
    }
    if (resolution.holder && resolution.holder.toLowerCase() !== state.wallet.address.toLowerCase()) {
      block(`This account belongs to ${resolution.holder}, not the connected wallet ${state.wallet.address}.`)
      return
    }
    if (!go({ type: 'derive-start' })) return
    log('Asking the wallet to sign the key text. The private key never leaves the wallet.')
    try {
      const derived = await deriveAuthorKey({
        holder: state.wallet.address,
        tokenId: resolution.tokenId!,
        cpu: resolution.cpu!,
        container: resolution.container!,
        keyIndex: resolution.key?.keyIndex ?? 0,
      })
      const derivedNorm = derived.publicKeyHex.toLowerCase()
      setDerivedHex(derivedNorm)
      const onFile = resolution.key && resolution.key.usable ? resolution.key.key.toLowerCase() : null
      const matches = onFile ? derivedNorm === onFile : false
      setKeyMatches(matches)
      log('Key derived.')
      if (matches) {
        go({ type: 'derive-done' })
        log('The derived key matches the key on file. Nothing to publish.')
      } else {
        go({ type: 'publish-needed' })
        log('The derived key is not on file yet. Publishing it needs one wallet transaction.')
      }
    } catch (e: any) {
      block(e?.shortMessage ?? e?.message ?? String(e))
    }
  }

  async function publish() {
    if (!resolution || resolution.status !== 'ok' || !state.wallet.address || !derivedHex) {
      block('Derive your key first.')
      return
    }
    log('Asking the wallet to approve the key setup transaction…')
    try {
      const pub = buildPublishKeyCalldata({
        circuits: resolution.circuits!,
        tokenId: resolution.tokenId!,
        publicKeyHex: derivedHex,
        keyIndex: resolution.key?.keyIndex ?? 0,
      })
      const hash = await sendTransaction({ to: pub.to, data: pub.data, from: state.wallet.address })
      setTxHash(hash)
      log(`Key setup transaction submitted: ${hash}. Waiting for confirmation…`)
      const receipt = await primaryClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      if (receipt.status !== 'success') {
        block(`The key setup transaction failed (${hash}). No key was published.`)
        return
      }
      setPublished(true)
      go({ type: 'publish-done' })
      log('Key published. The account is ready.')
    } catch (e: any) {
      block(e?.shortMessage ?? e?.message ?? String(e))
    }
  }

  function reset() {
    go({ type: 'reset' })
    setBlocker('')
    setResolution(null)
    setKeyMatches(null)
    setDerivedHex(null)
    setPublished(false)
    setTxHash('')
    setLogs([])
  }

  const canDerive =
    flow === 'ready' && !!resolution && resolution.status === 'ok' && !!state.wallet.address && !busy
  const canPublish = flow === 'publishing' && !!derivedHex && !busy

  return (
    <div>
      <h1>Set up your account</h1>
      <p>
        A live promise needs three things: a TapeOut circuit you own, its container opened on X
        Layer, and a published TapeSend key. This page checks all three and publishes the key. It
        follows <a href="https://tapeout.net/">tapeout.net</a>; the exact steps and fees are in{' '}
        <code>docs/container-onboarding.md</code>.
      </p>

      <div className="card">
        <h2>Start here</h2>
        <label htmlFor="endpoint">Your account name</label>
        <input
          id="endpoint"
          className="mono"
          value={endpointInput}
          onChange={(e) => setEndpointInput(e.target.value)}
          placeholder="#1@2.344"
        />
        <p className="small">
          The name tapeout.net shows for your circuit, such as <span className="mono">#1@2.344</span>.
          Browsing needs no wallet; resolving, deriving and publishing do.
        </p>
      </div>

      <div className="card">
        <h2>Checks</h2>
        <Kv
          rows={steps.map((s) => [
            s.label,
            <>
              <StepBadge status={s.status} />
              {s.detail ? <span className="small"> {s.detail}</span> : null}
            </>,
          ])}
        />
      </div>

      {resolution && (
        <div className="card">
          <h2>Your account</h2>
          <Kv
            rows={[
              ['Status', `${resolution.status}${resolution.error ? `: ${resolution.error}` : ''}`],
              ['Account', resolution.label ?? resolution.input],
              ['Processor contract', resolution.circuits ?? '-'],
              ['Container', resolution.container ?? '-'],
              ['Holder', resolution.holder ?? '-'],
              ['Opened', resolution.opened === undefined ? 'unknown' : String(resolution.opened)],
              ['Endpoint id', resolution.endpoint ?? '-'],
            ]}
          />
          {resolution.key && (
            <>
              <h3>TapeSend key</h3>
              <Kv
                rows={[
                  ['Usable', String(resolution.key.usable)],
                  ['Suite', String(resolution.key.suite)],
                  ['Key index', String(resolution.key.keyIndex)],
                  ['Version', String(resolution.key.version)],
                ]}
              />
            </>
          )}
        </div>
      )}

      {blocker && (
        <Callout kind="bad">
          <strong>Stopped.</strong> {blocker}
        </Callout>
      )}

      {flow === 'done' && (
        <Callout kind="ok">
          <strong>Your account is ready.</strong> The TapeSend key is published and usable. This
          page does not seal or send a commitment. When you are ready, go to{' '}
          <a href="#/create">Make a promise</a>.
        </Callout>
      )}

      {logs.length > 0 && (
        <div className="card">
          <h3>Log</h3>
          <ol>
            {logs.map((l, i) => (
              <li key={i} className="small">
                <span className="mono">{l.time}</span> {l.ok ? 'OK' : 'FAIL'}: {l.text}
              </li>
            ))}
          </ol>
          {txHash && (
            <p>
              Key setup transaction:{' '}
              <a href={xlayerExplorerTx(txHash)} target="_blank" rel="noreferrer" className="mono">
                {txHash}
              </a>
            </p>
          )}
        </div>
      )}

      <div className="action-bar" role="region" aria-label="Account set-up actions">
        <button className="btn" type="button" onClick={connect} disabled={busy || walletReady}>
          {walletReady ? 'Wallet connected' : 'Connect wallet'}
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={resolve}
          disabled={busy || !endpointInput.trim()}
        >
          Find my account
        </button>
        <button className="btn secondary" type="button" onClick={derive} disabled={!canDerive}>
          Derive my key
        </button>
        <button className="btn secondary" type="button" onClick={publish} disabled={!canPublish}>
          Publish my key
        </button>
        <button className="btn ghost" type="button" onClick={reset} disabled={busy}>
          Start over
        </button>
      </div>
    </div>
  )
}

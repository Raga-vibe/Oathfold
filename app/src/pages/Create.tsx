import { useMemo, useRef, useState } from 'react'
import { x25519 } from '@noble/curves/ed25519.js'
import type { AppState } from '../App'
import { Callout } from '../components/ui'
import {
  transitionSend,
  sendIsBusy,
  sendStepIndex,
  deriveFormState,
  SEND_STEPS,
  type SendState,
  type SendEvent,
} from '../lib/machines'
import {
  buildCommitmentRef,
  commitmentId,
  digestOf,
  deriveStatus,
  XLAYER_CHAIN_ID,
  HUB_ADDRESS,
} from '../lib/protocol/tap12'
import { buildCommitmentContent } from '../lib/protocol/tap12'
import { seal } from '../lib/tapeout/send/payload.js'
import { bytesToHex, hexToBytes } from '../lib/tapeout/send/bytes.js'
import {
  resolveEndpoint,
  inboxAt,
  readWithFallback,
  primaryClient,
  hubAbi,
} from '../lib/chain/xlayer'
import {
  deriveAuthorKey,
  buildPublishKeyCalldata,
  buildSendCalldata,
  sendTransaction,
  sealCommitment,
  xlayerExplorerTx,
} from '../lib/wallet'
import { saveDemoRecord, saveLiveRecords, loadLiveRecords } from '../lib/store'
import { decodeSentLog } from '../lib/indexer'
import type { OathRecord, ChainMessage } from '../lib/records'
import { SEND_STEP_PLAIN, PRACTICE_LABEL } from '../lib/plain'

interface LogLine {
  time: string
  text: string
  ok?: boolean
}

function toLocalInput(ts: number): string {
  const d = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Create({ state }: { state: AppState }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [deliverable, setDeliverable] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const [projectLink, setProjectLink] = useState('')
  const [evidence, setEvidence] = useState('public link')
  const [openLocal, setOpenLocal] = useState(() => toLocalInput(Math.floor(Date.now() / 1000) + 30 * 86400))
  const [judgeInput, setJudgeInput] = useState(
    () => import.meta.env.VITE_DEFAULT_JUDGE_ENDPOINT ?? '',
  )
  const [authorInput, setAuthorInput] = useState('')
  const [program, setProgram] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [attempted, setAttempted] = useState(false)
  // Live send is one named machine (src/lib/machines.ts). `busy` and the
  // blocker are derived from the state, never stored separately. stepRef
  // mirrors the state inside the async send flow so transitions always run
  // from the current state, not a stale render closure.
  const [step, setStep] = useState<SendState>('form')
  const stepRef = useRef<SendState>('form')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [blocker, setBlocker] = useState('')
  const [txHash, setTxHash] = useState('')
  const [finalId, setFinalId] = useState('')
  const [savedDemoId, setSavedDemoId] = useState('')

  const busy = sendIsBusy(step)
  const formState = deriveFormState(attempted, errors)
  const reachedRef = useRef(0)

  function setSendStep(next: SendState) {
    stepRef.current = next
    const i = sendStepIndex(next)
    if (i > reachedRef.current) reachedRef.current = i
    setStep(next)
  }

  /** Run one send transition. Rejected transitions keep the current state. */
  function go(event: SendEvent): boolean {
    const r = transitionSend(stepRef.current, event)
    if (r.ok) setSendStep(r.state)
    return r.ok
  }

  const openTs = useMemo(() => {
    const t = Date.parse(openLocal)
    return Number.isNaN(t) ? 0 : Math.floor(t / 1000)
  }, [openLocal])
  const nowSec = Math.floor(Date.now() / 1000)

  const claimBody = useMemo(() => {
    const parts = [body.trim()]
    if (deliverable.trim()) parts.push(`Deliverable: ${deliverable.trim()}`)
    if (acceptance.trim()) parts.push(`Acceptance: ${acceptance.trim()}`)
    if (projectLink.trim()) parts.push(`Project: ${projectLink.trim()}`)
    parts.push(`Evidence: ${evidence}`)
    if (program.trim()) parts.push(`Program: ${program.trim()}`)
    return parts.join('\n')
  }, [body, deliverable, acceptance, projectLink, evidence, program])

  const log = (text: string, ok = true) =>
    setLogs((l) => [...l, { time: new Date().toISOString().slice(11, 19), text, ok }])

  function validate(): string[] {
    const e: string[] = []
    if (title.trim().length < 3) e.push('Give your promise a title (at least 3 characters).')
    if (body.trim().length < 10) e.push('Write your promise in at least 10 characters.')
    if (!openTs) e.push('Pick an open date.')
    else if (openTs <= nowSec + 60) e.push('The open date must be in the future (at least 1 minute from now).')
    if (!judgeInput.trim()) e.push('Enter your judge, e.g. #1@2.344.')
    if (!authorInput.trim()) e.push('Enter your own account, e.g. #1@2.344, so the app can check you own it.')
    if (projectLink.trim() && !/^https?:\/\//.test(projectLink.trim())) e.push('Project link must start with http:// or https://.')
    return e
  }

  function block(message: string) {
    setBlocker(message)
    go({ type: 'block', reason: message })
    log(`Blocked: ${message}`, false)
  }

  async function startLiveSend() {
    setAttempted(true)
    const errs = validate()
    setErrors(errs)
    if (errs.length) return
    setLogs([])
    setTxHash('')
    setFinalId('')
    setBlocker('')
    try {
      let walletAddress = state.wallet.address
      if (!state.wallet.connected || !walletAddress) {
        log('Connecting wallet...')
        const w = await state.connect()
        walletAddress = w.address
        if (!w.connected || !walletAddress) {
          setErrors(['Wallet is not connected. Connect your wallet, then try again.'])
          return
        }
        if (w.chainId !== 196) {
          setErrors([`Wallet is on chain ${w.chainId}, not X Layer (196). Switch networks in your wallet and try again.`])
          return
        }
      }
      if (!go({ type: 'start', formValid: true })) return
      log('Checking your account and your judge on X Layer...')
      const [author, judge] = await Promise.all([resolveEndpoint(authorInput), resolveEndpoint(judgeInput)])
      if (author.status !== 'ok') {
        block(`Your account could not be used: ${author.error ?? author.status}. Live sealing needs an account you own that is opened.`)
        return
      }
      if (judge.status !== 'ok') {
        block(`Your judge could not be used: ${judge.error ?? judge.status}. The judge's account must exist and be opened.`)
        return
      }
      if (!author.holder || author.holder.toLowerCase() !== walletAddress.toLowerCase()) {
        block(`The connected wallet ${walletAddress} does not own ${author.label}. The owner is ${author.holder ?? 'unknown'}. Only the owner can seal from that account.`)
        return
      }
      if (!author.key || !author.key.usable) {
        block(`Your account ${author.label} has no key set up. Set up your key first, then seal.`)
        return
      }
      if (!judge.key || !judge.key.usable) {
        block(`Your judge ${judge.label} has no key set up. A sealed promise cannot be built without the judge's key. Ask the judge to set one up, or pick another judge.`)
        return
      }
      log(`Your account ${author.label} is yours and opened. Your judge ${judge.label} has a key set up.`)
      go({ type: 'resolved' })
      log('Asking your wallet to sign the key setup. Your private key never leaves your wallet.')
      const derived = await deriveAuthorKey({
        holder: walletAddress,
        tokenId: author.tokenId!,
        cpu: author.cpu!,
        container: author.container!,
        keyIndex: author.key.keyIndex,
      })
      const derivedHex = derived.publicKeyHex.toLowerCase()
      const publishedHex = author.key.key.toLowerCase()
      log('Your key is ready.')
      if (publishedHex !== derivedHex) {
        go({ type: 'publish-needed' })
        log('Your key does not match the one on file. Asking your wallet to set it up...')
        const pub = buildPublishKeyCalldata({
          circuits: author.circuits!,
          tokenId: author.tokenId!,
          publicKeyHex: derived.publicKeyHex,
          keyIndex: author.key.keyIndex,
        })
        const pubHash = await sendTransaction({ to: pub.to, data: pub.data, from: walletAddress })
        log(`Key setup sent: ${pubHash}. Waiting for confirmation...`)
        await primaryClient.waitForTransactionReceipt({ hash: pubHash as `0x${string}` })
        log('Key set up.')
        go({ type: 'published' })
      } else {
        log('Your key matches the one on file. Nothing to set up.')
        go({ type: 'derived' })
      }
      const judgePub = hexToBytes(judge.key.key as `0x${string}`)
      const sealed = sealCommitment({
        body: claimBody,
        open: openTs,
        judgeEndpoint: judge.endpoint!,
        authorEndpoint: author.endpoint!,
        judgePublicKey: judgePub,
        authorPublicKey: derived.publicKey,
        authorContainer: author.container!,
        nonce: '0x' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0'),
      })
      log('Sealed. Your promise is locked.')
      go({ type: 'sealed' })
      const send = buildSendCalldata({
        circuits: author.circuits!,
        tokenId: author.tokenId!,
        toEndpoint: judge.endpoint!,
        ref: sealed.ref,
        payloadHex: sealed.payloadHex,
      })
      log('Asking your wallet to sign the sealing transaction...')
      const hash = await sendTransaction({ to: send.to, data: send.data, from: walletAddress })
      setTxHash(hash)
      log(`Sent. tx ${hash}. Waiting for confirmation...`)
      const receipt = await primaryClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      if (receipt.status !== 'success') {
        block(`The sealing transaction failed (tx ${hash}). Nothing was recorded. Check the explorer link for the reason.`)
        return
      }
      log('Confirmed. Waiting for the chain to settle before your promise ID is final...')
      go({ type: 'sent' })
      // Wait until the send block is at or below the safe block.
      let safe: bigint | null = null
      for (let i = 0; i < 120; i++) {
        const sb = await readWithFallback((c) => c.getBlock({ blockTag: 'safe' })).catch(() => null)
        safe = sb ? sb.number : null
        if (safe !== null && receipt.blockNumber <= safe) break
        await new Promise((r) => setTimeout(r, 5000))
      }
      if (safe === null || receipt.blockNumber > safe) {
        block(`The transaction is confirmed, but the chain has not settled it yet. Your promise ID is not final yet. Check again from the Advanced page once it settles. tx ${hash}.`)
        return
      }
      // Rebuild the record from chain state: read inboxAt for the judge endpoint.
      // The inbox index is in the Sent event; fetch it from the receipt block logs.
      const logs = await readWithFallback((c) => c.getLogs({
        address: HUB_ADDRESS as `0x${string}`,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      }))
      const rawSent = (logs as any[]).find((l) => (l.transactionHash as string)?.toLowerCase() === hash.toLowerCase())
      const sent = rawSent
        ? decodeSentLog({
            address: rawSent.address,
            topics: rawSent.topics as string[],
            data: rawSent.data as string,
            blockNumber: BigInt(rawSent.blockNumber).toString(),
            transactionHash: rawSent.transactionHash as string,
          })
        : null
      if (!sent) {
        block(`Confirmed and settled, but the record could not be read back for tx ${hash}. Check again from the Advanced page.`)
        return
      }
      const inboxIndex = sent.inboxIndex
      const entry = await inboxAt(judge.endpoint! as `0x${string}`, BigInt(inboxIndex))
      const id = commitmentId(XLAYER_CHAIN_ID, HUB_ADDRESS, judge.endpoint!, inboxIndex)
      const msg: ChainMessage = {
        chainId: XLAYER_CHAIN_ID,
        hub: HUB_ADDRESS,
        to: judge.endpoint!,
        from: author.container!,
        ref: sealed.ref,
        inboxIndex,
        outboxIndex: sent.outboxIndex,
        payload: sealed.payloadHex,
        txHash: hash,
        blockNumber: Number(receipt.blockNumber),
        blockTimestamp: entry.timestamp,
        digest: entry.digest,
        final: true,
      }
      const record: OathRecord = {
        commitmentId: id,
        kind: 'promise',
        open: openTs,
        ref: sealed.ref,
        commitment: msg,
        status: deriveStatus({ malformed: false, revealed: false, judged: false, open: openTs, now: entry.timestamp }),
        revealedContent: null,
        reveal: null,
        verdicts: [],
        source: 'live',
        demoTitle: title.trim(),
      }
      const existing = loadLiveRecords()
      saveLiveRecords([record, ...existing.records], {
        fromBlock: receipt.blockNumber.toString(),
        toBlock: receipt.blockNumber.toString(),
        safeBlock: safe?.toString() ?? null,
        scannedAt: Math.floor(Date.now() / 1000),
        chunks: 1,
        discarded: [],
      })
      state.setLiveRecords([record, ...existing.records])
      setFinalId(id)
      go({ type: 'confirmed' })
      log(`Sealed. Promise ID ${id}.`, true)
    } catch (e: any) {
      block(e?.shortMessage ?? e?.message ?? String(e))
    }
  }

  function saveAsDemo() {
    setAttempted(true)
    const errs = validate()
    setErrors(errs)
    if (errs.length) return
    const now = Math.floor(Date.now() / 1000)
    const inboxIndex = 500 + (now % 100000)
    const judgeSecret = new Uint8Array(32).fill(0xab)
    const authorSecret = new Uint8Array(32).fill(0xcd)
    const judgeKey = x25519.getPublicKey(judgeSecret)
    const authorKey = x25519.getPublicKey(authorSecret)
    const judgeEndpoint = '0x0000000000000000000000c40b4a0ba288b4d2a87fc07db5f4c929f87dfda282'
    const authorContainer = '0xa2e4592ebbd0a08cf49dc306358b064587ab3362'
    const ref = buildCommitmentRef('promise', openTs)
    const content = buildCommitmentContent({ body: claimBody, kind: 'promise', open: openTs, subject: `Commitment: ${title.trim()}` })
    const payload = seal({
      content,
      recipients: [judgeKey, authorKey],
      to: judgeEndpoint,
      from: authorContainer,
      hub: HUB_ADDRESS,
      ref,
      chainId: XLAYER_CHAIN_ID,
    })
    const id = commitmentId(XLAYER_CHAIN_ID, HUB_ADDRESS, judgeEndpoint, inboxIndex)
    const record: OathRecord = {
      commitmentId: id,
      kind: 'promise',
      open: openTs,
      ref,
      commitment: {
        chainId: XLAYER_CHAIN_ID,
        hub: HUB_ADDRESS,
        to: judgeEndpoint,
        from: authorContainer,
        ref,
        inboxIndex,
        outboxIndex: inboxIndex,
        payload: bytesToHex(payload),
        txHash: '0x' + '0'.repeat(64),
        blockNumber: 42000000 + inboxIndex,
        blockTimestamp: now,
        digest: digestOf(ref, payload),
        final: true,
      },
      status: deriveStatus({ malformed: false, revealed: false, judged: false, open: openTs, now }),
      revealedContent: null,
      reveal: null,
      verdicts: [],
      source: 'demo',
      demoTitle: title.trim(),
      demoSecrets: { judge: bytesToHex(judgeSecret), author: bytesToHex(authorSecret) },
    }
    const next = saveDemoRecord(record)
    state.setDemoRecords(next)
    setSavedDemoId(id)
  }

  return (
    <div>
      <h1>Make a promise</h1>
      <p>
        A promise is a claim about your own future conduct. Write it, seal it like
        an envelope, and let your judge rule on it in public.
      </p>
      <p className="small">
        Need an opened container and a published TapeSend key first?{' '}
        <a href="#/onboarding">Set up your account</a>.
      </p>

      {state.hub && state.hub.isSealed === false && (
        <Callout>
          <strong>Live sealing is blocked for most people right now.</strong> The
          Oathfold judge account is not set up yet. Until then, save your promise as a
          clearly labelled practice record to see the full journey.
        </Callout>
      )}

      {errors.length > 0 && (
        <Callout kind="bad">
          <strong>Fix these before sending:</strong>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </Callout>
      )}

      <div className="card">
        <label htmlFor="title">Title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ship Oathfold v1" />
        <label htmlFor="body">Your promise</label>
        <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="I will ship Oathfold v1 by 2027-01-01." />
        <div className="two-col">
          <div>
            <label htmlFor="deliverable">What you will deliver</label>
            <input id="deliverable" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="Live app at the public URL" />
          </div>
          <div>
            <label htmlFor="evidence">Proof type</label>
            <select id="evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)}>
              <option value="public link">Public link</option>
              <option value="repo release">Repo release</option>
              <option value="on-chain record">On-chain record</option>
              <option value="screenshot">Screenshot</option>
            </select>
          </div>
        </div>
        <label htmlFor="acceptance">How the judge checks it</label>
        <input id="acceptance" value={acceptance} onChange={(e) => setAcceptance(e.target.value)} placeholder="The live URL loads and the dashboard lists the record." />
        <label htmlFor="projectLink">Project link (optional)</label>
        <input id="projectLink" value={projectLink} onChange={(e) => setProjectLink(e.target.value)} placeholder="https://..." />
        <label htmlFor="program">Programme (optional)</label>
        <input id="program" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="TapeOut Accelerate" />
        <label htmlFor="open">Open date (your local time, {Intl.DateTimeFormat().resolvedOptions().timeZone})</label>
        <input id="open" type="datetime-local" value={openLocal} onChange={(e) => setOpenLocal(e.target.value)} />
        {openTs > 0 && (
          <p className="small">Open date in UTC: {new Date(openTs * 1000).toUTCString()}</p>
        )}
        <label htmlFor="author">Your account</label>
        <input id="author" className="mono" value={authorInput} onChange={(e) => setAuthorInput(e.target.value)} placeholder="#1@2.344" />
        <label htmlFor="judge">Judge</label>
        <input id="judge" className="mono" value={judgeInput} onChange={(e) => setJudgeInput(e.target.value)} placeholder="#1@2.344" />
        {import.meta.env.VITE_DEFAULT_JUDGE_ENDPOINT ? (
          <p className="small">Judge provided by Oathfold.</p>
        ) : null}
        <p className="small">
          Your judge needs a key set up. The judge can read your promise before the
          open date, so pick someone you trust. Think of it as a sealed envelope:
          everyone can see the envelope, only the judge can open it early.
        </p>
      </div>

      <h2>What everyone can see, what stays hidden</h2>
      <div className="card">
        <table>
          <thead><tr><th>Field</th><th>Visibility</th></tr></thead>
          <tbody>
            <tr><td>Type: promise</td><td>Public</td></tr>
            <tr><td>Open date: {openTs ? new Date(openTs * 1000).toUTCString() : 'not set'}</td><td>Public</td></tr>
            <tr><td>Your account and your judge</td><td>Public</td></tr>
            <tr><td>Sealed time</td><td>Public</td></tr>
            <tr><td>Promise text, deliverable, checks, links</td><td>Hidden until opened</td></tr>
            <tr><td>Your key</td><td>Never shared until opened; opens this promise only</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Seal it</h2>
      <ol className="stepper" aria-label="Sealing progress">
        {SEND_STEPS.map((s) => {
          const i = sendStepIndex(s)
          const done = i < reachedRef.current || step === 'done'
          const current = s === step
          const blockedHere = step === 'blocked' && i === reachedRef.current
          return (
            <li key={s} className={done ? 'done' : current ? 'current' : blockedHere ? 'blocked' : 'todo'}>
              <span className="stepper__dot" aria-hidden="true" />
              {SEND_STEP_PLAIN[s]}
            </li>
          )
        })}
      </ol>
      <p className="small">
        Sealing live asks your wallet to sign at most twice: once to set up your key,
        once to seal. No private key is ever handled by this app.
      </p>

      {step === 'blocked' && blocker && (
        <Callout kind="bad">
          <strong>Could not seal this live.</strong> {blocker}
          <p style={{ marginTop: 8 }}>
            You can still save this promise as a practice record to preview the full
            journey. It will be labelled &ldquo;{PRACTICE_LABEL}&rdquo; and is not on chain.
          </p>
          <button className="btn secondary" type="button" onClick={saveAsDemo}>Save as a practice record</button>
        </Callout>
      )}

      {logs.length > 0 && (
        <div className="card">
          <h3>Sealing log</h3>
          <ol>
            {logs.map((l, i) => (
              <li key={i} className="small">
                <span className="mono">{l.time}</span> {l.ok ? 'OK' : 'FAIL'}: {l.text}
              </li>
            ))}
          </ol>
          {txHash && (
            <p>
              Transaction: <a href={xlayerExplorerTx(txHash)} target="_blank" rel="noreferrer" className="mono">{txHash}</a>
            </p>
          )}
          {step === 'done' && finalId && (
            <Callout kind="ok">
              <strong>Live promise recorded.</strong>{' '}
              Promise ID <span className="mono">{finalId}</span>.{' '}
              <a href={`#/record/${encodeURIComponent(finalId)}`}>Open the record</a>.
            </Callout>
          )}
        </div>
      )}

      {savedDemoId && (
        <Callout>
          <strong>Saved as a practice record.</strong> This is a local practice record
          built with real sealing, not a live transaction.{' '}
          <a href={`#/record/${encodeURIComponent(savedDemoId)}`}>Open the demo record</a>.
        </Callout>
      )}

      <div className="action-bar" role="region" aria-label="Send actions">
        <button className="btn" type="button" onClick={startLiveSend} disabled={busy}>
          {busy ? `${SEND_STEP_PLAIN[step]}…` : 'Seal live on X Layer'}
        </button>
        <button className="btn secondary" type="button" onClick={saveAsDemo} disabled={busy}>
          Save as a practice record instead
        </button>
        <span className="action-bar__status">
          {step === 'blocked' && blocker
            ? `Blocked: ${blocker}`
            : step === 'done'
              ? 'Live promise recorded.'
              : step === 'form'
                ? formState === 'invalid'
                  ? 'Fix the errors above, then seal.'
                  : 'Ready when the form is valid.'
                : `${SEND_STEP_PLAIN[step]}…`}
        </span>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { x25519 } from '@noble/curves/ed25519.js'
import type { AppState } from '../App'
import { Callout, Copy } from '../components/ui'
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
import { DEMO_LABEL } from '../lib/demo'

type Step =
  | 'form'
  | 'resolving'
  | 'deriving'
  | 'publishing'
  | 'sealing'
  | 'sending'
  | 'confirming'
  | 'done'
  | 'blocked'

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
  const [step, setStep] = useState<Step>('form')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [blocker, setBlocker] = useState('')
  const [txHash, setTxHash] = useState('')
  const [finalId, setFinalId] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedDemoId, setSavedDemoId] = useState('')

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
    if (title.trim().length < 3) e.push('Give the commitment a title (at least 3 characters).')
    if (body.trim().length < 10) e.push('Write the claim in at least 10 characters.')
    if (!openTs) e.push('Pick an open date and time.')
    else if (openTs <= nowSec + 60) e.push('The open time must be in the future (at least 1 minute from now).')
    if (!judgeInput.trim()) e.push('Enter the judge endpoint, e.g. #1@2.344.')
    if (!authorInput.trim()) e.push('Enter your own endpoint, e.g. #1@2.344, so the live send can check you hold it.')
    if (projectLink.trim() && !/^https?:\/\//.test(projectLink.trim())) e.push('Project link must start with http:// or https://.')
    return e
  }

  function block(message: string) {
    setBlocker(message)
    setStep('blocked')
    setBusy(false)
    log(`Blocked: ${message}`, false)
  }

  async function startLiveSend() {
    const errs = validate()
    setErrors(errs)
    if (errs.length) return
    setBusy(true)
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
          block('Wallet is not connected. Connect your wallet, then try again.')
          return
        }
        if (w.chainId !== 196) {
          block(`Wallet is on chain ${w.chainId}, not X Layer (196). Switch networks in your wallet and try again.`)
          return
        }
      }
      setStep('resolving')
      log('Resolving your endpoint and the judge endpoint on X Layer...')
      const [author, judge] = await Promise.all([resolveEndpoint(authorInput), resolveEndpoint(judgeInput)])
      if (author.status !== 'ok') {
        block(`Your endpoint could not be used: ${author.error ?? author.status}. Live send needs a container you hold that is opened (paid).`)
        return
      }
      if (judge.status !== 'ok') {
        block(`Judge endpoint could not be used: ${judge.error ?? judge.status}. The judge container must exist and be opened.`)
        return
      }
      if (!author.holder || author.holder.toLowerCase() !== walletAddress.toLowerCase()) {
        block(`The connected wallet ${walletAddress} is not the current holder of ${author.label}. The holder is ${author.holder ?? 'unknown'}. hub.send() only accepts the current holder.`)
        return
      }
      if (!author.key || !author.key.usable) {
        block(`Your container ${author.label} has no usable TapeSend key. Publish a key first (step below), then send.`)
        return
      }
      if (!judge.key || !judge.key.usable) {
        block(`Judge ${judge.label} has no usable TapeSend key (keyFor usable=false). A sealed payload cannot be built without the judge public key. Ask the judge to publish a key, or pick another judge.`)
        return
      }
      log(`Author ${author.label} held by you, opened. Judge ${judge.label} has a usable key.`)
      setStep('deriving')
      log('Asking your wallet to sign the TAP-10 key-derivation text (personal_sign). Your private key never leaves the wallet.')
      const derived = await deriveAuthorKey({
        holder: walletAddress,
        tokenId: author.tokenId!,
        cpu: author.cpu!,
        container: author.container!,
        keyIndex: author.key.keyIndex,
      })
      const derivedHex = derived.publicKeyHex.toLowerCase()
      const publishedHex = author.key.key.toLowerCase()
      log(`Derived key ${derivedHex.slice(0, 18)}...`)
      if (publishedHex !== derivedHex) {
        setStep('publishing')
        log('Derived key differs from the published key. Asking your wallet to publish it (publishKey transaction)...')
        const pub = buildPublishKeyCalldata({
          circuits: author.circuits!,
          tokenId: author.tokenId!,
          publicKeyHex: derived.publicKeyHex,
          keyIndex: author.key.keyIndex,
        })
        const pubHash = await sendTransaction({ to: pub.to, data: pub.data, from: walletAddress })
        log(`publishKey sent: ${pubHash}. Waiting for receipt...`)
        await primaryClient.waitForTransactionReceipt({ hash: pubHash as `0x${string}` })
        log('publishKey confirmed.')
      } else {
        log('Derived key matches the published key. No publishKey needed.')
      }
      setStep('sealing')
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
      log(`Sealed. ref ${sealed.ref}. Payload ${sealed.payload.length} bytes. Digest is bound by the hub on send.`)
      setStep('sending')
      const send = buildSendCalldata({
        circuits: author.circuits!,
        tokenId: author.tokenId!,
        toEndpoint: judge.endpoint!,
        ref: sealed.ref,
        payloadHex: sealed.payloadHex,
      })
      log('Asking your wallet to sign the hub.send transaction...')
      const hash = await sendTransaction({ to: send.to, data: send.data, from: walletAddress })
      setTxHash(hash)
      log(`Sent. tx ${hash}. Waiting for receipt...`)
      const receipt = await primaryClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      if (receipt.status !== 'success') {
        block(`The send transaction reverted (tx ${hash}). Nothing was recorded. Check the explorer link for the revert reason.`)
        return
      }
      log(`Receipt confirmed in block ${receipt.blockNumber}. Waiting for safe finality before deriving a commitment id...`)
      setStep('confirming')
      // Wait until the send block is at or below the safe block.
      let safe: bigint | null = null
      for (let i = 0; i < 120; i++) {
        const sb = await readWithFallback((c) => c.getBlock({ blockTag: 'safe' })).catch(() => null)
        safe = sb ? sb.number : null
        if (safe !== null && receipt.blockNumber <= safe) break
        await new Promise((r) => setTimeout(r, 5000))
      }
      if (safe === null || receipt.blockNumber > safe) {
        block(`The transaction is confirmed but not yet at safe finality (block ${receipt.blockNumber}, safe ${safe?.toString() ?? 'unknown'}). The commitment id is not final yet. Re-scan from the Live chain page once the safe block passes it. tx ${hash}.`)
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
        block(`Confirmed at safe finality, but the Sent event could not be read back for tx ${hash}. Re-scan from the Live chain page.`)
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
      setStep('done')
      setBusy(false)
      log(`Final. commitmentId ${id}.`, true)
    } catch (e: any) {
      block(e?.shortMessage ?? e?.message ?? String(e))
    }
  }

  function saveAsDemo() {
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

  const previewRef = openTs ? buildCommitmentRef('promise', openTs) : ''

  return (
    <div>
      <h1>Create a commitment</h1>
      <p>
        Promise commitments only. A promise is a claim about your own future conduct.
        Forecasts are defined in TAP-12 but not offered here.
      </p>

      {state.hub && state.hub.isSealed === false && (
        <Callout>
          <strong>Live send is blocked for most users right now.</strong> No founder-owned opened
          container with a published TapeSend key exists yet on X Layer, so there is no usable
          judge endpoint to seal to and no holder wallet to send from. The live flow below is
          fully built and will run once that exists. Until then, save your commitment as a
          clearly labelled DEMO FIXTURE to see the full record lifecycle.
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
        <label htmlFor="body">The claim, in plain words</label>
        <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="I will ship Oathfold v1 by 2027-01-01." />
        <div className="two-col">
          <div>
            <label htmlFor="deliverable">Deliverable</label>
            <input id="deliverable" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="Live app at the public URL" />
          </div>
          <div>
            <label htmlFor="evidence">Evidence type</label>
            <select id="evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)}>
              <option value="public link">Public link</option>
              <option value="repo release">Repo release</option>
              <option value="on-chain record">On-chain record</option>
              <option value="screenshot">Screenshot</option>
            </select>
          </div>
        </div>
        <label htmlFor="acceptance">Acceptance: how the judge checks it</label>
        <input id="acceptance" value={acceptance} onChange={(e) => setAcceptance(e.target.value)} placeholder="The live URL loads and the dashboard lists the record." />
        <label htmlFor="projectLink">Project link (optional)</label>
        <input id="projectLink" value={projectLink} onChange={(e) => setProjectLink(e.target.value)} placeholder="https://..." />
        <label htmlFor="program">Program label (optional)</label>
        <input id="program" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="TapeOut Accelerate" />
        <label htmlFor="open">Open date and time (your local time, {Intl.DateTimeFormat().resolvedOptions().timeZone})</label>
        <input id="open" type="datetime-local" value={openLocal} onChange={(e) => setOpenLocal(e.target.value)} />
        {openTs > 0 && (
          <p className="small">Open time in UTC: {new Date(openTs * 1000).toUTCString()} (unix {openTs}).</p>
        )}
        <label htmlFor="author">Your endpoint (author)</label>
        <input id="author" className="mono" value={authorInput} onChange={(e) => setAuthorInput(e.target.value)} placeholder="#1@2.344" />
        <label htmlFor="judge">Judge endpoint</label>
        <input id="judge" className="mono" value={judgeInput} onChange={(e) => setJudgeInput(e.target.value)} placeholder="#1@2.344" />
        {import.meta.env.VITE_DEFAULT_JUDGE_ENDPOINT ? (
          <p className="small">Judge provided by Oathfold.</p>
        ) : null}
        <p className="small">
          The judge must have a usable TapeSend key. The judge can read the claim before the
          open time. Pick a judge you trust with it early.
        </p>
      </div>

      <h2>What is public, what is sealed</h2>
      <div className="card">
        <table>
          <thead><tr><th>Field</th><th>Visibility</th></tr></thead>
          <tbody>
            <tr><td>Kind: promise</td><td>Public, in the ref</td></tr>
            <tr><td>Open time: {openTs ? new Date(openTs * 1000).toUTCString() : 'not set'}</td><td>Public, in the ref</td></tr>
            <tr><td>Author endpoint and judge endpoint</td><td>Public, in the hub entry</td></tr>
            <tr><td>Send time (block timestamp)</td><td>Public, in the hub entry</td></tr>
            <tr><td>Claim text, deliverable, acceptance, links</td><td>Sealed until reveal</td></tr>
            <tr><td>Content key K</td><td>Never published until reveal; reveals this message only</td></tr>
          </tbody>
        </table>
        {previewRef && (
          <p className="small" style={{ marginTop: 12 }}>
            Commitment ref (public): <span className="mono">{previewRef}</span>{' '}
            <Copy text={previewRef} />
          </p>
        )}
      </div>

      <h2>Send</h2>
      <p>
        <button className="btn" type="button" onClick={startLiveSend} disabled={busy}>
          {busy ? 'Working...' : 'Send live on X Layer'}
        </button>{' '}
        <button className="btn secondary" type="button" onClick={saveAsDemo} disabled={busy}>
          Save as DEMO FIXTURE instead
        </button>
      </p>
      <p className="small">
        Live send signs at most two things in your wallet: a personal_sign for the key
        derivation text, and the hub.send transaction (plus publishKey if your key is not the
        published one). No private key is ever handled by this app.
      </p>

      {step === 'blocked' && blocker && (
        <Callout kind="bad">
          <strong>Live send blocked.</strong> {blocker}
          <p style={{ marginTop: 8 }}>
            You can still save this commitment as a DEMO FIXTURE to preview the full record.
            It will be labelled {DEMO_LABEL} and is not on chain.
          </p>
          <button className="btn secondary" type="button" onClick={saveAsDemo}>Save as DEMO FIXTURE</button>
        </Callout>
      )}

      {logs.length > 0 && (
        <div className="card">
          <h3>Send log</h3>
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
              <strong>Live commitment recorded at safe finality.</strong>{' '}
              commitmentId <span className="mono">{finalId}</span>.{' '}
              <a href={`#/record/${encodeURIComponent(finalId)}`}>Open the record</a>.
            </Callout>
          )}
        </div>
      )}

      {savedDemoId && (
        <Callout>
          <strong>Saved as {DEMO_LABEL}.</strong> This is a local demo record built with real
          seal(), not a live transaction.{' '}
          <a href={`#/record/${encodeURIComponent(savedDemoId)}`}>Open the demo record</a>.
        </Callout>
      )}
    </div>
  )
}

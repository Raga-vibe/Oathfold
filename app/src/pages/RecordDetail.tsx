import { useMemo, useState } from 'react'
import type { OathRecord } from '../lib/records'
import { statusExplain, verifyDigest } from '../lib/protocol/tap12'
import { STATUS_PLAIN } from '../lib/plain'
import { buildGraph } from '../lib/graph/graph'
import { RelatedCommitmentsPanel, EvidenceGraphPanel } from '../components/graph-panels'
import { parsePayload } from '../lib/tapeout/send/payload.js'
import { hexToBytes } from '../lib/tapeout/send/bytes.js'
import { StatusBadge, SourceBadge, Callout, Kv, Copy } from '../components/ui'
import { formatTime, shortAddress } from '../lib/chain/xlayer'
import { xlayerExplorerTx } from '../lib/wallet'
import {
  transitionDisclosure,
  deriveRecordLookupState,
  deriveRevealState,
  type DisclosureState,
} from '../lib/machines'

export default function RecordDetail({ id, records }: { id: string; records: OathRecord[] }) {
  // Secondary panels are disclosure machines (src/lib/machines.ts): closed
  // by default, opened by an explicit toggle. The record itself is found
  // through the named lookup state, not an undefined check in the JSX.
  const [rawDisc, setRawDisc] = useState<DisclosureState>('closed')
  const [graphDisc, setGraphDisc] = useState<DisclosureState>('closed')
  const [verifyDisc, setVerifyDisc] = useState<DisclosureState>('closed')
  const graph = useMemo(() => buildGraph(records), [records])
  const record = records.find((r) => r.commitmentId.toLowerCase() === id.toLowerCase())
  const lookupState = deriveRecordLookupState(record)
  if (lookupState === 'not-found' || !record) {
    return (
      <div>
        <h1>Promise not found</h1>
        <p>
          No promise with ID <span className="mono">{id}</span> is in the current
          practice set or live list. Run a live scan from the Advanced page, or open a
          promise from Promises.
        </p>
        <p><a href="#/dashboard">Back to Promises</a></p>
      </div>
    )
  }

  const c = record.commitment
  const digestOk = verifyDigest(c.ref, hexToBytes(c.payload as `0x${string}`), c.digest)
  let payloadKind = 'unknown'
  try {
    payloadKind = parsePayload(hexToBytes(c.payload as `0x${string}`)).kind
  } catch {
    payloadKind = 'does not parse'
  }
  const designated = record.verdicts.filter((v) => v.designated)
  const thirdParty = record.verdicts.filter((v) => !v.designated)
  const judgeContainer = '0x' + c.to.slice(-40)
  const revealState = deriveRevealState(record)
  const verdictLine = designated.length > 0
    ? `The judge ruled: ${designated[0].outcome}${designated[0].valid ? '' : ` (invalid: ${designated[0].error})`}`
    : 'The judge has not ruled yet'

  function toggle(which: 'raw' | 'graph' | 'verify') {
    const [cur, set] = which === 'raw' ? [rawDisc, setRawDisc] : which === 'graph' ? [graphDisc, setGraphDisc] : [verifyDisc, setVerifyDisc]
    const r = transitionDisclosure(cur, { type: 'toggle' })
    if (r.ok) set(r.state)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <StatusBadge status={record.status} />
        <SourceBadge source={record.source} />
      </div>
      <h1>{record.demoTitle ?? record.revealedContent?.body ?? 'Sealed promise'}</h1>
      <p className="small">
        {verdictLine} · {revealState === 'verified' ? 'Opened' : revealState === 'published' ? 'Opening sent' : revealState === 'invalid' ? 'Opening did not check out' : 'Not opened yet'} · Opens {formatTime(record.open)}
      </p>
      <p className="small">{STATUS_PLAIN[record.status]}</p>
      {record.malformedReason && (
        <Callout kind="bad"><strong>Broken record.</strong> {record.malformedReason}</Callout>
      )}

      <h2>Promise</h2>
      <div className="card">
        {record.revealedContent ? (
          <div>
            <p>{String(record.revealedContent.body ?? '')}</p>
            {record.revealedContent.scv?.claim && (
              <p className="small">
                The promise, in detail: {record.revealedContent.scv.claim.subject}{' '}
                {record.revealedContent.scv.claim.op} {record.revealedContent.scv.claim.value}
                {record.revealedContent.scv.claim.metric ? ` (${record.revealedContent.scv.claim.metric})` : ''}
              </p>
            )}
            <p className="small">
              Opened by {record.reveal?.message.from ? shortAddress(record.reveal.message.from) : 'unknown'} at{' '}
              {record.reveal ? formatTime(record.reveal.message.blockTimestamp) : ''}.
            </p>
          </div>
        ) : (
          <p>
            Sealed. The promise text is hidden until it is opened. What everyone can see
            now: the type ({record.kind}), the open date{' '}
            {formatTime(record.open)}, the author and the judge.
          </p>
        )}
      </div>

      <h2>Timeline</h2>
      <ol className="timeline">
        <li>
          <strong>Promise sealed.</strong> {formatTime(c.blockTimestamp)}.
          Sealed by <span className="mono">{shortAddress(c.from)}</span>, judge{' '}
          <span className="mono">{c.to.slice(0, 18)}...</span>.
          {c.final ? ' Settled on the chain.' : ' Not settled yet.'}
        </li>
        {record.reveal && (
          <li>
            <strong>Opened.</strong>{' '}
            {formatTime(record.reveal.message.blockTimestamp)}. The promise was opened and
            checked against the sealed envelope.
          </li>
        )}
        {record.verdicts.map((v, i) => (
          <li key={i}>
            <strong>Ruling: {v.outcome}</strong> ({v.designated ? 'the judge' : 'someone else'}).
            {formatTime(v.message.blockTimestamp)}.
            {v.early ? ' Ruled before the open date.' : ''}
            {!v.valid ? ` Invalid: ${v.error}` : ''} {v.body}
          </li>
        ))}
        {record.verdicts.length === 0 && !record.reveal && (
          <li><strong>No opening or ruling yet.</strong></li>
        )}
      </ol>

      <h2>The judge's ruling</h2>
      <h3>The judge</h3>
      {designated.length === 0 ? (
        <p className="small">The judge has not ruled yet.</p>
      ) : (
        designated.map((v, i) => (
          <div className="card" key={i}>
            <p><strong>{v.outcome}</strong> {v.early ? '(early)' : ''} {!v.valid ? `(invalid: ${v.error})` : ''}</p>
            <p>{v.body}</p>
            {v.reason && <p className="small">Reason: {v.reason}</p>}
            {v.sources.length > 0 && (
              <ul>
                {v.sources.map((s, j) => (
                  <li key={j} className="small">
                    {s.name}: {s.value} at {formatTime(s.at)}
                    {s.url ? <> (<a href={s.url} target="_blank" rel="noreferrer">source</a>)</> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
      <h3>Other people's calls</h3>
      {thirdParty.length === 0 ? (
        <p className="small">None. Other people's calls are listed separately and never counted with the judge's ruling.</p>
      ) : (
        thirdParty.map((v, i) => (
          <div className="card" key={i}>
            <p><strong>{v.outcome}</strong> by <span className="mono">{shortAddress(v.message.from)}</span> {v.early ? '(early)' : ''}</p>
            <p>{v.body}</p>
          </div>
        ))
      )}

      <h2>
        <button className="btn ghost small toggle-btn" type="button" onClick={() => toggle('graph')} aria-expanded={graphDisc === 'open'}>
          {graphDisc === 'open' ? 'Hide background' : 'Show background'}
        </button>
      </h2>
      {graphDisc === 'open' && (
        <div>
          <RelatedCommitmentsPanel graph={graph} commitmentId={record.commitmentId} />
          <EvidenceGraphPanel graph={graph} commitmentId={record.commitmentId} />
        </div>
      )}

      <h2>
        <button className="btn ghost small toggle-btn" type="button" onClick={() => toggle('verify')} aria-expanded={verifyDisc === 'open'}>
          {verifyDisc === 'open' ? 'Hide technical details' : 'Show technical details'}
        </button>
      </h2>
      {verifyDisc === 'open' && (
        <div>
          <Kv rows={[
            ['Protocol', 'TAP-12 Draft over TAP-10 (TapeSend)'],
            ['Chain', 'X Layer (196)'],
            ['Hub', c.hub],
            ['Commitment id', record.commitmentId],
          ]} />
          <p className="mono" style={{ marginTop: 4 }}>{record.commitmentId}</p>
          <Kv rows={[
            ['Commitment ref', c.ref],
            ['Judge endpoint', c.to],
            ['Judge container', judgeContainer],
            ['Author container', c.from],
            ['Inbox index', String(c.inboxIndex)],
            ['Block', `${c.blockNumber} (${formatTime(c.blockTimestamp)})`],
            ['Transaction', c.txHash],
            ['Payload kind', payloadKind],
            ['Payload bytes', String((c.payload.length - 2) / 2)],
            ['Digest (on chain)', c.digest],
            ['Digest check', digestOk ? 'PASS: keccak256(ref || keccak256(payload)) matches the inbox entry' : 'FAIL: digest does not match'],
            ['Status derivation', `${record.status}: ${statusExplain(record.status, record.open)}`],
            ['Open time', `${formatTime(record.open)} (unix ${record.open})`],
            ['Finality', c.final ? 'Final: block at or below the safe block' : 'Not final: pending is never a final record'],
            ['Source', record.source === 'demo' ? 'Practice record: built locally, not on chain' : 'Live: rebuilt from X Layer data'],
          ]} />
          {c.txHash && c.txHash !== '0x' + '0'.repeat(64) && (
            <p><a href={xlayerExplorerTx(c.txHash)} target="_blank" rel="noreferrer">View transaction on the X Layer explorer</a></p>
          )}
          <p>
            <button className="btn secondary small" type="button" onClick={() => toggle('raw')}>
              {rawDisc === 'open' ? 'Hide raw ref and payload' : 'Show raw ref and payload'}
            </button>
          </p>
          {rawDisc === 'open' && (
            <div>
              <p className="small">ref</p>
              <p className="mono">{c.ref}</p>
              <p className="small">payload ({(c.payload.length - 2) / 2} bytes)</p>
              <p className="mono">{c.payload}</p>
              <Copy text={c.payload} label="Copy payload" />
            </div>
          )}
        </div>
      )}

      <p><a href="#/dashboard">Back to Promises</a></p>
    </div>
  )
}

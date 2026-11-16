import { useMemo, useState } from 'react'
import type { OathRecord } from '../lib/records'
import { statusExplain, verifyDigest } from '../lib/protocol/tap12'
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
        <h1>Record not found</h1>
        <p>
          No record with commitment id <span className="mono">{id}</span> is in the current
          demo set or live cache. Run a live scan on the Live chain page, or open a record from
          the dashboard.
        </p>
        <p><a href="#/dashboard">Back to the dashboard</a></p>
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
    ? `Designated verdict: ${designated[0].outcome}${designated[0].valid ? '' : ` (invalid: ${designated[0].error})`}`
    : 'No designated verdict yet'

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
      <h1>{record.demoTitle ?? record.revealedContent?.body ?? 'Sealed commitment'}</h1>
      <p className="small">
        {verdictLine} · Reveal: {revealState} · Opens {formatTime(record.open)}
      </p>
      <p className="small">{statusExplain(record.status, record.open)}</p>
      {record.malformedReason && (
        <Callout kind="bad"><strong>Malformed.</strong> {record.malformedReason}</Callout>
      )}

      <h2>Claim</h2>
      <div className="card">
        {record.revealedContent ? (
          <div>
            <p>{String(record.revealedContent.body ?? '')}</p>
            {record.revealedContent.scv?.claim && (
              <p className="small">
                Machine-readable claim: {record.revealedContent.scv.claim.subject}{' '}
                {record.revealedContent.scv.claim.op} {record.revealedContent.scv.claim.value}
                {record.revealedContent.scv.claim.metric ? ` (${record.revealedContent.scv.claim.metric})` : ''}
              </p>
            )}
            <p className="small">
              Revealed by {record.reveal?.message.from ? shortAddress(record.reveal.message.from) : 'unknown'} at{' '}
              {record.reveal ? formatTime(record.reveal.message.blockTimestamp) : ''}. Key:{' '}
              <span className="mono">{record.reveal?.key.slice(0, 18)}...</span>
            </p>
          </div>
        ) : (
          <p>
            Sealed. The claim text is hidden until the author or the judge publishes the content
            key. What is public now: kind ({record.kind}), open time{' '}
            {formatTime(record.open)}, author, judge.
          </p>
        )}
      </div>

      <h2>Timeline</h2>
      <ol className="timeline">
        <li>
          <strong>Commitment sent.</strong> Block {c.blockNumber}, {formatTime(c.blockTimestamp)}.
          Author container <span className="mono">{shortAddress(c.from)}</span>, judge endpoint{' '}
          <span className="mono">{c.to.slice(0, 18)}...</span>, inbox index {c.inboxIndex}.
          {c.final ? ' Final (at or below the safe block).' : ' Not yet final.'}
        </li>
        {record.reveal && (
          <li>
            <strong>Revealed.</strong> Block {record.reveal.message.blockNumber},{' '}
            {formatTime(record.reveal.message.blockTimestamp)}. The content key was published and
            the claim was verified against the sealed payload.
          </li>
        )}
        {record.verdicts.map((v, i) => (
          <li key={i}>
            <strong>Verdict: {v.outcome}</strong> ({v.designated ? 'designated judge' : 'third-party'}).
            Block {v.message.blockNumber}, {formatTime(v.message.blockTimestamp)}.
            {v.early ? ' Marked early (sent before the open time).' : ''}
            {!v.valid ? ` Invalid: ${v.error}` : ''} {v.body}
          </li>
        ))}
        {record.verdicts.length === 0 && !record.reveal && (
          <li><strong>No reveal or verdict yet.</strong></li>
        )}
      </ol>

      <h2>Verdicts</h2>
      <h3>Designated judge</h3>
      {designated.length === 0 ? (
        <p className="small">No verdict from the designated judge yet.</p>
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
      <h3>Third-party verdicts</h3>
      {thirdParty.length === 0 ? (
        <p className="small">None. Third-party verdicts are listed separately and never merged with the designated judge verdict.</p>
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
          {graphDisc === 'open' ? 'Hide graph context' : 'Show graph context'} (CONTEXT ONLY)
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
          {verifyDisc === 'open' ? 'Hide verification' : 'Show verification'}
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
            ['Source', record.source === 'demo' ? 'DEMO FIXTURE: built locally, not on chain' : 'LIVE: rebuilt from X Layer hub data'],
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

      <p><a href="#/dashboard">Back to the dashboard</a></p>
    </div>
  )
}

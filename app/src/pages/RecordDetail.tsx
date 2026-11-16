import { useState } from 'react'
import type { OathRecord } from '../lib/records'
import { statusExplain, verifyDigest } from '../lib/protocol/tap12'
import { parsePayload } from '../lib/tapeout/send/payload.js'
import { hexToBytes } from '../lib/tapeout/send/bytes.js'
import { StatusBadge, SourceBadge, Callout, Kv, Copy } from '../components/ui'
import { formatTime, shortAddress } from '../lib/chain/xlayer'
import { xlayerExplorerTx } from '../lib/wallet'

export default function RecordDetail({ id, records }: { id: string; records: OathRecord[] }) {
  const [showRaw, setShowRaw] = useState(false)
  const record = records.find((r) => r.commitmentId.toLowerCase() === id.toLowerCase())
  if (!record) {
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

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <StatusBadge status={record.status} />
        <SourceBadge source={record.source} />
      </div>
      <h1>{record.demoTitle ?? record.revealedContent?.body ?? 'Sealed commitment'}</h1>
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

      <h2>Verification</h2>
      <details open>
        <summary>Verification drawer</summary>
        <div style={{ marginTop: 12 }}>
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
            <button className="btn secondary small" type="button" onClick={() => setShowRaw((s) => !s)}>
              {showRaw ? 'Hide raw ref and payload' : 'Show raw ref and payload'}
            </button>
          </p>
          {showRaw && (
            <div>
              <p className="small">ref</p>
              <p className="mono">{c.ref}</p>
              <p className="small">payload ({(c.payload.length - 2) / 2} bytes)</p>
              <p className="mono">{c.payload}</p>
              <Copy text={c.payload} label="Copy payload" />
            </div>
          )}
        </div>
      </details>

      <p><a href="#/dashboard">Back to the dashboard</a></p>
    </div>
  )
}

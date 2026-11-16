// Shared UI primitives. Styled by src/index.css.
// Skills applied: ui-styling (component states, accessible patterns),
// ui-ux-pro-max (status never by colour alone: badge dot plus uppercase text
// label), taste-skill (one system, plain copy, errors explain what to do next).
import type { ReactNode } from 'react'
import type { CommitmentStatus } from '../lib/protocol/tap12'
import { statusLabel } from '../lib/protocol/tap12'
import type { OathRecord } from '../lib/records'
import { shortAddress } from '../lib/chain/xlayer'
import { brandCopy } from '../brand'

function shortDate(ts: number): string {
  return new Date(ts * 1000).toUTCString().slice(5, 16)
}

/** One real record, rendered as a ledger entry. Same data and actions everywhere. */
export function RecordCard({ record }: { record: OathRecord }) {
  const c = record.commitment
  const title = record.demoTitle ?? record.revealedContent?.body ?? 'Sealed commitment'
  const designated = record.verdicts.find((v) => v.designated)
  const steps: { label: string; value: ReactNode }[] = [
    { label: 'Seal', value: shortDate(c.blockTimestamp) },
    { label: 'Open', value: shortDate(record.open) },
    { label: 'Reveal', value: record.reveal ? shortDate(record.reveal.message.blockTimestamp) : 'Not yet' },
    {
      label: 'Verdict',
      value: designated ? (
        <>
          {designated.outcome}
          <br />
          {shortDate(designated.message.blockTimestamp)}
        </>
      ) : (
        'Not yet'
      ),
    },
  ]
  return (
    <article className="card record-card">
      <div className="record-card__head">
        <StatusBadge status={record.status} />
        <SourceBadge source={record.source} />
      </div>
      <h3 className="record-card__title">
        <a href={`#/record/${encodeURIComponent(record.commitmentId)}`}>{title}</a>
      </h3>
      <pre className="record-card__payload" title={c.payload}>
        <code>
          <span className="tok-kw">const</span> <span className="tok-var">commitment</span> <span className="tok-def">=</span> <span className="tok-def">{'{'}</span>{'\n'}
          {'  '}<span className="tok-prop">id</span><span className="tok-def">:</span> <span className="tok-str">"{record.commitmentId.slice(0, 26)}..."</span><span className="tok-def">,</span>{'\n'}
          {'  '}<span className="tok-prop">status</span><span className="tok-def">:</span> <span className="tok-str">"{record.status}"</span><span className="tok-def">,</span>{'\n'}
          {'  '}<span className="tok-prop">kind</span><span className="tok-def">:</span> <span className="tok-str">"promise"</span><span className="tok-def">,</span>{'\n'}
          {'  '}<span className="tok-prop">open</span><span className="tok-def">:</span> <span className="tok-str">"{shortDate(record.open)}"</span><span className="tok-def">,</span>{'\n'}
          {'  '}<span className="tok-prop">judge</span><span className="tok-def">:</span> <span className="tok-str">"{shortAddress('0x' + c.to.slice(-40))}"</span><span className="tok-def">,</span>{'\n'}
          {'  '}<span className="tok-prop">sealed</span><span className="tok-def">:</span> <span className="tok-str">"{c.payload.slice(0, 42)}..."</span><span className="tok-def">,</span>{'\n'}
          {'  '}<span className="tok-prop">revealed</span><span className="tok-def">:</span> <span className="tok-type">{record.reveal ? 'true' : 'false'}</span>{'\n'}
          <span className="tok-def">{'}'}</span>
        </code>
      </pre>
      <ol className="record-card__steps">
        {steps.map((s) => (
          <li key={s.label}>
            <strong>{s.label}</strong>
            <span>{s.value}</span>
          </li>
        ))}
      </ol>
      {record.revealedContent && (
        <p className="record-card__meta">{String(record.revealedContent.body ?? '').slice(0, 140)}</p>
      )}
      {record.malformedReason && <p className="record-card__meta">Malformed: {record.malformedReason}</p>}
      <p className="record-card__foot">
        <a href={`#/record/${encodeURIComponent(record.commitmentId)}`}>Open record</a>
      </p>
    </article>
  )
}

/** One record as a compact table row, for the dashboard. The code-pane
 * RecordCard stays for the hero and the detail page; rows are for scanning. */
export function RecordRow({ record }: { record: OathRecord }) {
  const c = record.commitment
  const title = record.demoTitle ?? record.revealedContent?.body ?? 'Sealed commitment'
  const designated = record.verdicts.find((v) => v.designated)
  return (
    <tr>
      <td><StatusBadge status={record.status} /></td>
      <td>
        <a href={`#/record/${encodeURIComponent(record.commitmentId)}`}>{title}</a>
        <span className="record-row__id mono">{record.commitmentId.slice(0, 18)}…</span>
      </td>
      <td className="mono">{shortDate(record.open)}</td>
      <td>{designated ? `${designated.outcome}${designated.valid ? '' : ' (invalid)'}` : '—'}</td>
      <td><SourceBadge source={record.source} /></td>
      <td><a href={`#/record/${encodeURIComponent(record.commitmentId)}`}>Open</a></td>
    </tr>
  )
}

export function StatusBadge({ status }: { status: CommitmentStatus }) {
  return (
    <span className={`badge ${status}`}>
      <span className="dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  )
}

export function SourceBadge({ source }: { source: 'live' | 'demo' }) {
  if (source === 'demo') {
    return (
      <span className="badge demo">
        <span className="dot" aria-hidden="true" />
        {brandCopy.demoDisclaimer}
      </span>
    )
  }
  return (
    <span className="badge live">
      <span className="dot" aria-hidden="true" />
      {brandCopy.liveLabel}
    </span>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

export function Skeleton({ width = '100%', height }: { width?: string; height?: string }) {
  return (
    <span
      className="skeleton"
      style={{ width, height }}
      role="status"
      aria-label="Loading"
    />
  )
}

export function Callout({ kind = 'warn', children }: { kind?: 'warn' | 'info' | 'ok' | 'bad'; children: ReactNode }) {
  const cls = kind === 'warn' ? 'callout' : kind === 'info' ? 'callout info' : kind === 'ok' ? 'callout ok' : 'callout bad'
  return <div className={cls}>{children}</div>
}

export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <span key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </span>
      ))}
    </dl>
  )
}

export function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      className="btn secondary small"
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).catch(() => undefined)}
    >
      {label}
    </button>
  )
}

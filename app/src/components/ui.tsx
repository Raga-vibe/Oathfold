// Shared UI primitives. Styled by src/index.css.
// Skills applied: ui-styling (component states, accessible patterns),
// ui-ux-pro-max (status never by colour alone: badge dot plus uppercase text
// label), taste-skill (one system, plain copy, errors explain what to do next).
import type { ReactNode } from 'react'
import type { CommitmentStatus } from '../lib/protocol/tap12'
import type { OathRecord } from '../lib/records'
import { shortAddress } from '../lib/chain/xlayer'
import { brandCopy } from '../brand'
import { STATUS_DISPLAY, STATUS_PLAIN } from '../lib/plain'

function shortDate(ts: number): string {
  return new Date(ts * 1000).toUTCString().slice(5, 16)
}

/** One real record, rendered as a ledger entry. Same data and actions everywhere.
 * Plain words first: the code pane lists the promise in labelled lines, with
 * the sealed bytes as one short line, not a wall of hex. */
export function RecordCard({ record }: { record: OathRecord }) {
  const c = record.commitment
  const title = record.demoTitle ?? record.revealedContent?.body ?? 'Sealed promise'
  const designated = record.verdicts.find((v) => v.designated)
  const steps: { label: string; value: ReactNode }[] = [
    { label: 'Status', value: STATUS_DISPLAY[record.status] },
    { label: 'Opens', value: shortDate(record.open) },
    { label: 'Judge', value: shortAddress('0x' + c.to.slice(-40)) },
    {
      label: 'Ruling',
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
      <h3 className="record-card__title">
        <a href={`#/record/${encodeURIComponent(record.commitmentId)}`}>{title}</a>
      </h3>
      <div className="record-card__head">
        <StatusBadge status={record.status} />
        <SourceBadge source={record.source} />
      </div>
      <ol className="record-card__steps">
        {steps.map((s) => (
          <li key={s.label}>
            <strong>{s.label}</strong>
            <span>{s.value}</span>
          </li>
        ))}
      </ol>
      <pre className="record-card__payload" title={c.payload}>
        <code>
          <span className="code-punct">{'{'}</span>{'\n'}
          {'  '}<span className="code-prop">promise</span><span className="code-punct">:</span> <span className="code-str">"{title}"</span><span className="code-punct">,</span>{'\n'}
          {'  '}<span className="code-prop">status</span><span className="code-punct">:</span> <span className="code-str">"{record.status}"</span><span className="code-punct">,</span>{'\n'}
          {'  '}<span className="code-prop">opens</span><span className="code-punct">:</span> <span className="code-str">"{shortDate(record.open)}"</span><span className="code-punct">,</span>{'\n'}
          {'  '}<span className="code-prop">judge</span><span className="code-punct">:</span> <span className="code-str">"{shortAddress('0x' + c.to.slice(-40))}"</span><span className="code-punct">,</span>{'\n'}
          {'  '}<span className="code-prop">ruling</span><span className="code-punct">:</span> <span className="code-ruling">"{designated ? designated.outcome : 'not yet'}"</span><span className="code-punct">,</span>{'\n'}
          {'  '}<span className="code-prop">sealed</span><span className="code-punct">:</span> <span className="code-str">"{c.payload.slice(0, 42)}..."</span><span className="code-punct">,</span>{'\n'}
          {'  '}<span className="code-prop">opened</span><span className="code-punct">:</span> <span className="code-bool">{record.reveal ? 'true' : 'false'}</span>{'\n'}
          <span className="code-punct">{'}'}</span>
        </code>
      </pre>
      <p className="record-card__meta">{STATUS_PLAIN[record.status]}</p>
      {record.revealedContent && (
        <p className="record-card__meta">{String(record.revealedContent.body ?? '').slice(0, 140)}</p>
      )}
      {record.malformedReason && <p className="record-card__meta">Broken record: {record.malformedReason}</p>}
      <p className="record-card__foot">
        <a href={`#/record/${encodeURIComponent(record.commitmentId)}`}>Open promise</a>
      </p>
    </article>
  )
}

/** One record as a compact table row, for the dashboard. The code-pane
 * RecordCard stays for the hero and the detail page; rows are for scanning. */
export function RecordRow({ record }: { record: OathRecord }) {
  const c = record.commitment
  const title = record.demoTitle ?? record.revealedContent?.body ?? 'Sealed promise'
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
      {STATUS_DISPLAY[status]}
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

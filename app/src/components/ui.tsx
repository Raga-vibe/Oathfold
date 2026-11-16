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
  const steps: { label: string; value: string }[] = [
    { label: 'Seal', value: shortDate(c.blockTimestamp) },
    { label: 'Open', value: shortDate(record.open) },
    { label: 'Reveal', value: record.reveal ? shortDate(record.reveal.message.blockTimestamp) : 'Not yet' },
    { label: 'Verdict', value: designated ? `${designated.outcome} · ${shortDate(designated.message.blockTimestamp)}` : 'Not yet' },
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
      <p className="record-card__meta">
        Promise. Opens {shortDate(record.open)}. Judge{' '}
        <span className="mono">{shortAddress('0x' + c.to.slice(-40))}</span>.
      </p>
      <p className="record-card__meta">
        id <span className="mono">{record.commitmentId.slice(0, 26)}...</span>
      </p>
      <p className="record-card__payload" title={c.payload}>
        {c.payload.slice(0, 66)}...
      </p>
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
    return <span className="badge demo">{brandCopy.demoDisclaimer}</span>
  }
  return <span className="badge live">{brandCopy.liveLabel}</span>
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

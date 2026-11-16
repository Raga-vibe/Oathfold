import type { ReactNode } from 'react'
import type { CommitmentStatus } from '../lib/protocol/tap12'
import { statusLabel } from '../lib/protocol/tap12'

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
    return <span className="badge demo">DEMO FIXTURE: not on chain</span>
  }
  return <span className="badge live">LIVE: X Layer</span>
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

import { useMemo, useState } from 'react'
import type { OathRecord } from '../lib/records'
import type { CommitmentStatus } from '../lib/protocol/tap12'
import { statusExplain } from '../lib/protocol/tap12'
import { StatusBadge, SourceBadge } from '../components/ui'

const ALL: ('all' | CommitmentStatus)[] = ['all', 'sealed', 'due', 'revealed', 'judged', 'unrevealed', 'malformed']

export default function Dashboard({ records }: { records: OathRecord[] }) {
  const [filter, setFilter] = useState<'all' | CommitmentStatus>('all')
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of records) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [records])
  const shown = filter === 'all' ? records : records.filter((r) => r.status === filter)
  const sorted = [...shown].sort((a, b) => b.commitment.blockTimestamp - a.commitment.blockTimestamp)

  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        Every commitment, grouped by status. Unrevealed and malformed records are shown with
        the same prominence as judged ones. Nothing is hidden because of its status or outcome.
      </p>
      <div className="tabs" role="tablist" aria-label="Filter by status">
        {ALL.map((s) => (
          <button
            key={s}
            type="button"
            className={filter === s ? 'active' : ''}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? `All (${records.length})` : `${s} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>

      {sorted.length === 0 && (
        <p>No records with this status yet. Run a live scan on the Live chain page, or look at the demo fixtures.</p>
      )}
      <div className="grid">
        {sorted.map((r) => (
          <article className="card" key={r.commitmentId}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <StatusBadge status={r.status} />
              <SourceBadge source={r.source} />
            </div>
            <h3>
              <a href={`#/record/${encodeURIComponent(r.commitmentId)}`}>
                {r.demoTitle ?? r.revealedContent?.body ?? 'Sealed commitment'}
              </a>
            </h3>
            <p className="small">
              {r.kind} promise. Opens {new Date(r.open * 1000).toUTCString()}.
            </p>
            <p className="small">{statusExplain(r.status, r.open)}</p>
            {r.revealedContent && (
              <p>{String(r.revealedContent.body ?? '').slice(0, 160)}</p>
            )}
            {r.malformedReason && <p className="small">Malformed: {r.malformedReason}</p>}
            <p className="small mono">id {r.commitmentId.slice(0, 18)}...</p>
            <p>
              <a href={`#/record/${encodeURIComponent(r.commitmentId)}`}>Open record</a>
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

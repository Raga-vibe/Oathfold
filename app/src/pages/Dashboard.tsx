import { useMemo, useState } from 'react'
import type { OathRecord } from '../lib/records'
import type { CommitmentStatus } from '../lib/protocol/tap12'
import { buildGraph } from '../lib/graph/graph'
import { TrackRecordPanel } from '../components/graph-panels'
import { RecordCard } from '../components/ui'

// Demo author container and demo judge endpoint (see src/lib/demo.ts).
const DEMO_AUTHOR = '0xa2e4592ebbd0a08cf49dc306358b064587ab3362'
const DEMO_JUDGE = '0x0000000000000000000000c40b4a0ba288b4d2a87fc07db5f4c929f87dfda282'

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
  const graph = useMemo(() => buildGraph(records), [records])
  const showDemoTrackRecords = graph.nodes.some(
    (n) => n.id === `author:${DEMO_AUTHOR.toLowerCase()}`,
  )

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p>Every commitment, grouped by status. Unrevealed and malformed records are shown with the same prominence as judged ones.</p>
      </div>
      {showDemoTrackRecords && (
        <div>
          <h2>Track records (graph)</h2>
          <div className="grid">
            <TrackRecordPanel graph={graph} endpoint={DEMO_AUTHOR} role="author" />
            <TrackRecordPanel graph={graph} endpoint={DEMO_JUDGE} role="judge" />
          </div>
        </div>
      )}
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
          <RecordCard key={r.commitmentId} record={r} />
        ))}
      </div>
    </div>
  )
}

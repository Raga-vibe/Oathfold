import { useMemo, useState } from 'react'
import type { OathRecord } from '../lib/records'
import type { CommitmentStatus } from '../lib/protocol/tap12'
import { buildGraph } from '../lib/graph/graph'
import { TrackRecordPanel } from '../components/graph-panels'
import { RecordRow } from '../components/ui'
import { transitionDisclosure, deriveGraphState, type DisclosureState } from '../lib/machines'

// Demo author container and demo judge endpoint (see src/lib/demo.ts).
const DEMO_AUTHOR = '0xa2e4592ebbd0a08cf49dc306358b064587ab3362'
const DEMO_JUDGE = '0x0000000000000000000000c40b4a0ba288b4d2a87fc07db5f4c929f87dfda282'

const ALL: ('all' | CommitmentStatus)[] = ['all', 'sealed', 'due', 'revealed', 'judged', 'unrevealed', 'malformed']
const TAB_LABEL: Record<'all' | CommitmentStatus, string> = {
  all: 'All',
  sealed: 'Sealed',
  due: 'Due',
  revealed: 'Opened',
  judged: 'Ruled',
  unrevealed: 'Still locked',
  malformed: 'Broken',
}

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
  const graphState = deriveGraphState(graph)
  const showDemoTrackRecords = graphState === 'ready' && graph.nodes.some(
    (n) => n.id === `author:${DEMO_AUTHOR.toLowerCase()}`,
  )
  // Track records are graph context, not the record list: they sit behind a
  // disclosure toggle below the table so the rows scan in one screen.
  const [trackDisc, setTrackDisc] = useState<DisclosureState>('closed')

  function toggleTracks() {
    const r = transitionDisclosure(trackDisc, { type: 'toggle' })
    if (r.ok) setTrackDisc(r.state)
  }

  return (
    <div>
      <div className="page-head">
        <h1>Promises</h1>
        <p>Every promise. Ones still locked and broken ones sit next to ones the judge has ruled on.</p>
      </div>
      <div className="tabs" role="tablist" aria-label="Filter by status">
        {ALL.map((s) => (
          <button
            key={s}
            type="button"
            className={filter === s ? 'active' : ''}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? `All (${records.length})` : `${TAB_LABEL[s]} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>

      {sorted.length === 0 && (
        <p>No promises with this status yet. Run a live scan from the Advanced page, or look at the practice records.</p>
      )}
      {sorted.length > 0 && (
        <table className="record-table">
          <thead>
            <tr><th>Status</th><th>Promise</th><th>Opens</th><th>Ruling</th><th>Source</th><th></th></tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <RecordRow key={r.commitmentId} record={r} />
            ))}
          </tbody>
        </table>
      )}
      {showDemoTrackRecords && (
        <div style={{ marginTop: 16 }}>
          <button className="btn ghost small toggle-btn" type="button" onClick={toggleTracks} aria-expanded={trackDisc === 'open'}>
            {trackDisc === 'open' ? 'Hide track records' : 'Show track records'}
          </button>
          {trackDisc === 'open' && (
            <div className="grid">
              <TrackRecordPanel graph={graph} endpoint={DEMO_AUTHOR} role="author" title="This person's promises" />
              <TrackRecordPanel graph={graph} endpoint={DEMO_JUDGE} role="judge" title="This judge's rulings" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

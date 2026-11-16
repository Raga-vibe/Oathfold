// Graph context panels for Oathfold.
// Retrieval only: these panels show what the verified graph already says.
// They never judge a record, an author or a judge. Every panel carries the
// label "Graph context, not a judgement", and a DEMO FIXTURE label when the
// underlying records are demo fixtures.
import type { OathGraph, RelatedReason } from '../lib/graph/graph'
import {
  authorHistory,
  judgeHistory,
  relatedCommitments,
  evidenceGraph,
} from '../lib/graph/graph'
import { shortAddress, formatTime } from '../lib/chain/xlayer'

const REASON_LABELS: Record<RelatedReason, string> = {
  'same-author': 'Same author',
  'same-judge': 'Same judge',
  'same-program': 'Same program',
  'shared-evidence-url': 'Shares an evidence URL',
  'shared-evidence-domain': 'Shares an evidence domain',
}

const STATUSES = ['sealed', 'due', 'revealed', 'judged', 'unrevealed', 'malformed'] as const

function DemoLabel({ graph, commitmentIds }: { graph: OathGraph; commitmentIds: string[] }) {
  if (commitmentIds.length === 0) return null
  const sources = new Set(
    commitmentIds.map(
      (id) => graph.nodes.find((n) => n.id === `commitment:${id}`)?.source,
    ),
  )
  if (sources.size === 1 && sources.has('demo')) {
    return <span className="badge demo">DEMO FIXTURE: not on chain</span>
  }
  if (sources.has('demo')) {
    return <span className="badge demo">Includes DEMO FIXTURE records</span>
  }
  return null
}

export function TrackRecordPanel({
  graph,
  endpoint,
  role,
  title,
}: {
  graph: OathGraph
  endpoint: string
  role: 'author' | 'judge'
  title?: string
}) {
  const history = role === 'author' ? authorHistory(graph, endpoint) : judgeHistory(graph, endpoint)
  return (
    <div className="card">
      <h3>{title ?? (role === 'author' ? 'Author track record' : 'Judge track record')}</h3>
      <p className="small">Graph context, not a judgement.</p>
      <p className="small mono">{shortAddress(endpoint)}</p>
      <DemoLabel graph={graph} commitmentIds={history.commitmentIds} />
      {history.total === 0 ? (
        <p className="small">No verified commitments found for this endpoint in the current records.</p>
      ) : (
        <div>
          <p className="small">
            {history.total} commitment{history.total === 1 ? '' : 's'} in the graph.
          </p>
          <ul className="small">
            {STATUSES.map((s) => (
              <li key={s}>
                {s}: {history.byStatus[s]}
              </li>
            ))}
          </ul>
          <p className="small">
            Designated verdicts (counted): {history.designated.hit} hit,{' '}
            {history.designated.miss} miss, {history.designated.undecidable} undecidable.
          </p>
          <p className="small">
            Third-party verdicts (listed separately, never counted above):{' '}
            {history.thirdParty.hit} hit, {history.thirdParty.miss} miss,{' '}
            {history.thirdParty.undecidable} undecidable.
          </p>
          <p className="small">
            Malformed: {history.malformed}. Unrevealed: {history.unrevealed}.
          </p>
          <ul className="small">
            {history.commitmentIds.map((id) => (
              <li key={id}>
                <a href={`#/record/${encodeURIComponent(id)}`}>{id.slice(0, 18)}...</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function RelatedCommitmentsPanel({
  graph,
  commitmentId,
}: {
  graph: OathGraph
  commitmentId: string
}) {
  const related = relatedCommitments(graph, commitmentId)
  const relatedIds = related.map((r) => r.commitmentId)
  return (
    <div className="card">
      <h3>Related commitments</h3>
      <p className="small">Graph context, not a judgement.</p>
      <DemoLabel graph={graph} commitmentIds={relatedIds} />
      {related.length === 0 ? (
        <p className="small">No related commitments in the current records.</p>
      ) : (
        <ul>
          {related.map((r) => {
            const node = graph.nodes.find((n) => n.id === `commitment:${r.commitmentId}`)
            return (
              <li key={r.commitmentId} className="small">
                <a href={`#/record/${encodeURIComponent(r.commitmentId)}`}>
                  {node?.label ?? r.commitmentId.slice(0, 18) + '...'}
                </a>{' '}
                ({r.reasons.map((reason) => REASON_LABELS[reason]).join(', ')})
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function EvidenceGraphPanel({
  graph,
  commitmentId,
}: {
  graph: OathGraph
  commitmentId: string
}) {
  const ev = evidenceGraph(graph, commitmentId)
  const allIds = [commitmentId]
  return (
    <div className="card">
      <h3>Evidence graph</h3>
      <p className="small">Graph context, not a judgement.</p>
      <DemoLabel graph={graph} commitmentIds={allIds} />
      {!ev.commitment ? (
        <p className="small">No graph entry for this commitment.</p>
      ) : (
        <div>
          <p className="small">
            Commitment: {ev.commitment.label} (status {ev.commitment.data.status ?? 'unknown'}).
            Source ref: <span className="mono">{ev.commitment.ref}</span>
          </p>
          {ev.reveal ? (
            <p className="small">
              Revealed by {ev.reveal.by?.label ?? 'unknown'} ({ev.reveal.ref}).
            </p>
          ) : (
            <p className="small">No verified reveal in the graph.</p>
          )}
          <h4>Designated judge verdicts</h4>
          {ev.designatedVerdicts.length === 0 ? (
            <p className="small">None.</p>
          ) : (
            ev.designatedVerdicts.map((entry, i) => (
              <div key={i}>
                <p className="small">
                  <strong>{entry.verdict.data.outcome}</strong> ({entry.verdict.ref})
                  {entry.verdict.data.reason ? ` Reason: ${entry.verdict.data.reason}` : ''}
                </p>
                {entry.evidence.length === 0 ? (
                  <p className="small">No evidence sources cited.</p>
                ) : (
                  <ul>
                    {entry.evidence.map((s, j) => (
                      <li key={j} className="small">
                        {s.data.name}: {s.data.value}
                        {s.data.at !== undefined ? ` at ${formatTime(s.data.at)}` : ''}
                        {s.data.url ? (
                          <>
                            {' '}
                            (<a href={s.data.url} target="_blank" rel="noreferrer">
                              {s.data.domain ?? s.data.url}
                            </a>)
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
          <h4>Third-party verdicts</h4>
          {ev.thirdPartyVerdicts.length === 0 ? (
            <p className="small">None. Third-party verdicts are listed separately and never merged with the designated judge verdict.</p>
          ) : (
            ev.thirdPartyVerdicts.map((entry, i) => (
              <div key={i}>
                <p className="small">
                  <strong>{entry.verdict.data.outcome}</strong> by{' '}
                  <span className="mono">
                    {entry.verdict.data.from ? shortAddress(entry.verdict.data.from) : 'unknown'}
                  </span>{' '}
                  ({entry.verdict.ref})
                </p>
                <ul>
                  {entry.evidence.map((s, j) => (
                    <li key={j} className="small">
                      {s.data.name}: {s.data.value}
                      {s.data.url ? (
                        <>
                          {' '}
                          (<a href={s.data.url} target="_blank" rel="noreferrer">
                            {s.data.domain ?? s.data.url}
                          </a>)
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

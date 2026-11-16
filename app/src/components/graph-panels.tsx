// Background panels for Oathfold (the graph layer).
// Retrieval only: these panels show what the verified record already says.
// They never rule on a promise, a person or a judge. Every panel carries the
// label "Background, not a ruling", and a practice-record label when the
// underlying records are practice records.
import type { OathGraph, RelatedReason } from '../lib/graph/graph'
import {
  authorHistory,
  judgeHistory,
  relatedCommitments,
  evidenceGraph,
} from '../lib/graph/graph'
import { shortAddress, formatTime } from '../lib/chain/xlayer'
import { GRAPH_NOTE, PRACTICE_DISCLAIMER, PRACTICE_INCLUDES } from '../lib/plain'

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
    return <span className="badge demo">{PRACTICE_DISCLAIMER}</span>
  }
  if (sources.has('demo')) {
    return <span className="badge demo">{PRACTICE_INCLUDES}</span>
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
      <h3>{title ?? (role === 'author' ? 'Promises by this person' : 'Rulings by this judge')}</h3>
      <p className="small">{GRAPH_NOTE}</p>
      <p className="small mono">{shortAddress(endpoint)}</p>
      <DemoLabel graph={graph} commitmentIds={history.commitmentIds} />
      {history.total === 0 ? (
        <p className="small">No verified promises found for this account in the current records.</p>
      ) : (
        <div>
          <p className="small">
            {history.total} promise{history.total === 1 ? '' : 's'} in this list.
          </p>
          <ul className="small">
            {STATUSES.map((s) => (
              <li key={s}>
                {s}: {history.byStatus[s]}
              </li>
            ))}
          </ul>
          <p className="small">
            The judge's rulings (counted): {history.designated.hit} hit,{' '}
            {history.designated.miss} miss, {history.designated.undecidable} cannot decide.
          </p>
          <p className="small">
            Other people's calls (listed separately, never counted above):{' '}
            {history.thirdParty.hit} hit, {history.thirdParty.miss} miss,{' '}
            {history.thirdParty.undecidable} undecidable.
          </p>
          <p className="small">
            Broken: {history.malformed}. Still locked: {history.unrevealed}.
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
      <h3>Related promises</h3>
      <p className="small">{GRAPH_NOTE}</p>
      <DemoLabel graph={graph} commitmentIds={relatedIds} />
      {related.length === 0 ? (
        <p className="small">No related promises in the current records.</p>
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
      <h3>Proof</h3>
      <p className="small">{GRAPH_NOTE}</p>
      <DemoLabel graph={graph} commitmentIds={allIds} />
      {!ev.commitment ? (
        <p className="small">No background for this promise yet.</p>
      ) : (
        <div>
          <p className="small">
            Promise: {ev.commitment.label} (status {ev.commitment.data.status ?? 'unknown'}).
          </p>
          {ev.reveal ? (
            <p className="small">
              Opened by {ev.reveal.by?.label ?? 'unknown'}.
            </p>
          ) : (
            <p className="small">No verified opening yet.</p>
          )}
          <h4>The judge's rulings</h4>
          {ev.designatedVerdicts.length === 0 ? (
            <p className="small">None.</p>
          ) : (
            ev.designatedVerdicts.map((entry, i) => (
              <div key={i}>
                <p className="small">
                  <strong>{entry.verdict.data.outcome}</strong>
                  {entry.verdict.data.reason ? ` Reason: ${entry.verdict.data.reason}` : ''}
                </p>
                {entry.evidence.length === 0 ? (
                  <p className="small">No proof cited.</p>
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
          <h4>Other people's calls</h4>
          {ev.thirdPartyVerdicts.length === 0 ? (
            <p className="small">None. Other people's calls are listed separately and never counted with the judge's ruling.</p>
          ) : (
            ev.thirdPartyVerdicts.map((entry, i) => (
              <div key={i}>
                <p className="small">
                  <strong>{entry.verdict.data.outcome}</strong> by{' '}
                  <span className="mono">
                    {entry.verdict.data.from ? shortAddress(entry.verdict.data.from) : 'unknown'}
                  </span>
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

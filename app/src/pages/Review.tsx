import { useMemo, useState } from 'react'
import type { OathRecord } from '../lib/records'
import { checkVerdictRules, buildVerdictContent } from '../lib/protocol/tap12'
import { buildGraph } from '../lib/graph/graph'
import { TrackRecordPanel, RelatedCommitmentsPanel, EvidenceGraphPanel } from '../components/graph-panels'
import { StatusBadge, SourceBadge, Callout } from '../components/ui'
import { formatTime } from '../lib/chain/xlayer'
import {
  transitionVerdictDraft,
  transitionDisclosure,
  draftAllowedOutcomes,
  type VerdictDraftState,
  type DisclosureState,
} from '../lib/machines'

export default function Review({ records }: { records: OathRecord[] }) {
  const nowSec = Math.floor(Date.now() / 1000)
  const queue = useMemo(
    () =>
      records.filter(
        (r) => (r.status === 'due' || r.status === 'revealed' || r.status === 'unrevealed') && !r.malformedReason,
      ),
    [records],
  )
  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.commitmentId ?? null)
  const [outcome, setOutcome] = useState<'hit' | 'miss' | 'undecidable'>('undecidable')
  const [reason, setReason] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceValue, setSourceValue] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  // Verdict draft is one named machine (src/lib/machines.ts): idle, editing,
  // invalid, ready. An illegal outcome (hit/miss on an unrevealed record) is
  // rejected at selection time, not at build time.
  const [draftState, setDraftState] = useState<VerdictDraftState>('idle')
  const [graphDisc, setGraphDisc] = useState<DisclosureState>('closed')

  const selected = queue.find((r) => r.commitmentId === selectedId) ?? queue[0]
  const graph = useMemo(() => buildGraph(records), [records])
  const revealed = !!selected?.reveal
  const check = selected
    ? checkVerdictRules({
        outcome,
        sources: sourceName && sourceValue ? [{ name: sourceName, value: sourceValue, at: selected.open, url: sourceUrl || undefined }] : [],
        revealed,
        verdictBlockTime: nowSec,
        open: selected.open,
        isDesignatedJudge: true,
      })
    : { errors: [], early: false }

  function selectRecord(id: string) {
    setSelectedId(id)
    setDraft(null)
    setErrors([])
    const rec = queue.find((r) => r.commitmentId === id)
    if (rec && !draftAllowedOutcomes(!!rec.reveal).includes(outcome)) setOutcome('undecidable')
    const r = transitionVerdictDraft(draftState, { type: 'select-record' })
    if (r.ok) setDraftState(r.state)
  }

  function onEdit() {
    const r = transitionVerdictDraft(draftState, { type: 'edit' })
    if (r.ok) setDraftState(r.state)
  }

  function toggleGraph() {
    const r = transitionDisclosure(graphDisc, { type: 'toggle' })
    if (r.ok) setGraphDisc(r.state)
  }

  function shortDate(ts: number): string {
    return new Date(ts * 1000).toUTCString().slice(5, 16)
  }

  const allowedOutcomes = draftAllowedOutcomes(revealed)

  function buildDraft() {
    if (!selected) return
    const errs: string[] = []
    if (!reason.trim()) errs.push('A reason is required.')
    if (!body.trim()) errs.push('Write the verdict in words (body).')
    if ((outcome === 'hit' || outcome === 'miss')) {
      if (!sourceName.trim() || !sourceValue.trim()) errs.push('Hit/miss verdicts require at least one source with a name and a value.')
    }
    if (!revealed && outcome !== 'undecidable') errs.push('This commitment has not been revealed, so the verdict must be undecidable.')
    const allErrors = [...errs, ...check.errors]
    setErrors(allErrors)
    const r = transitionVerdictDraft(draftState, { type: 'build', valid: allErrors.length === 0, errors: allErrors })
    if (!r.ok) return
    setDraftState(r.state)
    if (r.state !== 'ready') return
    const bytes = buildVerdictContent({
      body: body.trim(),
      commitment: { chainId: 196, to: selected.commitment.to, inboxIndex: selected.commitment.inboxIndex },
      outcome,
      sources: sourceName.trim()
        ? [{ name: sourceName.trim(), value: sourceValue.trim(), at: selected.open, url: sourceUrl.trim() || undefined }]
        : undefined,
      reason: reason.trim(),
      subject: 'Verdict',
    })
    const ref = '0x5343563103' + selected.commitmentId.slice(2, 2 + 54)
    setDraft(
      `TAP-12 verdict draft (NOT SENT).\n` +
      `Commitment: ${selected.commitmentId}\n` +
      `Ref: ${ref}\n` +
      `Outcome: ${outcome}${check.early ? ' (early: before the open time)' : ''}\n` +
      `Content JSON:\n${new TextDecoder().decode(bytes)}\n\n` +
      `To send this live, the judge sends a public TAP-10 message to the author endpoint ` +
      `with this ref and this content as the payload. Oathfold does not send verdicts ` +
      `from this page yet: a verdict must come from the judge container, and this demo ` +
      `build has no judge wallet connected. Use the content above with the live send path ` +
      `once a judge holder wallet is available.`,
    )
  }

  return (
    <div>
      <h1>Reviewer console</h1>
      <p>
        Due, revealed and unrevealed commitments waiting for a verdict. An unrevealed
        commitment can only be undecidable. Hit and miss need at least one source.
      </p>
      {queue.length === 0 && (
        <Callout kind="info">
          Nothing is waiting for review right now. Demo records in due, revealed and unrevealed
          states appear here once they exist.
        </Callout>
      )}
      <div className="two-col">
        <div className="queue" role="listbox" aria-label="Commitments waiting for review">
          {queue.map((r) => (
            <div
              key={r.commitmentId}
              role="option"
              aria-selected={selected?.commitmentId === r.commitmentId}
              className={`queue-row${selected?.commitmentId === r.commitmentId ? ' selected' : ''}`}
              onClick={() => selectRecord(r.commitmentId)}
            >
              <StatusBadge status={r.status} />
              <span className="queue-row__title">{r.demoTitle ?? r.revealedContent?.body ?? 'Sealed commitment'}</span>
              <span className="small mono">Opens {shortDate(r.open)}</span>
              <span className="small">{r.reveal ? 'Revealed' : 'Not revealed'}</span>
              <button className="btn secondary small" type="button" onClick={(e) => { e.stopPropagation(); selectRecord(r.commitmentId) }}>
                Review
              </button>
            </div>
          ))}
        </div>
        <div>
          {selected && (
            <div className="card">
              <h3>Verdict for {selected.demoTitle ?? 'this commitment'}</h3>
              <p className="small mono">{selected.commitmentId}</p>
              {!revealed && (
                <Callout>
                  Not revealed yet. The only valid outcome is undecidable until the content key
                  is published.
                </Callout>
              )}
              {check.early && <Callout>Early: the open time has not passed yet. This verdict would be marked early.</Callout>}
              <label htmlFor="outcome">Outcome</label>
              <select
                id="outcome"
                value={outcome}
                onChange={(e) => {
                  const next = e.target.value as typeof outcome
                  const r = transitionVerdictDraft(draftState, { type: 'set-outcome', outcome: next, revealed })
                  if (!r.ok) return
                  setDraftState(r.state)
                  setOutcome(next)
                }}
              >
                {(['hit', 'miss', 'undecidable'] as const).map((o) => (
                  <option key={o} value={o} disabled={!allowedOutcomes.includes(o)}>
                    {o}{!allowedOutcomes.includes(o) ? ' (needs a reveal)' : ''}
                  </option>
                ))}
              </select>
              <label htmlFor="vbody">Verdict in words (body)</label>
              <textarea id="vbody" value={body} onChange={(e) => { onEdit(); setBody(e.target.value) }} placeholder="Hit. The release tag exists." />
              <label htmlFor="reason">Reason (required)</label>
              <input id="reason" value={reason} onChange={(e) => { onEdit(); setReason(e.target.value) }} placeholder="Checked against the public release." />
              <label htmlFor="sname">Source name (required for hit/miss)</label>
              <input id="sname" value={sourceName} onChange={(e) => { onEdit(); setSourceName(e.target.value) }} placeholder="github-release" />
              <label htmlFor="svalue">Source value (required for hit/miss)</label>
              <input id="svalue" value={sourceValue} onChange={(e) => { onEdit(); setSourceValue(e.target.value) }} placeholder="v1.0.0" />
              <label htmlFor="surl">Source URL (optional)</label>
              <input id="surl" value={sourceUrl} onChange={(e) => { onEdit(); setSourceUrl(e.target.value) }} placeholder="https://..." />
              {errors.length > 0 && (
                <Callout kind="bad">
                  <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
                </Callout>
              )}
              {draft && (
                <div>
                  <h3>Draft (not sent)</h3>
                  <pre className="mono code-pane" style={{ whiteSpace: 'pre-wrap' }}>{draft}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {selected && (
        <div style={{ marginTop: 16 }}>
          <button className="btn ghost small toggle-btn" type="button" onClick={toggleGraph} aria-expanded={graphDisc === 'open'}>
            {graphDisc === 'open' ? 'Hide graph context' : 'Show graph context'} (CONTEXT ONLY)
          </button>
          {graphDisc === 'open' && (
            <div>
              <p className="small">
                Graph context, not a judgement. This section only shows the verified record of
                the author and the judge and the commitments that share evidence with this one.
                It does not judge this commitment.
              </p>
              <div className="grid">
                <TrackRecordPanel graph={graph} endpoint={selected.commitment.from} role="author" />
                <TrackRecordPanel graph={graph} endpoint={selected.commitment.to} role="judge" />
              </div>
              <RelatedCommitmentsPanel graph={graph} commitmentId={selected.commitmentId} />
              <EvidenceGraphPanel graph={graph} commitmentId={selected.commitmentId} />
            </div>
          )}
        </div>
      )}

      <div className="action-bar" role="region" aria-label="Verdict actions">
        <button className="btn" type="button" onClick={buildDraft} disabled={!selected}>
          Build verdict draft
        </button>
        <span className="action-bar__status">
          {draftState === 'ready'
            ? 'Draft ready (not sent).'
            : draftState === 'invalid'
              ? 'Fix the errors above.'
              : selected
                ? `Reviewing: ${selected.demoTitle ?? 'this commitment'}`
                : 'Nothing selected.'}
        </span>
      </div>
    </div>
  )
}

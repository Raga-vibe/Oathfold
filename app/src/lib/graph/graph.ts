// Graph retrieval over VERIFIED Oathfold records only.
//
// The graph is built from OathRecord values, which come from exactly two
// verified sources: chain-verified records rebuilt by the indexer from X
// Layer hub data, and labelled demo fixtures built locally by src/lib/demo.ts.
// Unverified, invented or guessed data is never added here, and this module
// never produces a verdict: it only retrieves and counts what the records
// already say.
//
// Rebuildable from chain data: there is no separate graph persistence. To
// rebuild, re-run the indexer (which re-scans the hub and rebuilds the
// OathRecord list from on-chain messages), then call buildGraph(records)
// again. Demo fixtures rebuild the same way from src/lib/demo.ts. The build
// is deterministic: nodes and edges are sorted by id before returning, so
// rebuilding from the same records always yields an identical graph.
//
// Rules enforced here:
// - Outcome counts (hit / miss / undecidable) use DESIGNATED verdicts only.
//   Third-party verdicts are listed separately and never counted in
//   designated totals.
// - Malformed and unrevealed records are nodes in the graph and counted
//   visibly. They are never dropped.
// - Every node and edge carries its source block/message ref and a source
//   flag ('live' | 'demo') copied from the underlying record. Demo fixtures
//   stay labelled 'demo' on every node they produce.

import type { CommitmentStatus, VerdictOutcome } from '../protocol/tap12'
import type { OathRecord } from '../records'

export type GraphSource = 'live' | 'demo'

export type GraphNodeKind =
  | 'commitment'
  | 'author'
  | 'judge'
  | 'verdict'
  | 'evidence'
  | 'program'

export type GraphEdgeKind =
  | 'SEALED_TO'
  | 'REVEALED_BY'
  | 'JUDGED_BY'
  | 'CITES'
  | 'IN_PROGRAM'
  | 'RELATED_CLAIM'

export type RelatedReason =
  | 'same-author'
  | 'same-judge'
  | 'same-program'
  | 'shared-evidence-url'
  | 'shared-evidence-domain'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  /** Source block/message ref for this node, e.g. "block 42000101 tx 0x...". */
  ref: string
  /** 'live' for chain-verified records, 'demo' for labelled demo fixtures. */
  source: GraphSource
  data: {
    commitmentId?: string
    status?: CommitmentStatus
    kind?: string
    open?: number
    /** Author container address (20 bytes) or judge container address. */
    container?: string
    /** 32-byte TAP-10 endpoint id, when known. */
    endpoint?: string
    designated?: boolean
    outcome?: VerdictOutcome
    valid?: boolean
    early?: boolean
    reason?: string
    body?: string
    from?: string
    index?: number
    url?: string
    domain?: string | null
    name?: string
    value?: string
    at?: number
    program?: string
    author?: string
    judge?: string
  }
}

export interface GraphEdge {
  id: string
  kind: GraphEdgeKind
  from: string
  to: string
  /** Source block/message ref for this edge. */
  ref: string
  source: GraphSource
  data: {
    reason?: RelatedReason
    detail?: string
  }
}

export interface OathGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  builtFrom: { recordCount: number; live: number; demo: number }
}

export type OutcomeCounts = { hit: number; miss: number; undecidable: number }

export interface TrackRecord {
  endpoint: string
  total: number
  byStatus: Record<CommitmentStatus, number>
  /** Counts use DESIGNATED, valid verdicts only. */
  designated: OutcomeCounts
  /** Third-party verdicts, listed separately, never merged into designated. */
  thirdParty: OutcomeCounts
  commitmentIds: string[]
  malformed: number
  unrevealed: number
}

export interface RelatedCommitment {
  commitmentId: string
  reasons: RelatedReason[]
}

export interface EvidenceGraphResult {
  commitmentId: string
  commitment: GraphNode | null
  reveal: { by: GraphNode | null; ref: string; source: GraphSource } | null
  designatedVerdicts: { verdict: GraphNode; evidence: GraphNode[] }[]
  thirdPartyVerdicts: { verdict: GraphNode; evidence: GraphNode[] }[]
}

export interface ProgramGraphResult {
  program: string
  total: number
  byStatus: Record<CommitmentStatus, number>
  commitmentIds: string[]
  authorEndpoints: string[]
  judgeEndpoints: string[]
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface AuthorRecordSummary extends TrackRecord {
  summary: string
}

const ALL_STATUSES: CommitmentStatus[] = [
  'malformed',
  'sealed',
  'due',
  'revealed',
  'unrevealed',
  'judged',
]

const UNASSIGNED_PROGRAM = 'unassigned'

function emptyByStatus(): Record<CommitmentStatus, number> {
  return { malformed: 0, sealed: 0, due: 0, revealed: 0, unrevealed: 0, judged: 0 }
}

function emptyOutcomes(): OutcomeCounts {
  return { hit: 0, miss: 0, undecidable: 0 }
}

function emptyTrackRecord(endpoint: string): TrackRecord {
  return {
    endpoint,
    total: 0,
    byStatus: emptyByStatus(),
    designated: emptyOutcomes(),
    thirdParty: emptyOutcomes(),
    commitmentIds: [],
    malformed: 0,
    unrevealed: 0,
  }
}

function shortAddr(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}...${addr.slice(-4)}` : addr
}

function msgRef(blockNumber: number, txHash: string): string {
  return `block ${blockNumber} tx ${txHash}`
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

function norm(s: string): string {
  return s.toLowerCase()
}

/** Build the graph from verified records. Deterministic: same records in, same graph out. */
export function buildGraph(
  records: OathRecord[],
  programs: Record<string, string> = {},
): OathGraph {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  let live = 0
  let demo = 0

  function addNode(node: GraphNode): GraphNode {
    const existing = nodes.get(node.id)
    if (!existing) {
      nodes.set(node.id, node)
      return node
    }
    // Merge: fill in data fields the first sighting did not know (for
    // example the author endpoint, learned from a later verdict message).
    for (const [k, v] of Object.entries(node.data)) {
      const key = k as keyof GraphNode['data']
      if (existing.data[key] === undefined && v !== undefined) {
        ;(existing.data as Record<string, unknown>)[key] = v
      }
    }
    return existing
  }

  function addEdge(edge: GraphEdge): void {
    if (!edges.has(edge.id)) edges.set(edge.id, edge)
  }

  const sorted = [...records].sort((a, b) =>
    a.commitmentId < b.commitmentId ? -1 : a.commitmentId > b.commitmentId ? 1 : 0,
  )

  for (const r of sorted) {
    if (r.source === 'live') live += 1
    else demo += 1
    const c = r.commitment
    const commitmentNodeId = `commitment:${r.commitmentId}`
    const authorNodeId = `author:${norm(c.from)}`
    const judgeNodeId = `judge:${norm(c.to)}`
    const programLabel = programs[r.commitmentId] ?? UNASSIGNED_PROGRAM
    const programNodeId = `program:${programLabel}`
    const cref = msgRef(c.blockNumber, c.txHash)

    addNode({
      id: commitmentNodeId,
      kind: 'commitment',
      label: r.demoTitle ?? 'Sealed commitment',
      ref: cref,
      source: r.source,
      data: {
        commitmentId: r.commitmentId,
        status: r.status,
        kind: r.kind,
        open: r.open,
        author: c.from,
        judge: c.to,
        program: programLabel,
      },
    })
    addNode({
      id: authorNodeId,
      kind: 'author',
      label: `Author ${shortAddr(c.from)}`,
      ref: cref,
      source: r.source,
      data: { container: c.from },
    })
    addNode({
      id: judgeNodeId,
      kind: 'judge',
      label: `Judge ${shortAddr(c.to)}`,
      ref: cref,
      source: r.source,
      data: { endpoint: c.to, container: `0x${c.to.slice(-40)}`, designated: true },
    })
    addNode({
      id: programNodeId,
      kind: 'program',
      label: programLabel,
      ref: `program:${programLabel}`,
      source: r.source,
      data: { program: programLabel },
    })

    addEdge({
      id: `edge:sealed_to:${authorNodeId}:${commitmentNodeId}`,
      kind: 'SEALED_TO',
      from: authorNodeId,
      to: commitmentNodeId,
      ref: cref,
      source: r.source,
      data: {},
    })
    addEdge({
      id: `edge:in_program:${commitmentNodeId}:${programNodeId}`,
      kind: 'IN_PROGRAM',
      from: commitmentNodeId,
      to: programNodeId,
      ref: cref,
      source: r.source,
      data: {},
    })

    // The author endpoint is learned from messages addressed to the author
    // (verdicts, and reveals sent by the judge).
    const authorEndpoint =
      r.verdicts[0]?.message.to ??
      (r.reveal && r.reveal.message.to !== c.to ? r.reveal.message.to : undefined)
    if (authorEndpoint) {
      addNode({
        id: authorNodeId,
        kind: 'author',
        label: `Author ${shortAddr(c.from)}`,
        ref: cref,
        source: r.source,
        data: { container: c.from, endpoint: authorEndpoint },
      })
    }

    if (r.reveal) {
      const rm = r.reveal.message
      const revealerIsAuthor = norm(rm.from) === norm(c.from)
      const revealerIsJudge = norm(rm.from) === norm(`0x${c.to.slice(-40)}`)
      const revealerId = revealerIsAuthor
        ? authorNodeId
        : revealerIsJudge
          ? judgeNodeId
          : `judge:${norm(rm.from)}`
      if (!revealerIsAuthor && !revealerIsJudge) {
        addNode({
          id: revealerId,
          kind: 'judge',
          label: `Judge ${shortAddr(rm.from)}`,
          ref: msgRef(rm.blockNumber, rm.txHash),
          source: r.source,
          data: { container: rm.from, designated: false },
        })
      }
      addEdge({
        id: `edge:revealed_by:${commitmentNodeId}:${revealerId}`,
        kind: 'REVEALED_BY',
        from: commitmentNodeId,
        to: revealerId,
        ref: msgRef(rm.blockNumber, rm.txHash),
        source: r.source,
        data: {},
      })
    }

    r.verdicts.forEach((v, i) => {
      const vm = v.message
      const verdictNodeId = `verdict:${r.commitmentId}:${i}`
      const vref = msgRef(vm.blockNumber, vm.txHash)
      const verdictJudgeId = v.designated
        ? judgeNodeId
        : `judge:${norm(vm.from)}`
      if (!v.designated) {
        addNode({
          id: verdictJudgeId,
          kind: 'judge',
          label: `Judge ${shortAddr(vm.from)}`,
          ref: vref,
          source: r.source,
          data: { container: vm.from, designated: false },
        })
      }
      addNode({
        id: verdictNodeId,
        kind: 'verdict',
        label: `Verdict ${v.outcome}`,
        ref: vref,
        source: r.source,
        data: {
          commitmentId: r.commitmentId,
          outcome: v.outcome,
          designated: v.designated,
          valid: v.valid,
          early: v.early,
          reason: v.reason,
          body: v.body,
          from: vm.from,
          index: i,
        },
      })
      addEdge({
        id: `edge:judged_by:${verdictNodeId}:${verdictJudgeId}`,
        kind: 'JUDGED_BY',
        from: verdictNodeId,
        to: verdictJudgeId,
        ref: vref,
        source: r.source,
        data: {},
      })
      // Commitment to designated judge, for valid designated verdicts only,
      // matching the TAP-12 section 7 meaning of "judged".
      if (v.designated && v.valid) {
        addEdge({
          id: `edge:judged_by:${commitmentNodeId}:${judgeNodeId}`,
          kind: 'JUDGED_BY',
          from: commitmentNodeId,
          to: judgeNodeId,
          ref: vref,
          source: r.source,
          data: {},
        })
      }
      for (const s of v.sources) {
        const domain = s.url ? domainOf(s.url) : null
        const evidenceId = s.url
          ? `evidence:${norm(s.url)}`
          : `evidence:${s.name}:${s.value}`
        addNode({
          id: evidenceId,
          kind: 'evidence',
          label: s.url ? domain ?? s.url : `${s.name}: ${s.value}`,
          ref: s.url ?? `${s.name}: ${s.value}`,
          source: r.source,
          data: { url: s.url, domain, name: s.name, value: s.value, at: s.at },
        })
        addEdge({
          id: `edge:cites:${verdictNodeId}:${evidenceId}`,
          kind: 'CITES',
          from: verdictNodeId,
          to: evidenceId,
          ref: vref,
          source: r.source,
          data: {},
        })
      }
    })
  }

  // RELATED_CLAIM edges: same author, same judge, same program, or shared
  // evidence URL / domain. One edge per (pair, reason), both directions are
  // covered by looking the pair up from either end at retrieval time.
  const commitmentIds = sorted.map((r) => r.commitmentId)
  const byId = new Map(sorted.map((r) => [r.commitmentId, r]))
  const evidenceUrls = new Map<string, Set<string>>()
  const evidenceDomains = new Map<string, Set<string>>()
  for (const r of sorted) {
    const urls = new Set<string>()
    const domains = new Set<string>()
    for (const v of r.verdicts) {
      for (const s of v.sources) {
        if (s.url) {
          urls.add(norm(s.url))
          const d = domainOf(s.url)
          if (d) domains.add(d)
        }
      }
    }
    evidenceUrls.set(r.commitmentId, urls)
    evidenceDomains.set(r.commitmentId, domains)
  }
  for (let i = 0; i < commitmentIds.length; i++) {
    for (let j = i + 1; j < commitmentIds.length; j++) {
      const a = commitmentIds[i]
      const b = commitmentIds[j]
      const ra = byId.get(a)!
      const rb = byId.get(b)!
      const reasons: { reason: RelatedReason; detail: string }[] = []
      if (norm(ra.commitment.from) === norm(rb.commitment.from)) {
        reasons.push({ reason: 'same-author', detail: ra.commitment.from })
      }
      if (norm(ra.commitment.to) === norm(rb.commitment.to)) {
        reasons.push({ reason: 'same-judge', detail: ra.commitment.to })
      }
      const pa = programs[a] ?? UNASSIGNED_PROGRAM
      const pb = programs[b] ?? UNASSIGNED_PROGRAM
      if (pa === pb && pa !== UNASSIGNED_PROGRAM) {
        reasons.push({ reason: 'same-program', detail: pa })
      }
      const sharedUrls = [...(evidenceUrls.get(a) ?? [])].filter((u) =>
        evidenceUrls.get(b)?.has(u),
      )
      for (const u of sharedUrls) {
        reasons.push({ reason: 'shared-evidence-url', detail: u })
      }
      const sharedDomains = [...(evidenceDomains.get(a) ?? [])].filter((d) =>
        evidenceDomains.get(b)?.has(d),
      )
      for (const d of sharedDomains) {
        if (!sharedUrls.some((u) => domainOf(u) === d)) {
          reasons.push({ reason: 'shared-evidence-domain', detail: d })
        }
      }
      const fromId = `commitment:${a}`
      const toId = `commitment:${b}`
      for (const { reason, detail } of reasons) {
        addEdge({
          id: `edge:related:${fromId}:${toId}:${reason}`,
          kind: 'RELATED_CLAIM',
          from: fromId,
          to: toId,
          ref: detail,
          source: ra.source === 'demo' && rb.source === 'demo' ? 'demo' : 'live',
          data: { reason, detail },
        })
      }
    }
  }

  const outNodes = [...nodes.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const outEdges = [...edges.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { nodes: outNodes, edges: outEdges, builtFrom: { recordCount: sorted.length, live, demo } }
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

function commitmentNode(graph: OathGraph, commitmentId: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === `commitment:${commitmentId}`)
}

function verdictNodesFor(graph: OathGraph, commitmentIds: Set<string>): GraphNode[] {
  return graph.nodes.filter(
    (n) => n.kind === 'verdict' && n.data.commitmentId && commitmentIds.has(n.data.commitmentId),
  )
}

function countOutcomes(verdicts: GraphNode[], designated: boolean, counts: OutcomeCounts): void {
  for (const v of verdicts) {
    if (v.data.designated !== designated) continue
    if (v.data.valid !== true) continue
    const outcome = v.data.outcome
    if (outcome === 'hit' || outcome === 'miss' || outcome === 'undecidable') {
      counts[outcome] += 1
    }
  }
}

function fillByStatus(graph: OathGraph, ids: string[], rec: TrackRecord): void {
  for (const id of ids) {
    const node = commitmentNode(graph, id)
    if (node?.data.status) rec.byStatus[node.data.status] += 1
  }
  rec.malformed = rec.byStatus.malformed
  rec.unrevealed = rec.byStatus.unrevealed
}

/** Complete record for one author, from the graph. Counts use designated verdicts only. */
export function authorHistory(graph: OathGraph, authorEndpoint: string): TrackRecord {
  const arg = norm(authorEndpoint)
  const rec = emptyTrackRecord(authorEndpoint)
  const authorNodeIds = new Set(
    graph.nodes
      .filter(
        (n) =>
          n.kind === 'author' &&
          (norm(n.data.container ?? '') === arg || norm(n.data.endpoint ?? '') === arg),
      )
      .map((n) => n.id),
  )
  if (authorNodeIds.size === 0) return rec
  const ids = graph.edges
    .filter((e) => e.kind === 'SEALED_TO' && authorNodeIds.has(e.from))
    .map((e) => e.to.replace(/^commitment:/, ''))
    .sort()
  rec.commitmentIds = [...new Set(ids)]
  rec.total = rec.commitmentIds.length
  fillByStatus(graph, rec.commitmentIds, rec)
  const idSet = new Set(rec.commitmentIds)
  const verdicts = verdictNodesFor(graph, idSet)
  countOutcomes(verdicts, true, rec.designated)
  countOutcomes(verdicts, false, rec.thirdParty)
  return rec
}

/** Complete record for one judge, from the graph. Counts use designated verdicts only. */
export function judgeHistory(graph: OathGraph, judgeEndpoint: string): TrackRecord {
  const arg = norm(judgeEndpoint)
  const rec = emptyTrackRecord(judgeEndpoint)
  const judgeNodeIds = new Set(
    graph.nodes
      .filter(
        (n) =>
          n.kind === 'judge' &&
          (norm(n.data.endpoint ?? '') === arg || norm(n.data.container ?? '') === arg),
      )
      .map((n) => n.id),
  )
  if (judgeNodeIds.size === 0) return rec
  const verdicts = graph.nodes.filter(
    (n) =>
      n.kind === 'verdict' &&
      graph.edges.some(
        (e) => e.kind === 'JUDGED_BY' && e.from === n.id && judgeNodeIds.has(e.to),
      ),
  )
  const ids = [...new Set(verdicts.map((v) => v.data.commitmentId).filter(Boolean) as string[])].sort()
  rec.commitmentIds = ids
  rec.total = ids.length
  fillByStatus(graph, ids, rec)
  countOutcomes(verdicts, true, rec.designated)
  countOutcomes(verdicts, false, rec.thirdParty)
  return rec
}

/** The commitment, its reveal, its verdicts (designated and third-party kept separate) and each verdict's evidence sources. */
export function evidenceGraph(graph: OathGraph, commitmentId: string): EvidenceGraphResult {
  const commitment = commitmentNode(graph, commitmentId) ?? null
  const result: EvidenceGraphResult = {
    commitmentId,
    commitment,
    reveal: null,
    designatedVerdicts: [],
    thirdPartyVerdicts: [],
  }
  if (!commitment) return result
  const revealEdge = graph.edges.find(
    (e) => e.kind === 'REVEALED_BY' && e.from === commitment.id,
  )
  if (revealEdge) {
    const by = graph.nodes.find((n) => n.id === revealEdge.to) ?? null
    result.reveal = { by, ref: revealEdge.ref, source: revealEdge.source }
  }
  const verdicts = graph.nodes
    .filter((n) => n.kind === 'verdict' && n.data.commitmentId === commitmentId)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  for (const v of verdicts) {
    const evidence = graph.edges
      .filter((e) => e.kind === 'CITES' && e.from === v.id)
      .map((e) => graph.nodes.find((n) => n.id === e.to))
      .filter((n): n is GraphNode => !!n && n.kind === 'evidence')
      .sort((a, b) => (a.id < b.id ? -1 : 1))
    const entry = { verdict: v, evidence }
    if (v.data.designated) result.designatedVerdicts.push(entry)
    else result.thirdPartyVerdicts.push(entry)
  }
  return result
}

/** Commitments related to this one, each hit labelled with its reason(s). */
export function relatedCommitments(graph: OathGraph, commitmentId: string): RelatedCommitment[] {
  const nodeId = `commitment:${commitmentId}`
  const byTarget = new Map<string, Set<RelatedReason>>()
  for (const e of graph.edges) {
    if (e.kind !== 'RELATED_CLAIM' || !e.data.reason) continue
    let other: string | null = null
    if (e.from === nodeId) other = e.to
    else if (e.to === nodeId) other = e.from
    if (!other) continue
    const id = other.replace(/^commitment:/, '')
    if (!byTarget.has(id)) byTarget.set(id, new Set())
    byTarget.get(id)!.add(e.data.reason)
  }
  return [...byTarget.entries()]
    .map(([id, reasons]) => ({ commitmentId: id, reasons: [...reasons].sort() }))
    .sort((a, b) => (a.commitmentId < b.commitmentId ? -1 : 1))
}

/** The subgraph for one program label: its commitments, their statuses and their parties. */
export function programGraph(graph: OathGraph, programLabel: string): ProgramGraphResult {
  const programId = `program:${programLabel}`
  const programNode = graph.nodes.find((n) => n.id === programId)
  const result: ProgramGraphResult = {
    program: programLabel,
    total: 0,
    byStatus: emptyByStatus(),
    commitmentIds: [],
    authorEndpoints: [],
    judgeEndpoints: [],
    nodes: [],
    edges: [],
  }
  if (!programNode) return result
  const commitmentIds = graph.edges
    .filter((e) => e.kind === 'IN_PROGRAM' && e.to === programId)
    .map((e) => e.from.replace(/^commitment:/, ''))
    .sort()
  result.commitmentIds = commitmentIds
  result.total = commitmentIds.length
  for (const id of commitmentIds) {
    const node = commitmentNode(graph, id)
    if (node?.data.status) result.byStatus[node.data.status] += 1
    if (node?.data.author) result.authorEndpoints.push(node.data.author)
    if (node?.data.judge) result.judgeEndpoints.push(node.data.judge)
  }
  result.authorEndpoints = [...new Set(result.authorEndpoints)].sort()
  result.judgeEndpoints = [...new Set(result.judgeEndpoints)].sort()
  const keep = new Set([programId, ...commitmentIds.map((id) => `commitment:${id}`)])
  result.nodes = graph.nodes.filter((n) => keep.has(n.id))
  result.edges = graph.edges.filter((e) => e.kind === 'IN_PROGRAM' && e.to === programId)
  return result
}

/** Plain-language summary of an author's complete record. Data only, no judgement words. */
export function answerAuthorRecord(graph: OathGraph, authorEndpoint: string): AuthorRecordSummary {
  const rec = authorHistory(graph, authorEndpoint)
  const parts = ALL_STATUSES.filter((s) => rec.byStatus[s] > 0).map(
    (s) => `${rec.byStatus[s]} ${s}`,
  )
  const statusText = parts.length > 0 ? parts.join(', ') : 'no commitments'
  const summary =
    `Author ${shortAddr(authorEndpoint)} has ${rec.total} commitment${rec.total === 1 ? '' : 's'}: ${statusText}. ` +
    `Designated verdicts: ${rec.designated.hit} hit, ${rec.designated.miss} miss, ` +
    `${rec.designated.undecidable} undecidable. ` +
    `Third-party verdicts: ${rec.thirdParty.hit} hit, ${rec.thirdParty.miss} miss, ` +
    `${rec.thirdParty.undecidable} undecidable. ` +
    `${rec.malformed} malformed, ${rec.unrevealed} unrevealed.`
  return { ...rec, summary }
}

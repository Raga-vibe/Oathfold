// Graph retrieval tests: build from verified records only (the real demo
// fixtures plus small hand-built OathRecord fixtures for third-party verdicts
// and shared evidence). No live chain is touched.
import { describe, it, expect } from 'vitest'
import { buildDemoSet } from '../demo'
import {
  buildGraph,
  authorHistory,
  judgeHistory,
  evidenceGraph,
  relatedCommitments,
  programGraph,
  answerAuthorRecord,
} from './graph'
import type { ChainMessage, OathRecord, VerdictInfo } from '../records'
import type { VerdictOutcome } from '../protocol/tap12'
import { HUB_ADDRESS } from '../protocol/tap12'

const NOW = 1793000000
const AUTHOR = '0xa2e4592ebbd0a08cf49dc306358b064587ab3362'
const AUTHOR_ENDPOINT = '0x0000000000000000000000a2e4592ebbd0a08cf49dc306358b064587ab3362'
const JUDGE_CONTAINER = '0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282'
const JUDGE_ENDPOINT = '0x0000000000000000000000c40b4a0ba288b4d2a87fc07db5f4c929f87dfda282'
const THIRD_PARTY = '0x1111111111111111111111111111111111111111'

function makeMessage(overrides: Partial<ChainMessage> = {}): ChainMessage {
  return {
    chainId: 196,
    hub: HUB_ADDRESS,
    to: JUDGE_ENDPOINT,
    from: AUTHOR,
    ref: '0x' + '0'.repeat(64),
    inboxIndex: 1,
    outboxIndex: 1,
    payload: '0x',
    txHash: '0x' + '1'.repeat(64),
    blockNumber: 42000001,
    blockTimestamp: NOW,
    digest: '0x' + '2'.repeat(64),
    final: true,
    ...overrides,
  }
}

function makeVerdict(
  outcome: VerdictOutcome,
  overrides: Partial<VerdictInfo> = {},
): VerdictInfo {
  return {
    message: makeMessage({
      from: JUDGE_CONTAINER,
      to: AUTHOR_ENDPOINT,
      txHash: '0x' + '3'.repeat(64),
      blockNumber: 42000100,
    }),
    outcome,
    sources: [],
    body: 'Verdict body.',
    designated: true,
    early: false,
    valid: true,
    ...overrides,
  }
}

function makeRecord(overrides: Partial<OathRecord> & { commitmentId: string }): OathRecord {
  return {
    kind: 'promise',
    open: NOW + 86400,
    ref: '0x' + '0'.repeat(64),
    commitment: makeMessage({}),
    status: 'sealed',
    revealedContent: null,
    reveal: null,
    verdicts: [],
    source: 'live',
    ...overrides,
  }
}

function demoGraph() {
  const set = buildDemoSet(NOW)
  return { set, graph: buildGraph(set.records) }
}

describe('buildGraph', () => {
  it('builds commitment, author, judge, verdict and evidence nodes from verified records', () => {
    const { set, graph } = demoGraph()
    expect(graph.builtFrom.recordCount).toBe(6)
    expect(graph.builtFrom.demo).toBe(6)
    expect(graph.builtFrom.live).toBe(0)
    const commitments = graph.nodes.filter((n) => n.kind === 'commitment')
    expect(commitments).toHaveLength(6)
    for (const r of set.records) {
      expect(commitments.some((n) => n.data.commitmentId === r.commitmentId)).toBe(true)
    }
    const kinds = new Set(graph.nodes.map((n) => n.kind))
    for (const k of ['commitment', 'author', 'judge', 'verdict', 'evidence', 'program']) {
      expect(kinds.has(k as never)).toBe(true)
    }
    expect(graph.nodes.some((n) => n.kind === 'author' && n.data.container === AUTHOR)).toBe(true)
    expect(graph.nodes.some((n) => n.kind === 'judge' && n.data.endpoint === JUDGE_ENDPOINT)).toBe(true)
  })

  it('returns nodes and edges sorted by id, and rebuilds identically', () => {
    const { set, graph } = demoGraph()
    const ids = graph.nodes.map((n) => n.id)
    expect(ids).toEqual([...ids].sort())
    const edgeIds = graph.edges.map((e) => e.id)
    expect(edgeIds).toEqual([...edgeIds].sort())
    const again = buildGraph(set.records)
    expect(again).toEqual(graph)
    expect(JSON.stringify(again)).toBe(JSON.stringify(graph))
  })

  it('labels every node from demo fixtures as demo, and live records as live', () => {
    const { graph } = demoGraph()
    expect(graph.nodes.every((n) => n.source === 'demo')).toBe(true)
    expect(graph.edges.every((e) => e.source === 'demo')).toBe(true)
    const liveRecord = makeRecord({ commitmentId: '0x' + 'a'.repeat(64), source: 'live' })
    const liveGraph = buildGraph([liveRecord])
    expect(liveGraph.nodes.find((n) => n.kind === 'commitment')!.source).toBe('live')
    expect(liveGraph.nodes.find((n) => n.kind === 'author')!.source).toBe('live')
  })

  it('keeps malformed and unrevealed records as visible nodes', () => {
    const { set, graph } = demoGraph()
    const malformed = set.records.find((r) => r.status === 'malformed')!
    const unrevealed = set.records.find((r) => r.status === 'unrevealed')!
    const mNode = graph.nodes.find((n) => n.data.commitmentId === malformed.commitmentId)!
    const uNode = graph.nodes.find((n) => n.data.commitmentId === unrevealed.commitmentId)!
    expect(mNode.data.status).toBe('malformed')
    expect(uNode.data.status).toBe('unrevealed')
    expect(graph.edges.some((e) => e.kind === 'SEALED_TO' && e.to === mNode.id)).toBe(true)
    expect(graph.edges.some((e) => e.kind === 'SEALED_TO' && e.to === uNode.id)).toBe(true)
  })
})

describe('authorHistory and judgeHistory', () => {
  it('counts the demo author record: 6 total, one per status, 1 designated hit', () => {
    const { set, graph } = demoGraph()
    const h = authorHistory(graph, AUTHOR)
    expect(h.total).toBe(6)
    expect(h.commitmentIds).toHaveLength(6)
    expect(h.byStatus).toEqual({
      malformed: 1, sealed: 1, due: 1, revealed: 1, unrevealed: 1, judged: 1,
    })
    expect(h.designated).toEqual({ hit: 1, miss: 0, undecidable: 0 })
    expect(h.thirdParty).toEqual({ hit: 0, miss: 0, undecidable: 0 })
    expect(h.malformed).toBe(1)
    expect(h.unrevealed).toBe(1)
    expect(new Set(h.commitmentIds)).toEqual(new Set(set.records.map((r) => r.commitmentId)))
  })

  it('matches the author by endpoint id as well as by container address', () => {
    const { graph } = demoGraph()
    const byContainer = authorHistory(graph, AUTHOR)
    const byEndpoint = authorHistory(graph, AUTHOR_ENDPOINT)
    expect(byEndpoint.total).toBe(byContainer.total)
    expect(byEndpoint.commitmentIds).toEqual(byContainer.commitmentIds)
  })

  it('counts the demo judge record from the judge side: 1 judged commitment, 1 hit', () => {
    const { set, graph } = demoGraph()
    const judged = set.records.find((r) => r.status === 'judged')!
    const h = judgeHistory(graph, JUDGE_ENDPOINT)
    expect(h.total).toBe(1)
    expect(h.commitmentIds).toEqual([judged.commitmentId])
    expect(h.byStatus.judged).toBe(1)
    expect(h.designated).toEqual({ hit: 1, miss: 0, undecidable: 0 })
    // The judge container address also resolves to the same record.
    const byContainer = judgeHistory(graph, JUDGE_CONTAINER)
    expect(byContainer.total).toBe(1)
    expect(byContainer.commitmentIds).toEqual([judged.commitmentId])
  })

  it('returns an empty, zero-filled record for an unknown endpoint', () => {
    const { graph } = demoGraph()
    const h = authorHistory(graph, '0x' + '9'.repeat(40))
    expect(h.total).toBe(0)
    expect(h.commitmentIds).toEqual([])
    expect(h.byStatus).toEqual({
      malformed: 0, sealed: 0, due: 0, revealed: 0, unrevealed: 0, judged: 0,
    })
  })

  it('counts designated verdicts only: a third-party hit never enters designated totals', () => {
    const record = makeRecord({
      commitmentId: '0x' + 'b'.repeat(64),
      status: 'judged',
      verdicts: [
        makeVerdict('miss', { designated: true }),
        makeVerdict('hit', {
          designated: false,
          message: makeMessage({
            from: THIRD_PARTY,
            to: AUTHOR_ENDPOINT,
            txHash: '0x' + '4'.repeat(64),
            blockNumber: 42000101,
          }),
          sources: [{ name: 'third', value: 'says hit', at: NOW }],
        }),
      ],
    })
    const graph = buildGraph([record])
    const h = authorHistory(graph, AUTHOR)
    expect(h.total).toBe(1)
    expect(h.designated).toEqual({ hit: 0, miss: 1, undecidable: 0 })
    expect(h.thirdParty).toEqual({ hit: 1, miss: 0, undecidable: 0 })
    // From the third-party judge side, the hit shows up only as third-party.
    const jh = judgeHistory(graph, THIRD_PARTY)
    expect(jh.total).toBe(1)
    expect(jh.designated).toEqual({ hit: 0, miss: 0, undecidable: 0 })
    expect(jh.thirdParty).toEqual({ hit: 1, miss: 0, undecidable: 0 })
  })
})

describe('evidenceGraph', () => {
  it('returns the commitment, its reveal, designated verdicts and evidence with url and domain', () => {
    const { set, graph } = demoGraph()
    const judged = set.records.find((r) => r.status === 'judged')!
    const ev = evidenceGraph(graph, judged.commitmentId)
    expect(ev.commitment?.data.status).toBe('judged')
    expect(ev.reveal).not.toBeNull()
    expect(ev.reveal!.by?.kind).toBe('judge')
    expect(ev.designatedVerdicts).toHaveLength(1)
    expect(ev.designatedVerdicts[0].verdict.data.outcome).toBe('hit')
    expect(ev.thirdPartyVerdicts).toHaveLength(0)
    const sources = ev.designatedVerdicts[0].evidence
    expect(sources).toHaveLength(1)
    expect(sources[0].data.url).toBe('https://www.okx.com/web3/explorer/xlayer')
    expect(sources[0].data.domain).toBe('www.okx.com')
  })

  it('keeps designated and third-party verdicts separate in the evidence graph', () => {
    const record = makeRecord({
      commitmentId: '0x' + 'c'.repeat(64),
      status: 'judged',
      verdicts: [
        makeVerdict('miss', {
          designated: true,
          sources: [{ name: 'explorer', value: 'no release', at: NOW, url: 'https://example.com/a' }],
        }),
        makeVerdict('hit', {
          designated: false,
          message: makeMessage({
            from: THIRD_PARTY,
            to: AUTHOR_ENDPOINT,
            txHash: '0x' + '5'.repeat(64),
            blockNumber: 42000102,
          }),
          sources: [{ name: 'blog', value: 'shipped', at: NOW, url: 'https://other.example/b' }],
        }),
      ],
    })
    const graph = buildGraph([record])
    const ev = evidenceGraph(graph, record.commitmentId)
    expect(ev.designatedVerdicts).toHaveLength(1)
    expect(ev.designatedVerdicts[0].evidence[0].data.url).toBe('https://example.com/a')
    expect(ev.thirdPartyVerdicts).toHaveLength(1)
    expect(ev.thirdPartyVerdicts[0].evidence[0].data.url).toBe('https://other.example/b')
    expect(ev.thirdPartyVerdicts[0].evidence[0].data.domain).toBe('other.example')
  })

  it('returns nulls and empty lists for an unknown commitment', () => {
    const { graph } = demoGraph()
    const ev = evidenceGraph(graph, '0x' + 'd'.repeat(64))
    expect(ev.commitment).toBeNull()
    expect(ev.reveal).toBeNull()
    expect(ev.designatedVerdicts).toEqual([])
    expect(ev.thirdPartyVerdicts).toEqual([])
  })
})

describe('relatedCommitments', () => {
  it('labels same-author related commitments', () => {
    const { set, graph } = demoGraph()
    const judged = set.records.find((r) => r.status === 'judged')!
    const related = relatedCommitments(graph, judged.commitmentId)
    // All six demo records share one author and one judge.
    expect(related).toHaveLength(5)
    for (const rel of related) {
      expect(rel.reasons).toContain('same-author')
      expect(rel.reasons).toContain('same-judge')
    }
    expect(related.map((r) => r.commitmentId)).toEqual(
      set.records.map((r) => r.commitmentId).filter((id) => id !== judged.commitmentId).sort(),
    )
  })

  it('labels same-program related commitments only when a program is assigned', () => {
    const a = makeRecord({ commitmentId: '0x' + 'e'.repeat(64), commitment: makeMessage({ from: '0x' + 'a'.repeat(40) }) })
    const b = makeRecord({ commitmentId: '0x' + 'f'.repeat(64), commitment: makeMessage({ from: '0x' + 'b'.repeat(40), to: '0x' + 'c'.repeat(64) }) })
    const programs = { [a.commitmentId]: 'oathfold', [b.commitmentId]: 'oathfold' }
    const graph = buildGraph([a, b], programs)
    const related = relatedCommitments(graph, a.commitmentId)
    expect(related).toHaveLength(1)
    expect(related[0].reasons).toEqual(['same-program'])
    // Without a program map both fall back to "unassigned", which is not a reason.
    const plain = buildGraph([a, b])
    expect(relatedCommitments(plain, a.commitmentId)).toEqual([])
  })

  it('labels shared evidence URL and shared evidence domain separately', () => {
    const sharedUrl = 'https://example.com/report'
    const sameDomain = 'https://example.com/other-report'
    const a = makeRecord({
      commitmentId: '0x' + '1'.repeat(64),
      status: 'judged',
      commitment: makeMessage({ from: '0x' + 'a'.repeat(40), to: '0x' + 'c'.repeat(64) }),
      verdicts: [makeVerdict('hit', { sources: [{ name: 'src', value: 'v', at: NOW, url: sharedUrl }] })],
    })
    const b = makeRecord({
      commitmentId: '0x' + '2'.repeat(64),
      status: 'judged',
      commitment: makeMessage({ from: '0x' + 'b'.repeat(40), to: '0x' + 'd'.repeat(64) }),
      verdicts: [makeVerdict('hit', { sources: [{ name: 'src', value: 'v', at: NOW, url: sharedUrl }] })],
    })
    const c = makeRecord({
      commitmentId: '0x' + '3'.repeat(64),
      status: 'judged',
      commitment: makeMessage({ from: '0x' + 'e'.repeat(40), to: '0x' + 'f'.repeat(64) }),
      verdicts: [makeVerdict('miss', { sources: [{ name: 'src', value: 'v', at: NOW, url: sameDomain }] })],
    })
    const graph = buildGraph([a, b, c])
    const relA = relatedCommitments(graph, a.commitmentId)
    expect(relA.find((r) => r.commitmentId === b.commitmentId)?.reasons).toContain('shared-evidence-url')
    const relB = relatedCommitments(graph, b.commitmentId)
    expect(relB.find((r) => r.commitmentId === c.commitmentId)?.reasons).toContain('shared-evidence-domain')
    expect(relB.find((r) => r.commitmentId === c.commitmentId)?.reasons).not.toContain('shared-evidence-url')
  })
})

describe('programGraph and answerAuthorRecord', () => {
  it('returns the program subgraph with its commitments and statuses', () => {
    const { set, graph } = demoGraph()
    const judged = set.records.find((r) => r.status === 'judged')!
    const sealed = set.records.find((r) => r.status === 'sealed')!
    const programs = { [judged.commitmentId]: 'oathfold', [sealed.commitmentId]: 'oathfold' }
    const g2 = buildGraph(set.records, programs)
    const pg = programGraph(g2, 'oathfold')
    expect(pg.total).toBe(2)
    expect(pg.commitmentIds).toEqual([judged.commitmentId, sealed.commitmentId].sort())
    expect(pg.byStatus.judged).toBe(1)
    expect(pg.byStatus.sealed).toBe(1)
    expect(pg.authorEndpoints).toEqual([AUTHOR])
    expect(pg.judgeEndpoints).toEqual([JUDGE_ENDPOINT])
    expect(pg.nodes.some((n) => n.kind === 'program' && n.data.program === 'oathfold')).toBe(true)
    expect(programGraph(g2, 'no-such-program').total).toBe(0)
  })

  it('summarises the author record in plain language with counts and no judgement words', () => {
    const { graph } = demoGraph()
    const s = answerAuthorRecord(graph, AUTHOR)
    expect(s.total).toBe(6)
    expect(s.malformed).toBe(1)
    expect(s.unrevealed).toBe(1)
    expect(s.summary).toContain('6 commitments')
    expect(s.summary).toContain('1 malformed')
    expect(s.summary).toContain('1 unrevealed')
    expect(s.summary).toContain('1 hit')
    expect(s.summary.toLowerCase()).not.toContain('trustworthy')
    expect(s.summary.toLowerCase()).not.toContain('reliable')
    expect(s.summary.toLowerCase()).not.toContain('dishonest')
  })
})

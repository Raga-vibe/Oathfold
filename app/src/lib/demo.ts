// DEMO FIXTURE records for Oathfold.
// These are NOT live chain records. They are built locally with REAL seal()
// from the vendored official TapeKit module, using ephemeral X25519 keys that
// exist only in this browser (localStorage). Every demo record is labelled
// "DEMO FIXTURE" in the UI and in its data. Nothing here is presented as a
// live transaction, a deployment, or an on-chain record.
// The five records cover sealed, due, revealed, judged, unrevealed, plus one
// malformed record, so every TAP-12 section 7 status can be inspected.

import { x25519 } from '@noble/curves/ed25519.js'
import { seal } from './tapeout/send/payload.js'
import { bytesToHex, hexToBytes } from './tapeout/send/bytes.js'
import {
  buildCommitmentRef,
  buildLinkedRef,
  buildCommitmentContent,
  buildRevealContent,
  buildVerdictContent,
  commitmentId,
  digestOf,
  deriveStatus,
  verifyRevealWithKey,
  parseContentObject,
  XLAYER_CHAIN_ID,
  HUB_ADDRESS,
} from './protocol/tap12'
import type { ChainMessage, OathRecord, RevealInfo, VerdictInfo } from './records'

export const DEMO_LABEL = 'DEMO FIXTURE'

const DEMO_JUDGE_CONTAINER = '0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282' // container inside the TAP-12 example judge endpoint (the c4 is the chain-id byte)
const DEMO_JUDGE_ENDPOINT =
  '0x0000000000000000000000c40b4a0ba288b4d2a87fc07db5f4c929f87dfda282'
const DEMO_AUTHOR_CONTAINER = '0xa2e4592ebbd0a08cf49dc306358b064587ab3362'
const DEMO_AUTHOR_ENDPOINT =
  '0x0000000000000000000000a2e4592ebbd0a08cf49dc306358b064587ab3362'

function hexSecret(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill)
}

function fakeTx(n: number): string {
  return '0x' + n.toString(16).padStart(64, '0')
}

interface DemoSpec {
  slug: string
  title: string
  body: string
  openOffsetDays: number // open time relative to build time
  sentOffsetDays: number // block time relative to build time
  inboxIndex: number
  reveal?: 'author' | 'judge'
  verdict?: 'hit' | 'miss' | 'undecidable'
  malformed?: 'bad-kind' | 'bad-reserved' | 'not-sealed'
  claim?: { metric: string; subject: string; op: '>' | '>=' | '<' | '<=' | '=='; value: string }
}

const SPECS: DemoSpec[] = [
  {
    slug: 'demo-sealed',
    title: 'Ship Oathfold v1',
    body: 'I will ship Oathfold v1 by 2027-01-01.',
    openOffsetDays: 30,
    sentOffsetDays: -1,
    inboxIndex: 101,
    claim: { metric: 'delivery', subject: 'Oathfold v1', op: '==', value: '1' },
  },
  {
    slug: 'demo-due',
    title: 'Publish the audit notes',
    body: 'I will publish the audit notes within the open window.',
    openOffsetDays: -2,
    sentOffsetDays: -10,
    inboxIndex: 102,
  },
  {
    slug: 'demo-revealed',
    title: 'Finish the judge page',
    body: 'I will finish the judge page before the open date.',
    openOffsetDays: -3,
    sentOffsetDays: -12,
    inboxIndex: 103,
    reveal: 'author',
  },
  {
    slug: 'demo-judged',
    title: 'Land the first live promise',
    body: 'I will land the first live promise on X Layer.',
    openOffsetDays: -9,
    sentOffsetDays: -20,
    inboxIndex: 104,
    reveal: 'judge',
    verdict: 'hit',
  },
  {
    slug: 'demo-unrevealed',
    title: 'Ship the mobile layout',
    body: 'I will ship the mobile layout for the promises list.',
    openOffsetDays: -10,
    sentOffsetDays: -25,
    inboxIndex: 105,
  },
  {
    slug: 'demo-malformed',
    title: 'Broken record (bad type)',
    body: 'This record was built with a type the rules do not define.',
    openOffsetDays: 30,
    sentOffsetDays: -1,
    inboxIndex: 106,
    malformed: 'bad-kind',
  },
]

function buildDemoRecord(spec: DemoSpec, nowSec: number): OathRecord {
  const open = nowSec + spec.openOffsetDays * 86400
  const blockTimestamp = nowSec + spec.sentOffsetDays * 86400
  const blockNumber = 42_000_000 + spec.inboxIndex
  const judgeSecret = hexSecret(0x10 + spec.inboxIndex)
  const authorSecret = hexSecret(0x20 + spec.inboxIndex)
  const judgeKey = x25519.getPublicKey(judgeSecret)
  const authorKey = x25519.getPublicKey(authorSecret)

  let ref = buildCommitmentRef('promise', open)
  if (spec.malformed === 'bad-kind') {
    const b = hexToBytes(ref as `0x${string}`)
    b[5] = 0x09
    ref = bytesToHex(b)
  } else if (spec.malformed === 'bad-reserved') {
    const b = hexToBytes(ref as `0x${string}`)
    b[31] = 0x01
    ref = bytesToHex(b)
  }

  const content = buildCommitmentContent({
    body: spec.body,
    kind: 'promise',
    open,
    claim: spec.claim,
    nonce: '0x' + spec.inboxIndex.toString(16).padStart(8, '0'),
    subject: `Commitment: ${spec.title}`,
  })
  const payloadBytes = seal({
    content,
    recipients: [judgeKey, authorKey],
    to: DEMO_JUDGE_ENDPOINT,
    from: DEMO_AUTHOR_CONTAINER,
    hub: HUB_ADDRESS,
    ref,
    chainId: XLAYER_CHAIN_ID,
  })
  const payloadHex = bytesToHex(payloadBytes)
  const id = commitmentId(XLAYER_CHAIN_ID, HUB_ADDRESS, DEMO_JUDGE_ENDPOINT, spec.inboxIndex)
  const commitment: ChainMessage = {
    chainId: XLAYER_CHAIN_ID,
    hub: HUB_ADDRESS,
    to: DEMO_JUDGE_ENDPOINT,
    from: DEMO_AUTHOR_CONTAINER,
    ref,
    inboxIndex: spec.inboxIndex,
    outboxIndex: spec.inboxIndex,
    payload: payloadHex,
    txHash: fakeTx(spec.inboxIndex),
    blockNumber,
    blockTimestamp,
    digest: digestOf(ref, payloadBytes),
    final: true,
  }

  // Recover K for the demo reveal: re-open locally is not possible through
  // openPayload (K is not exposed), so seal deterministically is not used;
  // instead the demo stores the content key by decrypting a slot with the
  // judge secret key, mirroring TAP-10 section 15.3 opening. Simpler exact
  // route: open the payload with the author secret and read the content, and
  // recover K from the sealed payload using the vendored open internals is
  // not exposed, so the demo keeps K by sealing a second payload with a
  // fixed K through the `random` hook and using that payload as the record.
  // (Implemented below: payload is rebuilt deterministically when a reveal
  // is needed.)
  let demoKey = ''
  let reveal: RevealInfo | null = null
  let revealedContent: Record<string, any> | null = null
  let verdicts: VerdictInfo[] = []
  let malformedReason: string | undefined

  if (spec.malformed === 'bad-kind') malformedReason = 'kind byte is not 0x01 (promise) or 0x02 (forecast)'
  if (spec.malformed === 'bad-reserved') malformedReason = 'reserved bytes 14-31 are not zero'
  if (open <= blockTimestamp) malformedReason = 'open time is not after the sending block time'

  if (spec.reveal || spec.verdict) {
    // Deterministic seal so the demo knows K: seal draws e(32), N(24), K(32).
    const e = new Uint8Array(32).fill(0x70 + spec.inboxIndex)
    const n = new Uint8Array(24).fill(0x80 + spec.inboxIndex)
    const kBytes = new Uint8Array(32).fill(0x90 + spec.inboxIndex)
    let call = 0
    const random = () => {
      call += 1
      if (call === 1) return e
      if (call === 2) return n
      return kBytes
    }
    const detPayload = seal({
      content,
      recipients: [judgeKey, authorKey],
      to: DEMO_JUDGE_ENDPOINT,
      from: DEMO_AUTHOR_CONTAINER,
      hub: HUB_ADDRESS,
      ref,
      chainId: XLAYER_CHAIN_ID,
      random,
    })
    commitment.payload = bytesToHex(detPayload)
    commitment.digest = digestOf(ref, detPayload)
    demoKey = bytesToHex(kBytes)
    const verified = verifyRevealWithKey({
      commitmentPayload: detPayload,
      keyHex: demoKey,
      to: DEMO_JUDGE_ENDPOINT,
      from: DEMO_AUTHOR_CONTAINER,
      ref,
      hub: HUB_ADDRESS,
      chainId: XLAYER_CHAIN_ID,
    })
    if (verified.ok && verified.content) {
      revealedContent = verified.content
      const revealRef = buildLinkedRef(0x02, id)
      const revealContent = buildRevealContent({
        body: spec.reveal === 'judge'
          ? 'Judge reveal: publishing the content key for this commitment.'
          : 'Author reveal: publishing the content key for this commitment.',
        commitment: { chainId: XLAYER_CHAIN_ID, to: DEMO_JUDGE_ENDPOINT, inboxIndex: spec.inboxIndex },
        key: demoKey,
        subject: 'Reveal',
      })
      const revealMsg: ChainMessage = {
        chainId: XLAYER_CHAIN_ID,
        hub: HUB_ADDRESS,
        to: spec.reveal === 'judge' ? DEMO_AUTHOR_ENDPOINT : DEMO_JUDGE_ENDPOINT,
        from: spec.reveal === 'judge' ? DEMO_JUDGE_CONTAINER : DEMO_AUTHOR_CONTAINER,
        ref: revealRef,
        inboxIndex: spec.inboxIndex + 1000,
        outboxIndex: spec.inboxIndex + 1000,
        payload: bytesToHex(revealContent),
        txHash: fakeTx(spec.inboxIndex + 1000),
        blockNumber: blockNumber + 500,
        blockTimestamp: open + 3600,
        digest: digestOf(revealRef, revealContent),
        final: true,
      }
      reveal = { message: revealMsg, key: demoKey, content: verified.content, verified: true }
    }
    if (spec.verdict && reveal) {
      const verdictRef = buildLinkedRef(0x03, id)
      const outcome = spec.verdict
      const verdictContent = buildVerdictContent({
        body: outcome === 'hit'
          ? 'Hit. The first live commitment landed on X Layer before the open date.'
          : 'Verdict recorded.',
        commitment: { chainId: XLAYER_CHAIN_ID, to: DEMO_JUDGE_ENDPOINT, inboxIndex: spec.inboxIndex },
        outcome,
        sources: [{ name: 'xlayer-explorer', value: 'commitment landed', at: open, url: 'https://www.okx.com/web3/explorer/xlayer' }],
        reason: 'Checked against the X Layer explorer.',
        subject: 'Verdict',
      })
      const verdictMsg: ChainMessage = {
        chainId: XLAYER_CHAIN_ID,
        hub: HUB_ADDRESS,
        to: DEMO_AUTHOR_ENDPOINT,
        from: DEMO_JUDGE_CONTAINER,
        ref: verdictRef,
        inboxIndex: spec.inboxIndex + 2000,
        outboxIndex: spec.inboxIndex + 2000,
        payload: bytesToHex(verdictContent),
        txHash: fakeTx(spec.inboxIndex + 2000),
        blockNumber: blockNumber + 900,
        blockTimestamp: open + 7200,
        digest: digestOf(verdictRef, verdictContent),
        final: true,
      }
      const parsed = parseContentObject(verdictContent)
      verdicts = [{
        message: verdictMsg,
        outcome,
        sources: parsed.scv.sources,
        reason: parsed.scv.reason,
        body: parsed.body,
        designated: true,
        early: false,
        valid: true,
      }]
    }
  }

  const judged = verdicts.some((v) => v.designated && v.valid)
  const status = deriveStatus({
    malformed: !!malformedReason,
    revealed: !!reveal,
    judged,
    open,
    now: nowSec,
  })

  return {
    commitmentId: id,
    kind: 'promise',
    open,
    ref,
    commitment,
    status,
    malformedReason,
    revealedContent,
    reveal,
    verdicts,
    source: 'demo',
    demoKey: demoKey || undefined,
    demoSecrets: {
      judge: bytesToHex(judgeSecret),
      author: bytesToHex(authorSecret),
    },
  }
}

export interface DemoSet {
  builtAt: number
  records: OathRecord[]
  titles: Record<string, string>
}

/** Build the demo fixture set. Deterministic per build time; cached by the store. */
export function buildDemoSet(nowSec = Math.floor(Date.now() / 1000)): DemoSet {
  const records = SPECS.map((s) => buildDemoRecord(s, nowSec))
  const titles: Record<string, string> = {}
  for (const s of SPECS) titles[s.slug] = s.title
  // Attach titles via a side map keyed by commitmentId order.
  const withTitles = records.map((r, i) => ({ ...r, demoTitle: SPECS[i].title }))
  return { builtAt: nowSec, records: withTitles as OathRecord[], titles }
}

export const DEMO_TITLES: Record<string, string> = Object.fromEntries(
  SPECS.map((s) => [s.slug, s.title]),
)

export function demoTitleFor(record: OathRecord, index: number): string {
  return SPECS[index]?.title ?? 'Demo commitment'
}

// Oathfold indexer: rebuild TAP-12 records from the X Layer hub.
// TAP-12 section 6: read hub Sent events, keep refs starting with the SCV1 tag
// (eth_getLogs cannot filter by prefix, so filter locally), verify each entry
// with inboxAt (from must equal the event from, digest must equal
// keccak256(ref || keccak256(payload))), group by commitmentId, attach reveals
// and verdicts, and apply section 4.4 / section 5 checks.
// Only records at or below the safe block count as final; pending is never a
// final record. The X Layer RPC caps eth_getLogs at 100 blocks, so scans are
// chunked in 100-block windows.

import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  HUB_ADDRESS,
  LOG_RANGE_MAX_BLOCKS,
  FINALITY_TAG,
  inboxAt,
  primaryClient,
  readWithFallback,
  type HubVerification,
} from './chain/xlayer'
import {
  parseRef,
  commitmentId,
  verifyDigest,
  deriveStatus,
  validateCommitmentContent,
  validateRevealContent,
  validateVerdictContent,
  verifyRevealWithKey,
  checkVerdictRules,
  parseContentObject,
  XLAYER_CHAIN_ID,
  HUB_ADDRESS as TAP_HUB,
} from './protocol/tap12'
import { bytesToHex, hexToBytes } from './tapeout/send/bytes.js'
import { parsePayload } from './tapeout/send/payload.js'
import type { ChainMessage, OathRecord, RevealInfo, VerdictInfo } from './records'

export const SENT_EVENT_SIG =
  'Sent(bytes32,address,bytes32,uint256,uint256,bytes)'

export function sentTopic0(): string {
  return bytesToHex(keccak_256(new TextEncoder().encode(SENT_EVENT_SIG)))
}

export interface ScanOptions {
  fromBlock: bigint
  toBlock: bigint
  onProgress?: (done: number, total: number) => void
}

export interface ScanResult {
  messages: ChainMessage[]
  safeBlock: bigint | null
  safeTimestamp: number | null
  fromBlock: bigint
  toBlock: bigint
  chunks: number
  discarded: { reason: string; count: number }[]
}

/** Decode one raw Sent log into a ChainMessage (payload is ABI-encoded bytes). */
export function decodeSentLog(log: {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
}): ChainMessage | null {
  if (log.address.toLowerCase() !== HUB_ADDRESS.toLowerCase()) return null
  if (log.topics.length !== 4) return null
  const to = log.topics[1].toLowerCase()
  const fromTopic = log.topics[2].toLowerCase()
  if (!/^0x0{24}[0-9a-f]{40}$/.test(fromTopic)) return null
  const from = ('0x' + fromTopic.slice(-40)) as string
  const ref = log.topics[3].toLowerCase()
  // data: uint256 inboxIndex, uint256 outboxIndex, bytes payload (offset, length, bytes)
  const data = hexToBytes(log.data as `0x${string}`)
  if (data.length < 96) return null
  const readU256 = (off: number) => {
    let v = 0n
    for (let i = off; i < off + 32; i++) v = (v << 8n) | BigInt(data[i])
    return v
  }
  const inboxIndex = Number(readU256(0))
  const outboxIndex = Number(readU256(32))
  const payloadOffset = Number(readU256(64))
  if (payloadOffset + 32 > data.length) return null
  const payloadLen = Number(readU256(payloadOffset))
  const payloadStart = payloadOffset + 32
  if (payloadStart + payloadLen > data.length) return null
  const payload = data.slice(payloadStart, payloadStart + payloadLen)
  return {
    chainId: XLAYER_CHAIN_ID,
    hub: HUB_ADDRESS,
    to,
    from,
    ref,
    inboxIndex,
    outboxIndex,
    payload: bytesToHex(payload),
    txHash: log.transactionHash,
    blockNumber: Number(BigInt(log.blockNumber)),
    blockTimestamp: 0, // filled from the block header by the caller
    digest: '',
    final: false,
  }
}

/** Scan hub Sent logs in 100-block chunks. Returns raw messages (unverified). */
export async function scanSentLogs(opts: ScanOptions): Promise<ScanResult> {
  const safeBlock = await readWithFallback((c) =>
    c.getBlock({ blockTag: FINALITY_TAG }),
  ).catch(() => null)
  const safeNumber = safeBlock ? safeBlock.number : null
  const safeTimestamp = safeBlock ? Number(safeBlock.timestamp) : null
  const messages: ChainMessage[] = []
  const discarded: { reason: string; count: number }[] = []
  const total = Number(opts.toBlock - opts.fromBlock + 1n)
  let chunks = 0
  let done = 0
  for (let start = opts.fromBlock; start <= opts.toBlock; start += BigInt(LOG_RANGE_MAX_BLOCKS)) {
    const end = start + BigInt(LOG_RANGE_MAX_BLOCKS) - 1n > opts.toBlock
      ? opts.toBlock
      : start + BigInt(LOG_RANGE_MAX_BLOCKS) - 1n
    chunks += 1
    const logs = await readWithFallback((c) =>
      c.getLogs({
        address: HUB_ADDRESS as `0x${string}`,
        fromBlock: start,
        toBlock: end,
      }),
    )
    for (const log of logs as any[]) {
      const m = decodeSentLog({
        address: log.address,
        topics: log.topics as string[],
        data: log.data as string,
        blockNumber: BigInt(log.blockNumber).toString(),
        transactionHash: log.transactionHash as string,
      })
      if (!m) continue
      // Block timestamp: read the header once per block is expensive; use the
      // safe block timestamp only as now. The per-message timestamp is filled
      // in verifyMessages via inboxAt (which returns the stored timestamp).
      messages.push(m)
    }
    done += Number(end - start + 1n)
    opts.onProgress?.(done, total)
  }
  return { messages, safeBlock: safeNumber, safeTimestamp, fromBlock: opts.fromBlock, toBlock: opts.toBlock, chunks, discarded }
}

/**
 * Verify scanned messages per TAP-12 section 6 step 2 and group them into
 * records. `now` is the pinned safe-block time.
 */
export async function buildRecords(
  messages: ChainMessage[],
  safeBlock: bigint | null,
  now: number,
): Promise<{ records: OathRecord[]; discarded: { reason: string; count: number }[] }> {
  const discardedMap = new Map<string, number>()
  const discard = (reason: string) => discardedMap.set(reason, (discardedMap.get(reason) ?? 0) + 1)
  const tagged = messages.filter((m) => parseRef(m.ref).isRecord)
  // Verify each tagged message against inboxAt and its digest.
  const verified: ChainMessage[] = []
  for (const m of tagged) {
    try {
      const entry = await inboxAt(m.to as `0x${string}`, BigInt(m.inboxIndex))
      if (entry.from.toLowerCase() !== m.from.toLowerCase()) { discard('inboxAt from does not match Sent from'); continue }
      const digest = verifyDigest(m.ref, hexToBytes(m.payload as `0x${string}`), entry.digest)
      if (!digest) { discard('digest mismatch with inboxAt entry'); continue }
      m.digest = entry.digest
      m.blockTimestamp = entry.timestamp
      m.blockNumber = Number(entry.blockNumber)
      m.final = safeBlock === null ? false : BigInt(m.blockNumber) <= safeBlock
      if (!m.final) { discard('not yet at safe finality (pending, not a final record)'); continue }
      verified.push(m)
    } catch {
      discard('inboxAt read failed')
    }
  }

  const commitments = new Map<string, OathRecord>()
  const reveals: { msg: ChainMessage; refInfo: ReturnType<typeof parseRef> }[] = []
  const verdicts: { msg: ChainMessage; refInfo: ReturnType<typeof parseRef> }[] = []

  for (const m of verified) {
    const refInfo = parseRef(m.ref)
    if (refInfo.type === 'commitment') {
      const id = commitmentId(XLAYER_CHAIN_ID, TAP_HUB, m.to, m.inboxIndex)
      const open = refInfo.open ?? 0
      let malformedReason = refInfo.malformedReason
      if (!malformedReason && !(open > m.blockTimestamp)) {
        malformedReason = 'open time is not after the sending block time'
      }
      let sealed = true
      if (!malformedReason) {
        try {
          const parsed = parsePayload(hexToBytes(m.payload as `0x${string}`))
          sealed = parsed.kind === 'sealed'
          if (!sealed) malformedReason = 'commitment payload is not sealed'
        } catch {
          malformedReason = 'commitment payload does not parse'
        }
      }
      commitments.set(id, {
        commitmentId: id,
        kind: refInfo.kind ?? 'promise',
        open,
        ref: m.ref,
        commitment: m,
        status: 'malformed',
        malformedReason,
        revealedContent: null,
        reveal: null,
        verdicts: [],
        source: 'live',
      })
    } else if (refInfo.type === 'reveal') {
      reveals.push({ msg: m, refInfo })
    } else if (refInfo.type === 'verdict') {
      verdicts.push({ msg: m, refInfo })
    } else {
      discard('unknown record type byte, ignored per TAP-12 section 2')
    }
  }

  // Attach reveals (section 4.4).
  for (const { msg, refInfo } of reveals) {
    const targetId = findCommitmentByRefPrefix(commitments, refInfo.commitmentRef ?? '')
    if (!targetId) { discard('reveal references no known commitment'); continue }
    const rec = commitments.get(targetId)!
    let revealContent: Record<string, any> | null = null
    let key = ''
    try {
      const parsed = parsePayload(hexToBytes(msg.payload as `0x${string}`))
      if (parsed.kind !== 'public') throw new Error('reveal payload is not public')
      revealContent = parseContentObject(parsed.content)
      const errs = validateRevealContent(revealContent)
      if (errs.length) throw new Error(errs.join('; '))
      key = revealContent.scv.key
    } catch (e: any) {
      discard(`reveal content invalid: ${e?.message ?? e}`)
      continue
    }
    // Step 1: recompute commitmentId from scv.commitment; first 27 bytes must equal ref bytes 5-31.
    const recomputed = commitmentId(
      revealContent.scv.commitment.chainId,
      TAP_HUB,
      revealContent.scv.commitment.to,
      revealContent.scv.commitment.inboxIndex,
    )
    if (recomputed.slice(2, 2 + 54).toLowerCase() !== (refInfo.commitmentRef ?? '').slice(2).toLowerCase()) {
      discard('reveal commitmentId does not match its ref')
      continue
    }
    if (recomputed.toLowerCase() !== targetId.toLowerCase()) {
      discard('reveal scv.commitment does not identify this commitment')
      continue
    }
    // Step 2: sender must be author or judge.
    const judgeEndpoint = rec.commitment.to.toLowerCase()
    const authorContainer = rec.commitment.from.toLowerCase()
    const senderIsAuthor = msg.from.toLowerCase() === authorContainer
    // The reveal sender is a container address (msg.from). The judge container
    // is the container inside the judge endpoint id.
    const judgeContainer = '0x' + judgeEndpoint.slice(-40)
    const senderIsJudgeContainer = msg.from.toLowerCase() === judgeContainer
    if (!senderIsAuthor && !senderIsJudgeContainer) {
      discard('reveal sender is neither author nor judge')
      continue
    }
    // Steps 3-5: verify with K.
    const result = verifyRevealWithKey({
      commitmentPayload: hexToBytes(rec.commitment.payload as `0x${string}`),
      keyHex: key,
      to: rec.commitment.to,
      from: rec.commitment.from,
      ref: rec.commitment.ref,
      hub: TAP_HUB,
      chainId: XLAYER_CHAIN_ID,
    })
    if (!result.ok || !result.content) {
      discard(`reveal verification failed: ${result.error ?? 'unknown'}`)
      continue
    }
    const contentErrors = validateCommitmentContent(result.content, parseRef(rec.commitment.ref))
    if (contentErrors.length) {
      rec.malformedReason = `revealed content fails TAP-12 section 3.4: ${contentErrors.join('; ')}`
      continue
    }
    const info: RevealInfo = { message: msg, key, content: result.content, verified: true }
    if (!rec.reveal) {
      rec.reveal = info
      rec.revealedContent = result.content
    }
  }

  // Attach verdicts (section 5).
  for (const { msg, refInfo } of verdicts) {
    const targetId = findCommitmentByRefPrefix(commitments, refInfo.commitmentRef ?? '')
    if (!targetId) { discard('verdict references no known commitment'); continue }
    const rec = commitments.get(targetId)!
    let content: Record<string, any> | null = null
    try {
      const parsed = parsePayload(hexToBytes(msg.payload as `0x${string}`))
      if (parsed.kind !== 'public') throw new Error('verdict payload is not public')
      content = parseContentObject(parsed.content)
      const errs = validateVerdictContent(content)
      if (errs.length) throw new Error(errs.join('; '))
    } catch (e: any) {
      discard(`verdict content invalid: ${e?.message ?? e}`)
      continue
    }
    const judgeContainer = '0x' + rec.commitment.to.slice(-40)
    const designated = msg.from.toLowerCase() === judgeContainer.toLowerCase()
    const revealed = !!rec.reveal || !!content.scv.key
    // If the verdict itself carries K, verify it like a reveal first.
    let verdictKeyVerified = false
    if (content.scv.key) {
      const r = verifyRevealWithKey({
        commitmentPayload: hexToBytes(rec.commitment.payload as `0x${string}`),
        keyHex: content.scv.key,
        to: rec.commitment.to,
        from: rec.commitment.from,
        ref: rec.commitment.ref,
        hub: TAP_HUB,
        chainId: XLAYER_CHAIN_ID,
      })
      verdictKeyVerified = r.ok && !!r.content
      if (verdictKeyVerified && !rec.reveal) {
        rec.reveal = { message: msg, key: content.scv.key, content: r.content!, verified: true }
        rec.revealedContent = r.content!
      }
    }
    const revealedNow = !!rec.reveal || verdictKeyVerified
    const { errors, early } = checkVerdictRules({
      outcome: content.scv.outcome,
      sources: content.scv.sources,
      revealed: revealedNow,
      verdictBlockTime: msg.blockTimestamp,
      open: rec.open,
      isDesignatedJudge: designated,
    })
    const info: VerdictInfo = {
      message: msg,
      outcome: content.scv.outcome,
      sources: content.scv.sources ?? [],
      reason: content.scv.reason,
      body: content.body ?? '',
      designated,
      early,
      key: content.scv.key,
      valid: errors.length === 0,
      error: errors.length ? errors.join('; ') : undefined,
    }
    rec.verdicts.push(info)
  }

  // Final status per record (section 7).
  for (const rec of commitments.values()) {
    const judged = rec.verdicts.some((v) => v.designated && v.valid)
    rec.status = deriveStatus({
      malformed: !!rec.malformedReason,
      revealed: !!rec.reveal,
      judged,
      open: rec.open,
      now,
    })
  }

  const discarded = [...discardedMap.entries()].map(([reason, count]) => ({ reason, count }))
  return { records: [...commitments.values()], discarded }
}

function findCommitmentByRefPrefix(
  commitments: Map<string, OathRecord>,
  commitmentRef27: string,
): string | null {
  const prefix = commitmentRef27.toLowerCase().replace(/^0x/, '')
  for (const id of commitments.keys()) {
    if (id.toLowerCase().replace(/^0x/, '').slice(0, 54) === prefix) return id
  }
  return null
}

export async function latestBlockNumber(): Promise<bigint> {
  const b = await readWithFallback((c) => c.getBlock({ blockTag: 'latest' }))
  return b.number
}

export { primaryClient }
export type { HubVerification }

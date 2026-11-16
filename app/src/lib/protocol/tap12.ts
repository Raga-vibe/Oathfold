// Oathfold TAP-12 protocol core.
// Implements TAP-12 (Draft, created 2026-09-30) over TAP-10 exactly as specified:
// ref layout, commitmentId, status derivation with 7-day grace, content rules,
// reveal verification with K (TAP-12 section 4.4), and verdict rules (section 5).
// Crypto for sealing/opening comes from the vendored official TapeKit send module
// (src/lib/tapeout/send, commit f1831a4). The reveal-with-K decryption below uses
// @noble/ciphers xchacha20poly1305 + @noble/hashes sha256 exactly per TAP-10
// section 15.3 Opening step 4 and TAP-12 section 4.4 step 4:
// aad = P || S || X, X = "TAP-10/X/v2" || to || from || ref || hub.

import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import {
  bytesToHex,
  hexToBytes,
  ascii,
  concat,
  equalBytes,
  uint256,
  addressBytes,
} from '../tapeout/send/bytes.js'
import { parsePayload, endpointBytes } from '../tapeout/send/payload.js'
import { decodeContent, messageId } from '../tapeout/send/content.js'

export const TAP12_TAG = 'SCV1'
export const GRACE_SECONDS = 604800 // 7 days, TAP-12 section 7
export const XLAYER_CHAIN_ID = 196
export const HUB_ADDRESS = '0xe61a9c7213a6aa616c246a2b569e555b417b25ee'

export type RecordType = 'commitment' | 'reveal' | 'verdict'
export type CommitmentKind = 'promise' | 'forecast'
export type CommitmentStatus =
  | 'malformed'
  | 'sealed'
  | 'due'
  | 'revealed'
  | 'unrevealed'
  | 'judged'
export type VerdictOutcome = 'hit' | 'miss' | 'undecidable'

export const KIND_BYTE: Record<CommitmentKind, number> = { promise: 0x01, forecast: 0x02 }
export const KIND_FROM_BYTE: Record<number, CommitmentKind | undefined> = {
  0x01: 'promise',
  0x02: 'forecast',
}

export function hexLower(hex: string): string {
  return hex.toLowerCase()
}

function refBytes(ref: string): Uint8Array {
  return hexToBytes(ref, 32)
}

/** TAP-12 section 3.1: commitment ref. */
export function buildCommitmentRef(kind: CommitmentKind, open: number): string {
  const out = new Uint8Array(32)
  out.set(ascii(TAP12_TAG), 0)
  out[4] = 0x01
  out[5] = KIND_BYTE[kind]
  const openBytes = new Uint8Array(8)
  let v = BigInt(open)
  for (let i = 7; i >= 0; i--) {
    openBytes[i] = Number(v & 0xffn)
    v >>= 8n
  }
  out.set(openBytes, 6)
  // bytes 14-31 stay zero (reserved)
  return bytesToHex(out)
}

/** TAP-12 section 4.1 / 5.1: reveal and verdict ref from a commitmentId. */
export function buildLinkedRef(type: 0x02 | 0x03, commitmentIdHex: string): string {
  const id = hexToBytes(commitmentIdHex, 32)
  const out = new Uint8Array(32)
  out.set(ascii(TAP12_TAG), 0)
  out[4] = type
  out.set(id.slice(0, 27), 5)
  return bytesToHex(out)
}

export interface ParsedRef {
  isRecord: boolean
  type?: RecordType
  typeByte?: number
  kind?: CommitmentKind
  kindByte?: number
  open?: number
  commitmentRef?: string // first 27 bytes of commitmentId, as 0x hex (27 bytes)
  malformedReason?: string
}

export function parseRef(ref: string): ParsedRef {
  let b: Uint8Array
  try {
    b = refBytes(ref)
  } catch {
    return { isRecord: false }
  }
  if (ascii(TAP12_TAG).some((c, i) => b[i] !== c)) return { isRecord: false }
  const typeByte = b[4]
  if (typeByte === 0x01) {
    const kindByte = b[5]
    const kind = KIND_FROM_BYTE[kindByte]
    const reservedOk = b.slice(14).every((x) => x === 0)
    let open = 0
    for (let i = 6; i < 14; i++) open = open * 256 + b[i]
    // open fits in JS safe range for any realistic timestamp (8 bytes, top bytes zero in practice)
    const openBig = b.slice(6, 14).reduce((acc, x) => (acc << 8n) | BigInt(x), 0n)
    if (!kind) return { isRecord: true, type: 'commitment', typeByte, kindByte, open: Number(openBig), malformedReason: 'kind byte is not 0x01 (promise) or 0x02 (forecast)' }
    if (!reservedOk) return { isRecord: true, type: 'commitment', typeByte, kindByte, kind, open: Number(openBig), malformedReason: 'reserved bytes 14-31 are not zero' }
    return { isRecord: true, type: 'commitment', typeByte, kindByte, kind, open: Number(openBig) }
  }
  if (typeByte === 0x02 || typeByte === 0x03) {
    return {
      isRecord: true,
      type: typeByte === 0x02 ? 'reveal' : 'verdict',
      typeByte,
      commitmentRef: bytesToHex(b.slice(5, 32)),
    }
  }
  return { isRecord: true, typeByte, malformedReason: 'unknown record type byte (not 0x01, 0x02 or 0x03)' }
}

/** TAP-12 section 3.3: commitmentId is the TAP-10 message id. Uses the vendored official messageId. */
export function commitmentId(chainId: number, hub: string, toEndpoint: string, inboxIndex: number | bigint): string {
  return messageId(chainId, hub, toEndpoint, inboxIndex)
}

/** TAP-10 section 13 / TAP-12 section 6 step 2: digest = keccak256(ref || keccak256(payload)). */
export function digestOf(ref: string, payload: Uint8Array): string {
  return bytesToHex(keccak_256(concat(refBytes(ref), keccak_256(payload))))
}

export function verifyDigest(ref: string, payload: Uint8Array, expectedDigest: string): boolean {
  return digestOf(ref, payload).toLowerCase() === expectedDigest.toLowerCase()
}

/**
 * TAP-12 section 7. Exactly one status.
 * malformed: ref fails section 3.1, payload is not sealed, open is not after the
 *   sending block, or a verified reveal yields content that fails section 3.4.
 * sealed: no verified reveal, now < T. due: T <= now < T+G.
 * unrevealed: no verified reveal, now >= T+G.
 * revealed: verified reveal, no verdict from the designated judge.
 * judged: verified reveal and at least one verdict from the designated judge.
 */
export function deriveStatus(args: {
  malformed: boolean
  revealed: boolean
  judged: boolean
  open: number
  now: number
}): CommitmentStatus {
  if (args.malformed) return 'malformed'
  if (args.revealed) return args.judged ? 'judged' : 'revealed'
  if (args.now < args.open) return 'sealed'
  if (args.now < args.open + GRACE_SECONDS) return 'due'
  return 'unrevealed'
}

export function statusLabel(status: CommitmentStatus): string {
  switch (status) {
    case 'malformed': return 'Malformed'
    case 'sealed': return 'Sealed'
    case 'due': return 'Due'
    case 'revealed': return 'Revealed'
    case 'unrevealed': return 'Unrevealed'
    case 'judged': return 'Judged'
  }
}

export function statusExplain(status: CommitmentStatus, open: number): string {
  const when = new Date(open * 1000).toUTCString()
  switch (status) {
    case 'malformed': return 'The ref, payload or revealed content breaks TAP-12 section 3. This counts against the author, not the judge.'
    case 'sealed': return `Sealed until ${when}. Only the claim metadata is public; the claim text stays hidden until reveal.`
    case 'due': return `Open time ${when} has passed and the 7-day grace period is running. The author or judge should reveal now.`
    case 'revealed': return 'The content key was published and the claim text was verified against the sealed payload. Awaiting the designated judge verdict.'
    case 'unrevealed': return 'The open time plus the 7-day grace period passed with no verified reveal. Shown with the same prominence as judged records.'
    case 'judged': return 'Revealed and judged by the designated judge. Third-party verdicts, if any, are listed separately.'
  }
}

// ---------------------------------------------------------------------------
// Content validation (TAP-12 sections 3.4, 4.3, 5.3)
// ---------------------------------------------------------------------------

export interface ScvClaim {
  metric: string
  subject: string
  op: '>' | '>=' | '<' | '<=' | '=='
  value: string
  at?: number
}

export interface CommitmentContent {
  v: 1
  kind: 'message'
  subject?: string
  body: string
  scv: {
    v: 1
    type: 'commitment'
    kind: CommitmentKind
    open: number
    claim?: ScvClaim
    slot?: { chainId: number; processor: string; id: string }
    nonce?: string
  }
}

export interface RevealContent {
  v: 1
  kind: 'message'
  subject?: string
  body: string
  scv: {
    v: 1
    type: 'reveal'
    commitment: { chainId: number; to: string; inboxIndex: number }
    key: string
  }
}

export interface VerdictSource {
  name: string
  value: string
  at: number
  url?: string
}

export interface VerdictContent {
  v: 1
  kind: 'message'
  subject?: string
  body: string
  scv: {
    v: 1
    type: 'verdict'
    commitment: { chainId: number; to: string; inboxIndex: number }
    key?: string
    outcome: VerdictOutcome
    sources?: VerdictSource[]
    reason?: string
  }
}

export function buildCommitmentContent(args: {
  body: string
  kind: CommitmentKind
  open: number
  claim?: ScvClaim
  slot?: { chainId: number; processor: string; id: string }
  nonce?: string
  subject?: string
}): Uint8Array {
  const obj: CommitmentContent = {
    v: 1,
    kind: 'message',
    body: args.body,
    scv: { v: 1, type: 'commitment', kind: args.kind, open: args.open },
  }
  if (args.subject) obj.subject = args.subject
  if (args.claim) obj.scv.claim = args.claim
  if (args.slot) obj.scv.slot = args.slot
  if (args.nonce) obj.scv.nonce = args.nonce
  return new TextEncoder().encode(JSON.stringify(obj))
}

export function buildRevealContent(args: {
  body: string
  commitment: { chainId: number; to: string; inboxIndex: number }
  key: string
  subject?: string
}): Uint8Array {
  const obj: RevealContent = {
    v: 1,
    kind: 'message',
    body: args.body,
    scv: { v: 1, type: 'reveal', commitment: args.commitment, key: args.key.toLowerCase() },
  }
  if (args.subject) obj.subject = args.subject
  return new TextEncoder().encode(JSON.stringify(obj))
}

export function buildVerdictContent(args: {
  body: string
  commitment: { chainId: number; to: string; inboxIndex: number }
  outcome: VerdictOutcome
  sources?: VerdictSource[]
  reason?: string
  key?: string
  subject?: string
}): Uint8Array {
  const obj: VerdictContent = {
    v: 1,
    kind: 'message',
    body: args.body,
    scv: { v: 1, type: 'verdict', commitment: args.commitment, outcome: args.outcome },
  }
  if (args.subject) obj.subject = args.subject
  if (args.key) obj.scv.key = args.key.toLowerCase()
  if (args.sources) obj.scv.sources = args.sources
  if (args.reason) obj.scv.reason = args.reason
  return new TextEncoder().encode(JSON.stringify(obj))
}

function isHex32(s: unknown): s is string {
  return typeof s === 'string' && /^0x[0-9a-f]{64}$/.test(s)
}

function isEndpointHex(s: unknown): s is string {
  return typeof s === 'string' && /^0x[0-9a-f]{64}$/.test(s)
}

/** Parse raw content bytes strictly (vendored decodeContent) and return the raw object for scv checks. */
export function parseContentObject(bytes: Uint8Array): Record<string, any> {
  const decoded = decodeContent(bytes)
  if (decoded.kind !== 'message') throw new Error('content kind is not message')
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

/** TAP-12 section 3.4: revealed commitment content must match its ref. Returns error strings, empty when valid. */
export function validateCommitmentContent(obj: any, refInfo: ParsedRef): string[] {
  const errors: string[] = []
  if (!obj || typeof obj !== 'object') return ['content is not an object']
  if (obj.v !== 1) errors.push('v is not 1')
  if (obj.kind !== 'message') errors.push('kind is not "message"')
  if (typeof obj.body !== 'string' || obj.body.length === 0) errors.push('body is missing or empty')
  const scv = obj.scv
  if (!scv || typeof scv !== 'object') return [...errors, 'scv member is missing']
  if (scv.v !== 1) errors.push('scv.v is not 1')
  if (scv.type !== 'commitment') errors.push('scv.type is not "commitment"')
  if (scv.kind !== 'promise' && scv.kind !== 'forecast') errors.push('scv.kind is not "promise" or "forecast"')
  if (refInfo.kind && scv.kind !== refInfo.kind) errors.push('scv.kind does not equal the kind byte in ref')
  if (typeof scv.open !== 'number' || !Number.isSafeInteger(scv.open)) errors.push('scv.open is not an integer')
  if (refInfo.open !== undefined && scv.open !== refInfo.open) errors.push('scv.open does not equal the open time in ref')
  if (scv.claim !== undefined) {
    const c = scv.claim
    if (typeof c.metric !== 'string' || typeof c.subject !== 'string') errors.push('scv.claim metric/subject must be strings')
    if (!['>', '>=', '<', '<=', '=='].includes(c.op)) errors.push('scv.claim op is not one of >, >=, <, <=, ==')
    if (typeof c.value !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(c.value)) errors.push('scv.claim value must be a decimal string without leading zeros')
    if (c.at !== undefined && (!Number.isSafeInteger(c.at) || c.at < 0)) errors.push('scv.claim at must be a non-negative integer')
  }
  return errors
}

export function validateRevealContent(obj: any): string[] {
  const errors: string[] = []
  if (!obj || typeof obj !== 'object') return ['content is not an object']
  if (obj.v !== 1) errors.push('v is not 1')
  if (obj.kind !== 'message') errors.push('kind is not "message"')
  if (typeof obj.body !== 'string') errors.push('body is missing')
  const scv = obj.scv
  if (!scv || typeof scv !== 'object') return [...errors, 'scv member is missing']
  if (scv.v !== 1) errors.push('scv.v is not 1')
  if (scv.type !== 'reveal') errors.push('scv.type is not "reveal"')
  if (!scv.commitment || typeof scv.commitment !== 'object') errors.push('scv.commitment is missing')
  else {
    if (!Number.isSafeInteger(scv.commitment.chainId) || scv.commitment.chainId <= 0) errors.push('scv.commitment.chainId is invalid')
    if (!isEndpointHex(scv.commitment.to)) errors.push('scv.commitment.to is not a 32-byte endpoint id')
    if (!Number.isSafeInteger(scv.commitment.inboxIndex) || scv.commitment.inboxIndex < 0) errors.push('scv.commitment.inboxIndex is invalid')
  }
  if (!isHex32(scv.key)) errors.push('scv.key is not 32 bytes of 0x-prefixed lowercase hex')
  return errors
}

export function validateVerdictContent(obj: any): string[] {
  const errors: string[] = []
  if (!obj || typeof obj !== 'object') return ['content is not an object']
  if (obj.v !== 1) errors.push('v is not 1')
  if (obj.kind !== 'message') errors.push('kind is not "message"')
  if (typeof obj.body !== 'string' || obj.body.length === 0) errors.push('body is missing or empty')
  const scv = obj.scv
  if (!scv || typeof scv !== 'object') return [...errors, 'scv member is missing']
  if (scv.v !== 1) errors.push('scv.v is not 1')
  if (scv.type !== 'verdict') errors.push('scv.type is not "verdict"')
  if (!scv.commitment || typeof scv.commitment !== 'object') errors.push('scv.commitment is missing')
  else {
    if (!Number.isSafeInteger(scv.commitment.chainId) || scv.commitment.chainId <= 0) errors.push('scv.commitment.chainId is invalid')
    if (!isEndpointHex(scv.commitment.to)) errors.push('scv.commitment.to is not a 32-byte endpoint id')
    if (!Number.isSafeInteger(scv.commitment.inboxIndex) || scv.commitment.inboxIndex < 0) errors.push('scv.commitment.inboxIndex is invalid')
  }
  if (scv.key !== undefined && !isHex32(scv.key)) errors.push('scv.key is not 32 bytes of 0x-prefixed lowercase hex')
  if (!['hit', 'miss', 'undecidable'].includes(scv.outcome)) errors.push('scv.outcome is not hit, miss or undecidable')
  if ((scv.outcome === 'hit' || scv.outcome === 'miss')) {
    if (!Array.isArray(scv.sources) || scv.sources.length < 1) errors.push('hit/miss verdicts require at least one source')
    else {
      for (const s of scv.sources) {
        if (typeof s.name !== 'string' || s.name.length === 0) errors.push('each source needs a name')
        if (typeof s.value !== 'string' || s.value.length === 0) errors.push('each source needs a value')
        if (!Number.isSafeInteger(s.at) || s.at < 0) errors.push('each source needs an integer at time')
        if (s.url !== undefined && typeof s.url !== 'string') errors.push('source url must be a string')
      }
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Reveal verification with K (TAP-12 section 4.4)
// ---------------------------------------------------------------------------

export interface RevealVerifyInput {
  commitmentPayload: Uint8Array
  keyHex: string
  to: string // judge endpoint id (32 bytes)
  from: string // author container address (20 bytes) or endpoint id
  ref: string // commitment ref
  hub: string
  chainId: number
}

export interface RevealVerifyResult {
  ok: boolean
  error?: string
  contentBytes?: Uint8Array
  content?: Record<string, any>
}

/**
 * TAP-12 section 4.4 steps 3-5 (steps 1-2 are done by the caller: recompute the
 * commitmentId and check the sender is author or judge).
 * Step 3: SHA-256("TAP-10/commit/v2" || K) must equal the sealed payload field D.
 * Step 4: decrypt C with K, nonce N, aad = P || S || X, X per TAP-10 section 15.3.
 * Step 5: decode the content under section 3.4.
 */
export function verifyRevealWithKey(input: RevealVerifyInput): RevealVerifyResult {
  let parsed: ReturnType<typeof parsePayload>
  try {
    parsed = parsePayload(input.commitmentPayload)
  } catch (e: any) {
    return { ok: false, error: `commitment payload does not parse: ${e?.message ?? e}` }
  }
  if (parsed.kind !== 'sealed') {
    return { ok: false, error: 'commitment payload is not sealed' }
  }
  let k: Uint8Array
  try {
    k = hexToBytes(input.keyHex, 32)
  } catch {
    return { ok: false, error: 'K is not 32 bytes of hex' }
  }
  // Step 3: D check. (payload.js parsePayload returns `commit` at runtime;
  // its JSDoc return type omits it, so read it via a cast.)
  const d = sha256(concat(ascii('TAP-10/commit/v2'), k))
  if (!equalBytes(d, (parsed as unknown as { commit: Uint8Array }).commit)) {
    return { ok: false, error: 'SHA-256("TAP-10/commit/v2" || K) does not equal the sealed payload commitment D' }
  }
  // Step 4: decrypt C. X is the TAP-10 sealing context (payload.js context()).
  const x = concat(
    ascii('TAP-10/X/v2'),
    endpointBytes(input.to, input.chainId),
    endpointBytes(input.from, input.chainId),
    refBytes(input.ref),
    addressBytes(input.hub),
  )
  const aad = concat(parsed.P, parsed.S, x)
  let contentBytes: Uint8Array
  try {
    contentBytes = xchacha20poly1305(k, parsed.N, aad).decrypt(parsed.C)
  } catch {
    return { ok: false, error: 'decryption of C with K failed (authentication tag mismatch)' }
  }
  // Step 5: decode content under section 3.4
  try {
    const content = parseContentObject(contentBytes)
    return { ok: true, contentBytes, content }
  } catch (e: any) {
    return { ok: false, error: `decrypted content does not decode: ${e?.message ?? e}` }
  }
}

// ---------------------------------------------------------------------------
// Verdict rules (TAP-12 section 5)
// ---------------------------------------------------------------------------

export interface VerdictCheckInput {
  outcome: VerdictOutcome
  sources?: VerdictSource[]
  revealed: boolean // commitment revealed by an earlier reveal or by this verdict's scv.key
  verdictBlockTime: number
  open: number
  isDesignatedJudge: boolean
}

export function checkVerdictRules(input: VerdictCheckInput): { errors: string[]; early: boolean } {
  const errors: string[] = []
  const early = input.verdictBlockTime < input.open
  if (!input.revealed && input.outcome !== 'undecidable') {
    errors.push('a verdict on a commitment that has not been revealed must be undecidable')
  }
  if ((input.outcome === 'hit' || input.outcome === 'miss') && (!input.sources || input.sources.length < 1)) {
    errors.push('hit/miss verdicts require at least one source {name, value, at, url?}')
  }
  return { errors, early }
}

/** keccak256 helper for tests and the indexer (raw bytes in, 0x hex out). */
export function keccak256Hex(data: Uint8Array): string {
  return bytesToHex(keccak_256(data))
}

export function uint256Bytes(value: bigint | number): Uint8Array {
  return uint256(value)
}

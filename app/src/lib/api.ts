// Oathfold internal API facade (v1).
// Additive only: this file re-exports the key types and functions from the
// existing lib modules and adds thin, typed wrappers plus the shared error
// shape. It does not change any existing module, and it sends no transaction.
// Full contract: docs/api-surface.md. Versioning, error codes, pagination,
// safe-finality and no-leak rules are defined there.
//
// No-leak rule: sealed plaintext and content keys never leave the client.
// Nothing in this file logs, returns, or stores sealed plaintext, an
// unpublished content key, a private key, or a personal_sign signature.

import {
  verifyHub,
  resolveEndpoint,
  keyFor,
  inboxAt,
  inboxCount,
  outboxCount,
  parseEndpointName,
  parseEndpointId,
  endpointIdFor,
  readWithFallback,
  XLAYER_CHAIN_ID,
  XLAYER_RPC_PRIMARY,
  XLAYER_RPC_SECONDARY,
  HUB_ADDRESS as XLAYER_HUB_ADDRESS,
  HUB_IMPLEMENTATION_XLAYER,
  HUB_OWNER,
  FACTORY_ADDRESS,
  OPENER_ADDRESS,
  ERC1967_IMPL_SLOT,
  FINALITY_TAG,
  LOG_RANGE_MAX_BLOCKS,
  shortAddress,
  formatTime,
  type HubVerification,
  type KeyForResult,
  type EndpointResolution,
  type InboxEntry,
} from './chain/xlayer'
import {
  scanSentLogs,
  buildRecords,
  decodeSentLog,
  sentTopic0,
  latestBlockNumber,
  type ScanOptions,
  type ScanResult,
} from './indexer'
import {
  loadDemoRecords,
  rebuildDemoRecords,
  loadLiveRecords,
  saveLiveRecords,
  clearLiveCache,
  saveDemoRecord,
  type LiveMeta,
} from './store'
import {
  parseRef,
  commitmentId,
  digestOf,
  verifyDigest,
  deriveStatus,
  statusLabel,
  statusExplain,
  buildCommitmentRef,
  buildLinkedRef,
  verifyRevealWithKey,
  checkVerdictRules,
  validateCommitmentContent,
  validateRevealContent,
  validateVerdictContent,
  TAP12_TAG,
  GRACE_SECONDS,
  XLAYER_CHAIN_ID as TAP12_CHAIN_ID,
  HUB_ADDRESS as TAP12_HUB_ADDRESS,
  type ParsedRef,
  type CommitmentKind,
  type CommitmentStatus,
  type RecordType,
  type VerdictOutcome,
  type VerdictSource,
  type RevealVerifyInput,
  type RevealVerifyResult,
  type VerdictCheckInput,
} from './protocol/tap12'
import type { ChainMessage, OathRecord, RevealInfo, VerdictInfo } from './records'

export const API_VERSION = 'v1' as const

// ---------------------------------------------------------------------------
// Error shape
// ---------------------------------------------------------------------------

export type OathErrorCode =
  | 'wrong-chain'
  | 'hub-changed'
  | 'not-opened'
  | 'no-usable-key'
  | 'stale-block'
  | 'unavailable'
  | 'digest-mismatch'
  | 'not-final'
  | 'malformed-record'
  | 'invalid-endpoint'
  | 'unknown'

export const OATH_ERROR_CODES: readonly OathErrorCode[] = [
  'wrong-chain',
  'hub-changed',
  'not-opened',
  'no-usable-key',
  'stale-block',
  'unavailable',
  'digest-mismatch',
  'not-final',
  'malformed-record',
  'invalid-endpoint',
  'unknown',
] as const

export type OathErrorSource = 'chain' | 'rpc' | 'protocol' | 'wallet' | 'cache' | 'input'

export interface OathErrorShape {
  code: OathErrorCode
  message: string
  recoverable: boolean
  source: OathErrorSource
}

/** Shared error type for the v1 surface. See docs/api-surface.md section 4. */
export class OathError extends Error implements OathErrorShape {
  code: OathErrorCode
  recoverable: boolean
  source: OathErrorSource

  constructor(code: OathErrorCode, message: string, recoverable: boolean, source: OathErrorSource) {
    super(message)
    this.name = 'OathError'
    this.code = code
    this.recoverable = recoverable
    this.source = source
  }
}

export function isOathError(e: unknown): e is OathError {
  return e instanceof OathError
}

/** Wrap an unexpected thrown error as an OathError without inventing a cause. */
export function toOathError(e: unknown, source: OathErrorSource = 'rpc'): OathError {
  if (e instanceof OathError) return e
  const message = e instanceof Error ? e.message : String(e)
  return new OathError('unavailable', message, true, source)
}

// ---------------------------------------------------------------------------
// Re-exported constants and types
// ---------------------------------------------------------------------------

export {
  XLAYER_CHAIN_ID,
  XLAYER_RPC_PRIMARY,
  XLAYER_RPC_SECONDARY,
  XLAYER_HUB_ADDRESS,
  HUB_IMPLEMENTATION_XLAYER,
  HUB_OWNER,
  FACTORY_ADDRESS,
  OPENER_ADDRESS,
  ERC1967_IMPL_SLOT,
  FINALITY_TAG,
  LOG_RANGE_MAX_BLOCKS,
  TAP12_TAG,
  GRACE_SECONDS,
  TAP12_CHAIN_ID,
  TAP12_HUB_ADDRESS,
}
export { shortAddress, formatTime, parseEndpointName, parseEndpointId, endpointIdFor }
export type {
  ChainMessage,
  OathRecord,
  RevealInfo,
  VerdictInfo,
  HubVerification,
  KeyForResult,
  EndpointResolution,
  InboxEntry,
  ScanOptions,
  ScanResult,
  LiveMeta,
  ParsedRef,
  CommitmentKind,
  CommitmentStatus,
  RecordType,
  VerdictOutcome,
  VerdictSource,
  RevealVerifyInput,
  RevealVerifyResult,
  VerdictCheckInput,
}

// ---------------------------------------------------------------------------
// Chain reads (thin wrappers; read-only, no transaction is sent)
// ---------------------------------------------------------------------------

/** Verify the live hub. Passes the HubVerification through unchanged. */
export async function verifyHubApi(): Promise<HubVerification> {
  return verifyHub()
}

/** Resolve an endpoint name or id. Passes the EndpointResolution through unchanged. */
export async function resolveEndpointApi(input: string): Promise<EndpointResolution> {
  const trimmed = input.trim()
  if (!parseEndpointName(trimmed) && !parseEndpointId(trimmed)) {
    return {
      input,
      status: 'error',
      error: 'Use an X Layer name like #1@2.344, or a 32-byte endpoint id (0x...).',
    }
  }
  return resolveEndpoint(trimmed)
}

/** Read hub keyFor. Throws OathError unavailable when both RPCs fail. */
export async function keyForApi(circuits: `0x${string}`, tokenId: bigint): Promise<KeyForResult> {
  try {
    return await keyFor(circuits, tokenId)
  } catch (e) {
    throw toOathError(e, 'rpc')
  }
}

/** Read one inbox entry. Throws OathError unavailable when both RPCs fail. */
export async function inboxAtApi(to: `0x${string}`, index: bigint): Promise<InboxEntry> {
  try {
    return await inboxAt(to, index)
  } catch (e) {
    throw toOathError(e, 'rpc')
  }
}

export async function inboxCountApi(to: `0x${string}`): Promise<bigint> {
  try {
    return await inboxCount(to)
  } catch (e) {
    throw toOathError(e, 'rpc')
  }
}

export async function outboxCountApi(from: `0x${string}`): Promise<bigint> {
  try {
    return await outboxCount(from)
  } catch (e) {
    throw toOathError(e, 'rpc')
  }
}

export async function latestBlockNumberApi(): Promise<bigint> {
  try {
    return await latestBlockNumber()
  } catch (e) {
    throw toOathError(e, 'rpc')
  }
}

/** Run a read against the primary RPC with fallback to the secondary. */
export { readWithFallback }

// ---------------------------------------------------------------------------
// Indexer (scan, verify, build records)
// ---------------------------------------------------------------------------

export { scanSentLogs, buildRecords, decodeSentLog, sentTopic0 }

/** A message counts as final only when its block is at or below the safe block. */
export function isFinal(blockNumber: number | bigint, safeBlock: bigint | null): boolean {
  if (safeBlock === null) return false
  return BigInt(blockNumber) <= safeBlock
}

export interface ScanPageRequest {
  /** Cursor: the first block to scan (the last scanned block + 1). */
  cursor: bigint
  /** Last block of the overall range. Defaults to the latest block. */
  toBlock?: bigint
  onProgress?: (done: number, total: number) => void
}

/**
 * Scan exactly one 100-block window starting at the cursor (the eth_getLogs
 * limit on rpc.xlayer.tech). The next cursor is nextCursorAfter(result).
 */
export async function scanPage(req: ScanPageRequest): Promise<ScanResult> {
  const toBlock = req.toBlock ?? (await latestBlockNumberApi())
  const end =
    req.cursor + BigInt(LOG_RANGE_MAX_BLOCKS) - 1n > toBlock
      ? toBlock
      : req.cursor + BigInt(LOG_RANGE_MAX_BLOCKS) - 1n
  if (end < req.cursor) {
    throw new OathError('stale-block', 'Scan cursor is past the requested end block.', false, 'input')
  }
  return scanSentLogs({ fromBlock: req.cursor, toBlock: end, onProgress: req.onProgress })
}

/** Next cursor after a scan page: toBlock + 1. The caller stops when the cursor passes its own overall end block. */
export function nextCursorAfter(result: ScanResult): bigint {
  return result.toBlock + 1n
}

// ---------------------------------------------------------------------------
// Protocol helpers (pure, no chain access)
// ---------------------------------------------------------------------------

export {
  parseRef,
  commitmentId,
  digestOf,
  verifyDigest,
  deriveStatus,
  statusLabel,
  statusExplain,
  buildCommitmentRef,
  buildLinkedRef,
  verifyRevealWithKey,
  checkVerdictRules,
  validateCommitmentContent,
  validateRevealContent,
  validateVerdictContent,
}

// ---------------------------------------------------------------------------
// Local cache (cache only; the chain is the source of truth)
// ---------------------------------------------------------------------------

export {
  loadDemoRecords,
  rebuildDemoRecords,
  loadLiveRecords,
  saveLiveRecords,
  clearLiveCache,
  saveDemoRecord,
}

// ---------------------------------------------------------------------------
// Graph module (in progress, see docs/api-surface.md section 7)
// ---------------------------------------------------------------------------
//
// src/lib/graph/ does not exist yet. This interface records the intended
// public functions so callers can rely on the names and shapes once it
// lands. There is no implementation here and nothing is faked.

export interface GraphApi {
  authorHistory(author: string): OathRecord[]
  judgeHistory(judge: string): OathRecord[]
  evidenceGraph(commitmentId: string): {
    record: OathRecord | null
    reveal: RevealInfo | null
    verdicts: VerdictInfo[]
  }
  relatedCommitments(commitmentId: string): OathRecord[]
  programGraph(): {
    records: OathRecord[]
    authors: string[]
    judges: string[]
  }
  answerAuthorRecord(answer: unknown): OathRecord | null
}

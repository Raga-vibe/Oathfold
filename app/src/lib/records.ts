// Shared record model for Oathfold (TAP-12 records rebuilt from chain or demo).
import type { CommitmentKind, CommitmentStatus, VerdictOutcome, VerdictSource } from './protocol/tap12'

export interface ChainMessage {
  chainId: number
  hub: string
  to: string // judge endpoint id (32 bytes hex)
  from: string // author container address
  ref: string
  inboxIndex: number
  outboxIndex: number
  payload: string // 0x hex
  txHash: string
  blockNumber: number
  blockTimestamp: number
  digest: string
  final: boolean // blockNumber <= safe block at scan time
  senderWallet?: string | null // TAP-12 section 8.3: sending wallet per message (when known)
}

export interface RevealInfo {
  message: ChainMessage
  key: string
  content: Record<string, any> | null
  verified: boolean
  error?: string
}

export interface VerdictInfo {
  message: ChainMessage
  outcome: VerdictOutcome
  sources: VerdictSource[]
  reason?: string
  body: string
  designated: boolean
  early: boolean
  key?: string
  valid: boolean
  error?: string
}

export interface OathRecord {
  commitmentId: string
  kind: CommitmentKind
  open: number
  ref: string
  commitment: ChainMessage
  status: CommitmentStatus
  malformedReason?: string
  revealedContent: Record<string, any> | null
  reveal: RevealInfo | null
  verdicts: VerdictInfo[]
  source: 'live' | 'demo'
  /** Demo-only display title (demo content subject also carries it). */
  demoTitle?: string
  /** Demo-only: the content key, kept in localStorage so the demo reveal works. Never a live key. */
  demoKey?: string
  /** Demo-only: the ephemeral secret keys used to seal the demo payload, for local open. */
  demoSecrets?: { judge: string; author: string }
}

// Oathfold state machines: every implicit state machine in the app, made explicit.
// One shared module, the single source of truth for UX, DX and AX.
// Pattern per machine (hand-rolled, zero-dependency, no xstate):
//   - a named union type of states
//   - an event union (discriminated by `type`)
//   - one transition function: (state, event) -> { ok: true, state } | { ok: false, state, reason }
//   - where a state is derived from chain or stored data, one pure derive function
//     so the UI and any agent read one field instead of re-inferring it from two.
// Rules: exhaustive switches (no default fall-through that hides a state),
// terminal states have no outgoing transitions except an explicit reset,
// guards encode the real protocol rules, and a rejected transition never
// changes state. Nothing here touches the chain or changes stored shapes:
// machine state is derived, not a new on-chain field.

import { deriveStatus, checkVerdictRules, type CommitmentStatus, type VerdictOutcome } from './protocol/tap12'
import type { WalletState } from './wallet'
import type { EndpointResolution, HubVerification } from './chain/xlayer'
import type { OathRecord } from './records'
import type { OathGraph } from './graph/graph'

// Re-exported so callers have one import for the machine module's inputs.
export type { EndpointResolution, HubVerification } from './chain/xlayer'
export type { OathRecord } from './records'
export type { OathGraph } from './graph/graph'
export type { WalletState } from './wallet'

// ---------------------------------------------------------------------------
// Shared result shape
// ---------------------------------------------------------------------------

export type TransitionResult<S> =
  | { ok: true; state: S }
  | { ok: false; state: S; reason: string }

function accept<S>(state: S): TransitionResult<S> {
  return { ok: true, state }
}

function reject<S>(state: S, reason: string): TransitionResult<S> {
  return { ok: false, state, reason }
}

// ---------------------------------------------------------------------------
// 1. Commitment lifecycle (TAP-12 section 7)
// Before: deriveStatus in tap12.ts computed the status, but the UI re-inferred
// it everywhere: `record.reveal ? ... : 'Not yet'`, `verdicts.some(v =>
// v.designated && v.valid)`, Review queue filtering on three status strings.
// Now: one derived state, one transition, guards encode the section 7 rules.
// ---------------------------------------------------------------------------

export type CommitmentState = CommitmentStatus

export type CommitmentEvent =
  | { type: 'reveal-verified' }
  | { type: 'designated-verdict' }
  | { type: 'malformed-found' }
  | { type: 'tick' }

export interface CommitmentInputs {
  malformed: boolean
  revealed: boolean
  judged: boolean
  open: number
  now: number
}

/** Pure derivation: the named state from the raw inputs. Same rule as TAP-12 section 7. */
export function deriveCommitmentState(input: CommitmentInputs): CommitmentState {
  return deriveStatus(input)
}

/** Derive the state straight from a stored record at a given time. */
export function commitmentStateOf(record: OathRecord, now: number): CommitmentState {
  return deriveStatus({
    malformed: !!record.malformedReason,
    revealed: !!record.reveal,
    judged: record.verdicts.some((v) => v.designated && v.valid),
    open: record.open,
    now,
  })
}

export function transitionCommitment(
  state: CommitmentState,
  event: CommitmentEvent,
): TransitionResult<CommitmentState> {
  switch (state) {
    case 'judged':
    case 'malformed':
      // Terminal states: no outgoing transition.
      return reject(state, `A ${state} commitment is terminal and cannot change state.`)
    case 'sealed':
    case 'due':
    case 'unrevealed':
      switch (event.type) {
        case 'reveal-verified': return accept('revealed')
        case 'designated-verdict':
          return reject(state, 'A designated verdict needs a verified reveal first. Reveal, then judge.')
        case 'malformed-found': return accept('malformed')
        case 'tick': return accept(state)
      }
      break
    case 'revealed':
      switch (event.type) {
        case 'designated-verdict': return accept('judged')
        case 'reveal-verified': return accept('revealed')
        case 'malformed-found': return accept('malformed')
        case 'tick': return accept(state)
      }
      break
  }
}

/** Can this state accept a reveal? (A reveal is what moves sealed/due/unrevealed to revealed.) */
export function canReveal(state: CommitmentState): boolean {
  return state === 'sealed' || state === 'due' || state === 'unrevealed'
}

/** Which verdict outcomes are legal for a commitment in this state? */
export function allowedVerdictOutcomes(state: CommitmentState): VerdictOutcome[] {
  if (state === 'revealed' || state === 'judged') return ['hit', 'miss', 'undecidable']
  // Unrevealed (sealed/due/unrevealed) commitments can only receive undecidable.
  return ['undecidable']
}

// ---------------------------------------------------------------------------
// 2. Wallet connection
// Before: App.tsx kept `connected: boolean`, `chainId: number | null` and
// `error?: string` with no in-flight state, so the Connect button stayed
// live during connect and could be double-clicked. Now: one named phase.
// ---------------------------------------------------------------------------

export type WalletPhase =
  | 'disconnected'
  | 'connecting'
  | 'connected-wrong-chain'
  | 'switching'
  | 'ready'
  | 'error'

export type WalletEvent =
  | { type: 'connect-start' }
  | { type: 'connect-ok'; chainId: number }
  | { type: 'connect-fail'; error: string }
  | { type: 'switch-start' }
  | { type: 'switch-ok' }
  | { type: 'switch-fail'; error: string }
  | { type: 'disconnect' }

export function transitionWallet(
  state: WalletPhase,
  event: WalletEvent,
): TransitionResult<WalletPhase> {
  switch (event.type) {
    case 'connect-start':
      if (state === 'disconnected' || state === 'error') return accept('connecting')
      return reject(state, `Cannot start connecting while the wallet is ${state}.`)
    case 'connect-ok':
      if (state !== 'connecting') return reject(state, 'A connect result arrived with no connect in flight.')
      return accept(event.chainId === 196 ? 'ready' : 'connected-wrong-chain')
    case 'connect-fail':
      if (state !== 'connecting') return reject(state, 'A connect failure arrived with no connect in flight.')
      return accept('error')
    case 'switch-start':
      if (state === 'connected-wrong-chain') return accept('switching')
      return reject(state, `Cannot switch chains while the wallet is ${state}.`)
    case 'switch-ok':
      if (state !== 'switching') return reject(state, 'A switch result arrived with no switch in flight.')
      return accept('ready')
    case 'switch-fail':
      if (state !== 'switching') return reject(state, 'A switch failure arrived with no switch in flight.')
      return accept('connected-wrong-chain')
    case 'disconnect':
      return accept('disconnected')
  }
}

export type WalletFlight = 'idle' | 'connecting' | 'switching'

/** Derive the named phase from the stored wallet state plus the in-flight action. */
export function deriveWalletState(wallet: WalletState, flight: WalletFlight): WalletPhase {
  if (flight === 'connecting') return 'connecting'
  if (flight === 'switching') return 'switching'
  if (wallet.error && !wallet.connected) return 'error'
  if (!wallet.connected || !wallet.address) return 'disconnected'
  if (wallet.chainId !== 196) return 'connected-wrong-chain'
  return 'ready'
}

export function walletPhaseLabel(phase: WalletPhase): string {
  switch (phase) {
    case 'disconnected': return 'Wallet not connected'
    case 'connecting': return 'Connecting wallet…'
    case 'connected-wrong-chain': return 'Wallet on the wrong chain'
    case 'switching': return 'Switching to X Layer…'
    case 'ready': return 'Wallet ready on X Layer'
    case 'error': return 'Wallet connection failed'
  }
}

// ---------------------------------------------------------------------------
// 3. Live send flow (Create page)
// Before: a `Step` union plus a separate `busy` boolean plus a `blocker`
// string that could desync (busy true while step was 'blocked', blocker set
// without a step change). Now: one state, `busy` and the blocker are derived.
// ---------------------------------------------------------------------------

export type SendState =
  | 'form'
  | 'resolving'
  | 'deriving'
  | 'publishing'
  | 'sealing'
  | 'sending'
  | 'confirming'
  | 'done'
  | 'blocked'

export const SEND_STEPS: readonly SendState[] = [
  'form',
  'resolving',
  'deriving',
  'publishing',
  'sealing',
  'sending',
  'confirming',
  'done',
] as const

export function sendStepLabel(state: SendState): string {
  switch (state) {
    case 'form': return 'Form'
    case 'resolving': return 'Resolve endpoints'
    case 'deriving': return 'Derive key'
    case 'publishing': return 'Publish key'
    case 'sealing': return 'Seal'
    case 'sending': return 'Send'
    case 'confirming': return 'Wait for finality'
    case 'done': return 'Done'
    case 'blocked': return 'Blocked'
  }
}

/** Index of a state in the stepper, or -1 for the off-path `blocked` state. */
export function sendStepIndex(state: SendState): number {
  return SEND_STEPS.indexOf(state)
}

/** `busy` is derived from the state, never stored separately. */
export function sendIsBusy(state: SendState): boolean {
  return state !== 'form' && state !== 'done' && state !== 'blocked'
}

export type SendEvent =
  | { type: 'start'; formValid: boolean }
  | { type: 'resolved' }
  | { type: 'derived' }
  | { type: 'publish-needed' }
  | { type: 'published' }
  | { type: 'sealed' }
  | { type: 'sent' }
  | { type: 'confirmed' }
  | { type: 'block'; reason: string }
  | { type: 'reset' }

export function transitionSend(state: SendState, event: SendEvent): TransitionResult<SendState> {
  if (event.type === 'reset') {
    if (state === 'done' || state === 'blocked' || state === 'form') return accept('form')
    return reject(state, `Cannot reset while a send is ${state}. Wait for it to finish or fail.`)
  }
  if (event.type === 'block') {
    if (state === 'done') return reject(state, 'A finished send cannot be blocked.')
    if (state === 'form') return reject(state, 'Nothing is in flight to block.')
    return accept('blocked')
  }
  switch (state) {
    case 'form':
      if (event.type === 'start') {
        return event.formValid
          ? accept('resolving')
          : reject(state, 'The form is not valid. Fix the listed errors first.')
      }
      return reject(state, `Cannot ${event.type} before the send starts.`)
    case 'resolving':
      if (event.type === 'resolved') return accept('deriving')
      return reject(state, `Cannot ${event.type} while endpoints are still resolving.`)
    case 'deriving':
      if (event.type === 'derived') return accept('sealing')
      if (event.type === 'publish-needed') return accept('publishing')
      return reject(state, `Cannot ${event.type} while the key is still deriving.`)
    case 'publishing':
      if (event.type === 'published') return accept('sealing')
      return reject(state, `Cannot ${event.type} while the key is still publishing.`)
    case 'sealing':
      if (event.type === 'sealed') return accept('sending')
      return reject(state, `Cannot ${event.type} while the payload is still sealing.`)
    case 'sending':
      if (event.type === 'sent') return accept('confirming')
      return reject(state, `Cannot ${event.type} while the transaction is still sending.`)
    case 'confirming':
      if (event.type === 'confirmed') return accept('done')
      return reject(state, `Cannot ${event.type} before safe finality.`)
    case 'done':
      return reject(state, 'The send is done. Reset to send another commitment.')
    case 'blocked':
      return reject(state, 'The send is blocked. Reset to try again.')
  }
}

// ---------------------------------------------------------------------------
// 4. Key readiness (endpoint + hub keyFor + derived key)
// Before: Create re-checked three things in line (`author.status`,
// `author.key.usable`, holder match, then later derived-vs-published hex
// compare). Now: one named readiness, derived from the resolution, with the
// derived-key comparison as an explicit event.
// ---------------------------------------------------------------------------

export type KeyReadiness =
  | 'unknown'
  | 'checking'
  | 'usable'
  | 'not-opened'
  | 'no-key'
  | 'stale'
  | 'mismatch'
  | 'error'

export type KeyReadinessEvent =
  | { type: 'check-start' }
  | { type: 'resolved'; resolution: EndpointResolution }
  | { type: 'key-compared'; matches: boolean }
  | { type: 'key-revoked' }

export function transitionKeyReadiness(
  state: KeyReadiness,
  event: KeyReadinessEvent,
): TransitionResult<KeyReadiness> {
  switch (event.type) {
    case 'check-start':
      if (state === 'unknown' || state === 'error' || state === 'stale' || state === 'mismatch') return accept('checking')
      return reject(state, `Cannot start a key check while readiness is ${state}.`)
    case 'resolved': {
      if (state !== 'checking' && state !== 'unknown') return reject(state, 'A key resolution arrived with no check in flight.')
      return accept(deriveKeyReadiness(event.resolution))
    }
    case 'key-compared':
      if (state !== 'usable') return reject(state, 'A derived key can only be compared once a usable key exists.')
      return accept(event.matches ? 'usable' : 'mismatch')
    case 'key-revoked':
      if (state === 'usable' || state === 'mismatch') return accept('stale')
      return reject(state, `Cannot revoke a key while readiness is ${state}.`)
  }
}

/** Derive readiness from a resolved endpoint. The derived-key comparison is a later event. */
export function deriveKeyReadiness(resolution: EndpointResolution | null): KeyReadiness {
  if (!resolution) return 'unknown'
  switch (resolution.status) {
    case 'ok':
      if (!resolution.opened) return 'not-opened'
      if (!resolution.key || !resolution.key.usable) return 'no-key'
      return 'usable'
    case 'not-opened':
      return 'not-opened'
    case 'no-such-cpu':
    case 'no-such-token':
    case 'not-tapeout':
    case 'error':
      return 'error'
  }
}

export function keyReadinessLabel(readiness: KeyReadiness): string {
  switch (readiness) {
    case 'unknown': return 'Key state unknown'
    case 'checking': return 'Checking key…'
    case 'usable': return 'Usable key'
    case 'not-opened': return 'Container not opened'
    case 'no-key': return 'No usable key'
    case 'stale': return 'Key stale (revoked or replaced)'
    case 'mismatch': return 'Derived key differs from published key'
    case 'error': return 'Key lookup failed'
  }
}

// ---------------------------------------------------------------------------
// 5. Reveal flow
// Before: the indexer verified reveals in five inline steps and the UI only
// knew `record.reveal ? ... : 'Not yet'`. Now: one named reveal state per
// record, derived from the stored reveal info.
// ---------------------------------------------------------------------------

export type RevealState = 'none' | 'published' | 'verifying' | 'verified' | 'invalid'

export type RevealEvent =
  | { type: 'publish-key' }
  | { type: 'verify-start' }
  | { type: 'verify-ok' }
  | { type: 'verify-fail' }

export function transitionReveal(state: RevealState, event: RevealEvent): TransitionResult<RevealState> {
  switch (state) {
    case 'none':
      if (event.type === 'publish-key') return accept('published')
      return reject(state, `Cannot ${event.type} before a content key is published.`)
    case 'published':
      if (event.type === 'verify-start') return accept('verifying')
      return reject(state, `Cannot ${event.type} before verification starts.`)
    case 'verifying':
      if (event.type === 'verify-ok') return accept('verified')
      if (event.type === 'verify-fail') return accept('invalid')
      return reject(state, `Cannot ${event.type} while verification is running.`)
    case 'verified':
    case 'invalid':
      return reject(state, `A ${state} reveal is terminal and cannot change state.`)
  }
}

/** Derive the reveal state from a stored record. */
export function deriveRevealState(record: OathRecord): RevealState {
  if (!record.reveal) return 'none'
  if (record.reveal.verified) return 'verified'
  if (record.reveal.error) return 'invalid'
  return 'published'
}

// ---------------------------------------------------------------------------
// 6. Verdict draft flow (Review page)
// Before: `draft: string | null` plus `errors: string[]` plus a live
// `checkVerdictRules` call, with the illegal hit/miss-on-unrevealed choice
// only failing at build time. Now: the machine rejects the illegal outcome
// at selection time, and the draft is either ready or invalid, never both.
// ---------------------------------------------------------------------------

export type VerdictDraftState = 'idle' | 'editing' | 'invalid' | 'ready'

export type VerdictDraftEvent =
  | { type: 'edit' }
  | { type: 'set-outcome'; outcome: VerdictOutcome; revealed: boolean }
  | { type: 'build'; valid: boolean; errors: string[] }
  | { type: 'reset' }
  | { type: 'select-record' }

export function transitionVerdictDraft(
  state: VerdictDraftState,
  event: VerdictDraftEvent,
): TransitionResult<VerdictDraftState> {
  switch (event.type) {
    case 'edit':
      if (state === 'idle' || state === 'invalid' || state === 'ready') return accept('editing')
      return accept(state)
    case 'set-outcome':
      if (!event.revealed && (event.outcome === 'hit' || event.outcome === 'miss')) {
        return reject(state, 'An unrevealed commitment can only receive undecidable.')
      }
      return accept(state === 'idle' ? 'editing' : state)
    case 'build':
      if (state === 'idle') return reject(state, 'Nothing to build: edit the verdict first.')
      return event.valid ? accept('ready') : accept('invalid')
    case 'reset':
      return accept('idle')
    case 'select-record':
      return accept('idle')
  }
}

/** Outcomes the UI may offer for a record, given whether it is revealed. */
export function draftAllowedOutcomes(revealed: boolean): VerdictOutcome[] {
  return revealed ? ['hit', 'miss', 'undecidable'] : ['undecidable']
}

// ---------------------------------------------------------------------------
// 7. Indexer scan (Live page)
// Before: `scanBusy` boolean plus a `scanProgress` string ("done/total") plus
// a free-form log. Now: one state with numeric progress in context; the
// progress string is rendered, never stored.
// ---------------------------------------------------------------------------

export type ScanState = 'idle' | 'scanning' | 'verifying' | 'done' | 'failed'

export interface ScanContext {
  done: number
  total: number
  chunks: number
}

export type ScanEvent =
  | { type: 'start' }
  | { type: 'progress'; done: number; total: number }
  | { type: 'verified'; chunks: number }
  | { type: 'complete' }
  | { type: 'fail' }
  | { type: 'reset' }

export function transitionScan(
  state: ScanState,
  event: ScanEvent,
): TransitionResult<ScanState> {
  switch (event.type) {
    case 'start':
      if (state === 'idle' || state === 'done' || state === 'failed') return accept('scanning')
      return reject(state, `Cannot start a scan while one is ${state}.`)
    case 'progress':
      if (state !== 'scanning') return reject(state, 'Scan progress arrived with no scan running.')
      return accept('scanning')
    case 'verified':
      if (state !== 'scanning') return reject(state, 'Verification cannot finish before the scan runs.')
      return accept('verifying')
    case 'complete':
      if (state !== 'verifying') return reject(state, 'A scan cannot complete before verification.')
      return accept('done')
    case 'fail':
      if (state === 'idle') return reject(state, 'Nothing is running to fail.')
      return accept('failed')
    case 'reset':
      return accept('idle')
  }
}

export function scanProgressLabel(ctx: ScanContext): string {
  if (ctx.total <= 0) return 'Starting scan…'
  return `${ctx.done}/${ctx.total} blocks`
}

// ---------------------------------------------------------------------------
// 8. Hub verification
// Before: `hub: HubVerification | null` plus `hubBusy`, and App.tsx re-built
// the display string (`hub === null ? 'Hub check…' : ...`). Now: one named
// state derived from the verification object.
// ---------------------------------------------------------------------------

export type HubState =
  | 'unknown'
  | 'checking'
  | 'verified-sealed'
  | 'verified-unsealed'
  | 'mismatch'
  | 'error'

export type HubEvent =
  | { type: 'check-start' }
  | { type: 'checked'; verification: HubVerification }
  | { type: 'check-fail' }

export function transitionHub(state: HubState, event: HubEvent): TransitionResult<HubState> {
  switch (event.type) {
    case 'check-start':
      if (state === 'unknown' || state === 'error' || state.startsWith('verified') || state === 'mismatch') return accept('checking')
      return reject(state, `Cannot start a hub check while one is ${state}.`)
    case 'checked':
      if (state !== 'checking' && state !== 'unknown') return reject(state, 'A hub result arrived with no check in flight.')
      return accept(deriveHubState(event.verification, false))
    case 'check-fail':
      if (state !== 'checking') return reject(state, 'A hub failure arrived with no check in flight.')
      return accept('error')
  }
}

/** Derive the named hub state. `checking` is true while a read is in flight. */
export function deriveHubState(verification: HubVerification | null, checking: boolean): HubState {
  if (checking) return 'checking'
  if (!verification) return 'unknown'
  if (verification.error) return 'error'
  if (verification.implementationMatches === false) return 'mismatch'
  if (verification.isSealed === true) return 'verified-sealed'
  if (verification.isSealed === false) return 'verified-unsealed'
  return 'unknown'
}

export function hubStateLabel(state: HubState): string {
  switch (state) {
    case 'unknown': return 'Hub check pending'
    case 'checking': return 'Checking hub…'
    case 'verified-sealed': return 'Hub sealed'
    case 'verified-unsealed': return 'Hub not sealed'
    case 'mismatch': return 'Hub implementation mismatch'
    case 'error': return 'Hub check failed'
  }
}

// ---------------------------------------------------------------------------
// 9. Endpoint lookup (Live page)
// Before: five separate pieces of state (`lookup`, `lookupBusy`, `lookupKey`,
// `lookupInbox`, `lookupOutbox`), each nullable, so "partial" results (key
// read failed but inbox read worked) had no name. Now: one state with a
// per-field report.
// ---------------------------------------------------------------------------

export type LookupState = 'idle' | 'looking' | 'ready' | 'partial' | 'failed'

export interface LookupReport {
  keyOk: boolean
  inboxOk: boolean
  outboxOk: boolean
}

export type LookupEvent =
  | { type: 'lookup-start' }
  | { type: 'lookup-done'; report: LookupReport }
  | { type: 'lookup-fail' }
  | { type: 'reset' }

export function transitionLookup(state: LookupState, event: LookupEvent): TransitionResult<LookupState> {
  switch (event.type) {
    case 'lookup-start':
      if (state === 'idle' || state === 'ready' || state === 'partial' || state === 'failed') return accept('looking')
      return reject(state, `Cannot start a lookup while one is ${state}.`)
    case 'lookup-done': {
      if (state !== 'looking') return reject(state, 'A lookup result arrived with no lookup running.')
      const { keyOk, inboxOk, outboxOk } = event.report
      if (keyOk && inboxOk && outboxOk) return accept('ready')
      if (!keyOk && !inboxOk && !outboxOk) return accept('failed')
      return accept('partial')
    }
    case 'lookup-fail':
      if (state !== 'looking') return reject(state, 'A lookup failure arrived with no lookup running.')
      return accept('failed')
    case 'reset':
      return accept('idle')
  }
}

/** Derive the lookup state from a per-field report (same rule as the transition). */
export function deriveLookupState(report: LookupReport | null): LookupState {
  if (!report) return 'idle'
  const { keyOk, inboxOk, outboxOk } = report
  if (keyOk && inboxOk && outboxOk) return 'ready'
  if (!keyOk && !inboxOk && !outboxOk) return 'failed'
  return 'partial'
}

// ---------------------------------------------------------------------------
// 10. Demo fixture store
// Before: loadDemoRecords silently rebuilt from cache or from scratch and the
// UI could not tell which. Now: the load result names its own state.
// ---------------------------------------------------------------------------

export type DemoStoreState = 'unknown' | 'cached' | 'rebuilt' | 'unavailable'

export type DemoStoreEvent =
  | { type: 'load'; fromCache: boolean }
  | { type: 'rebuild' }
  | { type: 'save' }
  | { type: 'unavailable' }

export function transitionDemoStore(
  state: DemoStoreState,
  event: DemoStoreEvent,
): TransitionResult<DemoStoreState> {
  switch (event.type) {
    case 'load':
      return accept(event.fromCache ? 'cached' : 'rebuilt')
    case 'rebuild':
      return accept('rebuilt')
    case 'save':
      if (state === 'unknown') return reject(state, 'Nothing is loaded to save into.')
      return accept(state)
    case 'unavailable':
      return accept('unavailable')
  }
}

// ---------------------------------------------------------------------------
// 11. Graph build
// Before: `useMemo(() => buildGraph(records))` with no named state; panels
// inferred emptiness from `history.total === 0` each. Now: one derived state.
// ---------------------------------------------------------------------------

export type GraphState = 'empty' | 'building' | 'ready'

export type GraphEvent =
  | { type: 'build-start' }
  | { type: 'build-done'; nodes: number }

export function transitionGraph(state: GraphState, event: GraphEvent): TransitionResult<GraphState> {
  switch (event.type) {
    case 'build-start':
      if (state === 'empty' || state === 'ready') return accept('building')
      return reject(state, 'A graph build is already running.')
    case 'build-done':
      if (state !== 'building') return reject(state, 'A graph result arrived with no build running.')
      return accept(event.nodes > 0 ? 'ready' : 'empty')
  }
}

/** Derive the graph state from a built graph. */
export function deriveGraphState(graph: OathGraph | null): GraphState {
  if (!graph) return 'empty'
  return graph.nodes.length > 0 ? 'ready' : 'empty'
}

// ---------------------------------------------------------------------------
// 12. Record lookup (RecordDetail)
// Before: `records.find(...)` returning undefined, rendered as a "not found"
// branch with no name. Now: the lookup result is a named state.
// ---------------------------------------------------------------------------

export type RecordLookupState = 'found' | 'not-found'

export function deriveRecordLookupState(record: OathRecord | undefined): RecordLookupState {
  return record ? 'found' : 'not-found'
}

// ---------------------------------------------------------------------------
// 13. Disclosure (toggles: raw payload, graph context, verification)
// Before: scattered `showX` booleans, each with its own toggle handler.
// Now: one toggle machine, reused by every collapsible panel.
// ---------------------------------------------------------------------------

export type DisclosureState = 'closed' | 'open'

export type DisclosureEvent = { type: 'toggle' } | { type: 'open' } | { type: 'close' }

export function transitionDisclosure(
  state: DisclosureState,
  event: DisclosureEvent,
): TransitionResult<DisclosureState> {
  switch (event.type) {
    case 'toggle': return accept(state === 'closed' ? 'open' : 'closed')
    case 'open': return accept('open')
    case 'close': return accept('closed')
  }
}

// ---------------------------------------------------------------------------
// 14. Route (navigation)
// Before: parseHash already mapped hashes to a Route union, but the menu
// open/closed boolean lived beside it and an unknown hash silently became
// landing with no named rule. Now: one machine for route + menu.
// ---------------------------------------------------------------------------

export type RouteName = 'landing' | 'dashboard' | 'create' | 'record' | 'review' | 'live' | 'trust' | 'onboarding'

export interface RouteMachineState {
  route: RouteName
  recordId: string | null
  menu: DisclosureState
}

export type RouteEvent =
  | { type: 'navigate'; route: RouteName; recordId?: string }
  | { type: 'unknown-hash' }
  | { type: 'toggle-menu' }
  | { type: 'close-menu' }

export function transitionRoute(
  state: RouteMachineState,
  event: RouteEvent,
): TransitionResult<RouteMachineState> {
  switch (event.type) {
    case 'navigate':
      if (event.route === 'record' && !event.recordId) {
        return reject(state, 'The record route needs a commitment id.')
      }
      return accept({
        route: event.route,
        recordId: event.route === 'record' ? (event.recordId ?? null) : null,
        menu: 'closed',
      })
    case 'unknown-hash':
      return accept({ route: 'landing', recordId: null, menu: 'closed' })
    case 'toggle-menu':
      return accept({ ...state, menu: state.menu === 'closed' ? 'open' : 'closed' })
    case 'close-menu':
      return accept({ ...state, menu: 'closed' })
  }
}

// ---------------------------------------------------------------------------
// 15. Live cache (Live page / store)
// Before: `liveMeta: ... | null` with the "never scanned" state implied by
// null and no name for it. Now: one named state derived from the meta.
// ---------------------------------------------------------------------------

export type LiveCacheState = 'empty' | 'cached'

export type LiveCacheEvent = { type: 'scan-saved' } | { type: 'cleared' }

export function transitionLiveCache(
  state: LiveCacheState,
  event: LiveCacheEvent,
): TransitionResult<LiveCacheState> {
  switch (event.type) {
    case 'scan-saved': return accept('cached')
    case 'cleared': return accept('empty')
  }
}

/** Derive the cache state from the stored scan meta. */
export function deriveLiveCacheState(meta: { scannedAt: number } | null): LiveCacheState {
  return meta ? 'cached' : 'empty'
}

// ---------------------------------------------------------------------------
// 16. Form validity (Create page)
// Before: validate() ran only on submit and `errors: string[]` carried no
// record of whether the user had tried. Now: pristine/editing/invalid/valid,
// so the UI can stay quiet until the first submit attempt.
// ---------------------------------------------------------------------------

export type FormState = 'pristine' | 'editing' | 'valid' | 'invalid'

export type FormEvent =
  | { type: 'edit' }
  | { type: 'submit'; errors: string[] }
  | { type: 'reset' }

export function transitionForm(state: FormState, event: FormEvent): TransitionResult<FormState> {
  switch (event.type) {
    case 'edit':
      if (state === 'pristine') return accept('editing')
      return accept(state)
    case 'submit':
      return accept(event.errors.length === 0 ? 'valid' : 'invalid')
    case 'reset':
      return accept('pristine')
  }
}

/** Derive the form state from whether a submit was attempted and its errors. */
export function deriveFormState(attempted: boolean, errors: string[]): FormState {
  if (!attempted) return 'pristine'
  return errors.length === 0 ? 'valid' : 'invalid'
}

// ---------------------------------------------------------------------------
// Cross-machine guard: the live send can only start when wallet, key and
// form are all in the right state. One place, so Create, the docs and any
// agent check the same rule.
// ---------------------------------------------------------------------------

export interface SendPrerequisites {
  wallet: WalletPhase
  authorKey: KeyReadiness
  judgeKey: KeyReadiness
  form: FormState
}

export function sendPrerequisitesMet(p: SendPrerequisites): { ok: boolean; blockers: string[] } {
  const blockers: string[] = []
  if (p.wallet !== 'ready') blockers.push(`Wallet is ${p.wallet}, not ready on X Layer.`)
  if (p.authorKey !== 'usable') blockers.push(`Author key is ${keyReadinessLabel(p.authorKey).toLowerCase()}.`)
  if (p.judgeKey !== 'usable') blockers.push(`Judge key is ${keyReadinessLabel(p.judgeKey).toLowerCase()}.`)
  if (p.form !== 'valid') blockers.push('The form is not valid yet.')
  return { ok: blockers.length === 0, blockers }
}

/** The verdict rules, re-exposed through the machine module so callers have one import. */
export function verdictRulesFor(args: {
  outcome: VerdictOutcome
  sources: { name: string; value: string; at: number; url?: string }[]
  revealed: boolean
  verdictBlockTime: number
  open: number
}): { errors: string[]; early: boolean } {
  return checkVerdictRules({
    outcome: args.outcome,
    sources: args.sources,
    revealed: args.revealed,
    verdictBlockTime: args.verdictBlockTime,
    open: args.open,
    isDesignatedJudge: true,
  })
}

// ---------------------------------------------------------------------------
// 17. Container onboarding (Onboarding page)
// Before: the holder's set-up path (connect the wallet, resolve the account
// name, check opened, check keyFor usable, derive the key, publish it) had no
// named state, so the page could not say which step it was on or why it
// stopped, and two readers could infer different blockers. Now: one flow plus
// a pure per-step derivation, so the UI and the tests read the same rule.
// ---------------------------------------------------------------------------

export type OnboardingState =
  | 'idle'
  | 'connecting'
  | 'resolving'
  | 'ready'
  | 'deriving'
  | 'publishing'
  | 'done'
  | 'blocked'

export const ONBOARDING_FLOW: readonly OnboardingState[] = [
  'idle',
  'connecting',
  'resolving',
  'ready',
  'deriving',
  'publishing',
  'done',
] as const

/** Index in the flow, or -1 for the off-path `blocked` state. */
export function onboardingStepIndex(state: OnboardingState): number {
  return ONBOARDING_FLOW.indexOf(state)
}

/** Busy is derived from the state, never stored separately. */
export function onboardingIsBusy(state: OnboardingState): boolean {
  return (
    state === 'connecting' ||
    state === 'resolving' ||
    state === 'deriving' ||
    state === 'publishing'
  )
}

export type OnboardingEvent =
  | { type: 'connect-start' }
  | { type: 'connect-done' }
  | { type: 'resolve-start' }
  | { type: 'resolve-done' }
  | { type: 'derive-start' }
  | { type: 'derive-done' }
  | { type: 'publish-needed' }
  | { type: 'publish-done' }
  | { type: 'block'; reason: string }
  | { type: 'reset' }

export function transitionOnboarding(
  state: OnboardingState,
  event: OnboardingEvent,
): TransitionResult<OnboardingState> {
  if (event.type === 'reset') return accept('idle')
  if (event.type === 'block') {
    if (state === 'done') return reject(state, 'A finished set-up cannot be blocked.')
    if (state === 'idle' || state === 'blocked') return reject(state, 'Nothing is in flight to block.')
    return accept('blocked')
  }
  switch (state) {
    case 'idle':
    case 'blocked':
      if (event.type === 'connect-start') return accept('connecting')
      if (event.type === 'resolve-start') return accept('resolving')
      return reject(state, `Cannot ${event.type} from ${state}.`)
    case 'connecting':
      if (event.type === 'connect-done') return accept('idle')
      return reject(state, `Cannot ${event.type} while the wallet is connecting.`)
    case 'resolving':
      if (event.type === 'resolve-done') return accept('ready')
      return reject(state, `Cannot ${event.type} while the account is resolving.`)
    case 'ready':
      if (event.type === 'connect-start') return accept('connecting')
      if (event.type === 'resolve-start') return accept('resolving')
      if (event.type === 'derive-start') return accept('deriving')
      if (event.type === 'publish-needed') return accept('publishing')
      return reject(state, `Cannot ${event.type} while the account is ready.`)
    case 'deriving':
      if (event.type === 'derive-done') return accept('done')
      return reject(state, `Cannot ${event.type} while the key is deriving.`)
    case 'publishing':
      if (event.type === 'publish-done') return accept('done')
      return reject(state, `Cannot ${event.type} while the key is publishing.`)
    case 'done':
      if (event.type === 'connect-start') return accept('connecting')
      if (event.type === 'resolve-start') return accept('resolving')
      return reject(state, `Cannot ${event.type} after the set-up is done.`)
  }
}

// ---------------------------------------------------------------------------
// Per-step checks. Pure, so the page renders one list and the tests assert the
// same rule. A missing usable key is NOT a hard blocker here: the page exists
// to publish one. Only an unopened or unresolvable account stops the flow.
// ---------------------------------------------------------------------------

export type OnboardingStepId = 'wallet' | 'name' | 'opened' | 'key' | 'derive' | 'publish'
export type OnboardingStepStatus = 'pending' | 'pass' | 'fail'

export interface OnboardingStep {
  id: OnboardingStepId
  label: string
  status: OnboardingStepStatus
  detail?: string
}

/** The exact hard blocker for a resolution, or null when the account can proceed. */
export function onboardingResolveBlocker(resolution: EndpointResolution | null): string | null {
  if (!resolution) return null
  switch (resolution.status) {
    case 'ok':
      return null
    case 'not-opened':
      return 'This account is not opened yet. Open its container on X Layer first (a one-time fee), then come back and resolve it again.'
    case 'no-such-cpu':
      return resolution.error ?? 'That processor does not exist on X Layer.'
    case 'no-such-token':
      return resolution.error ?? 'That circuit does not exist on this processor.'
    case 'not-tapeout':
      return resolution.error ?? 'That account is not a TapeOut circuit.'
    case 'error':
      return resolution.error ?? 'The account could not be read.'
  }
}

/** The exact text for an opened account that still has no usable key. */
export function onboardingKeyBlocker(resolution: EndpointResolution | null): string | null {
  if (!resolution || resolution.status !== 'ok') return null
  if (resolution.key && resolution.key.usable) return null
  return 'This account is opened, but it has no usable TapeSend key yet. Derive and publish your key below to finish.'
}

export function deriveOnboardingSteps(args: {
  wallet: WalletPhase
  resolution: EndpointResolution | null
  keyMatches: boolean | null
  published: boolean
}): OnboardingStep[] {
  const { wallet, resolution, keyMatches, published } = args

  let walletStep: OnboardingStep = { id: 'wallet', label: 'Connect your wallet', status: 'pending', detail: 'Not connected.' }
  if (wallet === 'ready') walletStep = { id: 'wallet', label: 'Connect your wallet', status: 'pass', detail: 'Connected on X Layer.' }
  else if (wallet === 'connected-wrong-chain') walletStep = { id: 'wallet', label: 'Connect your wallet', status: 'fail', detail: 'The wallet is on the wrong chain. Switch it to X Layer (196).' }
  else if (wallet === 'error') walletStep = { id: 'wallet', label: 'Connect your wallet', status: 'fail', detail: 'The connection failed. Try again.' }
  else if (wallet === 'connecting' || wallet === 'switching') walletStep = { id: 'wallet', label: 'Connect your wallet', status: 'pending', detail: 'Connecting…' }

  let nameStep: OnboardingStep = { id: 'name', label: 'Find your account', status: 'pending', detail: 'Enter your account name, e.g. #1@2.344.' }
  if (resolution && (resolution.status === 'ok' || resolution.status === 'not-opened')) {
    nameStep = { id: 'name', label: 'Find your account', status: 'pass', detail: resolution.label ?? resolution.input }
  } else if (resolution) {
    nameStep = { id: 'name', label: 'Find your account', status: 'fail', detail: onboardingResolveBlocker(resolution) ?? 'Could not read this account.' }
  }

  let openedStep: OnboardingStep = { id: 'opened', label: 'Account opened', status: 'pending', detail: 'Not checked yet.' }
  if (resolution && resolution.opened === true) {
    openedStep = { id: 'opened', label: 'Account opened', status: 'pass', detail: 'Opened.' }
  } else if (resolution && resolution.status === 'not-opened') {
    openedStep = { id: 'opened', label: 'Account opened', status: 'fail', detail: 'Not opened yet. Opening costs a one-time fee on X Layer.' }
  }

  let keyStep: OnboardingStep = { id: 'key', label: 'TapeSend key usable', status: 'pending', detail: 'Not checked yet.' }
  if (resolution && resolution.status === 'ok' && resolution.key && resolution.key.usable) {
    keyStep = { id: 'key', label: 'TapeSend key usable', status: 'pass', detail: 'A usable key is on file.' }
  } else if (resolution && resolution.status === 'ok') {
    keyStep = { id: 'key', label: 'TapeSend key usable', status: 'fail', detail: onboardingKeyBlocker(resolution) ?? 'No usable key yet.' }
  }

  let deriveStep: OnboardingStep = { id: 'derive', label: 'Sign to derive your key', status: 'pending', detail: 'Not derived yet.' }
  if (keyMatches === true) {
    deriveStep = { id: 'derive', label: 'Sign to derive your key', status: 'pass', detail: 'Derived key matches the key on file.' }
  } else if (keyMatches === false) {
    deriveStep = { id: 'derive', label: 'Sign to derive your key', status: 'pass', detail: 'Key derived. It differs from the key on file, so it needs publishing.' }
  }

  let publishStep: OnboardingStep = { id: 'publish', label: 'Publish your key', status: 'pending', detail: 'Not published yet.' }
  if (published) {
    publishStep = { id: 'publish', label: 'Publish your key', status: 'pass', detail: 'Published.' }
  } else if (keyMatches === false) {
    publishStep = { id: 'publish', label: 'Publish your key', status: 'pending', detail: 'Needs publishing.' }
  }

  return [walletStep, nameStep, openedStep, keyStep, deriveStep, publishStep]
}

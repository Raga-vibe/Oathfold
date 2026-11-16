// Tests for src/lib/machines.ts: every machine, every state, every legal
// transition, every guard rejection. Table-driven so a new state or event
// shows up as a missing case, not a silent pass.
import { describe, it, expect } from 'vitest'
import {
  deriveCommitmentState,
  commitmentStateOf,
  transitionCommitment,
  canReveal,
  allowedVerdictOutcomes,
  transitionWallet,
  deriveWalletState,
  walletPhaseLabel,
  transitionSend,
  sendStepIndex,
  sendStepLabel,
  sendIsBusy,
  SEND_STEPS,
  transitionKeyReadiness,
  deriveKeyReadiness,
  keyReadinessLabel,
  transitionReveal,
  deriveRevealState,
  transitionVerdictDraft,
  draftAllowedOutcomes,
  transitionScan,
  scanProgressLabel,
  transitionHub,
  deriveHubState,
  hubStateLabel,
  transitionLookup,
  deriveLookupState,
  transitionDemoStore,
  transitionGraph,
  deriveGraphState,
  deriveRecordLookupState,
  transitionDisclosure,
  transitionRoute,
  transitionLiveCache,
  deriveLiveCacheState,
  transitionForm,
  deriveFormState,
  sendPrerequisitesMet,
  type CommitmentState,
  type WalletPhase,
  type SendState,
  type KeyReadiness,
  type EndpointResolution,
} from './machines'
import type { OathRecord } from './records'
import type { HubVerification } from './chain/xlayer'

function fakeRecord(over: Partial<OathRecord> = {}): OathRecord {
  return {
    commitmentId: '0x' + 'ab'.repeat(32),
    kind: 'promise',
    open: 1_800_000_000,
    ref: '0x' + '00'.repeat(32),
    commitment: {
      chainId: 196,
      hub: '0xe61a9c7213a6aa616c246a2b569e555b417b25ee',
      to: '0x' + '00'.repeat(32),
      from: '0x' + '11'.repeat(20),
      ref: '0x' + '00'.repeat(32),
      inboxIndex: 1,
      outboxIndex: 1,
      payload: '0x00',
      txHash: '0x' + '00'.repeat(32),
      blockNumber: 1,
      blockTimestamp: 1_700_000_000,
      digest: '0x' + '00'.repeat(32),
      final: true,
    },
    status: 'sealed',
    revealedContent: null,
    reveal: null,
    verdicts: [],
    source: 'demo',
    ...over,
  }
}

describe('1. commitment lifecycle', () => {
  it('derives every section 7 status from raw inputs', () => {
    expect(deriveCommitmentState({ malformed: true, revealed: true, judged: true, open: 100, now: 200 })).toBe('malformed')
    expect(deriveCommitmentState({ malformed: false, revealed: false, judged: false, open: 200, now: 100 })).toBe('sealed')
    expect(deriveCommitmentState({ malformed: false, revealed: false, judged: false, open: 100, now: 150 })).toBe('due')
    expect(deriveCommitmentState({ malformed: false, revealed: false, judged: false, open: 100, now: 100 + 604800 })).toBe('unrevealed')
    expect(deriveCommitmentState({ malformed: false, revealed: true, judged: false, open: 100, now: 200 })).toBe('revealed')
    expect(deriveCommitmentState({ malformed: false, revealed: true, judged: true, open: 100, now: 200 })).toBe('judged')
  })

  it('derives state from a stored record', () => {
    const r = fakeRecord({ status: 'sealed', open: 1_800_000_000 })
    expect(commitmentStateOf(r, 1_700_000_000)).toBe('sealed')
    expect(commitmentStateOf(r, 1_800_000_001)).toBe('due')
  })

  it('allows reveal from sealed, due and unrevealed', () => {
    for (const s of ['sealed', 'due', 'unrevealed'] as CommitmentState[]) {
      expect(transitionCommitment(s, { type: 'reveal-verified' })).toEqual({ ok: true, state: 'revealed' })
    }
  })

  it('allows a designated verdict only after reveal', () => {
    expect(transitionCommitment('revealed', { type: 'designated-verdict' })).toEqual({ ok: true, state: 'judged' })
    for (const s of ['sealed', 'due', 'unrevealed'] as CommitmentState[]) {
      const r = transitionCommitment(s, { type: 'designated-verdict' })
      expect(r.ok).toBe(false)
      expect(r.state).toBe(s)
    }
  })

  it('rejects every transition out of terminal judged and malformed', () => {
    for (const s of ['judged', 'malformed'] as CommitmentState[]) {
      for (const e of [{ type: 'reveal-verified' }, { type: 'designated-verdict' }, { type: 'malformed-found' }, { type: 'tick' }] as const) {
        const r = transitionCommitment(s, e)
        expect(r.ok).toBe(false)
        expect(r.state).toBe(s)
      }
    }
  })

  it('malformed-found wins from any live state, tick is a no-op', () => {
    for (const s of ['sealed', 'due', 'unrevealed', 'revealed'] as CommitmentState[]) {
      expect(transitionCommitment(s, { type: 'malformed-found' })).toEqual({ ok: true, state: 'malformed' })
      expect(transitionCommitment(s, { type: 'tick' })).toEqual({ ok: true, state: s })
    }
  })

  it('canReveal and allowed outcomes encode the rules', () => {
    expect(canReveal('sealed')).toBe(true)
    expect(canReveal('due')).toBe(true)
    expect(canReveal('unrevealed')).toBe(true)
    expect(canReveal('revealed')).toBe(false)
    expect(canReveal('judged')).toBe(false)
    expect(canReveal('malformed')).toBe(false)
    expect(allowedVerdictOutcomes('sealed')).toEqual(['undecidable'])
    expect(allowedVerdictOutcomes('due')).toEqual(['undecidable'])
    expect(allowedVerdictOutcomes('unrevealed')).toEqual(['undecidable'])
    expect(allowedVerdictOutcomes('revealed')).toEqual(['hit', 'miss', 'undecidable'])
    expect(allowedVerdictOutcomes('judged')).toEqual(['hit', 'miss', 'undecidable'])
    expect(allowedVerdictOutcomes('malformed')).toEqual(['undecidable'])
  })
})

describe('2. wallet connection', () => {
  it('connects from disconnected and from error, and lands on ready or wrong-chain', () => {
    expect(transitionWallet('disconnected', { type: 'connect-start' })).toEqual({ ok: true, state: 'connecting' })
    expect(transitionWallet('error', { type: 'connect-start' })).toEqual({ ok: true, state: 'connecting' })
    expect(transitionWallet('connecting', { type: 'connect-ok', chainId: 196 })).toEqual({ ok: true, state: 'ready' })
    expect(transitionWallet('connecting', { type: 'connect-ok', chainId: 1 })).toEqual({ ok: true, state: 'connected-wrong-chain' })
    expect(transitionWallet('connecting', { type: 'connect-fail', error: 'rejected' })).toEqual({ ok: true, state: 'error' })
  })

  it('switches only from wrong-chain, and a failed switch stays wrong-chain', () => {
    expect(transitionWallet('connected-wrong-chain', { type: 'switch-start' })).toEqual({ ok: true, state: 'switching' })
    expect(transitionWallet('switching', { type: 'switch-ok' })).toEqual({ ok: true, state: 'ready' })
    expect(transitionWallet('switching', { type: 'switch-fail', error: 'no' })).toEqual({ ok: true, state: 'connected-wrong-chain' })
    expect(transitionWallet('ready', { type: 'switch-start' }).ok).toBe(false)
    expect(transitionWallet('disconnected', { type: 'switch-start' }).ok).toBe(false)
  })

  it('rejects connect while already connecting or ready, and disconnect always works', () => {
    expect(transitionWallet('connecting', { type: 'connect-start' }).ok).toBe(false)
    expect(transitionWallet('ready', { type: 'connect-start' }).ok).toBe(false)
    expect(transitionWallet('connecting', { type: 'connect-ok', chainId: 196 }).ok).toBe(true)
    for (const s of ['disconnected', 'connecting', 'connected-wrong-chain', 'switching', 'ready', 'error'] as WalletPhase[]) {
      expect(transitionWallet(s, { type: 'disconnect' })).toEqual({ ok: true, state: 'disconnected' })
    }
  })

  it('rejects results with no matching in-flight action', () => {
    expect(transitionWallet('ready', { type: 'connect-ok', chainId: 196 }).ok).toBe(false)
    expect(transitionWallet('ready', { type: 'switch-ok' }).ok).toBe(false)
    expect(transitionWallet('ready', { type: 'connect-fail', error: 'x' }).ok).toBe(false)
    expect(transitionWallet('ready', { type: 'switch-fail', error: 'x' }).ok).toBe(false)
  })

  it('derives the phase from wallet state plus flight', () => {
    const disc = { address: null, chainId: null, connected: false }
    const wrong = { address: '0xabc' as const, chainId: 1, connected: true }
    const ready = { address: '0xabc' as const, chainId: 196, connected: true }
    const err = { address: null, chainId: null, connected: false, error: 'no wallet' }
    expect(deriveWalletState(disc, 'idle')).toBe('disconnected')
    expect(deriveWalletState(disc, 'connecting')).toBe('connecting')
    expect(deriveWalletState(ready, 'switching')).toBe('switching')
    expect(deriveWalletState(wrong, 'idle')).toBe('connected-wrong-chain')
    expect(deriveWalletState(ready, 'idle')).toBe('ready')
    expect(deriveWalletState(err, 'idle')).toBe('error')
    expect(deriveWalletState(ready, 'idle')).toBe('ready')
  })

  it('labels every phase', () => {
    for (const s of ['disconnected', 'connecting', 'connected-wrong-chain', 'switching', 'ready', 'error'] as WalletPhase[]) {
      expect(walletPhaseLabel(s).length).toBeGreaterThan(0)
    }
  })
})

describe('3. live send flow', () => {
  const flow: SendState[] = ['form', 'resolving', 'deriving', 'sealing', 'sending', 'confirming', 'done']
  it('walks the happy path, including the optional publish step', () => {
    let s: SendState = 'form'
    const step = (e: Parameters<typeof transitionSend>[1]) => {
      const r = transitionSend(s, e)
      expect(r.ok).toBe(true)
      s = r.state
    }
    step({ type: 'start', formValid: true })
    step({ type: 'resolved' })
    step({ type: 'publish-needed' })
    step({ type: 'published' })
    step({ type: 'sealed' })
    step({ type: 'sent' })
    step({ type: 'confirmed' })
    expect(s).toBe('done')
  })

  it('walks the no-publish path (derived key matches published key)', () => {
    let s: SendState = 'form'
    const r1 = transitionSend(s, { type: 'start', formValid: true })
    expect(r1.state).toBe('resolving')
    const r2 = transitionSend(r1.state, { type: 'resolved' })
    const r3 = transitionSend(r2.state, { type: 'derived' })
    expect(r3).toEqual({ ok: true, state: 'sealing' })
  })

  it('rejects start with an invalid form, and out-of-order events', () => {
    expect(transitionSend('form', { type: 'start', formValid: false }).ok).toBe(false)
    expect(transitionSend('form', { type: 'sealed' }).ok).toBe(false)
    expect(transitionSend('resolving', { type: 'sealed' }).ok).toBe(false)
    expect(transitionSend('deriving', { type: 'sent' }).ok).toBe(false)
    expect(transitionSend('sending', { type: 'confirmed' }).ok).toBe(false)
    expect(transitionSend('confirming', { type: 'sent' }).ok).toBe(false)
  })

  it('blocks from any in-flight state, never from done or form', () => {
    for (const s of ['resolving', 'deriving', 'publishing', 'sealing', 'sending', 'confirming'] as SendState[]) {
      expect(transitionSend(s, { type: 'block', reason: 'x' })).toEqual({ ok: true, state: 'blocked' })
    }
    expect(transitionSend('done', { type: 'block', reason: 'x' }).ok).toBe(false)
    expect(transitionSend('form', { type: 'block', reason: 'x' }).ok).toBe(false)
  })

  it('resets only from form, done or blocked', () => {
    expect(transitionSend('done', { type: 'reset' })).toEqual({ ok: true, state: 'form' })
    expect(transitionSend('blocked', { type: 'reset' })).toEqual({ ok: true, state: 'form' })
    expect(transitionSend('form', { type: 'reset' })).toEqual({ ok: true, state: 'form' })
    expect(transitionSend('sending', { type: 'reset' }).ok).toBe(false)
    expect(transitionSend('done', { type: 'confirmed' }).ok).toBe(false)
    expect(transitionSend('blocked', { type: 'sealed' }).ok).toBe(false)
  })

  it('stepper order, labels and busy are derived', () => {
    expect(SEND_STEPS).toEqual(['form', 'resolving', 'deriving', 'publishing', 'sealing', 'sending', 'confirming', 'done'])
    expect(sendStepIndex('form')).toBe(0)
    expect(sendStepIndex('done')).toBe(7)
    expect(sendStepIndex('blocked')).toBe(-1)
    expect(sendStepLabel('confirming')).toBe('Wait for finality')
    expect(sendIsBusy('form')).toBe(false)
    expect(sendIsBusy('done')).toBe(false)
    expect(sendIsBusy('blocked')).toBe(false)
    expect(sendIsBusy('sending')).toBe(true)
    expect(sendIsBusy('confirming')).toBe(true)
  })
})

describe('4. key readiness', () => {
  const okRes: EndpointResolution = {
    input: '#1@2.344', status: 'ok', opened: true,
    key: {
      container: '0xabc' as const, endpoint: '0x00' as const, opened: true, current: '0xabc' as const,
      suite: 1, keyIndex: 0, key: '0x00' as const, usable: true, version: 1, chains: 4n,
    },
  }
  it('derives every readiness from a resolution', () => {
    expect(deriveKeyReadiness(null)).toBe('unknown')
    expect(deriveKeyReadiness(okRes)).toBe('usable')
    expect(deriveKeyReadiness({ ...okRes, opened: false })).toBe('not-opened')
    expect(deriveKeyReadiness({ ...okRes, status: 'not-opened' })).toBe('not-opened')
    expect(deriveKeyReadiness({ ...okRes, key: { ...okRes.key!, usable: false } })).toBe('no-key')
    expect(deriveKeyReadiness({ ...okRes, key: undefined })).toBe('no-key')
    expect(deriveKeyReadiness({ ...okRes, status: 'no-such-cpu' })).toBe('error')
    expect(deriveKeyReadiness({ ...okRes, status: 'error' })).toBe('error')
    expect(deriveKeyReadiness({ ...okRes, status: 'not-tapeout' })).toBe('error')
  })

  it('checks, resolves, compares and revokes', () => {
    expect(transitionKeyReadiness('unknown', { type: 'check-start' })).toEqual({ ok: true, state: 'checking' })
    expect(transitionKeyReadiness('checking', { type: 'resolved', resolution: okRes })).toEqual({ ok: true, state: 'usable' })
    expect(transitionKeyReadiness('usable', { type: 'key-compared', matches: true })).toEqual({ ok: true, state: 'usable' })
    expect(transitionKeyReadiness('usable', { type: 'key-compared', matches: false })).toEqual({ ok: true, state: 'mismatch' })
    expect(transitionKeyReadiness('usable', { type: 'key-revoked' })).toEqual({ ok: true, state: 'stale' })
    expect(transitionKeyReadiness('mismatch', { type: 'check-start' })).toEqual({ ok: true, state: 'checking' })
  })

  it('rejects comparisons and revokes in the wrong state', () => {
    expect(transitionKeyReadiness('checking', { type: 'key-compared', matches: true }).ok).toBe(false)
    expect(transitionKeyReadiness('no-key', { type: 'key-revoked' }).ok).toBe(false)
    expect(transitionKeyReadiness('usable', { type: 'check-start' }).ok).toBe(false)
    expect(transitionKeyReadiness('usable', { type: 'resolved', resolution: okRes }).ok).toBe(false)
  })

  it('labels every readiness', () => {
    for (const s of ['unknown', 'checking', 'usable', 'not-opened', 'no-key', 'stale', 'mismatch', 'error'] as KeyReadiness[]) {
      expect(keyReadinessLabel(s).length).toBeGreaterThan(0)
    }
  })
})

describe('5. reveal flow', () => {
  it('walks publish -> verify -> verified, and verify -> invalid', () => {
    expect(transitionReveal('none', { type: 'publish-key' })).toEqual({ ok: true, state: 'published' })
    expect(transitionReveal('published', { type: 'verify-start' })).toEqual({ ok: true, state: 'verifying' })
    expect(transitionReveal('verifying', { type: 'verify-ok' })).toEqual({ ok: true, state: 'verified' })
    expect(transitionReveal('verifying', { type: 'verify-fail' })).toEqual({ ok: true, state: 'invalid' })
  })

  it('rejects out-of-order events and any transition out of verified/invalid', () => {
    expect(transitionReveal('none', { type: 'verify-ok' }).ok).toBe(false)
    expect(transitionReveal('published', { type: 'verify-ok' }).ok).toBe(false)
    expect(transitionReveal('verified', { type: 'verify-start' }).ok).toBe(false)
    expect(transitionReveal('invalid', { type: 'publish-key' }).ok).toBe(false)
  })

  it('derives the state from a stored record', () => {
    expect(deriveRevealState(fakeRecord())).toBe('none')
    expect(deriveRevealState(fakeRecord({ reveal: { message: fakeRecord().commitment, key: '0x00', content: {}, verified: true } }))).toBe('verified')
    expect(deriveRevealState(fakeRecord({ reveal: { message: fakeRecord().commitment, key: '0x00', content: null, verified: false, error: 'bad key' } }))).toBe('invalid')
    expect(deriveRevealState(fakeRecord({ reveal: { message: fakeRecord().commitment, key: '0x00', content: null, verified: false } }))).toBe('published')
  })
})

describe('6. verdict draft flow', () => {
  it('walks edit -> build -> ready, and build -> invalid', () => {
    expect(transitionVerdictDraft('idle', { type: 'edit' })).toEqual({ ok: true, state: 'editing' })
    expect(transitionVerdictDraft('editing', { type: 'build', valid: true, errors: [] })).toEqual({ ok: true, state: 'ready' })
    expect(transitionVerdictDraft('editing', { type: 'build', valid: false, errors: ['x'] })).toEqual({ ok: true, state: 'invalid' })
    expect(transitionVerdictDraft('invalid', { type: 'edit' })).toEqual({ ok: true, state: 'editing' })
    expect(transitionVerdictDraft('ready', { type: 'reset' })).toEqual({ ok: true, state: 'idle' })
    expect(transitionVerdictDraft('editing', { type: 'select-record' })).toEqual({ ok: true, state: 'idle' })
  })

  it('rejects building from idle, and hit/miss on an unrevealed record at selection time', () => {
    expect(transitionVerdictDraft('idle', { type: 'build', valid: true, errors: [] }).ok).toBe(false)
    expect(transitionVerdictDraft('editing', { type: 'set-outcome', outcome: 'hit', revealed: false }).ok).toBe(false)
    expect(transitionVerdictDraft('editing', { type: 'set-outcome', outcome: 'miss', revealed: false }).ok).toBe(false)
    expect(transitionVerdictDraft('editing', { type: 'set-outcome', outcome: 'undecidable', revealed: false })).toEqual({ ok: true, state: 'editing' })
    expect(transitionVerdictDraft('editing', { type: 'set-outcome', outcome: 'hit', revealed: true })).toEqual({ ok: true, state: 'editing' })
  })

  it('allowed outcomes match the rule', () => {
    expect(draftAllowedOutcomes(false)).toEqual(['undecidable'])
    expect(draftAllowedOutcomes(true)).toEqual(['hit', 'miss', 'undecidable'])
  })
})

describe('7. indexer scan', () => {
  it('walks start -> progress -> verified -> complete', () => {
    expect(transitionScan('idle', { type: 'start' })).toEqual({ ok: true, state: 'scanning' })
    expect(transitionScan('scanning', { type: 'progress', done: 50, total: 100 })).toEqual({ ok: true, state: 'scanning' })
    expect(transitionScan('scanning', { type: 'verified', chunks: 20 })).toEqual({ ok: true, state: 'verifying' })
    expect(transitionScan('verifying', { type: 'complete' })).toEqual({ ok: true, state: 'done' })
    expect(transitionScan('done', { type: 'start' })).toEqual({ ok: true, state: 'scanning' })
    expect(transitionScan('done', { type: 'reset' })).toEqual({ ok: true, state: 'idle' })
  })

  it('fails from any running state, never from idle', () => {
    for (const s of ['scanning', 'verifying', 'done', 'failed'] as const) {
      expect(transitionScan(s, { type: 'fail' }).ok).toBe(true)
    }
    expect(transitionScan('idle', { type: 'fail' }).ok).toBe(false)
  })

  it('rejects out-of-order events', () => {
    expect(transitionScan('idle', { type: 'progress', done: 1, total: 2 }).ok).toBe(false)
    expect(transitionScan('idle', { type: 'verified', chunks: 1 }).ok).toBe(false)
    expect(transitionScan('scanning', { type: 'complete' }).ok).toBe(false)
    expect(transitionScan('scanning', { type: 'start' }).ok).toBe(false)
  })

  it('labels progress', () => {
    expect(scanProgressLabel({ done: 0, total: 0, chunks: 0 })).toBe('Starting scan…')
    expect(scanProgressLabel({ done: 50, total: 100, chunks: 1 })).toBe('50/100 blocks')
  })
})

describe('8. hub verification', () => {
  const base: HubVerification = {
    chainId: 196, blockNumber: 1n, safeBlockNumber: 1n, safeBlockTimestamp: 1,
    hub: '0xe61a9c7213a6aa616c246a2b569e555b417b25ee', implementation: '0xdcc57797089ebd9f26e686379a4323f353a3f9c6',
    implementationMatches: true, isSealed: false, owner: '0x571d447f4f24688ec35ccf07f1d6993655f6af15',
  }
  it('checks and lands on the right named state', () => {
    expect(transitionHub('unknown', { type: 'check-start' })).toEqual({ ok: true, state: 'checking' })
    expect(transitionHub('checking', { type: 'checked', verification: base })).toEqual({ ok: true, state: 'verified-unsealed' })
    expect(transitionHub('checking', { type: 'checked', verification: { ...base, isSealed: true } })).toEqual({ ok: true, state: 'verified-sealed' })
    expect(transitionHub('checking', { type: 'checked', verification: { ...base, implementationMatches: false } })).toEqual({ ok: true, state: 'mismatch' })
    expect(transitionHub('checking', { type: 'checked', verification: { ...base, error: 'rpc down' } })).toEqual({ ok: true, state: 'error' })
    expect(transitionHub('checking', { type: 'check-fail' })).toEqual({ ok: true, state: 'error' })
    expect(transitionHub('verified-unsealed', { type: 'check-start' })).toEqual({ ok: true, state: 'checking' })
  })

  it('derives the state from a verification object', () => {
    expect(deriveHubState(null, false)).toBe('unknown')
    expect(deriveHubState(null, true)).toBe('checking')
    expect(deriveHubState(base, false)).toBe('verified-unsealed')
    expect(deriveHubState({ ...base, isSealed: true }, false)).toBe('verified-sealed')
    expect(deriveHubState({ ...base, implementationMatches: false }, false)).toBe('mismatch')
    expect(deriveHubState({ ...base, error: 'x' }, false)).toBe('error')
    expect(deriveHubState({ ...base, isSealed: null }, false)).toBe('unknown')
  })

  it('rejects results with no check in flight', () => {
    expect(transitionHub('verified-sealed', { type: 'checked', verification: base }).ok).toBe(false)
    expect(transitionHub('error', { type: 'check-fail' }).ok).toBe(false)
  })

  it('labels every hub state', () => {
    for (const s of ['unknown', 'checking', 'verified-sealed', 'verified-unsealed', 'mismatch', 'error'] as const) {
      expect(hubStateLabel(s).length).toBeGreaterThan(0)
    }
  })
})

describe('9. endpoint lookup', () => {
  it('lands on ready, partial or failed from the per-field report', () => {
    expect(transitionLookup('idle', { type: 'lookup-start' })).toEqual({ ok: true, state: 'looking' })
    expect(transitionLookup('looking', { type: 'lookup-done', report: { keyOk: true, inboxOk: true, outboxOk: true } })).toEqual({ ok: true, state: 'ready' })
    expect(transitionLookup('looking', { type: 'lookup-done', report: { keyOk: false, inboxOk: true, outboxOk: true } })).toEqual({ ok: true, state: 'partial' })
    expect(transitionLookup('looking', { type: 'lookup-done', report: { keyOk: false, inboxOk: false, outboxOk: false } })).toEqual({ ok: true, state: 'failed' })
    expect(transitionLookup('looking', { type: 'lookup-fail' })).toEqual({ ok: true, state: 'failed' })
    expect(transitionLookup('partial', { type: 'reset' })).toEqual({ ok: true, state: 'idle' })
  })

  it('rejects results with no lookup running', () => {
    expect(transitionLookup('idle', { type: 'lookup-done', report: { keyOk: true, inboxOk: true, outboxOk: true } }).ok).toBe(false)
    expect(transitionLookup('ready', { type: 'lookup-fail' }).ok).toBe(false)
    expect(transitionLookup('looking', { type: 'lookup-start' }).ok).toBe(false)
  })

  it('derives the state from a report', () => {
    expect(deriveLookupState(null)).toBe('idle')
    expect(deriveLookupState({ keyOk: true, inboxOk: true, outboxOk: true })).toBe('ready')
    expect(deriveLookupState({ keyOk: true, inboxOk: false, outboxOk: true })).toBe('partial')
    expect(deriveLookupState({ keyOk: false, inboxOk: false, outboxOk: false })).toBe('failed')
  })
})

describe('10. demo fixture store', () => {
  it('names cached vs rebuilt loads', () => {
    expect(transitionDemoStore('unknown', { type: 'load', fromCache: true })).toEqual({ ok: true, state: 'cached' })
    expect(transitionDemoStore('unknown', { type: 'load', fromCache: false })).toEqual({ ok: true, state: 'rebuilt' })
    expect(transitionDemoStore('cached', { type: 'rebuild' })).toEqual({ ok: true, state: 'rebuilt' })
    expect(transitionDemoStore('cached', { type: 'save' })).toEqual({ ok: true, state: 'cached' })
    expect(transitionDemoStore('cached', { type: 'unavailable' })).toEqual({ ok: true, state: 'unavailable' })
  })

  it('rejects saving with nothing loaded', () => {
    expect(transitionDemoStore('unknown', { type: 'save' }).ok).toBe(false)
  })
})

describe('11. graph build', () => {
  it('builds to ready or empty by node count', () => {
    expect(transitionGraph('empty', { type: 'build-start' })).toEqual({ ok: true, state: 'building' })
    expect(transitionGraph('building', { type: 'build-done', nodes: 5 })).toEqual({ ok: true, state: 'ready' })
    expect(transitionGraph('building', { type: 'build-done', nodes: 0 })).toEqual({ ok: true, state: 'empty' })
    expect(transitionGraph('ready', { type: 'build-start' })).toEqual({ ok: true, state: 'building' })
  })

  it('rejects a second build and a result with no build running', () => {
    expect(transitionGraph('building', { type: 'build-start' }).ok).toBe(false)
    expect(transitionGraph('ready', { type: 'build-done', nodes: 1 }).ok).toBe(false)
  })

  it('derives the state from a built graph', () => {
    expect(deriveGraphState(null)).toBe('empty')
    expect(deriveGraphState({ nodes: [], edges: [] } as any)).toBe('empty')
    expect(deriveGraphState({ nodes: [{ id: 'x' }], edges: [] } as any)).toBe('ready')
  })
})

describe('12. record lookup', () => {
  it('names found and not-found', () => {
    expect(deriveRecordLookupState(fakeRecord())).toBe('found')
    expect(deriveRecordLookupState(undefined)).toBe('not-found')
  })
})

describe('13. disclosure', () => {
  it('toggles, opens and closes', () => {
    expect(transitionDisclosure('closed', { type: 'toggle' })).toEqual({ ok: true, state: 'open' })
    expect(transitionDisclosure('open', { type: 'toggle' })).toEqual({ ok: true, state: 'closed' })
    expect(transitionDisclosure('closed', { type: 'open' })).toEqual({ ok: true, state: 'open' })
    expect(transitionDisclosure('open', { type: 'close' })).toEqual({ ok: true, state: 'closed' })
    expect(transitionDisclosure('open', { type: 'open' })).toEqual({ ok: true, state: 'open' })
  })
})

describe('14. route', () => {
  const start = { route: 'landing' as const, recordId: null, menu: 'closed' as const }
  it('navigates, closes the menu, and guards the record route', () => {
    expect(transitionRoute(start, { type: 'navigate', route: 'dashboard' })).toEqual({
      ok: true, state: { route: 'dashboard', recordId: null, menu: 'closed' },
    })
    expect(transitionRoute(start, { type: 'navigate', route: 'record', recordId: '0xabc' })).toEqual({
      ok: true, state: { route: 'record', recordId: '0xabc', menu: 'closed' },
    })
    expect(transitionRoute(start, { type: 'navigate', route: 'record' }).ok).toBe(false)
    expect(transitionRoute({ ...start, route: 'record', recordId: '0xabc' }, { type: 'navigate', route: 'live' })).toEqual({
      ok: true, state: { route: 'live', recordId: null, menu: 'closed' },
    })
  })

  it('unknown hashes land on landing, menu toggles', () => {
    expect(transitionRoute({ ...start, route: 'live' }, { type: 'unknown-hash' })).toEqual({
      ok: true, state: { route: 'landing', recordId: null, menu: 'closed' },
    })
    expect(transitionRoute(start, { type: 'toggle-menu' }).state.menu).toBe('open')
    expect(transitionRoute({ ...start, menu: 'open' }, { type: 'toggle-menu' }).state.menu).toBe('closed')
    expect(transitionRoute({ ...start, menu: 'open' }, { type: 'close-menu' }).state.menu).toBe('closed')
  })
})

describe('15. live cache', () => {
  it('saves and clears, and derives from meta', () => {
    expect(transitionLiveCache('empty', { type: 'scan-saved' })).toEqual({ ok: true, state: 'cached' })
    expect(transitionLiveCache('cached', { type: 'cleared' })).toEqual({ ok: true, state: 'empty' })
    expect(deriveLiveCacheState(null)).toBe('empty')
    expect(deriveLiveCacheState({ scannedAt: 123 })).toBe('cached')
  })
})

describe('16. form validity', () => {
  it('stays quiet until the first submit', () => {
    expect(transitionForm('pristine', { type: 'edit' })).toEqual({ ok: true, state: 'editing' })
    expect(transitionForm('editing', { type: 'submit', errors: [] })).toEqual({ ok: true, state: 'valid' })
    expect(transitionForm('editing', { type: 'submit', errors: ['x'] })).toEqual({ ok: true, state: 'invalid' })
    expect(transitionForm('invalid', { type: 'edit' })).toEqual({ ok: true, state: 'invalid' })
    expect(transitionForm('invalid', { type: 'reset' })).toEqual({ ok: true, state: 'pristine' })
    expect(deriveFormState(false, ['x'])).toBe('pristine')
    expect(deriveFormState(true, [])).toBe('valid')
    expect(deriveFormState(true, ['x'])).toBe('invalid')
  })
})

describe('cross-machine send prerequisites', () => {
  const good = { wallet: 'ready' as const, authorKey: 'usable' as const, judgeKey: 'usable' as const, form: 'valid' as const }
  it('passes only when every prerequisite is met, and names every blocker', () => {
    expect(sendPrerequisitesMet(good)).toEqual({ ok: true, blockers: [] })
    const bad = sendPrerequisitesMet({ ...good, wallet: 'connected-wrong-chain', judgeKey: 'no-key', form: 'invalid' })
    expect(bad.ok).toBe(false)
    expect(bad.blockers).toHaveLength(3)
    expect(sendPrerequisitesMet({ ...good, authorKey: 'mismatch' }).blockers[0]).toMatch(/differs from published/i)
  })
})

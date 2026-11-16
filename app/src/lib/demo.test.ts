// Demo fixture tests: the six DEMO FIXTURE records must cover every TAP-12
// section 7 status, use real seal() payloads, and have a verifiable reveal
// where one is claimed. No live chain is touched.
import { describe, it, expect } from 'vitest'
import { buildDemoSet } from './demo'
import { verifyRevealWithKey, XLAYER_CHAIN_ID, HUB_ADDRESS } from './protocol/tap12'
import { hexToBytes } from './tapeout/send/bytes.js'
import { openPayload } from './tapeout/send/payload.js'

describe('demo fixtures', () => {
  it('covers sealed, due, revealed, judged, unrevealed and malformed', () => {
    const set = buildDemoSet(1793000000)
    expect(set.records.length).toBe(6)
    const statuses = new Set(set.records.map((r) => r.status))
    for (const s of ['sealed', 'due', 'revealed', 'judged', 'unrevealed', 'malformed']) {
      expect(statuses.has(s as any)).toBe(true)
    }
    for (const r of set.records) {
      expect(r.source).toBe('demo')
      expect(r.commitment.payload.length).toBeGreaterThan(10)
    }
  })

  it('revealed and judged demo records verify with K, and open with a holder key', () => {
    const set = buildDemoSet(1793000000)
    for (const r of set.records) {
      if (!r.reveal) continue
      const v = verifyRevealWithKey({
        commitmentPayload: hexToBytes(r.commitment.payload as `0x${string}`),
        keyHex: r.reveal.key,
        to: r.commitment.to,
        from: r.commitment.from,
        ref: r.commitment.ref,
        hub: HUB_ADDRESS,
        chainId: XLAYER_CHAIN_ID,
      })
      expect(v.ok).toBe(true)
      expect(v.content?.scv?.type).toBe('commitment')
      // The sealed payload also opens with the demo author secret key.
      const opened = openPayload({
        payload: hexToBytes(r.commitment.payload as `0x${string}`),
        secretKey: hexToBytes(r.demoSecrets!.author as `0x${string}`),
        to: r.commitment.to,
        from: r.commitment.from,
        hub: HUB_ADDRESS,
        ref: r.commitment.ref,
        chainId: XLAYER_CHAIN_ID,
      })
      expect(opened.kind).toBe('sealed')
    }
    const judged = set.records.find((r) => r.status === 'judged')!
    expect(judged.verdicts.length).toBe(1)
    expect(judged.verdicts[0].designated).toBe(true)
    expect(judged.verdicts[0].outcome).toBe('hit')
    expect(judged.verdicts[0].sources.length).toBeGreaterThanOrEqual(1)
  })

  it('unrevealed demo record has no reveal and no verdict', () => {
    const set = buildDemoSet(1793000000)
    const unrev = set.records.find((r) => r.status === 'unrevealed')!
    expect(unrev.reveal).toBeNull()
    expect(unrev.verdicts).toEqual([])
  })
})

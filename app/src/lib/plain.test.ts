// The plain-words glossary must cover every status and every send step, so
// a new status or step cannot slip through with no plain wording.
import { describe, it, expect } from 'vitest'
import { STATUS_PLAIN, STATUS_DISPLAY, SEND_STEP_PLAIN, OUTCOME_PLAIN } from './plain'
import { SEND_STEPS } from './machines'
import type { CommitmentStatus } from './protocol/tap12'

const STATUSES: CommitmentStatus[] = ['sealed', 'due', 'unrevealed', 'revealed', 'judged', 'malformed']

describe('plain-words glossary', () => {
  it('has one plain line for every status', () => {
    for (const s of STATUSES) {
      expect(STATUS_PLAIN[s]).toBeTruthy()
      expect(STATUS_DISPLAY[s]).toBeTruthy()
    }
    expect(STATUS_PLAIN.malformed).toContain('Broken')
    expect(STATUS_DISPLAY.malformed).toBe('Broken record')
  })

  it('has one plain label for every send step', () => {
    for (const s of SEND_STEPS) expect(SEND_STEP_PLAIN[s]).toBeTruthy()
    expect(SEND_STEP_PLAIN.blocked).toBe('Blocked')
    expect(SEND_STEP_PLAIN.confirming).toBe('Waiting for the chain')
  })

  it('labels every ruling outcome in plain words', () => {
    expect(OUTCOME_PLAIN).toEqual({
      hit: 'Rule hit',
      miss: 'Rule miss',
      undecidable: 'Cannot decide',
    })
  })
})

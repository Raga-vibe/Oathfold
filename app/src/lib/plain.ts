// Plain-words glossary for Oathfold (docs/decisions.md, "Plain words").
// Every user-facing string on the main pages (Landing, Promises, Make a
// promise, Promise detail, Judge) must use these words. Technical terms live
// only in the Advanced pages (Live chain, Trust) and in code/docs, never in
// the main flow. Nothing in this file changes protocol behaviour; it is copy
// only, so the protocol and machines modules are untouched.
import type { CommitmentStatus } from './protocol/tap12'
import type { SendState } from './machines'

export const GLOSSARY: Record<string, string> = {
  commitment: 'promise',
  commitmentId: 'promise ID',
  reveal: 'open',
  verdict: 'ruling',
  'designated judge': 'the judge',
  'third-party verdict': "other people's calls",
  'judge endpoint': 'judge',
  'author container': 'your account',
  'judge container': "the judge's account",
  hub: 'the record book',
  'sealed payload': 'sealed envelope',
  'demo fixture': 'practice record',
  malformed: 'broken record',
} as const

/** One plain line per status, shown under the status badge. */
export const STATUS_PLAIN: Record<CommitmentStatus, string> = {
  sealed: 'Locked. Nobody can see inside yet.',
  due: 'Time to open.',
  unrevealed: 'Past its date, still locked.',
  revealed: 'Opened. Everyone can read it.',
  judged: 'The judge has ruled.',
  malformed: 'Broken record. Something about it does not follow the rules.',
} as const

/** Status badge text. Statuses stay as they are, except malformed, which is
 * shown as "Broken record" everywhere in the main UI. */
export const STATUS_DISPLAY: Record<CommitmentStatus, string> = {
  sealed: 'Sealed',
  due: 'Due',
  unrevealed: 'Unrevealed',
  revealed: 'Revealed',
  judged: 'Judged',
  malformed: 'Broken record',
} as const

/** Plain labels for the live-seal stepper (Create page). The machine states
 * in src/lib/machines.ts are unchanged; this only relabels them. */
export const SEND_STEP_PLAIN: Record<SendState, string> = {
  form: 'Ready',
  resolving: 'Checking your account',
  deriving: 'Setting up your key',
  publishing: 'Setting up your key',
  sealing: 'Sealing',
  sending: 'Sending',
  confirming: 'Waiting for the chain',
  done: 'Sealed',
  blocked: 'Blocked',
} as const

/** Plain labels for ruling outcomes (Judge page). */
export const OUTCOME_PLAIN: Record<'hit' | 'miss' | 'undecidable', string> = {
  hit: 'Rule hit',
  miss: 'Rule miss',
  undecidable: 'Cannot decide',
} as const

/** The label for a practice (demo) record, and its badge text. */
export const PRACTICE_LABEL = 'Practice record'
export const PRACTICE_DISCLAIMER = 'Practice record, not on chain'
export const PRACTICE_INCLUDES = 'Includes practice records'

/** Graph panels are background only, never a ruling. */
export const GRAPH_NOTE = 'Background, not a ruling.'

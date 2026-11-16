// Oathfold brand system. Single source of truth for brand copy, voice and tokens.
// The CSS tokens in src/index.css mirror the values here; change a value here first,
// then update the matching CSS variable so the two stay in sync.
// Skill: brand (voice, messaging, colour and typography specs).

export const BRAND = {
  name: 'Oathfold',
  tagline: 'Make the promise before the result',
  product:
    'Sealed commitments and public verdicts over TAP-10 / TAP-12 on X Layer.',
  programme: 'OKX X Layer TapeOut Accelerate',
  protocolLine: 'TAP-10 / TAP-12 on X Layer',
} as const

// Voice rules. Every user-facing line should pass these checks.
export const VOICE = {
  tone: 'Confident, precise, calm, transparent.',
  rules: [
    'Say what is verified and what is not, in the same sentence when it matters.',
    'Use plain language. Name things by what they do, not by how the system is built.',
    'One sentence does one job. No filler, no sales language.',
    'Every claim names its source or its limit.',
    'Errors and empty states explain what happened and what to do next.',
  ],
} as const

// Words that must never appear in Oathfold copy. They promise more than the
// product can prove.
export const BANNED_HYPE_WORDS = [
  'trustless truth',
  'unbreakable',
  'guaranteed',
  'fraud-proof',
] as const

// Colour tokens. Trigger.dev dark system (DESIGN.md, docs/design-reference.md):
// slate canvas, ink-well inset, steel/graphite hairlines, bone/cloud/fog/ash
// text, Signal Lime the only filled accent. Syntax palette lives inside code
// contexts only. Status colours are used with a text label and a shape, never
// by colour alone.
export const COLORS = {
  canvas: '#1C1E21',
  inkWell: '#121317',
  hairline: '#3B3E45',
  steel: '#272A2E',
  ash: '#B5B8C0',
  fog: '#878C99',
  cloud: '#D7D9DD',
  bone: '#E5E7EB',
  lime: '#A8FF53',
  syntaxViolet: '#9C9AF2',
  syntaxPink: '#FA3ABF',
  eventViolet: '#7655FD',
  loopGreen: '#AFEC73',
  keyLime: '#D9F07C',
  tagMagenta: '#E888F8',
  muteRed: '#F43F5E',
  // Legacy keys, mapped onto the dark system.
  ink: '#E5E7EB',
  inkSoft: '#D7D9DD',
  body: '#D7D9DD',
  muted: '#878C99',
  faint: '#B5B8C0',
  line: '#272A2E',
  lineSoft: '#272A2E',
  bg: '#1C1E21',
  surface: '#1C1E21',
  accent: '#A8FF53',
  accentStrong: '#A8FF53',
  accentBg: '#121317',
  accentOn: '#121317',
  okBg: '#121317',
  okInk: '#AFEC73',
  warnBg: '#121317',
  warnInk: '#D7D9DD',
  warnLine: '#3B3E45',
  badBg: '#121317',
  badInk: '#F43F5E',
} as const

// Type tokens. Satoshi display and Geist body, both substituted with the
// system stack (Inter/system-ui) so the build stays offline-safe. Geist Mono
// locked at 14px for code, hashes, ids, addresses and timestamps.
export const TYPE = {
  fontSatoshi:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSans:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontMono:
    'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  // Legacy key kept for any reader of the old shape.
  fontSerif:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  baseSizePx: 16,
  lineHeightBody: 1.56,
  lineHeightHeading: 1.2,
  heroPx: 60,
  heroTrackingPx: 3,
  monoPx: 14,
  scale: {
    xs: '0.875rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    display: 'clamp(2rem, 1.6rem + 4vw, 3.75rem)',
  },
} as const

// Standard footer and disclaimer lines. App.tsx renders these so the wording
// stays identical everywhere it appears. Plain words only: no protocol terms
// in the main UI (see src/lib/plain.ts).
export const brandCopy = {
  footerIntro:
    'Oathfold is a TapeOut Accelerate entry for OKX X Layer. Practice records are labelled. No token, no escrow, no AI rulings.',
  footerAttribution:
    'TapeKit send module: MIT, TapeOutProtocol/TapeKit commit f1831a4. TAP-10 Draft v1.1, TAP-12 Draft.',
  demoDisclaimer: 'Practice record, not on chain',
  liveLabel: 'Live on X Layer',
} as const

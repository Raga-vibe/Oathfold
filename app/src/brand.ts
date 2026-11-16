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

// Colour tokens. Paper, ink, one wax-seal accent used sparingly.
// Status colours are used with a text label and a shape, never by colour alone.
export const COLORS = {
  ink: '#211A13',
  inkSoft: '#3D342A',
  body: '#4A4136',
  muted: '#6F6355',
  faint: '#8A7D6C',
  line: '#D9D0BC',
  lineSoft: '#E6DFCD',
  bg: '#F7F3EA',
  surface: '#FFFDF7',
  accent: '#8A2B1D',
  accentStrong: '#7A2418',
  accentBg: '#F6E3DD',
  accentOn: '#F7F3EA',
  okBg: '#E8ECE0',
  okInk: '#2E4D2A',
  warnBg: '#F3EAD3',
  warnInk: '#6B4A12',
  warnLine: '#D9C48F',
  badBg: '#F6E3DD',
  badInk: '#7A2418',
} as const

// Type tokens. Serif display face, system sans for body, mono for hashes.
// No webfont dependency: the serif stack falls back to the system serif.
export const TYPE = {
  fontSerif:
    '"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, "Times New Roman", serif',
  fontSans:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontMono:
    'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  baseSizePx: 16,
  lineHeightBody: 1.55,
  lineHeightHeading: 1.08,
  scale: {
    xs: '0.78rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.375rem',
    display: 'clamp(2.25rem, 1.9rem + 1.8vw, 3.25rem)',
  },
} as const

// Standard footer and disclaimer lines. App.tsx renders these so the wording
// stays identical everywhere it appears.
export const brandCopy = {
  footerIntro:
    'Oathfold is a TapeOut Accelerate entry for OKX X Layer. TAP-10 / TAP-12. Demo records are labelled DEMO FIXTURE. No token, no escrow, no AI verdicts.',
  footerAttribution:
    'TapeKit send module: MIT, TapeOutProtocol/TapeKit commit f1831a4. TAP-10 Draft v1.1, TAP-12 Draft.',
  demoDisclaimer: 'DEMO FIXTURE: not on chain',
  liveLabel: 'LIVE: X Layer',
} as const

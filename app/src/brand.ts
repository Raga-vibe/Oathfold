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

// Colour tokens. One accent (deep blue) on restrained neutrals; status colours
// are used with a text label and a shape, never by colour alone.
export const COLORS = {
  ink: '#0F172A',
  inkSoft: '#1E293B',
  body: '#334155',
  muted: '#475569',
  faint: '#64748B',
  line: '#E2E8F0',
  lineSoft: '#F1F5F9',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  accent: '#1E40AF',
  accentStrong: '#1E3A8A',
  accentBg: '#EFF6FF',
  accentOn: '#FFFFFF',
  okBg: '#EAF7EE',
  okInk: '#166534',
  warnBg: '#FFF7E6',
  warnInk: '#7C4A03',
  warnLine: '#F0D9A8',
  badBg: '#FDEEEE',
  badInk: '#991B1B',
} as const

// Type tokens. System stack only, no webfont dependency.
export const TYPE = {
  fontSans:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontMono:
    'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  baseSizePx: 16,
  lineHeightBody: 1.5,
  lineHeightHeading: 1.2,
  scale: {
    xs: '0.8rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.375rem',
    display: 'clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem)',
  },
} as const

// Standard footer and disclaimer lines. App.tsx renders these so the wording
// stays identical everywhere it appears.
export const brandCopy = {
  footerIntro:
    'Oathfold is a TapeOut Accelerate entry for OKX X Layer. It uses TAP-10 (TapeSend) and TAP-12 (sealed commitments and verdicts). Demo records are labelled DEMO FIXTURE and are not on chain. No token, no escrow, no payments, no AI verdicts.',
  footerAttribution:
    'TapeKit send module: MIT, TapeOutProtocol/TapeKit commit f1831a4. TAP-10 Draft v1.1, TAP-12 Draft.',
  demoDisclaimer: 'DEMO FIXTURE: not on chain',
  liveLabel: 'LIVE: X Layer',
} as const

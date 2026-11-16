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

// Colour tokens. Auros dark teal system (DESIGN_2.md,
// docs/design-reference-auros/): Liquid Abyss canvas, Liquid Deep recessed,
// Liquid Kelp raised, platinum/silver/mist text, lavender phosphor only for
// emphasis figures, aurora gradient exclusively on the primary CTA. No gray,
// black or blue surfaces, no syntax palette. Status colours are used with a
// text label and a shape, never by colour alone.
export const COLORS = {
  abyss: '#012624',
  deep: '#011D1C',
  kelp: '#003734',
  mist: '#EDFFFE',
  platinum: '#FFFFFF',
  silver: '#BBC7C6',
  ash: '#F2F2F2',
  slateDeep: '#707777',
  lavender: '#FDE9FF',
  auroraStart: '#CBFFFC',
  aurora: 'linear-gradient(90deg, rgb(203, 255, 252) 0%, rgb(237, 255, 254) 26.25%, rgb(255, 253, 250) 47.57%, rgb(250, 209, 255) 88.96%)',
  auroraText: '#222222',
  // Legacy keys, mapped onto the Auros system.
  canvas: '#012624',
  inkWell: '#011D1C',
  hairline: 'rgba(255, 255, 255, 0.1)',
  steel: 'rgba(255, 255, 255, 0.1)',
  fog: '#BBC7C6',
  cloud: '#EDFFFE',
  bone: '#FFFFFF',
  ink: '#FFFFFF',
  inkSoft: '#EDFFFE',
  body: '#BBC7C6',
  muted: '#BBC7C6',
  faint: '#707777',
  line: 'rgba(255, 255, 255, 0.1)',
  lineSoft: 'rgba(255, 255, 255, 0.08)',
  bg: '#012624',
  surface: '#003734',
  accent: '#CBFFFC',
  accentStrong: '#CBFFFC',
  accentBg: '#003734',
  accentOn: '#222222',
  okBg: '#011D1C',
  okInk: '#EDFFFE',
  warnBg: '#011D1C',
  warnInk: '#EDFFFE',
  warnLine: 'rgba(255, 255, 255, 0.1)',
  badBg: '#011D1C',
  badInk: '#EDFFFE',
} as const

// Type tokens. Matter display and body, substituted with the system stack
// (Inter/system-ui) so the build stays offline-safe. Weights 400 and 500
// ONLY, no bold, no light, at display sizes. Mono locked at 14px for code,
// hashes, ids, addresses and timestamps; it is a deliberate addition, Auros
// has no mono face (see docs/decisions.md).
export const TYPE = {
  fontMatter:
    "'Matter', Inter, ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
  fontSans:
    "'Matter', Inter, ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
  fontMono:
    'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  // Legacy keys kept for any reader of the old shape.
  fontSerif:
    "'Matter', Inter, ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
  baseSizePx: 16,
  lineHeightBody: 1.4,
  lineHeightHeading: 1,
  heroPx: 61,
  heroTrackingPx: -2.44,
  monoPx: 14,
  scale: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.25rem',
    xl: '1.5rem',
    display: 'clamp(2.5rem, 2.5rem + 1.5vw, 3.8125rem)',
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

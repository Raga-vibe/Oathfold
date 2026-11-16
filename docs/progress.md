# Oathfold progress

Hackathon: OKX X Layer TapeOut Accelerate. Submit by 7 Dec 2026 23:59 UTC (provisional).
Prize pool $100k (1st $20,000; 5 x 2nd $10,000; 5 x 3rd $6,000). Status: MVP built, tested, and building clean. Not deployed. No live
send has happened.

## 2026-11-16: MVP built

- Confirmed the environment first: official TapeKit send module tests at the pinned
  commit f1831a4 pass 32/32 (`npm test` in the pinned worktree).
- Scaffolded `app/` (Vite + React + TypeScript, viem, @noble/* 2.4.0, zod, vitest).
  Plain CSS, no Tailwind (kept deps minimal and pinned; package-lock committed).
- Vendored official TapeKit `bytes.js`, `keys.js`, `payload.js`, `content.js` unmodified
  (only an MIT attribution header added) into `src/lib/tapeout/send/`.
- Implemented `src/lib/protocol/tap12.ts`: ref build/parse, commitmentId, digest,
  status derivation with 7-day grace, content validation, reveal verification with K
  (xchacha20poly1305, aad = P || S || X), verdict rules.
- Implemented `src/lib/chain/xlayer.ts` (viem clients for both X Layer RPCs, hub ABI,
  verifyHub, resolveEndpoint, keyFor, inboxAt, counts), `src/lib/indexer.ts` (Sent scan
  in 100-block chunks, inboxAt + digest verification, grouping, reveal/verdict attach),
  `src/lib/demo.ts` (6 labelled DEMO FIXTURE records with real seal()), `src/lib/store.ts`
  (localStorage cache, rebuildable from chain), `src/lib/wallet.ts` (EIP-1193 connect,
  chain switch, personal_sign key derivation, publishKey/send calldata, safe-finality wait).
- UI: hash routing, 7 pages (Landing, Dashboard, Create, Record detail, Reviewer console,
  Live chain, Trust). Wallet bar in the header. Unsealed-hub warning on every page.
- Tests: `npm test` 28/28 pass (25 TAP-12 protocol tests + 3 demo fixture tests).
  TAP-12 Example 1 ref, Example 2 commitmentId and Example 3 verdict ref match exactly.
- Build: `npm run build` passes (tsc + vite). Preview serves HTTP 200.
- Live re-verification from this VM on 2026-11-16: chainId 0xc4 (196); hub impl slot
  0xdCC57797089eBD9f26e686379A4323f353a3F9C6; isSealed() false (0x00...0);
  owner() 0x571d447f4f24688eC35Ccf07f1D6993655F6aF15; safe block readable;
  keyFor(processor 1, #1) returns opened=false, usable=false, holder
  0xa2e4592ebbd0a08cf49dc306358b064587ab3362, matching the earlier sample.
- One real catch fixed during testing: the TAP-12 example judge endpoint container is
  0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282 (the `c4` in the endpoint hex is the
  chain-id byte 196, not part of the container). Demo judge container corrected.

## What works

- Full TAP-12 protocol logic with unit tests, including seal/open roundtrips and
  reveal verification with a known K.
- Demo lifecycle end to end: create a demo fixture, see it on the dashboard, open the
  record, inspect the verification drawer, build a verdict draft in the reviewer console.
- Live hub verification panel, endpoint/keyFor lookup, inbox/outbox counts, Sent scan
  with chunking and verification.
- Live send flow is fully implemented and gated; it stops with a precise blocker message
  when the prerequisites are missing.

## 2026-11-16: pushed to GitHub

- Repo: https://github.com/Raga-vibe/Oathfold (already existed, confirmed empty before the first push).
- First snapshot push: branch `main`, commit `49062e50d4e49ef49d4b7700f10697ec72bf96f1`, 42 files (root README, `app/`, `docs/`; research clones, node_modules and dist excluded). Verified live afterwards: the commit is on main, authored by Raga-vibe. The provider added an initial commit before the snapshot commit.
- Public web deployment: Muse web artifact (slug `oathfold`) finished building and passed audit (no console errors, no mobile overflow; wallet connect, Create tab and privacy acknowledgement probed). It is a separate hosted build of the same spec; the verified source of truth is the GitHub repo above.

## What is blocked

- Live send: no founder-owned opened container with a published TapeSend key exists yet
  on X Layer, so there is no usable judge endpoint and no holder wallet to send from.
  This is a precondition, not a code gap. The app must not claim a live send happened.
- Deployment: web artifact build in progress, link pending.

## 2026-11-16: skills round, GraphRAG, UI polish, API pass

- Applied the installed skills where they fit, in three parallel workstreams with separate file ownership, then merged and verified by the parent agent.
- Design and brand: restyled the UI under frontend-design, design, design-system, ui-styling, taste-skill, responsive-design and ui-ux-pro-max. Three-layer design tokens in `src/index.css`, `src/brand.ts` as the single source of truth (name, tagline "Make the promise before the result", voice rules, banned hype words), folded-corner brand mark, status by text plus dot shape, 4.5:1 body contrast, visible focus rings, 44px mobile touch targets, fluid type, no horizontal overflow. `EmptyState` and `Skeleton` components added. No page logic changed.
- GraphRAG: new `src/lib/graph/` module (typed graph model, `buildGraph`, `authorHistory`, `judgeHistory`, `evidenceGraph`, `relatedCommitments`, `programGraph`, `answerAuthorRecord`) built only from verified records, designated verdicts only for counts, third-party kept separate, malformed and unrevealed counted visibly, rebuildable from chain data, no LLM and no automated verdict. Wired into Record detail, Dashboard and Reviewer console as labelled context only. 17 new tests.
- API design: `docs/api-surface.md` (v1) and additive `src/lib/api.ts` facade, one error shape `{ code, message, recoverable, source }` with 11 codes, cursor pagination by 100-block windows, safe-finality guarantees, no-leak rule for sealed plaintext and content keys. API section added to `docs/architecture.md`.
- Founder corrections applied in this round: banner-design dropped entirely (no banner file, no `app/public/`), slides deck dropped as a separate deliverable (draft removed to recoverable trash). Both recorded as explicitly not used in `docs/decisions.md` sections 14-15 and in `docs/skill-application.md`. GraphRAG and design-system decisions recorded in `docs/decisions.md` sections 16-17.
- Verification by the parent agent after the merge: `npm test` 45 passed (25 TAP-12 protocol + 3 demo fixture + 17 graph), 3 test files, 0 failed. `npm run build` passes. One transient build failure reported by two agents (TS2783 duplicate key in the graph test file while it was being edited in parallel) was checked after the merge: the duplicate line is gone and the build passes cleanly.
- Not pushed to GitHub and not deployed in this round; the parent agent verifies, pushes and deploys after this report.

## 2026-11-16: redesign, no more slop

The founder deployed the app and said it screamed slop. He was right: two warning banners sat above the headline, the hero was a three-clause AI headline plus a six-line paragraph, no real product was visible on the first screen, and the page was white, blue-accented, rounded cards, system sans everywhere, folded-corner logo. Rebuilt under the taste-skill (design-taste-frontend) as a proper redesign, not token tweaks:

- Identity: a sealed record, a notary's ledger. Warm paper background (#F7F3EA), warm ink text, one wax-seal red accent (#8A2B1D) used sparingly, a serif display face for the headline and wordmark, mono for hashes, ids, addresses and timestamps. Hairline borders, square corners, no shadows, no gradients, no purple, no emoji, no stock illustration, no decorative shapes. One button style.
- Banners gone: the hub warning and the no-wallet notice are one slim status strip, one line, under the header (`X Layer 196 · Hub not sealed · No wallet · Live chain`). The full hub warning text lives only on the Live chain page.
- Hero: one short headline, "Seal the promise before the result." (7 words), one plain sentence, and the real thing: one actual demo record rendered as a record card (real commitment id, status, open time, sealed payload excerpt in mono, judge endpoint, timeline Seal -> Open -> Reveal -> Verdict), plus the Create action. First screen shows headline + real record + action.
- "How it works" is one compact horizontal strip, four steps, 3-6 word titles plus at most 10 words of support. "What this build proves" cards and the "Honest limits" card are gone, replaced by one "Checked live" line with real values (hub implementation short, chain 196, safe block) linking to Live chain. "What Oathfold is not" and the long footer are one footer line. Landing copy cut by more than two thirds.
- Shared `RecordCard` component (`src/components/ui.tsx`) used by the landing hero and the dashboard, so the record looks the same everywhere. Dashboard, RecordDetail, Create, Review, Live and Trust restyled to the same system with the same data and actions; Create and Review copy cut, privacy point folded into one short line on Create and Trust. Demo fixtures still labelled DEMO FIXTURE.
- Mobile 390px: header is one row (wordmark, Connect wallet, Menu button); nav collapses into a menu panel. No horizontal overflow at 1440 or 390 (measured 0px on landing, dashboard, create).
- Demo-first default (founder decision, same day): the landing's primary action is now "Explore a demo record", linking straight to the judged demo record. The Create form takes its default judge from `VITE_DEFAULT_JUDGE_ENDPOINT` (empty until the team provisions one judge container and publishes its key; documented in `app/.env.example` and `docs/container-onboarding.md` section 5 as the Oathfold demo judge, provisioned once by the team, so no visitor or hackathon judge ever needs a container to try it). When set, the form shows the one-line note "Judge provided by Oathfold." Wallet connect stays only for live sends.
- Verification: screenshots taken with headless Chromium and read by eye at 1440x900 and 390x844 (landing, dashboard, create, menu open) in `shots/`. Two real bugs found and fixed in the round: the record card read "promise promise" (kind plus the word promise), and the mobile Connect wallet button was hidden because `.walletbar .small { display: none }` also matched the button, which carries the `small` class; scoped to `.walletbar > span`. Taste-skill gate run: `GATE: ERROR` (its scripts are built for static pages: copy-lint saw no content in the client-rendered shell and no Chrome was on its path; the Playwright headless-shell screenshots above are the visual verification instead). `npm test` 45 passed (25 protocol + 3 demo + 17 graph), `npm run build` passes.
- Not pushed to GitHub and not deployed in this round; the parent agent verifies, pushes and deploys after this report.

## Next steps

1. Founder: open a container on X Layer (pay to open), publish a TapeSend key from the
   holder wallet, and confirm the judge endpoint name. Exact steps are in
   `docs/submission-draft.md` under "Founder next step".
2. Founder (or parent agent): run a live send from the Create page with the holder wallet,
   wait for safe finality, then run a live scan from the Live chain page and confirm the
   record appears on the dashboard.
3. Deploy the static `dist/` output and submit with the access link plus the TapeOut
   features explanation (draft in `docs/submission-draft.md`).
4. Before submission, re-run `npm test` and `npm run build`, and re-check the hub seal
   state on the Live chain page.

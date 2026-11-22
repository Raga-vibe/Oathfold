# Oathfold progress

Hackathon: OKX X Layer TapeOut Accelerate. Submit by 7 Dec 2026 23:59 UTC (provisional).
Prize pool $100k (1st $20,000; 5 x 2nd $10,000; 5 x 3rd $6,000). Status: MVP built and building clean; 104 unit tests and 7 Playwright e2e tests pass. Static `gh-pages` branch pushed; turning on Pages needs one repo setting. No live
send has happened.

## 2026-11-18: polish round (access link, hub message, UI)

- PR #3 merged: Playwright e2e (now 7 tests), 10 desktop/mobile screenshots, final demo
  shot list.
- Live re-check at block 76246532: the hub implementation slot now reads
  `0xf6b86f44bd039bacc8d3670971d556202d579261`, not the pinned
  `0xdCC57797089eBD9f26e686379A4323f353a3F9C6`. `isSealed()` false, owner unchanged.
  The status strip now says "Record book updated" instead of an alarm; the landing page
  shows exactly what was read from the chain, and Advanced keeps the full warning.
- Landing gains a live read-out card (network, record book, implementation, seal state,
  block). Create gains a one-click sample promise and a plain-language open-date hint.
- Added `.github/workflows/deploy.yml` and `scripts/deploy-pages.sh`; pushed `gh-pages`.
  Enabling Pages needs repo admin: bayoabefe03-ai gets HTTP 404 from the Pages API.

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

## 2026-11-16: reskin to the founder's Trigger.dev style spec

The founder uploaded his own style reference (`docs/design-reference.md`, a Trigger.dev style spec) and asked for this style. It replaces the paper/ink ledger look from the redesign round, at the founder's word. Same demo-first structure, just reskinned; no protocol, route, copy-structure or test change.

- Tokens, exact from the spec: dark canvas #1C1E21, inset/code surfaces #121317, hairlines #272A2E (subtle) and #3B3E45 (emphasis). Text bone #E5E7EB primary, cloud #D7D9DD secondary, fog #878C99 secondary body/metadata, ash #B5B8C0 tertiary. Signal Lime #A8FF53 is the only filled accent: primary CTA fill (dark #121317 text on it), logo mark, active nav indicator, feature-pill icons. Never a lime background wash, never lime on body text. No new neutrals.
- Typography: Satoshi display (substituted with Inter/system-ui, 0.05em tracking at 36px+, weights 500/600), Geist body/nav/buttons (Inter/system-ui, 300/400/500), Geist Mono locked at 14px for all code, hashes, ids, addresses, timestamps (ui-monospace/JetBrains Mono stack). No webfonts fetched at runtime; the build stays offline-safe. Hero 60px/1.00/3px tracking, body 16px/1.56, body-lg 18px/1.50, caption 14px/1.43.
- Shapes: 4px radius on all rectangles, 9999px only for pills. No drop shadows anywhere; depth from surface contrast and 1px hairlines only. Card hover only changes border-color. Single centered column, max-width 1200px, section gaps 80-120px, card padding 24-32px.
- Header: sticky top bar, lime triangle seal mark + "Oathfold" in bone, centered nav links (ghost style, cloud text, bone on hover/active, lime underline for active), right side Connect wallet as a ghost button plus a lime "Create" CTA. Mobile menu still works; the mobile header was fixed twice in this round (grid auto-placement pushed the wallet button to a second row, then flex order put the menu button before it) and is now one row, verified by measuring element boxes at 390px.
- Record card is now a code-editor pane (Ink Well #121317, 1px #272A2E border, 4px radius): the real demo record rendered as mono 14px lines with the spec's syntax palette used only inside this code context (keywords #9C9AF2 violet, strings #FA3ABF pink, types/booleans #AFEC73 loop green, variables #D9F07C key lime, property names #E888F8 tag magenta, default text #878C99 fog). Shows commitment id, status, open time, judge endpoint, sealed payload excerpt, revealed true/false, and the Seal -> Open -> Reveal -> Verdict timeline. Status is a feature pill (9999px, bone text, small chromatic dot); DEMO FIXTURE label stays visible with a lime dot. Lime is not a status colour.
- "Checked live" nit fixed: the line no longer reads "safe block pending". It shows the safe-block part only once the hub read has landed, and labels the implementation "(expected)" until verified. The status strip "Hub check pending" wording was also changed to "Hub check…".
- Dashboard, RecordDetail, Create, Review, Live, Trust: same dark system, same data, same fields and flows. Record cards and graph panels use canvas surfaces with #272A2E hairlines; code/ids in mono 14px on ink-well panes. One stray blue (#1D4ED8) selected-card border in Review was changed to lime; the verdict draft preview is now an ink-well code pane.
- Verification: `npm test` 45 passed (25 protocol + 3 demo + 17 graph), `npm run build` passes. Screenshots taken with headless Chromium and read by eye at 1440x900 and 390x844 in `shots/` (trigger-landing-1440.png, trigger-landing-390.png, trigger-dashboard-1440.png, trigger-menu-390.png). First screen shows headline + lime CTA + the record code pane, no banner, no wall of text. Zero horizontal overflow at 390px, measured. Two real bugs found and fixed in the round: the mobile header wrapped to two rows, and the record card verdict step wrapped mid-date ("hit · 07 Nov / 2026"); the verdict step now renders outcome and date on two lines.
- Not pushed to GitHub and not deployed in this round; the parent agent verifies, pushes and deploys after this report.

## 2026-11-16: explicit state machines + compact UX

Two linked jobs, one round. Full inventory in `docs/state-machines.md`.

- Machines: audited the whole app and made 16 implicit state machines explicit in one shared module, `app/src/lib/machines.ts` (hand-rolled, zero-dependency, typed discriminated unions, exhaustive switches, no xstate), plus `app/src/lib/machines.test.ts` (52 tests, one describe per machine plus the cross-machine send prerequisites, covering every state, every legal transition and every guard rejection). The 16: commitment lifecycle, wallet connection, live send flow, key readiness, reveal flow, verdict draft flow, indexer scan, hub verification, endpoint lookup, demo fixture store, graph build, record lookup, disclosure, route, live cache, form validity. Plus a cross-machine guard `sendPrerequisitesMet` (wallet ready + author key usable + judge key usable + form valid) and `verdictRulesFor` re-exposed through the module. Guards encode the real rules: unrevealed commitments can only receive undecidable (rejected at selection time in Review, not just at build); a verdict needs at least one evidence source; a send requires an opened container with a usable key; no transition out of a terminal state (`done`, `judged`, `malformed`).
- Wiring: App.tsx (wallet phase with disabled Connect button and phase label, hub state in the status strip, route + mobile menu as one machine with an unknown hash landing on landing by a named rule), Create.tsx (send machine as a compact stepper with a sticky bottom action bar, form state, one-line status/blocker), Review.tsx (verdict draft machine, outcome select restricted to legal outcomes, compact queue rows, graph context behind a toggle), Live.tsx (scan machine with numeric progress, hub machine, lookup machine with per-field report, live-cache state), RecordDetail.tsx (lookup state, verdict summary line, reveal state, graph context and verification behind disclosure toggles), Dashboard.tsx (compact record table, track records behind a toggle gated on graph state), Landing.tsx (hub label via the machine).
- Two real bugs found and fixed in the round: Live kept its own local copy of the hub object and showed "Hub check pending" while the status strip said "Hub check failed"; Live now reads `hub ?? state.hub`, so both readers show one state. The build also caught a missing type re-export (`EndpointResolution` is now re-exported from the machines module so callers have one import).
- Compactness: hero padding and section gaps tightened (steps strip now starts near the fold), card padding 24px to 16px, form spacing tightened, dashboard card stack replaced by a record table (all 6 records scan in one screen at 1440x900), RecordDetail reordered into one scannable column with secondary panels collapsed, Create/Review/Live use a fixed sticky action bar so the primary action is always visible, status strip wraps on mobile instead of truncating.
- Verification: `npm test` 97 passed (45 before: 25 protocol + 3 demo + 17 graph; 52 new machines tests), `npm run build` passes. Screenshots taken with headless Chromium and read by eye at 1440x900 and 390x844 in `shots/` (compact-landing-1440.png, compact-landing-390.png, compact-dashboard-1440.png, compact-dashboard-390.png, compact-record-1440.png, compact-create-1440.png, compact-create-390.png, compact-review-1440.png, compact-live-1440.png). Zero horizontal overflow on all nine, measured. Note: the preview screenshots show "Hub check failed" because the headless shell has no network route to the X Layer RPC; the machine correctly names the error state, and on Vercel it reads live.
- Not pushed to GitHub and not deployed in this round; the parent agent verifies, pushes and deploys after this report.

## 16 November 2026 — Plain words: the app speaks promises, not protocol

- Founder said the build feels complicated and he does not understand it. The app spoke protocol; a visitor had to learn the machinery before understanding the product.
- Glossary as code in `app/src/lib/plain.ts` (plus `app/src/lib/plain.test.ts`, 3 tests): commitment -> promise, reveal -> open, verdict -> ruling, designated judge -> the judge, third-party verdict -> other people's calls, endpoint -> judge, container -> your account / the judge's account, hub -> the record book, sealed payload -> sealed envelope, demo fixture -> practice record, malformed -> Broken record. Statuses keep their names and each gets one plain line (sealed = "Locked. Nobody can see inside yet.", due = "Time to open.", unrevealed = "Past its date, still locked.", revealed = "Opened. Everyone can read it.", judged = "The judge has ruled.").
- Main nav is three items only (Promises, Make a promise, Judge) plus Advanced. Live chain and Trust moved into Advanced; routes #/live and #/trust keep working. Landing record pane shows the promise in plain labelled lines first (Promise, Status, Opens, Judge, Ruling) with the sealed bytes as one short line. Steps strip is "Write it. Seal it. Open it. The judge rules." Create and Judge fields, buttons, errors, blockers and the seal stepper are all plain words ("Checking your account", "Setting up your key", "Sealing", "Waiting for the chain"). Technical detail (IDs, hashes, digests, inbox) sits behind one "Technical details" toggle on a promise, collapsed by default. Demo fixture titles and bodies renamed to plain words too ("Publish the audit notes", "Land the first live promise", "Broken record (bad type)").
- Docs: glossary in `docs/decisions.md` section 24, and an "Explain it simply" section in `app/README.md` (a sealed envelope for a promise, 4 steps).
- Verification: `npm test` 100 passed (97 before: 25 protocol + 3 demo + 17 graph + 52 machines; 3 new plain glossary tests), `npm run build` passes. Screenshots taken with headless Chromium and read by eye at 1440x900 and 390x844 in `shots/` (simple-landing-1440.png, simple-landing-390.png, simple-dashboard-1440.png, simple-record-1440.png, simple-create-1440.png). Zero horizontal overflow on all five. Note: the preview screenshots show "Record book check failed" because the headless shell has no network route to the X Layer RPC; on Vercel it reads live.
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

## 2026-11-16: reskin to the founder's Auros style spec

- Trigger.dev dark system replaced by Auros (DESIGN_2.md, tokens.json,
  theme.css, variables.css, all copied to `docs/design-reference-auros/`).
- Dark teal abyss: canvas #012624, deep #011D1C, kelp cards #003734,
  platinum/mist/silver text, lavender phosphor only for the ruling value
  and emphasis figures, aurora gradient exclusively on the primary CTA.
- Matter (Inter/system-ui substitute, 400/500 only), hero 61px at -0.04em,
  uppercase 12px tracked labels, 16px card radii, 6px button radii, no
  shadows, no syntax palette, no lime, no slate, no pills.
- Record card is a kelp card with a deep code pane in silver/mist/white;
  "How it works" steps are kelp cards with 32x32 arrow buttons; dashboard
  is a kelp table card; header is a transparent 80px bar with an
  aurora-gradient seal mark and ghost uppercase nav.
- Mono (ui-monospace 14px) is a deliberate addition: Auros has no mono
  face. Recorded in decisions.md section 25 with the other adaptations
  (gradient padding, footer, no-colour errors, dot field).
- Tests 100/100 pass, production build passes. Screenshots:
  `shots/auros-landing-1440.png`, `shots/auros-landing-390.png`,
  `shots/auros-dashboard-1440.png`, `shots/auros-create-1440.png`.

## 18 November 2026: DeWEB publication prepared, blocked

- Researched the TapeKit site-owner handbook at the pinned commit `f1831a4` and TAP-10 sections
  6 and 7; wrote `scripts/deweb-publish.md` with the exact X Layer addresses, commands, cost model
  and verification steps.
- Did **not** publish. No TapeOut circuit on X Layer is held by this workspace, so there is no
  opened container to write under and no holder wallet to sign with. No `tape://` link was faked;
  the exact blocker and the live evidence are recorded in `scripts/deweb-publish.md`.
- Live check 18 Nov 2026 13:20 UTC against `https://rpc.xlayer.tech`, block `76238991`: processor
  1 / #1 resolves to container `0x374fa57399f356030847Eb0c56851bE9a1194E5D`; `isOpened` false;
  `SiteRegistry.fileInfo(container, "index.html")` size 0 / chunkCount 0;
  `DomainBinding.isContainerLive` false.

## 22 November 2026: merged main verified end to end, deploy script fixed

- Pulled `main` at `bf8ce7cfa3` (PR #4 merged) into the workspace copy and verified it: unit tests 104/104 pass, production build passes, Playwright e2e 7/7 pass (screenshot capture skipped by design, it needs `CAPTURE_SCREENSHOTS=1`).
- The e2e run needed the headless shell for Playwright 1.65.1 (revision 1255). The Playwright download hosts are blocked by the VM egress proxy, so the already installed 1254 shell was copied into the 1255 slot; the suite runs on it. This is a local environment note only, nothing in the repo changed for it.
- `vite build` exit 127 seen on the old `feat/polish-access-link` branch at `e4810f8` did not reproduce: the same commands pass on merged main. Cause remains unproven; the branch is merged and production is unaffected.
- Fixed `scripts/deploy-pages.sh`: it hardcoded bayoabefe03-ai as the commit author. It now uses the runner's own git identity (or `DEPLOY_GIT_NAME` / `DEPLOY_GIT_EMAIL`), recorded in decisions.md section 26.
- The GitHub Pages workflow in `.github/workflows/deploy.yml` runs `npm test` and `npm run build` on every push to main, but it does not run the Playwright suite; e2e stays a local/manual check.
- Still open, unchanged: GitHub Pages is not enabled (repo Settings > Pages > Source: GitHub Actions), so `raga-vibe.github.io/Oathfold` returns 404; the Vercel deploy is the live one. The live on-chain cycle still needs a founder-owned opened container and key.

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

## What is blocked

- Live send: no founder-owned opened container with a published TapeSend key exists yet
  on X Layer, so there is no usable judge endpoint and no holder wallet to send from.
  This is a precondition, not a code gap. The app must not claim a live send happened.
- Deployment: not done. The parent agent deploys after verifying this build.

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

# Oathfold submission draft

For the OKX X Layer TapeOut Accelerate submission form. Deadline 7 Dec 2026 23:59 UTC
(provisional, re-check on the page). Access link and demo video to be added after deploy.

## Project name

Oathfold

## One-line description

Sealed commitments and public verdicts on X Layer: seal a claim now, reveal it on a
chosen date, have it judged in public, with a track record anyone can rebuild from the
chain.

## Access link

TODO: deploy the static `dist/` output and paste the URL here.

## Demo video

TODO: record a video of at most 3 minutes following `docs/demo-script.md`.

## Which TapeOut features are used

- **TapeOut circuits / DeWEB containers on X Layer (chain 196):** commitments are sent
  from one container to another. The author endpoint and the judge endpoint are X Layer
  containers, e.g. `#1@2.344`. Identity is resolved through the processor factory
  (`cpuAt`), the ERC-6551 opener (`accountOf`, `isOpened`), the circuit `ownerOf`, and
  the payments table, exactly as TAP-10 section 2.3 specifies.
- **DeWEB hub on X Layer:** the hub proxy `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee`
  carries every message. The app uses `send`, `publishKey`, `keyFor`, `inboxCount`,
  `inboxAt`, `inboxPage`, `outboxCount`, `outboxPage`, and the `Sent` event. The app
  verifies the hub live: ERC-1967 implementation slot reads
  `0xdCC57797089eBD9f26e686379A4323f353a3F9C6`, the pinned X Layer implementation.
- **TAP-10 (TapeSend):** sealed and public payloads, X25519 key derivation by wallet
  signature (`personal_sign` over the exact key-derivation text), and the digest
  `keccak256(ref || keccak256(payload))`. Crypto is the official TapeKit send module,
  vendored unmodified from commit `f1831a4` (MIT).
- **TAP-12 (sealed commitments and verdicts):** SCV1 refs, commitmentId, the 7-day grace
  period, reveal verification with K (D check, decrypt C with the exact TAP-10 aad,
  content validation), and verdict rules (hit/miss need sources, unrevealed only allows
  undecidable, designated vs third-party verdicts kept separate). TAP-12 Example 1, 2
  and 3 vectors match exactly in the app's unit tests.
- **X Layer on-chain data:** the app reads the live hub, key records, inbox/outbox
  counts and Sent logs from the X Layer RPCs, in 100-block chunks (the RPC limit), and
  only counts messages at or below the safe block as final.

## What the app does

- Create a promise commitment with a privacy preview (what is public vs sealed), sealed
  and sent through the hub to a judge.
- Dashboard grouping every commitment by status: sealed, due, revealed, judged,
  unrevealed, malformed, all shown with equal prominence.
- Record pages with a timeline, designated vs third-party verdicts, and a verification
  drawer (protocol, chain, hub, tx, block time, message id, digest check, status
  derivation, raw ref and payload).
- Reviewer console with the TAP-12 verdict guards.
- Live chain page with hub verification, endpoint/key lookup, and Sent log scanning.

## Honest current state (state this in the submission)

- The hub is NOT sealed (isSealed() false, owner
  `0x571d447f4f24688eC35Ccf07f1D6993655F6aF15`). The app warns about this on every page.
- No live send has happened yet. No founder-owned opened container with a published
  TapeSend key exists on X Layer, so there is no usable judge endpoint to seal to. The
  live send path is fully built and wallet-gated; it stops with the exact prerequisite
  instead of faking a send. Demo records in the app are built locally with real seal()
  calls and are labelled DEMO FIXTURE.
- Goal before submission: open a founder container, publish a key, send one live
  commitment, reveal it, and record a designated judge verdict, so the submission links
  to at least one real on-chain record cycle.

## Founder next step (exact)

1. On X Layer, acquire a TapeOut circuit (processor 168 is the TAP-12 reference
   processor) and open its container (pay the opening fee) from the founder wallet.
2. In Oathfold, connect that holder wallet, go to Create, and let the app derive the
   TapeSend key (personal_sign) and publish it (publishKey) if it is not already the
   published key.
3. Pick a judge endpoint that has a usable key (check it on the Live chain page first).
   If none exists, the judge must open a container and publish a key the same way.
4. Send the commitment from Create, wait for safe finality in the app, then run a Sent
   scan from the Live chain page and confirm the record on the dashboard.
5. After the open time, reveal from the record (author or judge publishes K) and record
   a designated judge verdict with at least one source.

## Repo

TODO: paste the GitHub repo URL after the parent agent creates it. The app is a static
SPA (`app/`, `npm install && npm run build`, serve `dist/`). Tests: `npm test` (28 tests).

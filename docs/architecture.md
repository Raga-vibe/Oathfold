# Oathfold architecture

Static SPA. No backend, no server-side state, no database. The chain is the source of
truth; localStorage is a cache that can always be rebuilt by re-scanning.

## Stack

- Vite 5 + React 18 + TypeScript 5.6, `app/` (see `app/package.json`, lockfile committed).
- viem 2.33 for chain reads and calldata encoding.
- @noble/curves, @noble/ciphers, @noble/hashes 2.4.0 (same versions the official send
  module uses).
- zod 3.23.8 (available for form validation; the Create form currently validates by hand).
- vitest 2.1.8. Plain CSS, hash routing, no router library.

## Module map

```
app/src/
  main.tsx                 entry, renders <App/>
  App.tsx                  hash routing, wallet state, hub warning banner, footer
  index.css                design tokens and components
  components/ui.tsx        StatusBadge, SourceBadge, Callout, Kv, Copy
  pages/
    Landing.tsx            what/why/how, privacy warning, demo counts
    Dashboard.tsx          records grouped by status, all statuses equal
    Create.tsx             promise form, privacy preview, live send flow, demo save
    RecordDetail.tsx       timeline, verdicts, verification drawer, raw ref/payload
    Review.tsx             due/revealed/unrevealed queue, verdict draft builder
    Live.tsx               hub verification, endpoint/key lookup, Sent scan
    Trust.tsx              verified vs not, privacy, keys, no legal/escrow claims
  lib/
    protocol/tap12.ts      TAP-12 core: refs, commitmentId, digest, status, content
                           validation, reveal verification with K, verdict rules
    protocol/tap12.test.ts 25 tests incl. TAP-12 Example 1/2/3 vectors
    tapeout/send/          vendored official TapeKit module (bytes, keys, payload,
                           content) + README attribution. Do not edit by hand.
    chain/xlayer.ts        viem clients, hub/factory/opener/circuit/payments ABIs,
                           verifyHub, resolveEndpoint, keyFor, inboxAt, counts
    indexer.ts             Sent scan in 100-block chunks, inboxAt + digest verify,
                           grouping, reveal/verdict attach, status derivation
    demo.ts                6 DEMO FIXTURE records built with real seal()
    demo.test.ts           3 tests: statuses, reveal verification, unrevealed
    records.ts             shared ChainMessage / OathRecord / RevealInfo / VerdictInfo
    store.ts               localStorage cache for demo + live records
    wallet.ts              EIP-1193 connect, chain switch, key derivation by
                           personal_sign, publishKey/send calldata, tx send
```

## Data flow

### Reading live records

1. `Live.tsx` runScan: latest block, then `scanSentLogs` over the chosen recent range in
   100-block chunks (`eth_getLogs` cap). Each chunk reads all hub Sent logs; refs are
   filtered locally for the SCV1 tag.
2. `buildRecords`: for each tagged message, `inboxAt(to, inboxIndex)` must return the same
   `from`, and `digestOf(ref, payload)` must equal the stored digest. Messages above the
   safe block are discarded as pending, never final records.
3. Commitments are grouped by commitmentId. Reveals are verified per TAP-12 section 4.4
   (recompute id, sender is author or judge, D check, decrypt C with K, validate content).
   Verdicts are validated per section 5 and split designated vs third-party.
4. Status is derived per section 7 with the pinned safe-block time as `now`.
5. Records and scan metadata are cached in localStorage (`store.ts`); the dashboard reads
   live records plus demo records.

### Creating a live commitment

1. Form validation (title, claim, future open time, author and judge endpoints).
2. Wallet connect + switch to chain 196.
3. `resolveEndpoint` for author and judge: factory cpuAt, opener accountOf/isOpened,
   circuit ownerOf, payments.paid, hub keyFor. Author holder must equal the wallet.
   Judge key must be usable.
4. `deriveAuthorKey`: personal_sign of the exact TAP-10 key-derivation text, then
   vendored `deriveKeyPair`. If the derived key differs from the published key, a
   publishKey transaction is sent first.
5. `sealCommitment`: vendored `seal()` with judge + author public keys, ref from
   `buildCommitmentRef('promise', open)`.
6. `buildSendCalldata` + wallet `eth_sendTransaction` for hub.send. Wait for receipt,
   then poll the safe block until the send block is final.
7. Read the Sent event from the receipt block, `inboxAt` for the digest and timestamp,
   derive the commitmentId, and save the record to the live cache.

Any step failing stops with the exact blocker. Nothing is recorded until safe finality.

### Demo records

`buildDemoSet()` seals six commitments with ephemeral X25519 keys (deterministic
randomness only where a reveal must be reproducible, so the demo knows K). Statuses are
derived from open times relative to build time: sealed (+30d), due (-2d), revealed
(-3d, author reveal), judged (-9d, judge reveal + designated hit verdict), unrevealed
(-10d), malformed (bad kind byte). Stored in localStorage; rebuildable on demand.

## Trust boundaries

- Chain data is verified (inboxAt + digest + safe finality), never taken on trust from an
  indexer. There is no indexer.
- The app trusts the two public RPCs to answer reads; disagreements surface as errors,
  not as silent verification.
- The wallet is trusted to hold the private key and to show the user exactly what they
  sign. The app never sees a private key.
- Demo data is trusted by nobody: it is labelled and kept separate from live records.

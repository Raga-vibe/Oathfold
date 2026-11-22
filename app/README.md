# Oathfold

Sealed commitments and public verdicts over TAP-10 / TAP-12 on X Layer.

**What it is:** you write a promise, seal it with TAP-10 encryption, and send it to a
judge on X Layer through the DeWEB hub. The kind, open time, author and judge are public
from the moment it is sent. The claim text stays hidden until the author or the judge
publishes the content key. Then anyone can decrypt the exact on-chain bytes and check
them. The designated judge rules hit, miss or undecidable, with sources. Third-party
verdicts are recorded separately.

**Hackathon:** OKX X Layer TapeOut Accelerate. Submit by 7 Dec 2026 23:59 UTC
(provisional). $100k prize pool.

## Explain it simply

Oathfold is a sealed envelope for a promise.

1. You write a promise, like "I will ship this by 1 December".
2. You seal it and hand it to a judge before anyone knows the result. Nobody can see inside, and you cannot change it after.
3. On the date, you open it and show the proof.
4. The judge says hit or miss, in public, and anyone can check the envelope was sealed before the result.

That is all it does. Everything else in this repo (TAP-10, TAP-12, containers, keys, the record book) is the machinery underneath. A user should never need to learn it.

## Brand

- **Name:** Oathfold. **Tagline:** "Make the promise before the result".
- **Voice:** confident, precise, calm, transparent. Say what is verified and what
  is not, in plain language, with one job per sentence. Every claim names its
  source or its limit. Never use the hype words "trustless truth",
  "unbreakable", "guaranteed" or "fraud-proof".
- **Tokens (single source of truth: `src/brand.ts`, mirrored in
  `src/index.css`):** Auros dark teal — abyss `#012624`, deep `#011d1c`, kelp
  `#003734`, mist `#edfffe`, platinum `#ffffff`, silver `#bbc7c6`, lavender
  phosphor `#fde9ff` reserved for the ruling value, and the aurora gradient
  reserved for the primary CTA. Status is always a text label plus a dot shape,
  never colour alone.
- **Type:** system stack only (no webfonts), base 16px, line-height 1.4,
  weights 400/500, uppercase tracked labels. Dark theme only.

## Run it

```bash
npm install
npm run dev      # local dev server
npm test         # vitest, 104 tests
npm run test:e2e # Playwright, 7 demo-lifecycle tests
npm run build    # tsc + vite build, outputs static dist/
npm run preview  # serve the built app
```

No secrets. No backend. All chain reads use the public X Layer RPCs
(`https://rpc.xlayer.tech`, `https://xlayerrpc.okx.com`). See `.env.example`.

## Deploy

`bash ../scripts/deploy-pages.sh` rebuilds `dist/` and force-updates the `gh-pages`
branch. `.github/workflows/deploy.yml` publishes automatically on every push to `main`
once repo Settings > Pages uses "GitHub Actions" as the source. Either way the site
lands at `https://raga-vibe.github.io/Oathfold/`.

When deploying from the static `gh-pages` branch on Vercel instead, set Root Directory to
`/` and leave the build command empty; `app/public/vercel.json` ships in `dist/` and tells
Vercel there is nothing to build.

## Pages (hash routing, no router library)

- `#/` Landing: what, why, how, privacy warning.
- `#/dashboard` Dashboard: all records grouped by status. Unrevealed and malformed get
  the same prominence as judged.
- `#/create` Create: promise form with privacy preview, then the wallet-gated live send
  flow (resolve endpoints, derive key by personal_sign, publishKey if needed, seal,
  hub.send, wait for safe finality). If live send is blocked, save as a DEMO FIXTURE.
- `#/record/:id` Record detail: timeline, verdicts split designated vs third-party, and
  a verification drawer (protocol, chain, hub, tx, block time, message id, digest check,
  status derivation, raw ref and payload).
- `#/review` Reviewer console: due / revealed / unrevealed queue, verdict form with the
  TAP-12 guards (hit/miss need a source, unrevealed only allows undecidable, early flag).
- `#/live` Live chain: hub verification panel (ERC-1967 implementation slot, isSealed,
  owner), endpoint and keyFor lookup, and a Sent-log scan in 100-block chunks.
- `#/onboarding` Onboarding: step-by-step container and TapeSend-key readiness check
  for a holder, reusing the same `resolveEndpoint` / `keyFor` code as the live send.
- `#/trust` Trust: what is verified vs what is not, privacy, keys, no legal or escrow claims.

## Protocol

- **TAP-10 Draft v1.1** (TapeSend): sealed and public payloads, key derivation by wallet
  signature, hub send / publishKey / keyFor / inbox / outbox.
- **TAP-12 Draft** (created 2026-09-30): SCV1 refs, commitmentId, 7-day grace, reveal
  verification with K, verdict rules.
- Crypto: the official TapeKit send module, vendored unmodified from commit
  `f1831a4` into `src/lib/tapeout/send/` (MIT). Reveal-with-K decryption is implemented
  in `src/lib/protocol/tap12.ts` with `@noble/ciphers` xchacha20poly1305 and
  `@noble/hashes` sha256 exactly per TAP-10 section 15.3 / TAP-12 section 4.4.
- MVP scope: **promise** commitments only. Forecasts are defined in TAP-12 but rejected
  in the Create form.

## Verified live facts (checked 2026-11-16 and 2026-11-18)

- X Layer chain 196, hub proxy `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee`.
- Hub implementation slot read `0xdCC57797089eBD9f26e686379A4323f353a3F9C6` on 2026-11-16,
  then `0xf6b86f44bd039bacc8d3670971d556202d579261` at block 76246532 on 2026-11-18. The pin
  therefore no longer matches; the app says "Record book updated" instead of claiming
  verification, and Advanced shows the change. `isSealed()` is **false** and the owner is
  unchanged (`0x571d447f4f24688eC35Ccf07f1D6993655F6aF15`), so the unsealed warning stays.
- Finality tag for X Layer is `safe`. Only messages at or below the safe block count.
- `eth_getLogs` max range is 100 blocks; the indexer chunks at 100.
- Factory `0x1f09DAeFA827f02CBb40967cc91b259763760761`, cpuCount 424. Processor 1 tokens
  #1-#12: all holder `0xa2e4592ebbd0a08cf49dc306358b064587ab3362`, opened=false,
  usable=false. **No usable X Layer endpoint was found in that sample.**

## Live send blocker (honest)

No founder-owned opened container with a published TapeSend key exists yet, so no live
send can be broadcast by the founder today. `hub.send()` requires msg.sender to be the
current holder of an opened circuit. The full live send path is implemented and gated
behind a connected holder wallet plus an opened container with a usable judge key. The
app shows the exact prerequisite and status, and never claims a live send happened.
No live transaction, deployment or on-chain record is fabricated anywhere in this repo.

## Demo fixtures

Six DEMO FIXTURE records are built in the browser with real `seal()` calls and ephemeral
keys, covering sealed, due, revealed, judged, unrevealed and malformed. They are labelled
DEMO FIXTURE everywhere and are not on chain. Demo keys live in localStorage only so
demo reveals work.

## Docs

- `../docs/progress.md`: build log and status.
- `../docs/protocol-compatibility.md`: TAP-10 / TAP-12 conformance and vectors.
- `../docs/architecture.md`: modules, data flow, live send flow.
- `../docs/security-and-trust.md`: threat model, privacy, key handling, unsealed contracts.
- `../docs/decisions.md`: decisions made while building, with reasons.
- `../docs/demo-script.md`: the final 3-minute video shot list, with each shot marked
  fixture or live.
- `../docs/assets/screenshots/`: desktop and mobile captures of Landing, Dashboard,
  Create, Record detail and Live chain.
- `../docs/submission-draft.md`: draft submission text for the hackathon form.

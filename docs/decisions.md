# Oathfold decisions

Decisions made while building the MVP, with reasons. Reversible unless marked otherwise.

## 1. Promise-only MVP scope

Forecast commitments are defined in TAP-12 and implemented in the protocol layer
(parse, build, validate), but the Create form offers promise only. Reason: a promise is
a claim about the author's own conduct, so a judge can verify it from public evidence
(a release, a live URL) without a price feed or oracle. Forecasts need a metric source
the app does not provide yet. Adding forecasts later is a form change, not a protocol change.

## 2. Plain CSS instead of Tailwind

Tailwind via @tailwindcss/vite would have added install risk and build config for a
small UI. Plain CSS in `src/index.css` gives the same visual direction (deep ink and
graphite, restrained neutrals, one blue accent, status by text plus icon dot, never
colour alone). Reversible: the class names are semantic enough to restyle later.

## 3. No router library

Hash routing with a tiny `parseHash` in App.tsx. Reason: seven static pages, no nested
routes, no server. One less dependency and no router upgrade risk.

## 4. Vendored official crypto, unmodified

`bytes.js`, `keys.js`, `payload.js`, `content.js` from TapeKit commit f1831a4, copied
byte for byte except for an attribution header comment. No custom crypto shortcuts.
Reason: TAP-10 crypto has subtle context binding (X, D, slots); reimplementing it would
risk silent incompatibility. The reveal-with-K decryption is the one piece written here,
and it follows TAP-10 section 15.3 / TAP-12 section 4.4 step by step with the same
noble primitives.

## 5. viem for chain access, EIP-1193 directly for the wallet

viem `createPublicClient` for reads (two RPCs, fallback on error) and `encodeFunctionData`
for calldata. The wallet is used through `window.ethereum` directly, not a wallet
library, to keep the dependency surface small and the signing steps explicit
(personal_sign for key derivation, eth_sendTransaction for publishKey and send).
No private key is ever handled by the app.

## 6. Only safe-finality records count

A record is only derived once its block is at or below the safe block. Pending messages
are discarded in the indexer and the Create flow waits for safe finality before deriving
a commitmentId. Reason: TAP-12 section 6 is explicit, and a reorg can change the inbox
index and therefore the commitmentId.

## 7. Demo fixtures use real seal(), labelled everywhere

Demo records are sealed with the vendored official `seal()` and ephemeral keys, so the
format, payload sizes and reveal verification are real. They are labelled DEMO FIXTURE
in data, badges, dashboard, record pages and docs, and carry fake zero tx hashes.
Reason: a demo that fakes the crypto would prove nothing; a demo that hides its demo
status would mislead. Demo keys live in localStorage only.

## 8. Unsealed hub warning is always visible

The hub is not sealed (isSealed() false, owner 0x571d447f4f24688eC35Ccf07f1D6993655F6aF15).
The app shows the warning in the header area on every page and in full on the Live and
Trust pages. Reason: the owner can still replace the hub implementation; presenting the
hub as final would be false.

## 9. Live send is gated, never simulated

The Create flow checks, in order: wallet connected, chain 196, author endpoint resolves
and is held by the connected wallet, author key usable, judge key usable, derived key
matches the published key (else publishKey). Any failure stops with the exact blocker
and offers a labelled demo save. The app never invents a tx hash or a commitmentId for
a send that did not happen. Reason: a fabricated live record would destroy the product's
whole point.

## 10. No token, no escrow, no payments, no AI verdicts

Out of scope by design and by the brief. Verdicts are human, with sources, and anyone
can re-check them. This keeps the trust story simple: the chain is the record, the judge
is the human, the app is the reader.

## 11. Reviewer console builds drafts, does not broadcast verdicts

A verdict must come from the judge container. The console builds the exact ref and
content JSON and states it is not sent. Wiring a judge-wallet verdict send is a defined
follow-up once a judge holder wallet exists. Reason: sending a verdict from the wrong
wallet would create a third-party verdict mislabelled as designated.

## 12. Key-derivation text domain stays as the official module defines it

`keyDerivationText` names `www.tapesend.com`. The app does not rewrite it to an Oathfold
domain, because changing the text changes the derived key and breaks compatibility with
TapeSend-published keys. The Create page tells the user exactly what they are signing.
Revisit only if TapeKit publishes an Oathfold-aware derivation text.

## 13. Two RPCs, primary first, fallback on error

Reads try `https://rpc.xlayer.tech` then `https://xlayerrpc.okx.com`. The second RPC
returned no response in one earlier check, so it is a fallback, not a quorum partner.
TAP-10 wants multi-operator agreement for pinned reads; this MVP shows read failures
rather than false verification, and a stricter quorum read is a follow-up.

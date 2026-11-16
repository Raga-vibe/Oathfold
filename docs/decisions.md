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

## 14. Hackathon banner explicitly not used, at the founder's word

16 November 2026: the founder corrected the brief to drop the banner-design asset entirely. No banner file exists in `app/public/` (the directory does not exist), no banner is mentioned in the app or docs except this record and `docs/skill-application.md`. The priority is a working and clean UI/UX only. Revisit only if the founder asks for a banner later.

## 15. Slides pitch deck explicitly not used, at the founder's word

16 November 2026: the founder corrected the brief to drop the slides deck as a separate deliverable. A draft deck was written and then removed (recoverable trash, restorable until 2026-12-16); no deck file exists in the workspace and no deck content was written elsewhere. The submission text lives in `docs/submission-draft.md` instead. Revisit only if the founder asks for a deck later.

## 16. GraphRAG is retrieval over verified records, never a verdict

`src/lib/graph/` builds a typed knowledge graph only from verified `OathRecord` objects (chain-verified records plus labelled demo fixtures), with every node and edge carrying its source block/message ref and a live/demo flag. Retrieval functions (`authorHistory`, `judgeHistory`, `evidenceGraph`, `relatedCommitments`, `programGraph`, `answerAuthorRecord`) return data, never judgement words. Designated verdicts alone feed hit/miss/undecidable counts; third-party verdicts are a separate bucket and are listed separately. Malformed and unrevealed records are graph nodes and are counted visibly, never dropped. The graph is rebuildable from chain data (re-run the indexer, rebuild the graph; no separate persistence). No LLM generation is involved and no automated verdict is produced. UI panels are labelled "Graph context, not a judgement" and "CONTEXT ONLY" in the reviewer console.

## 17. Design system restyle, brand as code

16 November 2026: the UI was restyled under the installed design skills to a three-layer token system in `src/index.css` (primitive values, semantic aliases, component values) with `src/brand.ts` as the single source of truth for name, tagline, voice rules, banned hype words and tokens. One accent colour, deep ink/graphite neutrals, status by text plus dot shape, 4.5:1 body contrast, visible focus rings, 44px mobile touch targets. Page class names and flows were preserved so the restyle could not break behaviour. Brand voice rules are enforced in code constants, not just in docs.

## 18. Two RPCs, primary first, fallback on error

Reads try `https://rpc.xlayer.tech` then `https://xlayerrpc.okx.com`. The second RPC
returned no response in one earlier check, so it is a fallback, not a quorum partner.
TAP-10 wants multi-operator agreement for pinned reads; this MVP shows read failures
rather than false verification, and a stricter quorum read is a follow-up.

## 19. Redesign: a ledger, not a template

16 November 2026: the founder deployed the app and said it screamed slop. The diagnosis was
right, so the UI was rebuilt under the taste-skill instead of re-tokened. The identity is a
sealed record, a notary's ledger: warm paper, warm ink, one wax-seal red accent used
sparingly, a serif display face, mono for hashes and ids, hairline borders, square corners,
no shadows, no gradients, no purple, no emoji, no illustration, no decorative shapes. The
two banners above the hero became one slim status strip under the header; the full hub
warning lives only on the Live chain page. The hero is one short headline, one plain
sentence, and one real demo record rendered as a record card, so a visitor sees what
Oathfold makes within 5 seconds. "How it works" is one compact strip; the proof cards,
the limits card, the "is not" essay and the long footer were cut to one "Checked live"
line and one footer line. Landing copy was cut by more than two thirds. The record card is
one shared component used by the landing and the dashboard. Mobile gets a one-row header
with a menu button. The gate script's checks are built for static pages and returned
`GATE: ERROR` on this client-rendered SPA, so visual verification was done with headless
Chromium screenshots at 1440x900 and 390x844, read by eye, in `shots/`.

## 20. Demo-first: judges never need a container

16 November 2026, founder decision: hackathon judges must never have to acquire a
container or publish a key. The landing's primary action is exploring a real demo record,
and the Create form defaults its judge field to `VITE_DEFAULT_JUDGE_ENDPOINT`, a single
configurable default judge endpoint. It is empty until the team provisions one judge
container and publishes its key; it is documented in `app/.env.example` and
`docs/container-onboarding.md` section 5 as the Oathfold demo judge, provisioned once by
the team, so no visitor or hackathon judge ever needs a container to try it. When set,
the form shows the one-line note "Judge provided by Oathfold." Wallet connect stays only
for live sends. A visitor who wants to send a live commitment of their own still needs
their own opened container, which is a protocol requirement, not an Oathfold one.

## 21. Trigger.dev dark system replaces the ledger look

16 November 2026, founder decision: the founder uploaded his own style reference
(`docs/design-reference.md`, Trigger.dev style spec) and asked for this style. It
replaces the paper/ink ledger look from section 19, at the founder's word. Token
mapping: paper #F7F3EA became slate canvas #1C1E21; raised paper #FFFDF7 became
canvas cards on #1C1E21 with #272A2E hairlines; ink text became bone #E5E7EB, body
became cloud #D7D9DD, muted became fog #878C99; wax-seal red #8A2B1D became Signal
Lime #A8FF53 as the only filled accent (primary CTA, logo mark, active nav); serif
display became Satoshi (Inter/system-ui substitute, 0.05em tracking at 36px+); mono
stays locked at 14px for code, hashes, ids, addresses and timestamps, now on
ink-well #121317 panes with the spec's syntax palette used only inside code
contexts. Radius went from 2px to 4px on rectangles, 9999px kept for pills. No
shadows in either system. No webfonts: Satoshi/Geist are substituted with the
system stack so the build stays offline-safe. The record card became a code-editor
pane (see the progress entry for this round). The "Checked live" line no longer
reads "safe block pending": the safe-block part renders only once the hub read has
landed, and the implementation is labelled "(expected)" until verified. Demo-first
structure, routes, copy structure, protocol code and tests are unchanged.

## 22. One shared state-machine module, hand-rolled

16 November 2026. The app had sixteen implicit state machines: state inferred
from two or more booleans, timestamps, nullable fields, or a chain read, in a
different way on every page. The same fact had several names, and two of them
disagreed (Live showed "Hub check pending" while the status strip said "Hub
check failed"). Decision: one shared module, `app/src/lib/machines.ts`, as the
single source of truth, following the pattern that worked on Podium. Hand-rolled
and zero-dependency (no xstate): sixteen machines, each a union type plus one
switch, fit in one file with no runtime cost and no new API to learn. If a
machine ever grows async side effects or nested states, that is the moment to
revisit, not before. Each machine has a named union type of states, one
explicit transition function (state + event -> next state or an explicit
rejection with a reason), guards encoding the real rules (unrevealed
commitments can only receive undecidable; a verdict needs at least one evidence
source; a send requires an opened container with a usable key; no transition
out of a terminal state), and where a machine is derived from chain data, one
pure function computing the named state from the raw inputs. Machine state is
derived, never stored on chain and never a new stored shape; `tap12.ts` keeps
the protocol semantics. The full inventory, with where each machine lived
before and where it lives now, is in `docs/state-machines.md`. Deliberately
left implicit: the vendored TapeKit send module (untouched, pure functions);
the reveal K decryption steps (a linear check, the reveal machine names the
outcome); graph build progress (synchronous, so `building` exists in the
transition function but the derived state only returns `empty`/`ready`); the
demo-store state in the UI (named and tested, not displayed, because the load
result is invisible by design).

## 23. Compact density: tables over cards, sticky action bars

16 November 2026, same round as section 22. The dashboard card stack became a
compact record table (status pill, title, open date, verdict, one action) so
all 6 records scan in one screen; the RecordCard code pane stays for the hero
and detail only. Track records moved behind a toggle below the table, gated on
the graph machine being ready. Create and Review got a fixed sticky action bar
at the viewport bottom so the primary action is always visible without
scrolling, with the next action and its blocker in one line. RecordDetail
reordered into one scannable column (verdict/status, code pane, timeline) with
graph context and verification behind disclosure toggles. Hero padding and
section gaps tightened so "How it works" starts near the fold. Same Trigger.dev
dark tokens, lime only as the filled accent, 4px radii, hairlines, mono 14px.
Verified by screenshots at 1440x900 and 390x844 with zero horizontal overflow.

# Oathfold protocol compatibility report

Checked 16 November 2026, 12:00-12:30 WAT. All live chain checks were read-only.

## Event (locked)

- Event: OKX X Layer TapeOut Accelerate.
- Page: https://web3.okx.com/xlayer/build-x-series (read 16 Nov 2026).
- Submission deadline: 7 December 2026, 23:59 UTC, labelled provisional on the page. Re-check before submitting.
- Prize pool: 100,000 USDT (1st 20,000; 5 x 2nd 10,000; 5 x 3rd 6,000).
- Requirement: build within the TapeOut ecosystem and use TapeOut circuits, contracts, or on-chain data on X Layer, or run on X Layer DeWEB. Apps must provide an access link and explain which TapeOut features they use. Interfaces and other functionality do not all have to run inside circuits. Individuals welcome. Existing projects need substantial new development during the event.
- Judging: user value/commercial potential, innovation, ecosystem integration, product readiness/UX, demo video (max 3 minutes recommended).

## Upstream revisions (pinned)

- TAPs repo: https://github.com/TapeOutProtocol/TAPs, HEAD `527477e` (Merge PR #104, README TAP-19-21), cloned 16 Nov 2026.
- TAP-10: DeWEB Access and Messaging Layers, Draft, version 1.1, updated 2026-09-28. Status Draft, not sealed, no independent audit published (per TAP-10 itself).
- TAP-12: Sealed Commitments and Verdicts over TapeSend, Draft, created 2026-09-30, requires TAP-10. Reference implementation listed as processor #168 on X Layer, link at a fixed commit to be added before TAP-12 moves to Review (not yet present in the document).
- TapeKit reference implementation: https://github.com/TapeOutProtocol/TapeKit, pinned commit `f1831a44160e7a5a31385c05f1cdf64f25619516` (2026-09-20), MIT. TAP-10 names this commit; later commit `da14c93` (2026-09-27) changes only a gateway end-to-end test.
- Official send module tests at the pinned commit: 32 passed, 0 failed (`npm test` in `send/module`, 16 Nov 2026).
- TAP-12 test vectors verified in this workspace (`/tmp/spike.mjs`, 16 Nov 2026):
  - Example 1 ref (forecast, open 1791259200): `0x534356310102000000006ac47240` + 18 zero bytes. Match.
  - Example 2 commitmentId (chain 196, hub 0xe61A9C7213a6Aa616C246a2B569e555B417b25ee, judge endpoint `0x0000000000000000000000c40b4a0ba288b4d2a87fc07db5f4c929f87dfda282`, inboxIndex 7): `0xa7df3a8c829184ef7aa7d58ca798ede329157250076430fb979e5128e5ea2e0b`. Match.
  - Seal/open roundtrip with vendored official code: sealed payload 426 bytes, opened correctly as judge. Match.
  - Digest formula `keccak256(ref || keccak256(payload))` reproduced.

## X Layer chain (verified live, read-only)

- Chain ID: 196 (`0xc4`), confirmed via `eth_chainId` on https://rpc.xlayer.tech, block 0x4888ed4 at check time, head 76,058,466 later the same hour.
- RPCs: https://rpc.xlayer.tech (OKX, works), https://xlayerrpc.okx.com (no response in one check, do not rely on it alone), https://xlayer.drpc.org (chainId check timed out in one attempt). TAP-10 lists a fourth: https://196.rpc.thirdweb.com.
- Observed limit: `eth_getLogs` on rpc.xlayer.tech rejects ranges over 100 blocks (`block range greater than 100 max`). The Oathfold indexer chunks log scans to 100 blocks.
- Finality tag for X Layer per TAP-10 §2.1: `safe`. Max pin lag 300 blocks.

## Hub (verified live, read-only)

- Hub proxy (every chain): `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee`. Code present (proxy bytecode returned by `eth_getCode`).
- ERC-1967 implementation slot `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` read `0xdCC57797089eBD9f26e686379A4323f353a3F9C6` on 2026-11-16 (the pinned X Layer implementation listed in TAP-10 Deployments) and then `0xf6b86f44bd039bacc8d3670971d556202d579261` at block 76246532 on 2026-11-18. The pin no longer matches, so `implementationMatches` is false and the app reports the change ("Record book updated") instead of claiming verification. The advanced page still warns in full.
- `isSealed()`: `0` (false). `owner()`: `0x571d447f4f24688eC35Ccf07f1D6993655F6aF15`. The hub is NOT sealed and is still upgradeable by its owner. The app must show this warning; do not present the hub as final.
- Boot implementation: `0xC0D28CA8689248B0bed26cC0aa328CF16Aa4401e` (per TAP-10).

## Other X Layer contracts (from TAP-10 Deployments, not all re-read live)

- Processor factory: `0x1f09DAeFA827f02CBb40967cc91b259763760761`. Live `cpuCount()` = 424 (`0x1a8`).
- Processor 1: `0x0565EA48CA41Ae559d8d491dbb0a9ec945DB551b`. Processor 168: `0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282` (same address used illustratively as the judge endpoint container in TAP-12 Example 2).
- Container opener, ERC-6551 registry (`0x000000006551c19487814612e58FE06813775758`), container implementation, payments table, site store and payment contract addresses are as listed in TAP-10 Deployments for Base/X Layer. Re-read before any send that depends on them.

## Endpoint / key readiness (verified live, read-only)

- `keyFor` for processor 1, tokens #1 to #12 on X Layer: every container is `opened=false`, `usable=false`, suite 0, key all zero. Current holder for all twelve is `0xa2e4592ebbd0a08cf49dc306358b064587ab3362`. Inbox count 0 and outbox count 0 for #1@2.1 (container `0x374fa57399f356030847Eb0c56851bE9a1194E5D`).
- No usable X Layer endpoint was found in that sample. A `KeyPublished` log scan was attempted over the last 100 blocks on rpc.xlayer.tech but the request format was rejected by that node; it is not evidence that no keys exist. The app's live lookup must check `keyFor` per endpoint rather than assume.
- Consequence: a real sealed send needs a founder-owned circuit container on X Layer that is opened (paid) and has a published TapeSend key, plus a judge endpoint with a usable key. `DeWebHub.send` enforces this on chain (`_authorize`: caller must be the current holder of an opened circuit). No such container is available to this workspace, and no private key was requested or collected.

## Compatibility status

- TAP-12 ref layout, commitment ID, digest, sealed payload, content object, reveal and verdict formats: implemented from the pinned draft and verified against its published examples and the official module's test vectors.
- TAP-10 messaging crypto: vendored unmodified from TapeKit `f1831a4` (`bytes.js`, `keys.js`, `payload.js`, `content.js`, MIT). No custom crypto.
- Live chain reads (hub verification, `keyFor`, inbox/outbox, `Sent` log scan): implemented against the live X Layer RPCs with the 100-block chunk limit.
- Live send path: implemented wallet-gated in the app, not yet broadcast, because the prerequisite container/key does not exist. This is the single open blocker for a live on-chain commitment/reveal/verdict cycle. See `docs/progress.md`.

## Implementation status (2026-11-16, MVP build)

The MVP in `app/` implements the compatibility items above: TAP-12 ref/commitmentId/
digest/reveal/verdict logic in `src/lib/protocol/tap12.ts` (28 unit tests pass, including
the Example 1/2/3 vectors), vendored official crypto, live hub verification, keyFor
lookup, and a 100-block-chunked Sent scan. The live send path is implemented wallet-gated
and not yet broadcast: the prerequisite founder-owned opened container with a published
key does not exist. See `docs/progress.md` and `docs/decisions.md`.

One correction found during the build: the TAP-12 Example 2 judge endpoint container is
`0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282` (the `c4` in the endpoint hex is the
chain-id byte for 196, not part of the container). The demo fixtures use that container.

- Both TAPs are Draft and the hub/factory are unsealed. Oathfold labels itself "compatible with the published TAP-12 draft" and shows the unsealed warning.
- TAP-12 has no published reference vector set under `assets/` yet ("will be added once the reference implementation is at a fixed commit"). Only the in-document examples were verified.
- Node agreement: TAP-10 requires multi-operator agreement for pinned reads. The app uses two RPC endpoints where available and shows disagreement/unavailable states rather than false verification.
- The founder's container acquisition path (mint/open a TapeOut circuit on X Layer, opening fee, publish key) was not verified end to end. That is the next founder action.

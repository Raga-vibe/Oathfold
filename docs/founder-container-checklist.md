# Founder container checklist — Oathfold live send

Prepared 2026-11-16 ~12:50 WAT, from the pinned TAP-10 v1.1 / TAP-12 drafts,
`docs/protocol-compatibility.md`, `docs/submission-draft.md`, and a live read of
https://tapeout.net/ on 2026-11-16 11:49 UTC. Nothing here spends money or
touches a wallet. Do not pay anything until the unverified steps below are confirmed.

## Why this matters now

The MVP is done (45/45 tests, build passes, pushed as commit 41a9fcf3) and the
Dec 7, 23:59 UTC submission is 3 weeks away. The one missing proof is a real
sealed commitment → reveal → verdict cycle on X Layer. That cycle is blocked
on one precondition: a founder-owned circuit container on X Layer that is
opened and has a published TapeSend key.

Important framing: a live send is proof strength, not a formal submission gate.
The hackathon requires using TapeOut circuits, contracts or on-chain data on
X Layer, or running on DeWEB. Oathfold already reads the hub, factory and
`keyFor` live on X Layer, so it can be submitted with labelled demo fixtures
if the live cycle cannot be unlocked. Do not let the container hunt block the
video and submission form.

## Verified — the steps inside Oathfold once you own a circuit

From `docs/submission-draft.md` ("Founder next step") and the implemented app:

1. Connect the holder wallet (the wallet that owns the circuit NFT) in the app.
2. Go to Create. The app derives the TapeSend key by `personal_sign` and
   publishes it with `publishKey` if it is not already the published key.
   `publishKey` needs suite 1, a non-zero key, and a plain-account holder.
3. Pick a judge endpoint that has a usable key — check it first on the
   Live chain page (`keyFor`). If none exists, the judge must open a
   container and publish a key the same way. This is two-sided: your
   container alone is not enough, a judge endpoint is needed too.
4. Send the commitment from Create, wait for safe finality in the app, then
   run a Sent scan from the Live chain page and confirm the record on the
   dashboard. The indexer scans in 100-block chunks (the X Layer RPC rejects
   wider ranges).
5. After the open time, reveal from the record and record a designated judge
   verdict with at least one source.

Verified chain facts (from `docs/protocol-compatibility.md`, checked live
2026-11-16 12:00–12:30 WAT): X Layer chain 196, hub proxy
0xe61A9C7213a6Aa616C246a2B569e555B417b25ee, implementation
0xdCC57797089eBD9f26e686379A4323f353a3F9C6, hub NOT sealed, owner
0x571d447f4f24688eC35Ccf07f1D6993655F6aF15. Processor 1 tokens #1–#12 are all
unopened with no published key, holder 0xa2e4592ebbd0a08cf49dc306358b064587ab3362.
Processor 168 is the TAP-12 reference processor on X Layer.

## NOT verified — how to get an X Layer circuit in the first place

This is the gap. `docs/protocol-compatibility.md` states it plainly: "The
founder's container acquisition path (mint/open a TapeOut circuit on X Layer,
opening fee, publish key) was not verified end to end."

What I checked this run:

- TAP-10 defines a circuit as (processor contract, #ID), a container as the
  ERC-6551 account bound to it, and "opened" as the one-time opening fee
  paid (`opener.isOpened` / `payments.paid`). It does not document any
  mint/buy UI or marketplace.
- https://tapeout.net/ (read 2026-11-16 11:49 UTC) lists processors up to
  #1491 with prices in BNB. It reads as BNB-centric; no X Layer or
  processor-168 purchase path was visible on its homepage. Do not assume
  minting there yields an X Layer circuit.
- A live re-check of the X Layer factory (`cpuCount` / `cpuAt(167)`) from
  this run was blocked by the VM egress proxy (403 on CONNECT to
  rpc.xlayer.tech), so processor 168's on-chain circuit count and holders
  are still unconfirmed here. The app's own Live chain page can do this
  lookup from Qeeb's browser instead.

## Questions to settle before paying anything

Ask in the OKX TapeOut / hackathon channel, or put them to the teammate on
`feat/container-onboarding` (see `docs/team-commits.md`, Commit 1):

1. On X Layer, how is a circuit acquired — mint from the processor factory,
   buy the NFT on a marketplace, or another route? Which processor should a
   new founder use (168, or any)?
2. What is the container opening fee, in what token, and is it one-time?
3. Once opened, is `publishKey` from the Oathfold Create page the whole
   key step, or is there a separate TapeSend key registration?
4. Is there a public judge endpoint with a usable key already, or must the
   team supply its own judge container too?

## If acquisition stalls

- Do not buy an expensive rig/NFT on speculation. The submission does not
  require owning one.
- Keep building the submission assets (team Commit 3: Playwright e2e, clean
  screenshots, final 3-minute demo shot list) and the DeWEB publish step
  (Commit 2). Both are useful with demo fixtures alone.
- Re-check the hub seal state on the Live chain page before submitting; the
  app must keep showing the unsealed-hub warning.

## Team note

Teammates cannot open pull requests until Qeeb adds each of them as a
collaborator in repo Settings (or they fork). Their GitHub usernames have not
been shared yet, so that step is still waiting on Qeeb.

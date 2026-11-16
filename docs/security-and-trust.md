# Oathfold security and trust

## Threat model

Oathfold is a record reader and a send assistant, not a custodian. It holds no funds,
no private keys, and no server state. The assets at stake are: the truth of the record
(was this claim sealed then, revealed as claimed, judged by whom), the confidentiality
of the claim text before reveal, and the user's wallet (signing).

## What the app verifies

- Every live record: `inboxAt` from matches the Sent event from, and
  `digest = keccak256(ref || keccak256(payload))` matches the stored digest. A mismatch
  discards the message.
- Every reveal: commitmentId recomputed from `scv.commitment`, sender is author or judge,
  SHA-256("TAP-10/commit/v2" || K) equals D, C decrypts with K under the exact TAP-10 aad,
  and the content validates against TAP-12 section 3.4.
- Every verdict: outcome/source rules, unrevealed only allows undecidable, early flag,
  designated vs third-party separation.
- Finality: only messages at or below the safe block count. Pending is never a record.
- Hub identity: ERC-1967 implementation slot, isSealed, owner, read live on every visit
  to the Live page and once on app load.

## What the app does NOT verify

- The hub is NOT sealed (isSealed() false, owner 0x571d447f4f24688eC35Ccf07f1D6993655F6aF15).
  The owner can replace the hub implementation. The factory seal state is not asserted
  either. Until both seals are in effect, records inherit TAP-10 section 13.8 trust
  assumptions. The app warns about this on every page.
- TAP-10 and TAP-12 are Drafts with no published independent audit. Oathfold claims
  compatibility with the published drafts, not audited security.
- A judge's sources are cited, not verified, by the app. Readers check sources themselves.
- The app does not verify that a demo record's author container is a real container.
  Demo containers are illustrative and the records are labelled DEMO FIXTURE.
- Node agreement: TAP-10 wants multi-operator agreement for pinned reads. This MVP reads
  two public RPCs with fallback, and shows failures rather than false verification. A
  stricter quorum read is a follow-up.

## Privacy

- Author, judge, time, kind and open time are public from the moment a commitment is sent.
  Only the claim text is hidden, and only until reveal.
- Sealing hides the claim from the public, not from the judge. The judge holds a key slot
  and can publish K at any time, including before the open time. The Create page and the
  landing page both state this before anyone sends.
- Revealing K exposes one message only. Long-term keys are never disclosed.
- A message that is not meant to be a public record must not carry the SCV1 tag.
- Container transfer transfers the track record. The sending container of every message is
  shown so a reader can see when the current holder was not the author.

## Keys

- The author's X25519 key is derived by the wallet signing the exact TAP-10
  key-derivation text (personal_sign). The signature is used once to derive the key and
  is never stored. The secret key lives only in memory for the send.
- The derivation text names the official TapeSend domain from the vendored module. The
  user is told exactly what they are signing before they sign it.
- If the derived key differs from the published key, the app asks the wallet to publish
  the derived one (publishKey) before sending. It never silently sends with a stale key.
- Demo keys are ephemeral and stored in localStorage only so demo reveals work in the
  browser. They are not live keys.
- Oathfold stores no secret keys, no mnemonics, no wallet credentials anywhere.

## Wallet safety

- Every transaction (publishKey, hub.send) is built as calldata and signed by the user in
  their own wallet. The app never broadcasts on its own.
- `hub.send` enforces on chain that msg.sender is the current holder of an opened
  circuit, so a non-holder cannot send as someone else's container.
- The app checks the chain is 196 before sending and offers to switch networks.
- No token approvals, no payments, no escrow: the app never asks the wallet to move funds
  except gas for hub transactions.

## Abuse and limits

- Cherry-picking: every tagged commitment is visible in the author's outbox and becomes
  unrevealed if not disclosed. The dashboard shows unrevealed and malformed records with
  the same prominence as judged ones.
- Verdict spam: anyone can send a verdict, but third-party verdicts are listed separately
  and never merged with the designated judge verdict.
- Malformed commitments: an author who seals undecryptable or invalid content gets a
  malformed record, which counts against the author, not the judge.
- Reorgs: commitmentIds are only derived after safe finality.
- The app makes no legal claim and offers no guarantee that a promise will be kept. It
  holds no funds and runs no escrow.

## Reporting a problem

If a live record in the app disagrees with the chain, re-scan from the Live chain page
and compare the verification drawer (digest check, block, tx) against the X Layer
explorer. If the hub seal state changes, the Live page shows the new state immediately.

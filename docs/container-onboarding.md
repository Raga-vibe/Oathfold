# Getting a container and a TapeSend key (checked live on tapeout.net, 16 Nov 2026)

No wallet is needed to browse tapeout.net. A wallet is only needed to tape out, open a container, or publish a key. Nothing here needs a seed phrase or private key shared with anyone.

## 1. Get a circuit on X Layer

Go to [tapeout.net](https://tapeout.net/). The site opens in Chinese by default; switch with the bottom-left "中文 / EN" toggle.

1. Top-left chain selector (default BNB Chain) -> pick **X Layer** (shown as "X Layer, OKX's L2, Chain ID 196").
2. Left sidebar -> **Canvas**. It loads a "NAND demo" design, 3 gates.
3. Click **"Choose a processor…"** and pick an X Layer processor priced in OKB (examples seen: TAPELIQUID #265 at 0.00066 OKB per transistor, HashPortAI #167 at 0.001 OKB). Processor 168 is the TAP-12 reference processor; pick it if it is listed, otherwise any X Layer processor works for Oathfold.
4. Click **"Connect wallet and tape out"** and connect the wallet that will hold the circuit. The example 3-gate tape-out showed: burns 3 NAND, unit price 0.001 OKB, tapeout fee 0.0013 OKB. The circuit NFT is yours and it gets its own container address.

Note: the **Circuit market** page does NOT work on X Layer. It flips the site back to BNB Chain, so buying a listed circuit is a BNB Chain action, not an X Layer one. On X Layer, create the circuit on Canvas.

## 2. Open the container

Opening fee seen on the site: **0.08 OKB, one-off per container**.

1. With X Layer selected, sidebar (ME section) -> **Containers**. Heading: "My containers, X Layer".
2. Find your circuit's container (or use "Open any container" and paste the processor address plus circuit ID, e.g. `0x4f3b.../49`).
3. On the container page, right-hand panel **"Open the container"** -> connect the holder wallet and pay the 0.08 OKB. The page says: "It can receive before opening; the holder can withdraw only after. One-time fee."

Every circuit has its own on-chain account (ERC-6551). Whoever holds the circuit controls the container.

## 3. Publish your TapeSend key (in Oathfold)

1. Open the Oathfold app and connect the same holder wallet.
2. The app asks the wallet to sign the exact TAP-10 key text (`personal_sign`). That signature derives your TapeSend key. No key is typed in or bought.
3. The app publishes the public part on chain (`publishKey`). Check it on the app's Live chain page: the endpoint should show a usable key.

## 4. Judge endpoint

The judge needs the same three things: their own circuit, an opened container, and a published key. Repeat steps 1 to 3 with the judge's wallet, or pick an existing endpoint that already shows a usable key on the Live chain page.

## 5. The Oathfold demo judge (so visitors never do this)

Hackathon judges and visitors must never have to acquire a container or publish a key. The Oathfold demo judge is provisioned once by the team, so no visitor or hackathon judge ever needs a container to try it: the team provisions ONE judge container once, publishes its key, and sets it as the app's default judge endpoint (`VITE_DEFAULT_JUDGE_ENDPOINT` in `app/.env.example`). The Create form then defaults to that endpoint, and the demo records in the browser need no wallet or container at all. Only a visitor who wants to send a live commitment of their own needs their own opened container, which is a protocol requirement, not an Oathfold one.

## Costs seen (16 Nov 2026, X Layer)

- Tape out a 3-gate demo circuit: about 0.003 OKB of transistors plus 0.0013 OKB tapeout fee, plus gas.
- Open a container: 0.08 OKB one-off.
- Minting transistors on a processor (if you need more): e.g. 100 at 0.001 OKB each plus 0.00066 OKB protocol fee per transaction.

Fees are as shown on the site on the day; re-check before paying.

## Sources (official TapeOut only; checked 18 Nov 2026)

- TapeOut official site and canvas: https://tapeout.net/ . The X Layer chain selector, Canvas
  (tape-out), Containers (open) and the per-circuit container pages used in steps 1 and 2 are
  all on this site. No other site is an official TapeOut source.
- TAP-10, DeWEB Access and Messaging Layers, Draft v1.1 (2026-09-28):
  https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-10.md . Endpoint ids and the
  container/account model are in section 2; the hub key view (`keyFor`), the key-derivation
  text and `publishKey` are in section 13. Oathfold uses that text unchanged.
- TapeKit, the open-source browser kernel (MIT), pinned commit
  `f1831a44160e7a5a31385c05f1cdf64f25619516`: https://github.com/TapeOutProtocol/TapeKit . The
  vendored send module (`bytes.js`, `keys.js`, `payload.js`, `content.js`) comes from this
  commit; see docs/decisions.md and docs/protocol-compatibility.md.
- X Layer (chain 196, OKB gas): block explorer https://www.okx.com/web3/explorer/xlayer and the
  public RPCs https://rpc.xlayer.tech and https://xlayerrpc.okx.com .

Fees are shown by the site at checkout. The amounts above were seen on 16 Nov 2026 and can
change; the open-container fee is per container and one-off.

## In the app

The Onboarding page (`app/src/pages/Onboarding.tsx`, linked from Landing and Make a promise)
walks the same steps: connect the wallet, resolve the account name, check opened, check
`keyFor` usable, derive the key from the wallet signature, and publish it. It reuses
`resolveEndpoint` and `keyFor` from `src/lib/chain/xlayer.ts` and the existing key helpers in
`src/lib/wallet.ts`; it writes no new crypto and does not change the live send flow. It shows
the exact blocker when an account is not opened or has no usable key, and it never claims a
promise was sent.

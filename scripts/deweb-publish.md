# Publishing Oathfold as a DeWEB site (`tape://`)

Status: **BLOCKED — prepared, not published.** Checked 18 Nov 2026.

No `tape://` link is recorded below, because none was published. This file records the exact
steps, commands, addresses and cost model from the pinned TapeKit commit and TAP-10, the live
chain check that was run, and the precise blocker. It is written so the publish can be completed
by anyone who holds an opened X Layer container.

## Sources

- TapeKit site-owner handbook, pinned commit `f1831a44160e7a5a31385c05f1cdf64f25619516`:
  https://github.com/TapeOutProtocol/TapeKit/blob/f1831a44160e7a5a31385c05f1cdf64f25619516/README.md
  (sections: what a site is, prepare the folder, publish, SPA fallback, content types, activate).
- TAP-10 (DeWEB Access and Messaging Layers, Draft v1.1): https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-10.md
  — §6 names and payment, §7 files and paths, Appendix B contract interfaces.
- TapeOut console: https://tapeout.net/ . TapeKit gateway: https://tapekit.org/ .

## What publication needs, in order

1. A TapeOut circuit NFT on X Layer, held by the publishing wallet.
2. That circuit's ERC-6551 container **opened** (one-time fee).
3. The holder wallet with OKB for gas and for name activation.
4. The static site written to `SiteRegistry` under `(container, path)` with each file's size,
   content type and SHA-256.
5. The on-chain name activated through `DomainBinding` (clients only display activated names).

## X Layer (chain 196) addresses

| Contract | Address |
|---|---|
| Site store `SiteRegistry` (UUPS proxy) | `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6` |
| Payment `DomainBinding` (UUPS proxy) | `0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9` |
| Processor factory (UUPS proxy) | `0x1f09DAeFA827f02CBb40967cc91b259763760761` |
| Container opener | `0x536adD8F30f03b69f6fbF29d425A816A0dC50106` |
| DeWEB hub (UUPS proxy) | `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee` |

RPC: `https://rpc.xlayer.tech` (fallback `https://xlayerrpc.okx.com`). Block explorer:
`https://www.okx.com/web3/explorer/xlayer`.

## 1. Prepare the static folder

```bash
cd app
npm ci
npm run build          # writes app/dist/
find dist -type f -exec sha256sum {} \;
```

Rules that matter for an on-chain site:

- Relative or root-relative paths only; never absolute `https://` URLs to your own files.
- ASCII / Unicode-NFC file names.
- Declare the real MIME type per file (HTML, CSS and JS must have one, or browsers will not run them).
- No off-chain references in HTML/CSS, and no runtime fetches to external hosts. Reading chain data
  through the wallet provider or the configured public RPC nodes is allowed.
- Single-page app: set the fallback path to `index.html` so client-side routes resolve.

Chunk math: `CHUNK_MAX` is 24,000 bytes, at most 350 chunks per file (8.4 MB). Each chunk is deployed
as a small contract, so the cost is roughly proportional to bytes (about 200 gas per byte of deployed
code, plus overhead). Minify before publishing; do not publish source maps or `node_modules`.

## 2. Publish

**A. Hosted console.** Open https://tapeout.net/ , pick the circuit, upload `app/dist/`, and sign.
The console computes hashes, splits chunks and sets the fallback.

**B. Direct contract calls** (what any tool ultimately does; caller must be the holder or an
operator set with `setOperator`):

```text
putFile(container, path, contentType, sha256Hash, firstChunk)   # first chunk <= 24,000 bytes; replaces an existing file
appendChunk(container, path, expectIndex, chunk)               # expectIndex = 1, 2, 3, ... per further 24,000-byte chunk
setFallback(container, "index.html")                           # SPA route fallback
removeFile(container, path)                                    # optional
```

`appendChunk` rejects a wrong `expectIndex`, so a retried transaction cannot append twice.

Then activate the name:

```text
DomainBinding.bind("<id>.<cpu>.tape", container, months)        # payable; msg.value = months * monthlyFee()
```

Read `monthlyFee()` from the chain at payment time and never hard-code it; the fee differs per chain
(the handbook quotes 0.08 BNB per 30 days on BNB Chain). X Layer pays in OKB. One payment per
container activates both its bound domain and its on-chain name.

## 3. Verify

- Resolve and open `tape://<id>.<cpu>.tape` through the TapeKit gateway (`https://tapekit.org/`) or a
  TapeKit shell, and confirm every byte matches the on-chain SHA-256.
- Confirm the hub panel, dashboard and demo lifecycle work there.
- Record the verified link and the check date in `docs/progress.md`.

## Blocker — why this was not published (18 Nov 2026)

> No TapeOut circuit on X Layer is held by this workspace, so there is no container to publish
> under. Writing files requires the circuit holder (or an authorised operator), so `putFile` cannot
> be called by us, and there is no `tape://` name to activate or verify. No fee was paid and no link
> was faked.

Live evidence, read-only against `https://rpc.xlayer.tech` at 18 Nov 2026 13:20 UTC, block
`76238991`:

| Check | Result |
|---|---|
| Factory `cpuCount()` | `428` |
| Processor 1 | `0x0565EA48CA41Ae559d8d491dbb0a9ec945DB551b` |
| Processor 1 / #1 container | `0x374fa57399f356030847Eb0c56851bE9a1194E5D` |
| `opener.isOpened(processor1, 1)` | `false` |
| `SiteRegistry.fileInfo(container, "index.html")` | size `0`, chunkCount `0` (no site) |
| `DomainBinding.isContainerLive(container)` | `false` |

To unblock: the team provisions one circuit on X Layer, opens its container (one-time fee), and
either runs the console once or provides the holder wallet address so the steps above can be
executed. Then re-run steps 1–3 and record the verified `tape://` link and date. No secret belongs in
this repository; signing happens in the console or in the holder's wallet.

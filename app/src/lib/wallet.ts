// Wallet-gated live send path for Oathfold.
// The wallet is never asked for a private key. The flow:
//  1. Connect via EIP-1193 (window.ethereum), check/switch to X Layer (196).
//  2. Resolve the author's endpoint (#id@2.cpu) and the judge endpoint; both
//     must have usable keys (hub keyFor usable=true) or sealing is impossible.
//  3. Derive the author's X25519 key with personal_sign over the exact TAP-10
//     key-derivation text (vendored keyDerivationText / deriveKeyPair). The
//     signature is used only to derive the key; the private key never leaves
//     the wallet.
//  4. If the author's key is not published (or is stale), build publishKey
//     calldata; the user signs that transaction in their wallet.
//  5. Seal the commitment with seal() (vendored), build hub.send calldata
//     with viem encodeFunctionData, and the user signs that transaction.
//  6. Wait for the receipt, then wait until the block is at or below the
//     chain's safe block before deriving a commitmentId (TAP-12 section 6:
//     pending is never a final record).
// No step here broadcasts anything by itself. Every transaction is signed by
// the user in their own wallet. If the connected wallet is not the holder of
// an opened container, hub.send reverts (DeWebHub._authorize) and the UI
// shows the exact blocker instead of claiming a send happened.

import { encodeFunctionData, type Address, type Hex } from 'viem'
import { hubAbi, XLAYER_CHAIN_ID, HUB_ADDRESS } from './chain/xlayer'
import { keyDerivationText, deriveKeyPair } from './tapeout/send/keys.js'
import { seal } from './tapeout/send/payload.js'
import { bytesToHex, hexToBytes } from './tapeout/send/bytes.js'
import { buildCommitmentContent, buildCommitmentRef } from './protocol/tap12'

export interface WalletState {
  address: Address | null
  chainId: number | null
  connected: boolean
  error?: string
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on?: (event: string, cb: (...args: unknown[]) => void) => void
      removeListener?: (event: string, cb: (...args: unknown[]) => void) => void
    }
  }
}

export function hasWallet(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum
}

export async function connectWallet(): Promise<WalletState> {
  if (!hasWallet()) {
    return { address: null, chainId: null, connected: false, error: 'No EIP-1193 wallet found in this browser. Install a wallet and try again.' }
  }
  try {
    const accounts = (await window.ethereum!.request({
      method: 'eth_requestAccounts',
    })) as string[]
    const chainHex = (await window.ethereum!.request({ method: 'eth_chainId' })) as string
    return {
      address: (accounts[0] ?? null) as Address | null,
      chainId: Number.parseInt(chainHex, 16),
      connected: accounts.length > 0,
    }
  } catch (e: any) {
    return { address: null, chainId: null, connected: false, error: e?.message ?? String(e) }
  }
}

export async function switchToXLayer(): Promise<{ ok: boolean; error?: string }> {
  if (!hasWallet()) return { ok: false, error: 'No wallet found.' }
  try {
    await window.ethereum!.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xc4' }],
    })
    return { ok: true }
  } catch (e: any) {
    // 4902: chain not added to the wallet. Add it with the public X Layer RPC.
    if (e?.code === 4902) {
      try {
        await window.ethereum!.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0xc4',
            chainName: 'X Layer',
            nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
            rpcUrls: ['https://rpc.xlayer.tech'],
            blockExplorerUrls: ['https://www.okx.com/web3/explorer/xlayer'],
          }],
        })
        return { ok: true }
      } catch (e2: any) {
        return { ok: false, error: e2?.message ?? String(e2) }
      }
    }
    return { ok: false, error: e?.message ?? String(e) }
  }
}

export interface DerivedKey {
  secretKey: Uint8Array
  publicKey: Uint8Array
  publicKeyHex: string
  text: string
}

/**
 * Derive the author's X25519 key: ask the wallet to personal_sign the exact
 * TAP-10 key-derivation text, then deriveKeyPair (vendored). The text names
 * the TapeSend domain from the official module; only sign it in the official
 * context. The signature is never stored.
 */
export async function deriveAuthorKey(args: {
  holder: Address
  tokenId: bigint
  cpu: bigint
  container: Address
  keyIndex?: number
}): Promise<DerivedKey> {
  if (!hasWallet()) throw new Error('No wallet found.')
  const text = keyDerivationText({
    tokenId: args.tokenId,
    cpuIndex: args.cpu,
    container: args.container,
    holder: args.holder,
    hub: HUB_ADDRESS,
    chainId: XLAYER_CHAIN_ID,
    keyIndex: args.keyIndex ?? 0,
  })
  const signature = (await window.ethereum!.request({
    method: 'personal_sign',
    params: [text, args.holder],
  })) as string
  const pair = deriveKeyPair({
    signature,
    holder: args.holder,
    tokenId: args.tokenId,
    cpuIndex: args.cpu,
    container: args.container,
    hub: HUB_ADDRESS,
    chainId: XLAYER_CHAIN_ID,
    keyIndex: args.keyIndex ?? 0,
  })
  return {
    secretKey: pair.secretKey,
    publicKey: pair.publicKey,
    publicKeyHex: bytesToHex(pair.publicKey),
    text: pair.text,
  }
}

export function buildPublishKeyCalldata(args: {
  circuits: Address
  tokenId: bigint
  publicKeyHex: string
  keyIndex?: number
  chainsBitmap?: bigint
}): { to: Address; data: Hex } {
  // X Layer chain index in the TAP-10 chain table is 2, so the bitmap is 1<<2 = 4.
  const chains = args.chainsBitmap ?? 4n
  const data = encodeFunctionData({
    abi: hubAbi,
    functionName: 'publishKey',
    args: [args.circuits, args.tokenId, 1, args.keyIndex ?? 0, args.publicKeyHex as Hex, chains],
  })
  return { to: HUB_ADDRESS, data }
}

export interface SealCommitmentInput {
  body: string
  open: number
  judgeEndpoint: string
  authorEndpoint: string
  judgePublicKey: Uint8Array
  authorPublicKey: Uint8Array
  authorContainer: Address
  nonce?: string
}

export interface SealedCommitment {
  ref: string
  payload: Uint8Array
  payloadHex: string
  contentKeyNote: string
}

/**
 * Seal a promise commitment. The content key K is fresh random per message
 * (inside seal()); it is NOT returned or stored here. The author must keep
 * the ability to reveal: either hold a recipient slot (author key included)
 * and re-derive K by opening with their secret key, or store K locally.
 * Oathfold stores nothing on a server; the Create page tells the author to
 * keep the reveal material safe.
 */
export function sealCommitment(input: SealCommitmentInput): SealedCommitment {
  const ref = buildCommitmentRef('promise', input.open)
  const content = buildCommitmentContent({
    body: input.body,
    kind: 'promise',
    open: input.open,
    nonce: input.nonce,
    subject: 'Commitment',
  })
  const payload = seal({
    content,
    recipients: [input.judgePublicKey, input.authorPublicKey],
    to: input.judgeEndpoint,
    from: input.authorContainer,
    hub: HUB_ADDRESS,
    ref,
    chainId: XLAYER_CHAIN_ID,
  })
  return {
    ref,
    payload,
    payloadHex: bytesToHex(payload),
    contentKeyNote:
      'K is fresh random inside seal(). Keep your derived key safe: you will need it (or a recipient slot) to reveal.',
  }
}

export function buildSendCalldata(args: {
  circuits: Address
  tokenId: bigint
  toEndpoint: string
  ref: string
  payloadHex: string
}): { to: Address; data: Hex } {
  const data = encodeFunctionData({
    abi: hubAbi,
    functionName: 'send',
    args: [args.circuits, args.tokenId, args.toEndpoint as Hex, args.ref as Hex, args.payloadHex as Hex],
  })
  return { to: HUB_ADDRESS, data }
}

/** Ask the wallet to send a prepared transaction. Returns the tx hash. */
export async function sendTransaction(tx: { to: Address; data: Hex; from: Address }): Promise<string> {
  if (!hasWallet()) throw new Error('No wallet found.')
  const hash = (await window.ethereum!.request({
    method: 'eth_sendTransaction',
    params: [{ from: tx.from, to: tx.to, data: tx.data }],
  })) as string
  return hash
}

export function xlayerExplorerTx(hash: string): string {
  return `https://www.okx.com/web3/explorer/xlayer/tx/${hash}`
}

export function xlayerExplorerAddress(address: string): string {
  return `https://www.okx.com/web3/explorer/xlayer/address/${address}`
}

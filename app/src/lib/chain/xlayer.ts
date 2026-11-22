// X Layer chain access for Oathfold, via viem.
// Chain 196, hub proxy 0xe61A9C7213a6Aa616C246a2B569e555B417b25ee.
// Finality tag for X Layer is "safe" (TAP-10 / TapeKit config).
// Reads try the primary RPC first and fall back to the second RPC on error.
// Nothing here sends a transaction; writes are built in src/lib/wallet.ts and
// signed by the user's wallet.

import {
  createPublicClient,
  defineChain,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'

export const XLAYER_CHAIN_ID = 196
export const XLAYER_RPC_PRIMARY = 'https://rpc.xlayer.tech'
export const XLAYER_RPC_SECONDARY = 'https://xlayerrpc.okx.com'
export const HUB_ADDRESS = '0xe61a9c7213a6aa616c246a2b569e555b417b25ee' as Address
export const HUB_IMPLEMENTATION_XLAYER = '0xdcc57797089ebd9f26e686379a4323f353a3f9c6' as Address
export const HUB_OWNER = '0x571d447f4f24688ec35ccf07f1d6993655f6af15' as Address
export const FACTORY_ADDRESS = '0x1f09daefa827f02cbb40967cc91b259763760761' as Address
export const OPENER_ADDRESS = '0x536add8f30f03b69f6fbf29d425a816a0dc50106' as Address
export const ERC1967_IMPL_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as Hex
export const FINALITY_TAG = 'safe' as const
/** eth_getLogs max range on the X Layer RPCs: 100 blocks. The indexer must chunk. */
export const LOG_RANGE_MAX_BLOCKS = 100

export const xlayerChain = defineChain({
  id: XLAYER_CHAIN_ID,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: [XLAYER_RPC_PRIMARY, XLAYER_RPC_SECONDARY] } },
})

export const hubAbi = parseAbi([
  'function send(address circuits, uint256 tokenId, bytes32 to, bytes32 ref, bytes payload) returns (uint256 inboxIndex)',
  'function publishKey(address circuits, uint256 tokenId, uint8 suite, uint16 keyIndex, bytes32 key, uint64 chains)',
  'function revokeKey(address circuits, uint256 tokenId)',
  'function keyFor(address circuits, uint256 tokenId) view returns (address container, bytes32 endpoint, bool opened, address current, uint8 suite, uint16 keyIndex, bytes32 key, bool usable, uint32 version, uint64 chains)',
  'function inboxCount(bytes32 to) view returns (uint256)',
  'function inboxAt(bytes32 to, uint256 i) view returns (address from, uint256 blockNumber, uint256 timestamp, bytes32 digest)',
  'function inboxPage(bytes32 to, uint256 start, uint256 n) view returns ((address from, uint256 blockNumber, uint256 timestamp, bytes32 digest)[])',
  'function outboxCount(address from) view returns (uint256)',
  'function outboxPage(address from, uint256 start, uint256 n) view returns ((bytes32 to, uint32 inboxIndex, uint256 blockNumber, uint256 timestamp, bytes32 digest)[])',
  'function accountOf(address circuits, uint256 tokenId) view returns (address)',
  'function endpointOf(address container) view returns (bytes32)',
  'function digestOf(bytes32 ref, bytes payload) pure returns (bytes32)',
  'function isSealed() view returns (bool)',
  'function owner() view returns (address)',
  'function payments() view returns (address)',
  'function factory() view returns (address)',
  'function registry() view returns (address)',
  'event Sent(bytes32 indexed to, address indexed from, bytes32 indexed ref, uint256 inboxIndex, uint256 outboxIndex, bytes payload)',
  'event KeyPublished(address indexed container, address indexed holder, uint8 suite, uint16 keyIndex, bytes32 key, uint32 version, uint64 chains)',
  'event KeyRevoked(address indexed container, address indexed holder, uint32 version)',
])

export const factoryAbi = parseAbi([
  'function cpuCount() view returns (uint256)',
  'function cpuAt(uint256 i) view returns (address)',
  'function isCPU(address circuits) view returns (bool)',
])

export const openerAbi = parseAbi([
  'function accountOf(address circuits, uint256 tokenId) view returns (address)',
  'function isOpened(address circuits, uint256 tokenId) view returns (bool)',
])

export const circuitAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function name() view returns (string)',
])

export const paymentsAbi = parseAbi([
  'function paid(address account) view returns (bool)',
])

function makeClient(url: string): PublicClient {
  return createPublicClient({ chain: xlayerChain, transport: http(url) })
}

export const primaryClient = makeClient(XLAYER_RPC_PRIMARY)
export const secondaryClient = makeClient(XLAYER_RPC_SECONDARY)

/** Run a read against the primary RPC, falling back to the secondary on any error. */
export async function readWithFallback<T>(fn: (c: PublicClient) => Promise<T>): Promise<T> {
  try {
    return await fn(primaryClient)
  } catch (e) {
    return await fn(secondaryClient)
  }
}

export interface HubVerification {
  chainId: number
  blockNumber: bigint | null
  safeBlockNumber: bigint | null
  safeBlockTimestamp: number | null
  hub: Address
  implementation: Address | null
  implementationMatches: boolean | null
  isSealed: boolean | null
  owner: Address | null
  error?: string
}

/**
 * Verify the live hub: read the ERC-1967 implementation slot, isSealed() and
 * owner(), plus latest and safe blocks. The slot moved after the pin was set:
 * 2026-11-16 read 0xdCC57797089eBD9f26e686379A4323f353a3F9C6 (the value this
 * file pins), 2026-11-18 read 0xf6b86f44bd039bacc8d3670971d556202d579261 at block
 * 76246532. implementationMatches is therefore false until the pin is
 * re-verified, and the app reports that instead of hiding it. isSealed() stayed
 * false and the owner is unchanged, so the unsealed warning stays too.
 */
export async function verifyHub(): Promise<HubVerification> {
  try {
    const [block, safeBlock, slot, sealed, owner] = await Promise.all([
      readWithFallback((c) => c.getBlock({ blockTag: 'latest' })),
      readWithFallback((c) => c.getBlock({ blockTag: 'safe' })).catch(() => null),
      readWithFallback((c) =>
        c.getStorageAt({ address: HUB_ADDRESS, slot: ERC1967_IMPL_SLOT }),
      ),
      readWithFallback((c) =>
        c.readContract({ address: HUB_ADDRESS, abi: hubAbi, functionName: 'isSealed' }),
      ),
      readWithFallback((c) =>
        c.readContract({ address: HUB_ADDRESS, abi: hubAbi, functionName: 'owner' }),
      ),
    ])
    const impl =
      slot && /^0x0{24}[0-9a-f]{40}$/.test(slot.toLowerCase())
        ? (`0x${slot.slice(-40)}` as Address)
        : null
    return {
      chainId: XLAYER_CHAIN_ID,
      blockNumber: block.number,
      safeBlockNumber: safeBlock ? safeBlock.number : null,
      safeBlockTimestamp: safeBlock ? Number(safeBlock.timestamp) : null,
      hub: HUB_ADDRESS,
      implementation: impl,
      implementationMatches: impl
        ? impl.toLowerCase() === HUB_IMPLEMENTATION_XLAYER.toLowerCase()
        : null,
      isSealed: sealed,
      owner: owner as Address,
    }
  } catch (e: any) {
    return {
      chainId: XLAYER_CHAIN_ID,
      blockNumber: null,
      safeBlockNumber: null,
      safeBlockTimestamp: null,
      hub: HUB_ADDRESS,
      implementation: null,
      implementationMatches: null,
      isSealed: null,
      owner: null,
      error: e?.message ?? String(e),
    }
  }
}

export interface KeyForResult {
  container: Address
  endpoint: Hex
  opened: boolean
  current: Address
  suite: number
  keyIndex: number
  key: Hex
  usable: boolean
  version: number
  chains: bigint
}

export async function keyFor(circuits: Address, tokenId: bigint): Promise<KeyForResult> {
  const r = await readWithFallback((c) =>
    c.readContract({
      address: HUB_ADDRESS,
      abi: hubAbi,
      functionName: 'keyFor',
      args: [circuits, tokenId],
    }),
  )
  const [container, endpoint, opened, current, suite, keyIndex, key, usable, version, chains] = r as unknown as [
    Address, Hex, boolean, Address, number, number, Hex, boolean, number, bigint,
  ]
  return { container, endpoint, opened, current, suite, keyIndex, key, usable, version, chains }
}

export interface EndpointResolution {
  input: string
  status: 'ok' | 'not-opened' | 'no-such-cpu' | 'no-such-token' | 'not-tapeout' | 'error'
  label?: string
  tokenId?: bigint
  cpu?: bigint
  circuits?: Address
  container?: Address
  holder?: Address | null
  opened?: boolean
  endpoint?: Hex
  paid?: boolean
  key?: KeyForResult
  error?: string
}

/** Parse an X Layer endpoint name: #<tokenId>@2.<cpu>, e.g. #1@2.344. Area 2 is X Layer. */
export function parseEndpointName(input: string): { tokenId: bigint; cpu: bigint } | null {
  const m = /^#(\d+)@2\.(\d+)$/.exec(input.trim())
  if (!m) return null
  return { tokenId: BigInt(m[1]), cpu: BigInt(m[2]) }
}

export function endpointIdFor(chainId: number, container: Address): Hex {
  const chainHex = BigInt(chainId).toString(16).padStart(16, '0')
  return (`0x${'0'.repeat(8)}${chainHex}${container.slice(2).toLowerCase()}`) as Hex
}

export function parseEndpointId(id: string): { chainId: number; container: Address } | null {
  const s = id.toLowerCase()
  if (!/^0x0{8}[0-9a-f]{56}$/.test(s)) return null
  const chainId = Number(BigInt('0x' + s.slice(10, 26)))
  const container = ('0x' + s.slice(26)) as Address
  if (chainId === 0 || /^0x0{40}$/.test(container)) return null
  return { chainId, container }
}

/**
 * Resolve an endpoint name (#id@2.cpu) via factory cpuAt + ERC-6551 opener
 * accountOf + ownerOf + payments.paid + hub keyFor, mirroring TAP-10 section 2.3
 * and the TapeKit identity resolver. Also accepts a 32-byte endpoint id hex.
 */
export async function resolveEndpoint(input: string): Promise<EndpointResolution> {
  const trimmed = input.trim()
  try {
    const asEndpoint = parseEndpointId(trimmed)
    if (asEndpoint) {
      if (asEndpoint.chainId !== XLAYER_CHAIN_ID) {
        return { input, status: 'error', error: `endpoint is for chain ${asEndpoint.chainId}, not X Layer (196)` }
      }
      return { input, status: 'ok', container: asEndpoint.container, endpoint: trimmed.toLowerCase() as Hex }
    }
    const parsed = parseEndpointName(trimmed)
    if (!parsed) {
      return {
        input,
        status: 'error',
        error: 'Use an X Layer name like #1@2.344, or a 32-byte endpoint id (0x...).',
      }
    }
    const { tokenId, cpu } = parsed
    const cpuCount = await readWithFallback((c) =>
      c.readContract({ address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'cpuCount' }),
    )
    if (cpu >= cpuCount) {
      return { input, status: 'no-such-cpu', tokenId, cpu, error: `processor ${cpu} does not exist (factory cpuCount is ${cpuCount})` }
    }
    const circuits = (await readWithFallback((c) =>
      c.readContract({ address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'cpuAt', args: [cpu] }),
    )) as Address
    const [container, opened, holder] = await Promise.all([
      readWithFallback((c) =>
        c.readContract({ address: OPENER_ADDRESS, abi: openerAbi, functionName: 'accountOf', args: [circuits, tokenId] }),
      ) as Promise<Address>,
      readWithFallback((c) =>
        c.readContract({ address: OPENER_ADDRESS, abi: openerAbi, functionName: 'isOpened', args: [circuits, tokenId] }),
      ) as Promise<boolean>,
      readWithFallback((c) =>
        c.readContract({ address: circuits, abi: circuitAbi, functionName: 'ownerOf', args: [tokenId] }),
      ).catch(() => null) as Promise<Address | null>,
    ])
    const key = await keyFor(circuits, tokenId)
    const endpoint = endpointIdFor(XLAYER_CHAIN_ID, container)
    if (key.endpoint.toLowerCase() !== endpoint.toLowerCase()) {
      return { input, status: 'error', tokenId, cpu, circuits, container, error: 'hub keyFor endpoint does not match the resolved container' }
    }
    let paid: boolean | undefined
    try {
      const payments = await readWithFallback((c) =>
        c.readContract({ address: HUB_ADDRESS, abi: hubAbi, functionName: 'payments' }),
      )
      paid = await readWithFallback((c) =>
        c.readContract({ address: payments as Address, abi: paymentsAbi, functionName: 'paid', args: [container] }),
      )
    } catch {
      paid = undefined
    }
    return {
      input,
      status: opened ? 'ok' : 'not-opened',
      label: `#${tokenId}@2.${cpu}`,
      tokenId,
      cpu,
      circuits,
      container,
      holder,
      opened,
      endpoint,
      paid,
      key,
    }
  } catch (e: any) {
    return { input, status: 'error', error: e?.shortMessage ?? e?.message ?? String(e) }
  }
}

export interface InboxEntry {
  from: Address
  blockNumber: bigint
  timestamp: number
  digest: Hex
}

export async function inboxAt(to: Hex, index: bigint): Promise<InboxEntry> {
  const r = await readWithFallback((c) =>
    c.readContract({
      address: HUB_ADDRESS,
      abi: hubAbi,
      functionName: 'inboxAt',
      args: [to, index],
    }),
  )
  const [from, blockNumber, timestamp, digest] = r as unknown as [Address, bigint, bigint, Hex]
  return { from, blockNumber, timestamp: Number(timestamp), digest }
}

export async function inboxCount(to: Hex): Promise<bigint> {
  return readWithFallback((c) =>
    c.readContract({ address: HUB_ADDRESS, abi: hubAbi, functionName: 'inboxCount', args: [to] }),
  )
}

export async function outboxCount(from: Address): Promise<bigint> {
  return readWithFallback((c) =>
    c.readContract({ address: HUB_ADDRESS, abi: hubAbi, functionName: 'outboxCount', args: [from] }),
  )
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a
}

export function formatTime(ts: number): string {
  return new Date(ts * 1000).toUTCString()
}

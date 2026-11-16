# Oathfold internal API surface (v1)

Oathfold is a static SPA with no backend and no server-side state. This document
describes the app's internal record and indexer API surface: the functions in
`app/src/lib/chain/xlayer.ts`, `app/src/lib/indexer.ts`, `app/src/lib/records.ts`,
`app/src/lib/store.ts`, `app/src/lib/protocol/tap12.ts`, plus the typed facade in
`app/src/lib/api.ts`. It is the contract the pages (`Landing`, `Dashboard`,
`Create`, `RecordDetail`, `Review`, `Live`, `Trust`) program against. There is no
HTTP API and no external API consumer; "API" here means the in-app module
surface, versioned so a future backend or indexer can adopt the same shapes
without breaking the UI.

Status: v1, current as of 16 November 2026. The graph module described in
section 7 is in progress and is not part of v1 yet.

## 1. Versioning

- The surface is versioned as `v1`. The version constant is `API_VERSION = 'v1'`
  in `src/lib/api.ts`.
- Rules, taken from the api-design-principles skill (version from day one,
  deprecate before removing):
  - Additive changes (new functions, new optional fields, new error codes) do
    not change the version. They are recorded in the changelog below.
  - Breaking changes (renaming a function, changing a return shape, removing an
    error code, changing the finality rule) require a new version (`v2`) and the
    old surface stays available until every page has moved.
  - Local storage cache keys already carry a version suffix
    (`oathfold.live.v1`, `oathfold.demo.v1`); a v2 cache uses new keys and never
    silently reinterprets v1 data.
  - The TAP-12 protocol version is separate from this API version. The protocol
    is the TAP-12 draft (created 2026-09-30) and TAP-10 Draft v1.1; a protocol
    change is not an API version change unless it changes these shapes.

### Changelog

- v1 (16 Nov 2026): initial surface. Chain reads, Sent scan, record build,
  local cache, protocol helpers, and the `OathError` shape.

## 2. Naming conventions

- Resources are nouns: `records`, `messages`, `endpoints`, `keys`, `hub`.
  Functions are verbs on those nouns: `scanSentLogs`, `buildRecords`,
  `resolveEndpoint`, `verifyHub`, `loadLiveRecords`, `saveLiveRecords`.
- No action verbs in resource names and no `getXById` style wrappers; the
  lookup is the noun plus its key, for example `inboxAt(to, index)` and
  `keyFor(circuits, tokenId)`.
- Boolean results are named as predicates: `isSealed`, `usable`, `opened`,
  `final`, `valid`, `designated`.
- All public names use camelCase for functions and PascalCase for types.
  On-chain constants use SCREAMING_SNAKE_CASE (`HUB_ADDRESS`,
  `LOG_RANGE_MAX_BLOCKS`).
- Timestamps are Unix seconds (`number`). Block numbers are `bigint` in chain
  calls and `number` in stored `ChainMessage` records. Hex values are
  lowercase `0x`-prefixed strings.

## 3. Typed request and response shapes

Core types live in `src/lib/records.ts` and `src/lib/protocol/tap12.ts` and are
re-exported by the facade. The shapes below are the contract; fields marked
optional are the only ones a caller may omit.

### 3.1 ChainMessage

```ts
interface ChainMessage {
  chainId: number            // always 196
  hub: string                // hub proxy address, lowercase
  to: string                 // judge endpoint id, 32-byte hex
  from: string               // author container address
  ref: string                // 32-byte SCV1 ref, lowercase hex
  inboxIndex: number
  outboxIndex: number
  payload: string            // 0x hex, sealed or public payload bytes
  txHash: string             // demo records carry a fake zero hash and are labelled DEMO FIXTURE
  blockNumber: number
  blockTimestamp: number     // Unix seconds, filled from inboxAt
  digest: string             // keccak256(ref || keccak256(payload)), filled by verification
  final: boolean             // true only when blockNumber <= safe block at scan time
  senderWallet?: string | null
}
```

### 3.2 OathRecord

```ts
type CommitmentStatus = 'malformed' | 'sealed' | 'due' | 'revealed' | 'unrevealed' | 'judged'
type CommitmentKind = 'promise' | 'forecast'
type VerdictOutcome = 'hit' | 'miss' | 'undecidable'

interface OathRecord {
  commitmentId: string       // TAP-10 message id, 32-byte hex
  kind: CommitmentKind
  open: number               // Unix seconds; reveal is due at this time
  ref: string
  commitment: ChainMessage
  status: CommitmentStatus   // derived per TAP-12 section 7, exactly one value
  malformedReason?: string
  revealedContent: Record<string, any> | null
  reveal: RevealInfo | null
  verdicts: VerdictInfo[]
  source: 'live' | 'demo'
  demoTitle?: string         // demo only
  demoKey?: string           // demo only, localStorage only, never a live key
  demoSecrets?: { judge: string; author: string } // demo only
}
```

`RevealInfo` is `{ message, key, content, verified, error? }` where `key` is
the published content key K (32-byte hex) from a verified reveal, and
`content` is the decrypted commitment content. `VerdictInfo` is
`{ message, outcome, sources, reason?, body, designated, early, key?,
valid, error? }`. A verdict is `designated` only when its sender is the judge
container; all other verdicts are third-party and listed separately.

### 3.3 Hub verification

`verifyHub(): Promise<HubVerification>` returns:

```ts
interface HubVerification {
  chainId: number            // 196
  blockNumber: bigint | null
  safeBlockNumber: bigint | null
  safeBlockTimestamp: number | null
  hub: Address
  implementation: Address | null
  implementationMatches: boolean | null
  isSealed: boolean | null   // false on 16 Nov 2026; the UI must warn
  owner: Address | null
  error?: string
}
```

Null fields mean the read failed, not that the value is zero. A failed
verification is never presented as a passed check.

### 3.4 Endpoint resolution

`resolveEndpoint(input: string): Promise<EndpointResolution>` accepts an
endpoint name (`#<tokenId>@2.<cpu>`, for example `#1@2.344`) or a 32-byte
endpoint id hex. It returns:

```ts
interface EndpointResolution {
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
```

`keyFor(circuits, tokenId): Promise<KeyForResult>` returns
`{ container, endpoint, opened, current, suite, keyIndex, key, usable,
version, chains }`. A key is usable only when `usable` is true; `opened`
false or `usable` false is a blocker, not a retryable error.

### 3.5 Scan request and response

`scanSentLogs(opts: ScanOptions): Promise<ScanResult>` where:

```ts
interface ScanOptions {
  fromBlock: bigint
  toBlock: bigint
  onProgress?: (done: number, total: number) => void
}

interface ScanResult {
  messages: ChainMessage[]   // raw, unverified; verification is buildRecords
  safeBlock: bigint | null
  safeTimestamp: number | null
  fromBlock: bigint
  toBlock: bigint
  chunks: number
  discarded: { reason: string; count: number }[]
}
```

`buildRecords(messages, safeBlock, now): Promise<{ records: OathRecord[];
discarded: { reason: string; count: number }[] }>` verifies each tagged
message against `inboxAt` and its digest, groups by commitmentId, attaches
verified reveals and verdicts, and derives status. `now` is the pinned
safe-block time, never the wall clock. Every discarded message is counted
under a reason string; nothing is dropped silently.

### 3.6 Local cache

`store.ts` is a cache, never a source of truth. The chain is the source of
truth; any cached record can be rebuilt by re-scanning.

```ts
interface LiveMeta {
  fromBlock: string
  toBlock: string
  safeBlock: string | null
  scannedAt: number
  chunks: number
  discarded: { reason: string; count: number }[]
}

loadDemoRecords(): OathRecord[]
rebuildDemoRecords(): OathRecord[]
loadLiveRecords(): { records: OathRecord[]; meta: LiveMeta | null }
saveLiveRecords(records: OathRecord[], meta: LiveMeta): void
clearLiveCache(): void
saveDemoRecord(record: OathRecord): OathRecord[]
```

Cache keys are `oathfold.demo.v1`, `oathfold.live.v1`,
`oathfold.live.meta.v1`. Corrupt cache entries are ignored and rebuilt, never
surfaced as record data.

### 3.7 Protocol helpers (tap12.ts)

Pure functions, no chain access, no side effects:

- `buildCommitmentRef(kind, open): string`, `buildLinkedRef(type,
  commitmentIdHex): string`, `parseRef(ref): ParsedRef`
- `commitmentId(chainId, hub, toEndpoint, inboxIndex): string`
- `digestOf(ref, payload): string`, `verifyDigest(ref, payload,
  expectedDigest): boolean`
- `deriveStatus({ malformed, revealed, judged, open, now }):
  CommitmentStatus`, `statusLabel(status)`, `statusExplain(status, open)`
- `buildCommitmentContent`, `buildRevealContent`, `buildVerdictContent`
- `validateCommitmentContent(obj, refInfo): string[]`,
  `validateRevealContent(obj): string[]`, `validateVerdictContent(obj):
  string[]` (empty array means valid)
- `verifyRevealWithKey(input): RevealVerifyResult` (TAP-12 section 4.4)
- `checkVerdictRules(input): { errors: string[]; early: boolean }`
  (TAP-12 section 5)

## 4. Error shape

Every failure that crosses a module boundary uses one shape. Functions that
already return a result object with an `error` field (for example
`verifyHub`, `resolveEndpoint`) keep that field; the facade and any new code
throw or return `OathError` in this shape:

```ts
interface OathErrorShape {
  code: OathErrorCode
  message: string
  recoverable: boolean
  source: 'chain' | 'rpc' | 'protocol' | 'wallet' | 'cache' | 'input'
}
```

`OathError` (in `src/lib/api.ts`) is an `Error` subclass carrying `code`,
`recoverable`, and `source`. `recoverable` is true only when retrying the same
call later, or fixing the named input, can succeed. A missing container, an
unusable key, or a digest mismatch is never recoverable by retrying.

### Error codes

| Code | Meaning | Recoverable | Source |
| --- | --- | --- | --- |
| `wrong-chain` | Wallet or endpoint is not on X Layer chain 196 | Yes, after switching chain | `wallet` |
| `hub-changed` | Hub implementation slot does not match the pinned X Layer implementation `0xdCC57797089eBD9f26e686379A4323f353a3F9C6` | No | `chain` |
| `not-opened` | Container exists but is not opened (paid) | Yes, after opening the container | `chain` |
| `no-usable-key` | No published, usable TapeSend key for the endpoint | Yes, after publishing a key | `chain` |
| `stale-block` | Safe block is missing or older than the scan expects; pinned reads cannot be trusted yet | Yes, retry later | `rpc` |
| `unavailable` | RPC read failed on both endpoints, or a read threw an unexpected error | Yes, retry later | `rpc` |
| `digest-mismatch` | `digestOf(ref, payload)` does not equal the `inboxAt` digest | No | `protocol` |
| `not-final` | Message block is above the safe block; pending is never a final record | Yes, after safe finality | `chain` |
| `malformed-record` | Ref, payload, or revealed content breaks TAP-12 (bad kind byte, reserved bytes, unsealed commitment payload, content failing section 3.4) | No | `protocol` |
| `invalid-endpoint` | Endpoint name or id does not parse (`#id@2.cpu` or 32-byte hex) | Yes, after fixing the input | `input` |
| `unknown` | Anything else; the original message is preserved in `message` | Depends on the cause | `chain` |

Rules:

- The `message` is written for the user who must act on it: it names the
  blocker and the next step, never a raw stack trace.
- The `code` is stable across releases. New codes are added, never renamed;
  renaming a code is a breaking change under section 1.
- `source` names where the failure was detected, so the UI can say whether
  the chain, the RPC, the wallet, or the input is at fault. It never names a
  person.
- Verification failures (`digest-mismatch`, `malformed-record`,
  `hub-changed`) are shown as failed verification, never hidden and never
  retried as if the data might become valid.

## 5. Pagination

Chain reads are paginated by block range, not by page number, because the
data source is `eth_getLogs` and the record identity depends on block order.

- The RPC limit is 100 blocks per `eth_getLogs` call on `rpc.xlayer.tech`
  (`LOG_RANGE_MAX_BLOCKS = 100`). Every scan chunks its range into
  100-block windows. A wider range is never requested in one call.
- The cursor is the last scanned block: a scan page is
  `{ fromBlock, toBlock }` with `toBlock - fromBlock <= 99`, and the next
  cursor is `toBlock + 1`. The facade exposes `scanPage({ cursor, toBlock,
  onProgress })`, which scans exactly one 100-block window from the cursor,
  and `nextCursorAfter(result)` which returns `toBlock + 1`; the caller stops
  when the cursor passes its own overall end block.
- A scan response always reports `fromBlock`, `toBlock`, `chunks`,
  `safeBlock`, and `discarded` counts, so a caller can resume from the
  cursor after an interruption without re-scanning finished windows.
- There is no offset pagination and no page-size parameter for records: the
  record set is the verified output of a block range, and re-scanning the
  same range is idempotent because verification is deterministic.
- `inboxPage` and `outboxPage` (hub view functions) are the per-endpoint
  paging primitives for inbox and outbox entries; they take a start index
  and a count and are the only place a count-based page exists.

## 6. Safe-finality guarantees

- Only messages at or below the safe block count as final records. This is
  the TAP-12 section 6 rule and the app's decision 6 in
  `docs/decisions.md`. A reorg can change the inbox index and therefore the
  commitmentId, so nothing is recorded until safe finality.
- `scanSentLogs` reads the safe block first and returns it in every
  `ScanResult`. `buildRecords` marks each message `final` only when
  `blockNumber <= safeBlock`; messages above the safe block are discarded
  with the reason `not yet at safe finality (pending, not a final record)`
  and the error code `not-final`.
- When the safe block cannot be read (`safeBlock` is `null`), no message is
  final. The scan still returns raw messages, but `buildRecords` treats them
  all as pending.
- The Create flow waits for the send block to reach safe finality before
  deriving a commitmentId or saving the record. The status derivation uses
  the pinned safe-block time as `now`, never the wall clock.
- Finality is a property of the record, not of the UI: `ChainMessage.final`
  is set by the indexer and stored with the record, so a cached record
  never becomes "more final" than the scan that produced it.

## 7. Graph module (in progress)

`src/lib/graph/` is being built in parallel and is not part of v1. Its
intended public functions are recorded here so callers and the facade can
rely on the names and shapes once it lands. Do not import from
`src/lib/graph/` until the module exists; the facade defines the intended
`GraphApi` interface only, with no implementation.

| Function | Intended purpose |
| --- | --- |
| `authorHistory(author)` | All records sent by one author container, newest first |
| `judgeHistory(judge)` | All records judged by one judge endpoint, with outcomes |
| `evidenceGraph(commitmentId)` | The commitment, its reveal, and its verdicts as one linked graph |
| `relatedCommitments(commitmentId)` | Other records sharing the author, judge, or subject |
| `programGraph()` | The whole record set as a graph (authors, judges, records, verdicts) |
| `answerAuthorRecord(...)` | The record behind one author answer, for verification |

Intended rules for the graph module: it reads only verified `OathRecord`
values produced by `buildRecords`; it never re-verifies chain data itself,
never trusts demo records as live records, and never includes sealed
plaintext or content keys (see section 8). Its functions return the same
`OathError` shape on failure.

## 8. No-leak rule

Sealed plaintext and content keys never leave the client.

- The sealed commitment content (the claim text) exists only inside the
  sealed payload until a verified reveal publishes K. The app never
  decrypts a sealed payload without a published K, and never stores
  plaintext for a sealed record.
- Content keys (K) are never returned by any API function except as the
  published `key` field of a verified `RevealInfo` or `VerdictInfo`, which
  is data already published on chain by the author or judge. Demo keys
  (`demoKey`, `demoSecrets`) exist only in localStorage for demo fixtures
  and are never sent anywhere.
- No API return value and no log line contains sealed plaintext, a content
  key that is not already published on chain, a wallet private key, or a
  `personal_sign` signature. The wallet private key is never visible to the
  app at all; signing happens in the user's wallet.
- The `personal_sign` signature used for TAP-10 key derivation is used once
  to derive the key and is never stored.
- If a future function needs to log a failure, it logs the error code, the
  commitmentId or ref, and the block number only.

## 9. What this surface does not do

- No token, no NFT, no escrow, no payments, no AI-generated verdicts. The
  brief and decision 10 in `docs/decisions.md` exclude them, and no function
  in this surface creates them.
- No transaction is sent by any function in this surface. Writes
  (`publishKey`, `hub.send`) are built in `src/lib/wallet.ts` and signed by
  the user in their own wallet. The indexer and chain-read functions are
  read-only.
- No record is invented. A send that did not happen has no tx hash and no
  commitmentId anywhere in the API.

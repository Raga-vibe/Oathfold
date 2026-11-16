# Oathfold state machines

16 November 2026. One shared module, `app/src/lib/machines.ts`, plus
`app/src/lib/machines.test.ts` (52 tests). Hand-rolled, zero-dependency: typed
discriminated unions, exhaustive switches, no boolean soup, no xstate.

## Why one module

Before this round the app inferred state from two or more booleans,
timestamps, nullable fields, or a chain read, in a different way on every
page. The same fact had several names: the hub was `hub === null ? 'Hub
check…' : …` in App.tsx and a different local copy in Live.tsx, and the two
disagreed (one said "Hub check failed", the other "Hub check pending"). The
send flow kept a `Step` union plus a separate `busy` boolean plus a `blocker`
string that could desync. The Connect button stayed live during connect and
could be double-clicked. An illegal verdict (hit on an unrevealed record) only
failed at build time.

One module fixes all of that at once:

- **UX:** the user sees the state in plain words where they are waiting
  (send stepper, scan state, key readiness, hub state), and illegal actions
  are disabled with the reason, never a dead button.
- **DX:** one import, one name per fact. A page reads `deriveHubState(hub,
  busy)` instead of rebuilding the display string from a nullable object.
  Guards are tested once, in the module, instead of re-checked per page.
- **AX (agent experience):** an agent reading the app, or a future agent
  writing a page, reads one field instead of re-inferring a state from two
  booleans. The transition functions are the spec: state + event -> next
  state, or an explicit rejection with a reason string.

## Why hand-rolled, not xstate

The app has no state-machine dependency and does not need one. Sixteen
machines, each a union type plus one switch, fit in one file with no runtime
cost, no new build step, and no API to learn. The Podium pattern (one shared
module, same shape) already proved this works for this team. If a machine
ever grows async side effects or nested states, that is the moment to revisit,
not before.

## Conventions

- Every machine: a named union type of states, one explicit transition
  function `transitionX(state, event) -> { ok: true, state } | { ok: false,
  state, reason }`. A rejected transition keeps the old state and names why.
- Where a machine is derived from chain data, one pure `deriveX(...)`
  function computes the named state from the raw inputs. The UI and any agent
  read one field instead of re-inferring it.
- Machine state is derived, never stored on chain and never a new stored
  shape. `tap12.ts` keeps the protocol semantics (`deriveStatus`,
  `checkVerdictRules`); the machines re-expose them through one import.
- Terminal states have no exit: `done` in the send flow, `judged` in the
  commitment lifecycle, `malformed` once found.

## Inventory

### 1. Commitment lifecycle — `CommitmentState`

States: `sealed | due | unrevealed | revealed | judged | malformed`.
Derived by `deriveCommitmentState({ open, now, reveal, verdicts })`, which
wraps `deriveStatus` from `tap12.ts` (open time, 7-day grace G=604800s, reveal
and verdicts). Transitions: `transitionCommitment(state, event)` with events
`tick | reveal-published | reveal-verified | designated-verdict |
malformed-found`. Guards: `canReveal` is true only for sealed/due/unrevealed;
`allowedVerdictOutcomes` returns `['hit', 'miss', 'undecidable']` only for
revealed/judged, otherwise `['undecidable']` only; no transition out of
`judged` or `malformed` except `tick` staying in place.

Before: `deriveStatus` computed the status, but the UI re-inferred it
everywhere (`record.reveal ? … : 'Not yet'`, `verdicts.some(v =>
v.designated && v.valid)`, Review queue filtering on three status strings).
Now: one derived state. Records carry it in `record.status`, computed at
build/index time by the indexer and the demo builder through `deriveStatus`,
which `deriveCommitmentState` wraps; Dashboard filters, the RecordDetail
verdict line and the Review queue all read that one field. The transition
function is the spec for event-driven updates and is covered by tests.

### 2. Wallet connection — `WalletPhase`

States: `disconnected | connecting | connected-wrong-chain | switching |
ready | error`. Transition `transitionWallet(state, event)` with events
`connect-start | connect-ok { chainId } | connect-fail { error } |
switch-start | switch-ok | switch-fail { error } | disconnect`. Derived by
`deriveWalletState(wallet, flight)` from the stored wallet plus the in-flight
flag. Guards: `connect-ok` on the wrong chain lands in
`connected-wrong-chain`, not `ready`; `ready` requires chain 196.

Before: App.tsx kept `connected: boolean`, `chainId: number | null` and
`error?: string` with no in-flight state, so the Connect button stayed live
during connect and could be double-clicked. Now: the button is disabled while
connecting/switching and shows the phase label ("Connecting…", "Switching to
X Layer…").

### 3. Live send flow — `SendState`

States: `form | resolving | deriving | publishing | sealing | sending |
confirming | done | blocked`. Transition `transitionSend(state, event)` with
events `start | resolved { readiness } | derived | published | sealed | sent |
confirmed | fail { reason } | reset`. `SEND_STEPS` is the ordered step list
for the UI stepper; `sendStepLabel` / `sendStepIndex` render it;
`sendIsBusy` is derived (every state except `form`, `done`, `blocked`).
Guards: `start` is rejected from any state other than `form`; `blocked` is
terminal until `reset`; `done` has no exit.

Before: a `Step` union plus a separate `busy` boolean plus a `blocker` string
that could desync (busy true while step was `blocked`, blocker set without a
step change). Now: one state, busy and the blocker are derived. Used by
Create.tsx as a compact stepper with a sticky bottom action bar; the send
button is disabled with the blocker named in one line.

### 4. Key readiness — `KeyReadiness`

States: `unknown | checking | usable | not-opened | no-key | stale |
mismatch | error`. Transition `transitionKeyReadiness(state, event)` with
events `check-start | resolved { resolution } | key-compared { matches } |
key-revoked`. Derived by `deriveKeyReadiness(resolution)` from the endpoint
resolution: `ok` + opened + usable key -> `usable`; `ok` + not opened ->
`not-opened`; `ok` + opened + no usable key -> `no-key`; `not-opened` ->
`not-opened`; `no-such-cpu | no-such-token | not-tapeout | error` -> `error`.
Guards: a derived key can only be compared once a usable key exists
(otherwise the comparison is rejected); a revoked key moves `usable`/`mismatch`
to `stale`, never back to `unknown`.

Before: Create.tsx re-read `resolution.status`, `opened` and `key.usable`
inline in several places. Now: one named readiness with a label
(`keyReadinessLabel`), used in the Create form's one-line blocker.

### 5. Reveal flow — `RevealState`

States: `none | published | verifying | verified | invalid`. Transition
`transitionReveal(state, event)` with events `publish-key | verify-start |
verify-ok | verify-fail`. Derived by `deriveRevealState(record)` from the
stored reveal info: no reveal -> `none`; reveal with verified content ->
`verified`; reveal that fails K decryption -> `invalid`.

Before: the indexer verified reveals in five inline steps and the UI only
knew `record.reveal ? … : 'Not yet'`. Now: one named reveal state per record,
shown on RecordDetail next to the verdict line ("Reveal: none/published/
verified/invalid").

### 6. Verdict draft flow — `VerdictDraftState`

States: `idle | editing | invalid | ready`. Transition
`transitionVerdictDraft(state, event)` with events `edit | set-outcome {
outcome, revealed } | build { valid, errors } | reset | select-record`.
Guards: `set-outcome` with `hit`/`miss` on an unrevealed record is rejected
with "An unrevealed commitment can only receive undecidable."; `build` from
`idle` is rejected ("Nothing to build: edit the verdict first.").
`draftAllowedOutcomes(revealed)` returns `['hit', 'miss', 'undecidable']` when
revealed, `['undecidable']` only when not.

Before: Review.tsx held an outcome select plus a `checkVerdictRules` call,
with the illegal hit/miss-on-unrevealed choice only failing at build time.
Now: the machine rejects the illegal outcome at selection time, the select
only offers legal outcomes, and the draft is either ready or invalid, never
both. The Review page also uses the machine to build the draft and shows its
state in the sticky action bar.

### 7. Indexer scan — `ScanState`

States: `idle | scanning | verifying | done | failed`. Transition
`transitionScan(state, event)` with events `start | progress { done, total }
| verified { chunks } | complete | fail | reset`. Progress lives in
`ScanContext { done, total, chunks }`, rendered by `scanProgressLabel`
("3/20 blocks"), never stored as a string. Guards: `start` only from
`idle`/`done`/`failed`; `progress` only while `scanning`; `complete` only
from `verifying`; `fail` rejected from `idle`.

Before: a `scanBusy` boolean plus a `scanProgress` string ("done/total") plus
a free-form log. Now: one state with numeric progress in context. Used by
Live.tsx ("Scan: idle/scanning 3/20 blocks/verifying/done/failed").

### 8. Hub verification — `HubState`

States: `unknown | checking | verified-sealed | verified-unsealed | mismatch
| error`. Transition `transitionHub(state, event)` with events `check-start |
checked { verification } | check-fail`. Derived by `deriveHubState
(verification, checking)` from the `HubVerification` object: checking ->
`checking`; null -> `unknown`; `error` set -> `error`; implementation
mismatch -> `mismatch`; `isSealed` true -> `verified-sealed`, false ->
`verified-unsealed`. Labels via `hubStateLabel` ("Hub check pending",
"Checking hub…", "Hub sealed", "Hub not sealed", "Hub implementation
mismatch", "Hub check failed").

Before: `hub: HubVerification | null` plus `hubBusy`, and App.tsx re-built
the display string inline. Now: one named state, shared by the App status
strip, the Landing "Checked live" line, and the Live page. This also fixed a
real divergence found in this round: Live kept its own local copy of the hub
object and showed "Hub check pending" while the strip said "Hub check
failed". Live now reads `hub ?? state.hub` (the App value until its own
re-check replaces it), so both readers show one state.

### 9. Endpoint lookup — `LookupState`

States: `idle | looking | ready | partial | failed`. Transition
`transitionLookup(state, event)` with events `lookup-start | lookup-done {
report } | lookup-fail`. Derived by `deriveLookupState(report)` from
`LookupReport { keyOk, inboxOk, outboxOk }`: all three ok -> `ready`; none
ok -> `failed`; anything in between -> `partial`.

Before: five separate pieces of state (`lookup`, `lookupBusy`, `lookupKey`,
`lookupInbox`, `lookupOutbox`), each nullable, so partial results (key read
failed but inbox read worked) had no name. Now: one state with a per-field
report, used on the Live page.

### 10. Demo fixture store — `DemoStoreState`

States: `unknown | cached | rebuilt | unavailable`. Transition
`transitionDemoStore(state, event)` with events `load { fromCache } |
rebuild | save | unavailable`.

Before: `loadDemoRecords` silently rebuilt from cache or from scratch and
the UI could not tell which. Now: the load result names its own state.

### 11. Graph build — `GraphState`

States: `empty | building | ready`. Transition `transitionGraph(state,
event)` with events `build-start | build-done { nodes }`. Derived by
`deriveGraphState(graph)`: null or zero nodes -> `empty`, otherwise `ready`.

Before: `useMemo(() => buildGraph(records))` with no named state; panels
inferred emptiness from `history.total === 0` each. Now: one derived state.

### 12. Record lookup — `RecordLookupState`

States: `found | not-found`. Derived by `deriveRecordLookupState(record)`.

Before: `records.find(…)` returning undefined, rendered as a "not found"
branch with no name. Now: the lookup result is a named state, used by
RecordDetail.

### 13. Disclosure — `DisclosureState`

States: `closed | open`. Transition `transitionDisclosure(state, event)`
with events `toggle | open | close`. Reused by every collapsible panel:
RecordDetail raw ref/payload, graph context, verification; Dashboard track
records; Review graph context.

Before: scattered `showX` booleans, each with its own toggle handler. Now:
one toggle machine.

### 14. Route — `RouteMachineState`

State: `{ route: RouteName, recordId: string | null, menu:
DisclosureState }`, where `RouteName = landing | dashboard | create | record
| review | live | trust`. Transition `transitionRoute(state, event)` with
events `navigate { route, recordId? } | unknown-hash | toggle-menu |
close-menu`. Guards: navigating to `record` without an id is rejected ("The
record route needs a commitment id."); every navigation closes the menu;
an unknown hash lands on landing with a named rule instead of silently.

Before: `parseHash` already mapped hashes to a Route union, but the menu
open/closed boolean lived beside it and an unknown hash silently became
landing with no named rule. Now: one machine for route + menu, used by
App.tsx (the menu uses the disclosure machine inside it).

### 15. Live cache — `LiveCacheState`

States: `empty | cached`. Transition `transitionLiveCache(state, event)`
with events `scan-saved | cleared`. Derived by `deriveLiveCacheState(meta)`
from the stored scan meta.

Before: the "Last scan" block in Live.tsx read the stored meta directly with
no name for the empty case. Now: the block names its state.

### 16. Form validity — `FormState`

States: `pristine | editing | valid | invalid`. Transition
`transitionForm(state, event)` with events `edit | submit { errors } |
reset`. Derived by `deriveFormState(attempted, errors)`: not attempted ->
`pristine`; attempted with no errors -> `valid`; attempted with errors ->
`invalid`.

Before: `validate()` ran only on submit and `errors: string[]` carried no
record of whether the user had tried. Now: the UI stays quiet until the
first submit attempt, and the send guard reads `form === 'valid'`.

## Cross-machine guard

`sendPrerequisitesMet({ wallet, authorKey, judgeKey, form })` is the one
place that answers "can a live send start?" It returns `{ ok, blockers }`
with a blocker string per unmet prerequisite: wallet not `ready`, author key
not `usable`, judge key not `usable`, form not `valid`. Create, the docs and
any agent check the same rule. `verdictRulesFor` re-exposes
`checkVerdictRules` through the module so callers have one import.

## Where each machine is wired

| Machine | Wired in |
| --- | --- |
| 1 Commitment lifecycle | Read via `record.status`, the stored derived state, in Dashboard filters, RecordDetail verdict line, Review queue; transition function is the tested spec |
| 2 Wallet connection | App.tsx Connect button (disabled while connecting/switching, phase label) |
| 3 Live send flow | Create.tsx stepper + sticky action bar |
| 4 Key readiness | Create.tsx one-line blocker |
| 5 Reveal flow | RecordDetail verdict/reveal line |
| 6 Verdict draft flow | Review.tsx outcome select, draft build, action bar |
| 7 Indexer scan | Live.tsx scan section |
| 8 Hub verification | App.tsx status strip, Landing checked line, Live.tsx hub section |
| 9 Endpoint lookup | Live.tsx lookup section |
| 10 Demo fixture store | Defined + tested; load result not surfaced in UI (invisible by design, see below) |
| 11 Graph build | Dashboard: gates the track-records toggle on `graphState === 'ready'` |
| 12 Record lookup | RecordDetail not-found branch |
| 13 Disclosure | RecordDetail, Dashboard, Review toggles |
| 14 Route | App.tsx: one `routeState` for navigation + mobile menu; unknown hash lands on landing by a named rule |
| 15 Live cache | Live.tsx "Last scan" block |
| 16 Form validity | Create.tsx submit gating |

## Tests

`machines.test.ts`: 52 tests, one `describe` per machine plus one for the
cross-machine send prerequisites. Each machine's block covers every state,
every legal transition, and every guard rejection. Total suite after this
round: 97 tests (45 before: 25 protocol + 3 demo + 17 graph; 52 new).

## Deliberately left implicit

- **The vendored TapeKit send module** (`src/lib/tapeout/send/`): untouched,
  per the build rules. It has no state machine of its own in the app; its
  functions are pure.
- **The reveal K decryption steps** inside the indexer: they are five inline
  verification steps, but they are a linear check, not a stateful flow; the
  reveal machine (5) names the outcome, which is what the UI needs.
- **Graph build progress**: `buildGraph` is synchronous and fast; there is
  no `building` state observable in the UI, so the `building` state exists in
  the transition function for completeness but the derived state only ever
  returns `empty`/`ready`. If graph building ever becomes async, the derived
  function is the place to surface it.
- **Demo store state in the UI**: the state is named and transitioned, but
  no page displays it yet; the demo records either load or the page shows the
  empty state, and a separate indicator would be noise.

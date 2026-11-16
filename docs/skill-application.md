# Skill application record: Oathfold round, 16 November 2026

This file records which installed skills in `~/workspace/custom-skills/` were
applied in this round of Oathfold work, how, and which installed skills do not
fit this project. Written by the API and slides subagent. Work done by the
parallel design agent is recorded as an assignment only; it is not claimed
here as this agent's work, and its output was not verified in this round.

Scope of this round for this agent: `docs/architecture.md` (API section
added), `docs/api-surface.md` (new),
`docs/skill-application.md` (this file), and
`app/src/lib/api.ts` (new). No other app file was edited, no UI file was
touched, nothing was pushed to GitHub, and nothing was deployed. No pitch
deck was written: the founder corrected the brief in this round to drop the
deck as a deliverable, so no deck file exists anywhere in the workspace.

## The 11 named skills

### 1. api-design-principles: APPLIED by this agent

Applied in full to Task 1. What was taken from the skill and where it landed:

- Versioning from day one (`SKILL.md` section 3 and `references/details.md`
  Pattern 1): the surface is versioned as v1 (`API_VERSION = 'v1'` in
  `src/lib/api.ts`), with the rule that additive changes keep v1 and breaking
  changes (renamed function, changed return shape, removed error code,
  changed finality rule) require v2. Local storage cache keys already carry
  the version suffix (`oathfold.live.v1`), and the doc records that.
- Resource-oriented naming (Pattern 1): resources are nouns (`records`,
  `messages`, `endpoints`, `keys`, `hub`); functions are verbs on those
  nouns (`scanSentLogs`, `buildRecords`, `resolveEndpoint`, `verifyHub`).
  No action-verb endpoints and no `getXById` wrappers.
- Pagination (Pattern 2): cursor-based pagination adapted to the data
  source. The data source is `eth_getLogs`, so the cursor is the last
  scanned block and a page is one 100-block window (the RPC limit on
  `rpc.xlayer.tech`). The facade exposes `scanPage({ cursor, toBlock })`
  and `nextCursorAfter(result)`. Offset pagination was deliberately not
  used: the record set is the verified output of a block range, and
  re-scanning the same range is idempotent.
- Consistent error format (Pattern 3): one error shape for the whole
  surface, `{ code, message, recoverable, source }`, carried by the
  `OathError` class in `src/lib/api.ts`. Eleven named codes are defined:
  `wrong-chain`, `hub-changed`, `not-opened`, `no-usable-key`,
  `stale-block`, `unavailable`, `digest-mismatch`, `not-final`,
  `malformed-record`, `invalid-endpoint`, `unknown`. `recoverable` is true
  only when retrying or fixing the named input can succeed. The doc states
  that codes are stable and renaming one is a breaking change.
- Typed request and response shapes: the doc specifies `ChainMessage`,
  `OathRecord`, `HubVerification`, `EndpointResolution`, `ScanOptions`,
  `ScanResult`, and `LiveMeta`, with the protocol helpers from `tap12.ts`
  listed as pure functions.
- GraphQL patterns from the skill were not used: Oathfold has no HTTP API,
  no server, and no GraphQL endpoint. The skill's schema-first and
  DataLoader ideas were adapted, not adopted: the `GraphApi` interface in
  the facade records the intended graph functions as a typed contract with
  no implementation, which is the schema-first idea applied to an in-app
  module that does not exist yet.
- The skill's REST guidance was adapted, not copied literally: there are no
  HTTP methods or status codes here because there is no server. The doc
  says so explicitly in its introduction.

Output: `docs/api-surface.md`, `app/src/lib/api.ts`, and the API section
added to `docs/architecture.md`.

### 2. slides: NOT used, at the founder's word

Not used. The original brief asked for a pitch deck from this skill, and a
draft deck was written, but the founder corrected the brief in this round:
drop the slides deck as a separate deliverable, do not create
`docs/oathfold-pitch-deck.md`, and do not write a pitch deck anywhere else.
The deck file was removed (moved to recoverable trash) and no deck content
was written anywhere else. The priority is a working and clean UI/UX only.
The slides skill therefore counts as explicitly not used in this round, at
the founder's word, not because it does not fit Oathfold in general: a
submission deck is a normal use of the skill, and it would fit a future
round if the founder asks for one again.

### 3. ui-ux-pro-max: NOT applied by this agent in this round

Not applied. This round's file ownership forbade editing any UI file
(`src/pages/`, `src/index.css`), and the work was API documentation, a
typed facade, and a markdown deck. There was no interface decision to make.
It fits Oathfold in general (the app has seven pages and a design direction
in `docs/decisions.md`), and it would be the right skill for a future round
that changes the Create flow, the dashboard, or the verification drawer.
It was not used here because no UI changed.

### 4. ui-styling: NOT applied by this agent in this round

Not applied, for the same reason as ui-ux-pro-max: no styling file was in
this round's ownership and no class or token changed. It fits a future
styling round on `src/index.css` and the components in
`src/components/ui.tsx`. It did not fit this round.

### 5. design: ASSIGNED to the parallel design agent in this round

Recorded as an assignment only. The task for this round assigned the design
family (design, brand) to the parallel design agent working in the same
round. This agent did not apply the design skill, did not read that agent's
output, and does not claim its work. Verify against that agent's own report,
not this file.

### 6. design-system: NOT applied by this agent in this round

Not applied. No design token, component, or system decision was in this
round's ownership. It fits Oathfold as a project (the app has a token set
in `src/index.css` and shared components in `src/components/ui.tsx`), and
it would fit a round that formalises those tokens. It did not fit this
round because this round changed no component or token.

### 7. brand: ASSIGNED to the parallel design agent in this round

Recorded as an assignment only, same as design above. Assigned to the
parallel design agent in this same round; this agent did not apply the
brand skill and does not claim that agent's work. Verify against that
agent's own report.

### 8. banner-design: NOT used, at the founder's word

Not used. The original brief assigned the design family (design, brand,
banner-design) to the parallel design agent, but the founder's correction
in this round states banner-design explicitly as not used, and the priority
is a working and clean UI/UX only. This agent did not apply the
banner-design skill and does not claim any banner work. No banner was made
in this round by this agent.

### 9. frontend-design: NOT applied by this agent in this round

Not applied. This is a frontend design skill for building interfaces, and
this round built no interface: the facade is a TypeScript module, the deck
is a markdown draft, and the API doc is prose. It fits future Oathfold UI
work (new pages, the reviewer console, the Live page). It did not fit this
round.

### 10. taste-skill: NOT applied by this agent in this round

Not applied. This is a frontend taste and anti-slop skill for interface
work, and this round changed no interface. It fits future Oathfold UI
rounds, where the app's restrained direction (deep ink and graphite, one
blue accent, status by text plus icon dot, never colour alone, per
`docs/decisions.md`) is exactly the kind of direction this skill supports.
It did not fit this round.

### 11. responsive-design: NOT applied by this agent in this round

Not applied. No layout or breakpoint changed in this round, and the deck is
a markdown draft, not a responsive page. It fits future Oathfold UI work:
the app is used on desktop and on phones, and the submission will be judged
partly on mobile. It did not fit this round.

## Skills present in ~/workspace/custom-skills/ that do NOT fit Oathfold

These are installed for other work. None was used in this round. Each entry
states why it does not fit and what would change that.

### three-js

Why it does not fit: Oathfold is a static SPA of forms, tables, and record
pages. It has no 3D scene, no WebGL or WebGPU canvas, no game, and no
spatial visualisation. Adding a 3D view would add a dependency and a render
cost for no user benefit.
What would change that: a real need for a 3D view, for example a 3D graph
of the commitment network if the graph module grows into something a flat
list cannot show. A flat list is enough today, so this stays out.

### Remotion skills (remotion-best-practices, remotion-captions, remotion-create, remotion-docs, remotion-interactivity, remotion-license, remotion-maps, remotion-markup, remotion-multimedia, remotion-render, remotion-saas, remotion-studio, remotion-upgrade)

Why they do not fit: these are code-based video creation skills for React
(building and rendering motion videos). Oathfold needs at most one demo
video of at most 3 minutes for the submission, which is a screen recording
with narration, not a programmatic motion-graphics project. Building the
demo as a Remotion project would be slower than recording the app, and the
video is a submission artefact, not part of the product.
What would change that: a decision to produce a polished animated
explainer or a recurring video series about Oathfold. A single screen
recording does not justify it.

### grok_x_search

Why it does not fit: this skill searches X (Twitter) via the Grok Build
CLI. Oathfold's data comes from the X Layer chain (hub reads, `Sent` logs,
`inboxAt`, digests), not from social media. No Oathfold feature reads X,
and no submission claim depends on an X search.
What would change that: a feature that genuinely needs X data, for example
verifying a public claim that was first posted on X. That is not in the
current scope, and the Trust page already states the app does not verify
off-chain claims.

### makefun_submission_authorship

Why it does not fit: this skill is about make.fun submission authorship
checks (transcript authorship for Tiny Chess and similar entries). Oathfold
is an OKX X Layer TapeOut Accelerate entry, submitted through the OKX
form, not through make.fun. There is no authorship transcript check in
this event's rules.
What would change that: nothing in Oathfold. It would only become
relevant if a future entry went through make.fun, which is a different
event with different rules.

### social_publishing_draft_backup

Why it does not fit: this skill backs up social post drafts in the
workspace before saving them in the app. Oathfold has no social posting
feature, and this round produced no social draft.
What would change that: a decision to publish Oathfold launch or update
posts on X. The user has a standing rule that nothing is posted publicly
on their behalf without approval and drafts only, so this would need their
explicit go-ahead first.

### social_publishing_recurring_schedule

Why it does not fit: this skill creates the scheduled job that runs a
recurring social posting or drafting routine. Oathfold has no recurring
social cadence, no posting schedule, and no social content in this round.
What would change that: the same as above: an approved recurring posting
plan for Oathfold, with the user's explicit approval for the cadence and
the content. There is none today.

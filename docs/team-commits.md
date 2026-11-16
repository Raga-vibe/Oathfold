# Oathfold team commits

Repo: https://github.com/Raga-vibe/Oathfold, branch `main`.
Each item below is one commit on its own branch, opened as a pull request to `main`.
Run `npm test` and `npm run build` in `app/` before pushing. Commit under your own real GitHub identity.

Setup for each teammate (Qeeb does this once per person): repo Settings, Collaborators, add their GitHub username. Or fork the repo and open a pull request from the fork.

```bash
git clone https://github.com/Raga-vibe/Oathfold.git
cd Oathfold/app && npm install
```

Do not touch `src/lib/graph/`, `src/index.css`, or brand files while the GraphRAG and design work in progress lands. Rebase your branch on `main` after it lands, then push.

## Commit 1: live container onboarding

Branch: `feat/container-onboarding`
Message: `feat: live container onboarding and endpoint readiness check`

What to do:
- Research, from official TapeOut sources only, the exact steps to acquire a TapeOut circuit on X Layer, open its container, and publish a TapeSend key. Record the source links and any fee in `docs/container-onboarding.md`.
- Add an Onboarding page to the app (`app/src/pages/Onboarding.tsx`, linked from Landing and Create) that walks a holder through: connect wallet, resolve their container name, check opened status, check `keyFor` usable, derive the key by wallet signature, publish the key.
- Reuse the existing `resolveEndpoint` and `keyFor` code in `src/lib/chain/xlayer.ts`. Do not write new crypto and do not change the send flow.
- Show the exact blocker text when a container is not opened or has no usable key. Never claim a send happened.

Done when: a holder can follow the page and see a clear pass or fail for each step, `npm test` and `npm run build` pass, and `docs/container-onboarding.md` lists the verified steps with sources.

## Commit 2: DeWEB publication

Branch: `feat/deweb-publish`
Message: `feat: publish Oathfold as a DeWEB site with TapeKit`

What to do:
- Follow the TapeKit DeWEB publication steps in the pinned TapeKit commit `f1831a4` and TAP-10. Publish the static `app/dist/` output as a DeWEB site.
- Add `scripts/deweb-publish.md` with the exact commands used, the tape:// name, the container used, and the cost if any. No secrets in the file.
- Verify the published site loads over its tape:// name and that the hub panel, dashboard and demo lifecycle work there. Record the verified link and the check date in `docs/progress.md`.
- If publication needs a container or a fee the teammate does not have, stop and write the exact blocker in `docs/deweb-publish.md` instead of faking a link.

Done when: a tape:// link is verified working and recorded, or a precise blocker is recorded, and `npm test` and `npm run build` still pass.

## Commit 3: end-to-end tests and submission assets

Branch: `feat/e2e-and-assets`
Message: `feat: Playwright end-to-end tests, screenshots and demo assets`

What to do:
- Add Playwright end-to-end tests in `app/tests/e2e/` covering the demo lifecycle only: landing loads, dashboard shows all six statuses, create a demo fixture, open the record, reveal it, build a verdict draft in the reviewer console. No live send in tests.
- Add `docs/assets/screenshots/` with clean desktop and mobile screenshots of Landing, Dashboard, Create, Record detail and Live chain.
- Update `docs/demo-script.md` with the final shot list for the 3-minute video and note which shots are demo fixtures and which will be live once Commit 1 unblocks the live cycle.

Done when: `npx playwright test` passes, screenshots are in the repo, the demo script is final, and `npm test` and `npm run build` still pass.

## After all three

Qeeb reviews and merges each pull request, then the live commitment, reveal and verdict cycle is run through the app, the demo video is recorded, and the submission form is filled in before 7 December 2026, 23:59 UTC.

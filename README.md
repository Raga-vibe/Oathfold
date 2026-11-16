# Oathfold

Make the promise before the result.

Oathfold is a verifiable record of promises, reveals and outcomes for funded Web3 projects. A team seals a promise to a designated reviewer before the result is known, reveals it at the agreed time, attaches evidence, and the reviewer publishes a verifiable verdict. The record is reconstructed from TapeOut messages on X Layer, not from an editable private database.

Entry for the OKX X Layer TapeOut Accelerate hackathon. Submission deadline: 7 December 2026, 23:59 UTC (provisional, re-check the official page).

## What it uses

- TapeOut circuits and DeWEB containers on X Layer (chain 196)
- DeWEB hub `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee`
- TAP-10 TapeSend sealed and public messages
- TAP-12 sealed commitments and verdicts (SCV1 records)
- X Layer on-chain data: hub entries, key records, inbox/outbox counts, Sent logs

## Layout

- `app/` — the web app (Vite + React + TypeScript). See `app/README.md` for setup, tests and deployment.
- `docs/` — product brief, architecture, protocol compatibility, security and trust notes, demo script, submission draft, progress log.

## Status

MVP built 16 November 2026. Unit tests 28/28 pass, production build passes. Demo records in the app are labelled fixtures built with real seal/open crypto. No live on-chain commitment has been sent yet: that needs a founder-owned opened TapeOut container with a published TapeSend key on X Layer. See `docs/progress.md` and `docs/protocol-compatibility.md` for the exact verified state and the remaining blocker.

## License

MIT. The TapeOut reference code vendored under `app/src/lib/tapeout/send/` keeps its own MIT license and attribution.

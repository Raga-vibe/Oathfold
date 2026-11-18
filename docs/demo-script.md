# Oathfold demo script (5 minutes)

For a judge or a reviewer. Everything below works with no wallet and no live send.
Total: about 5 minutes. Keep it under the 3-minute video limit by cutting the Live
chain section to the hub panel only.

## 0:00-0:30 Landing

Open the app. Point at the one-line promise: seal a claim now, reveal it on a chosen
date, have it judged in public. Note the privacy warning in the yellow box: sealing
hides the claim from the public, not from the judge.

## 0:30-1:30 Dashboard (demo records)

Open the Dashboard. Six DEMO FIXTURE records, one per status: sealed, due, revealed,
judged, unrevealed, malformed. Click the status filters to show that unrevealed and
malformed are shown with the same prominence as judged. Say out loud: these are built
in the browser with real seal() calls and ephemeral keys, and they are labelled DEMO
FIXTURE because no live send exists yet.

## 1:30-2:30 Record detail (judged)

Open the judged demo record. Show the claim text (revealed), the timeline (sent, revealed
by the judge, verdict hit), and the verdict with its source. Open the verification drawer:
protocol, chain 196, hub, commitment id, ref, digest check PASS, status derivation,
raw ref and payload. This is the whole product in one screen: a checkable record.

## 2:30-3:30 Create (live send blocked, honestly)

Open Create. Fill in a promise (title, claim, deliverable, acceptance, open date, judge
endpoint). Show the privacy preview table: what is public vs what is sealed, and the
commitment ref it will use. Click "Send live on X Layer". Show the blocker: no usable
judge key and no holder wallet exist yet, so the app stops and explains the exact
prerequisite instead of faking a send. Then click "Save as DEMO FIXTURE instead" and open
the new record on the dashboard. It is labelled DEMO FIXTURE.

## 3:30-4:15 Reviewer console

Open Review. Pick the due record. Show the guards: it is not revealed, so the only valid
outcome is undecidable. Pick the revealed record, choose hit, and show that a source is
required. Build the verdict draft and show the exact ref and content JSON it would send.

## 4:15-5:00 Live chain

Open Live chain. Show the hub verification panel: implementation matches the pinned value,
isSealed false with the warning, owner shown. Look up #1@2.344: keyFor usable false,
opened false. Run the Sent scan over the last 2000 blocks in 100-block chunks and show
that no live TAP-12 records are found yet, which is the honest current state.

## Lines to use

- "The chain is the record. The judge is the human. The app is the reader."
- "We do not fake a live send. The blocker is the demo: the prerequisite does not exist yet."
- "Every status is shown, including the ones that make the author look bad. That is the point."

## Lines to avoid

- Do not say a live commitment exists. None does.
- Do not say the hub is sealed. It is not.
- Do not say the demo records are on chain. They are labelled DEMO FIXTURE.

## Final shot list (3-minute video)

Cut the 5-minute walkthrough above to these shots. Total 3:00.

| # | Time | Shot | Fixture or live |
|---|------|------|-----------------|
| 1 | 0:00-0:20 | Landing: headline, the real practice record card, the set-up link | Demo fixture card |
| 2 | 0:20-0:45 | Dashboard: all six statuses scan in one screen | Demo fixtures |
| 3 | 0:45-1:15 | Record detail of the Opened record: promise text, timeline, verification drawer | Demo fixture |
| 4 | 1:15-1:45 | Create: fill a promise and save a practice record, then open it | Demo fixture (local, not on chain) |
| 5 | 1:45-2:15 | Judge: build a ruling draft on the Opened record | Demo fixture |
| 6 | 2:15-2:45 | Live chain: hub panel, endpoint lookup, honest no-live-record state | Live chain reads (no send) |
| 7 | 2:45-3:00 | Set up your account: the exact blocker and what a holder must do | Product page (no wallet needed to view) |

Which shots are fixtures, and what changes once Commit 1 unblocks the live cycle:

- Shots 1-5 show practice records only. They are built in the browser with real seal() calls and
  are labelled DEMO FIXTURE / practice record. Say so on the recording.
- Once Commit 1 unblocks the live cycle (a holder-owned opened container with a published
  TapeSend key), shot 4 becomes a real seal on X Layer and a new shot of that live record on the
  dashboard is added. The practice-record wording is dropped from the script at that point.
- Shot 6 is already live chain data; it does not depend on Commit 1. It will show a real record
  once a live send exists.
- No live commitment exists at the time of recording. The script must not say one does.

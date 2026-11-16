import type { AppState } from '../App'
import { Callout } from '../components/ui'

export default function Landing({ state }: { state: AppState }) {
  const demo = state.demoRecords
  const counts = (s: string) => demo.filter((r) => r.status === s).length
  return (
    <div>
      <h1>Seal a claim now. Reveal it on a chosen date. Have it judged in public.</h1>
      <p>
        Oathfold is a track record you cannot edit after the fact. You write a promise, seal
        it with TAP-10 encryption, and send it to a judge on X Layer. The sealed claim is
        public metadata from the moment it is sent: kind, open time, author, judge. The claim
        text stays hidden until the author or the judge publishes the content key. Then anyone
        can decrypt the exact on-chain bytes and check them.
      </p>
      <p>
        <a className="btn" href="#/create">Create a commitment</a>{' '}
        <a className="btn secondary" href="#/dashboard">Explore the demo records</a>
      </p>

      <Callout>
        <strong>Privacy, stated plainly.</strong> Sealing hides the claim from the public, not
        from the judge. The judge holds a key slot and can publish the key at any time, including
        before the open time. Choose a judge you trust with the claim early. Author, judge, time,
        kind and open time are public from the moment a commitment is sent. Only the claim text
        is hidden, and only until reveal.
      </Callout>

      <h2>How it works</h2>
      <ol className="steps">
        <li>
          <strong>Seal.</strong> You write a promise and pick an open time and a judge endpoint
          (an X Layer container, like <span className="mono">#1@2.344</span>). Oathfold seals the
          text with the judge key and your key, and sends it through the DeWEB hub on X Layer
          with a TAP-12 ref that states the kind and open time in public.
        </li>
        <li>
          <strong>Wait.</strong> The commitment sits in the judge inbox and your outbox. Anyone
          can see it is due and when. You cannot seal an opposite claim and hide it: every
          tagged commitment is visible, and an unrevealed one stays on your record.
        </li>
        <li>
          <strong>Reveal.</strong> At or after the open time, you or the judge publish the
          content key. Any reader recomputes the commitment id, checks the key against the
          sealed payload, decrypts the exact on-chain bytes, and validates the content.
        </li>
        <li>
          <strong>Judge.</strong> The designated judge rules hit, miss or undecidable, with at
          least one source for hit or miss. Third-party verdicts are recorded separately and
          never merged with the designated judge verdict.
        </li>
      </ol>

      <h2>What this build proves</h2>
      <div className="grid">
        <div className="card">
          <h3>TAP-10, real crypto</h3>
          <p>
            Sealing and opening use the official TapeKit send module, vendored unmodified from
            commit f1831a4. No custom crypto shortcuts. The TAP-12 example vectors match exactly.
          </p>
        </div>
        <div className="card">
          <h3>TAP-12, full status model</h3>
          <p>
            Sealed, due, revealed, judged, unrevealed and malformed, with the 7-day grace
            period. Unrevealed and malformed records get the same prominence as judged ones.
          </p>
        </div>
        <div className="card">
          <h3>Live chain, verified</h3>
          <p>
            The app reads the live X Layer hub, checks the ERC-1967 implementation slot, the
            seal state and the owner, and scans Sent logs in 100-block chunks. Only messages
            at or below the safe block count as final.
          </p>
        </div>
        <div className="card">
          <h3>Honest limits</h3>
          <p>
            The hub is not sealed, and no founder-owned opened container with a published
            TapeSend key exists yet. A live send needs that first. Until then the live send
            path is fully built and gated, and the demo shows every status with real sealed
            payloads.
          </p>
        </div>
      </div>

      <h2>Demo records</h2>
      <p>
        Six demo fixtures are built in your browser with real seal() calls and ephemeral keys.
        They are labelled DEMO FIXTURE and are not on chain: {counts('sealed')} sealed,{' '}
        {counts('due')} due, {counts('revealed')} revealed, {counts('judged')} judged,{' '}
        {counts('unrevealed')} unrevealed, {counts('malformed')} malformed.
      </p>
      <p>
        <a href="#/dashboard">Open the dashboard</a> or{' '}
        <a href="#/live">check the live hub</a>.
      </p>

      <h2>What Oathfold is not</h2>
      <p>
        No token. No NFT. No escrow and no payments. No AI verdicts: a human judge rules, with
        sources, and anyone can re-check the ruling. Oathfold makes no legal claim and offers
        no guarantee that a promise will be kept. It only makes the record public and checkable.
      </p>
    </div>
  )
}

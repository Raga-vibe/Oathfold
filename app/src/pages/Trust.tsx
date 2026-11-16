import { Callout, Kv } from '../components/ui'

export default function Trust() {
  return (
    <div>
      <h1>Trust and limits</h1>
      <p>
        Oathfold is built to be checkable, not to ask for trust. This page states the limits plainly.
        Also see <a href="#/live">Advanced: live chain checks</a>.
      </p>

      <h2>Verified by this app</h2>
      <div className="card">
        <Kv rows={[
          ['TAP-12 vectors', 'Example 1 ref, Example 2 commitmentId and Example 3 verdict ref match exactly (unit tests).'],
          ['TapeKit crypto', 'Official send module tests pass 32/32 at the pinned commit f1831a4.'],
          ['Hub implementation', 'ERC-1967 slot reads 0xdCC57797089eBD9f26e686379A4323f353a3F9C6, the pinned X Layer implementation.'],
          ['Hub owner', '0x571d447f4f24688eC35Ccf07f1D6993655F6aF15.'],
          ['Finality', 'Only messages at or below the safe block count as final records.'],
          ['Digests', 'Every record is checked: digest = keccak256(ref || keccak256(payload)) against the inbox entry.'],
          ['Reveals', 'K is checked against D, C is decrypted with the exact TAP-10 aad, and the content is validated against TAP-12 section 3.4.'],
        ]} />
      </div>

      <h2>Not verified, and not claimed</h2>
      <Callout>
        <strong>The hub is NOT sealed.</strong> isSealed() is false. The hub owner can still
        replace the hub implementation, which could change identity checks. The factory seal
        state is not asserted by this app either. Until the factory and hub seals are in effect,
        records inherit the trust assumptions in TAP-10 section 13.8. Oathfold shows this warning
        until the seal lands.
      </Callout>
      <div className="card">
        <ul>
          <li>No live send has happened from this app. No transaction hash is claimed.</li>
          <li>No founder-owned opened container with a published TapeSend key exists yet, so no live commitment can be sent by the founder today.</li>
          <li>Demo records are built locally with real seal() calls and ephemeral keys. They prove the format and the UI, not any chain state. They are labelled DEMO FIXTURE everywhere.</li>
          <li>The app does not verify a judge's sources for them. A verdict cites sources; readers check the sources themselves.</li>
          <li>The app does not score judges or build leaderboards. That is out of scope for TAP-12.</li>
        </ul>
      </div>

      <h2>Privacy</h2>
      <div className="card">
        <ul>
          <li>Author, judge, time, kind and open time are public from the moment a commitment is sent. Only the claim text is hidden, and only until reveal.</li>
          <li>Sealing hides the claim from the public, not from the judge. The judge can publish the content key at any time, including before the open time.</li>
          <li>Revealing K exposes one message only. Long-term keys are never disclosed.</li>
          <li>A message that is not meant to be a public record must not carry the SCV1 tag.</li>
          <li>Container transfer transfers the track record. The sending wallet of every message is shown, so a reader can see when the current holder was not the author.</li>
        </ul>
      </div>

      <h2>Keys</h2>
      <div className="card">
        <ul>
          <li>Your X25519 key is derived by your wallet signing the exact TAP-10 key-derivation text (personal_sign). The private key never leaves your wallet.</li>
          <li>The derived secret key lives only in memory for the send. Oathfold stores no secret keys.</li>
          <li>Demo keys are ephemeral, stored in localStorage only so demo reveals work in your browser. They are not live keys and prove nothing on chain.</li>
          <li>If your published key does not match the derived key, the app asks your wallet to publish the derived one (publishKey) before sending.</li>
        </ul>
      </div>

      <h2>No legal or escrow claims</h2>
      <p>
        Oathfold makes no legal claim and offers no guarantee that a promise will be kept. It
        holds no funds, runs no escrow, and takes no payment. It only makes the record public
        and checkable, so a broken promise is visible and a kept one is provable.
      </p>
    </div>
  )
}

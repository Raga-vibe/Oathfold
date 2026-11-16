import type { AppState } from '../App'
import { RecordCard } from '../components/ui'
import { shortAddress, HUB_IMPLEMENTATION_XLAYER } from '../lib/chain/xlayer'
import { deriveHubState } from '../lib/machines'

export default function Landing({ state }: { state: AppState }) {
  const demo = state.demoRecords
  const featured = demo.find((r) => r.status === 'judged') ?? demo[0]
  const hub = state.hub
  const impl = hub?.implementation ? shortAddress(hub.implementation) : shortAddress(HUB_IMPLEMENTATION_XLAYER)
  const safe = hub?.safeBlockNumber?.toString() ?? null
  const hubState = deriveHubState(hub, false)

  return (
    <div>
      <section className="hero">
        <div>
          <h1>Seal the promise before the result.</h1>
          <p className="hero__lead">
            Oathfold is a public record of sealed promises on X Layer. Write a claim,
            seal it, reveal it on the date you chose, and have a judge rule on it in public.
          </p>
          <p className="hero__actions">
            {featured && (
              <a className="btn" href={`#/record/${encodeURIComponent(featured.commitmentId)}`}>Explore a demo record</a>
            )}
            <a className="btn ghost" href="#/create">Create a commitment</a>
          </p>
        </div>
        {featured && <RecordCard record={featured} />}
      </section>

      <section className="steps-strip" aria-label="How it works">
        <h2>How it works</h2>
        <div className="steps-strip__step">
          <strong>Seal</strong>
          <p>Write a promise. Pick a judge and a date.</p>
        </div>
        <div className="steps-strip__step">
          <strong>Wait</strong>
          <p>The sealed record is public. The claim stays hidden.</p>
        </div>
        <div className="steps-strip__step">
          <strong>Reveal</strong>
          <p>Publish the key. Anyone decrypts the bytes.</p>
        </div>
        <div className="steps-strip__step">
          <strong>Judge</strong>
          <p>The judge rules hit, miss, or undecidable.</p>
        </div>
      </section>

      <p className="checked-line">
        <b>Checked live:</b> hub <span className="mono">{impl}</span>
        {hubState === 'verified-sealed' || hubState === 'verified-unsealed' ? ' (read from chain)' : hubState === 'error' ? ' (check failed)' : ' (expected)'} · chain 196
        {safe ? (
          <>
            {' '}· safe block <span className="mono">{safe}</span>
          </>
        ) : null}{' '}
        <a href="#/live">Live chain</a>
      </p>
    </div>
  )
}

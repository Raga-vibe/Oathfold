import type { AppState } from '../App'
import { RecordCard } from '../components/ui'
import { deriveHubState } from '../lib/machines'

export default function Landing({ state }: { state: AppState }) {
  const demo = state.demoRecords
  const featured = demo.find((r) => r.status === 'judged') ?? demo[0]
  const hub = state.hub
  const hubState = deriveHubState(hub, false)

  return (
    <div>
      <section className="hero">
        <div>
          <h1>Seal the promise before the result.</h1>
          <p className="hero__lead">
            Oathfold is a public record of sealed promises. Write a promise, seal
            it, open it on the date you chose, and have a judge rule on it in public.
          </p>
          <p className="hero__actions">
            {featured && (
              <a className="btn" href={`#/record/${encodeURIComponent(featured.commitmentId)}`}>See a practice record</a>
            )}
            <a className="btn ghost" href="#/create">Make a promise</a>
          </p>
        </div>
        {featured && <RecordCard record={featured} />}
      </section>

      <section className="steps-strip" aria-label="How it works">
        <h2>How it works</h2>
        <div className="steps-strip__step">
          <strong>Write it</strong>
          <p>Write a promise about something you will do.</p>
        </div>
        <div className="steps-strip__step">
          <strong>Seal it</strong>
          <p>The promise is locked. Nobody can see inside yet.</p>
        </div>
        <div className="steps-strip__step">
          <strong>Open it</strong>
          <p>On the date you chose, the promise is opened.</p>
        </div>
        <div className="steps-strip__step">
          <strong>The judge rules</strong>
          <p>The judge says hit, miss, or cannot decide.</p>
        </div>
      </section>

      <p className="checked-line">
        <b>Checked live:</b> X Layer, chain 196
        {hubState === 'error' ? ' · check failed' : hubState === 'verified-sealed' || hubState === 'verified-unsealed' ? ' · record book read from the chain' : ''}{' '}
        · <a href="#/live">Advanced</a>
      </p>
    </div>
  )
}

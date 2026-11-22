import type { AppState } from '../App'
import { Kv, RecordCard } from '../components/ui'
import { BRAND, brandCopy } from '../brand'
import { deriveHubState } from '../lib/machines'
import { HUB_STATE_PLAIN } from '../lib/plain'

export default function Landing({ state }: { state: AppState }) {
  const demo = state.demoRecords
  const featured = demo.find((r) => r.status === 'judged') ?? demo[0]
  const hub = state.hub
  const hubState = deriveHubState(hub, false)
  const hubRead = hubState === 'verified-sealed' || hubState === 'verified-unsealed'

  return (
    <div>
      <section className="hero">
        <div>
          <p className="eyebrow">{BRAND.tagline}</p>
          <h1>{brandCopy.heroLine}</h1>
          <p className="hero__lead">
            Commit in public before you know the outcome. Oathfold seals a promise
            on X Layer, opens it on the date you chose, and lets your judge rule
            in public &mdash; with a record anyone can rebuild from the chain.
          </p>
          <p className="hero__actions">
            {featured && (
              <a className="btn" href={`#/record/${encodeURIComponent(featured.commitmentId)}`}>See a practice record</a>
            )}
            <a className="btn ghost" href="#/create">Make a promise</a>
          </p>
          <p className="small">
            Own a TapeOut circuit? <a href="#/onboarding">Set up your account and TapeSend key</a>{' '}
            so you can seal a live promise.
          </p>
        </div>
        {featured && <RecordCard record={featured} />}
      </section>

      <section className="card network-card" aria-label="Live network status">
        <div className="network-card__head">
          <h2>Read from X Layer just now</h2>
          {hubState === 'error'
            ? <span className="badge bad"><span className="dot" />Read failed</span>
            : hub
              ? <span className="badge ok"><span className="dot" />Live read</span>
              : <span className="badge"><span className="dot" />Reading…</span>}
        </div>
        {hub ? (
          <Kv rows={[
            ['Network', 'X Layer · chain 196'],
            ['Record book', <span className="mono">{hub.hub}</span>],
            ['Implementation', <span className="mono">{hub.implementation ?? 'not read'}</span>],
            ['Sealed', hub.isSealed ? 'Yes' : 'No — its owner can still upgrade it'],
            ['Read at', hub.blockNumber != null ? `Block ${hub.blockNumber.toString()} (latest)` : 'not read'],
          ]} />
        ) : (
          <p className="small">Reading the record book from the public X Layer RPCs…</p>
        )}
        {hubState === 'mismatch' && (
          <p className="small network-card__note">
            The record book&rsquo;s implementation changed since it was last pinned, so
            Oathfold reports the current state instead of assuming the old one.{' '}
            <a href="#/live">See what changed</a>.
          </p>
        )}
        {hubState === 'verified-unsealed' && (
          <p className="small network-card__note">
            The record book is not sealed, so its owner can still change it. Oathfold
            shows that rather than treating it as final.
          </p>
        )}
        {hubState === 'error' && hub?.error && (
          <p className="small network-card__note">{hub.error} · <a href="#/live">Try again</a></p>
        )}
        {hubRead && (
          <p className="small network-card__note">
            Status: {HUB_STATE_PLAIN[hubState]} · <a href="#/live">Advanced</a>
          </p>
        )}
      </section>

      <section className="steps-strip" aria-label="How it works">
        <h2>How it works</h2>
        <div className="steps-strip__step">
          <a className="arrow-btn" href="#/create" aria-label="Make a promise">↗</a>
          <strong>Write it</strong>
          <p>Write a promise about something you will do.</p>
        </div>
        <div className="steps-strip__step">
          <a className="arrow-btn" href="#/create" aria-label="Make a promise">↗</a>
          <strong>Seal it</strong>
          <p>The promise is locked before anyone knows how it turned out.</p>
        </div>
        <div className="steps-strip__step">
          <a className="arrow-btn" href="#/dashboard" aria-label="See promises">↗</a>
          <strong>Open it</strong>
          <p>On the date you chose, the promise is opened.</p>
        </div>
        <div className="steps-strip__step">
          <a className="arrow-btn" href="#/review" aria-label="Judge promises">↗</a>
          <strong>The judge rules</strong>
          <p>The judge says hit, miss, or cannot decide.</p>
        </div>
      </section>
    </div>
  )
}

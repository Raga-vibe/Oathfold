// Local store for Oathfold records.
// Live records are rebuildable from the chain at any time (indexer scan); the
// cache only avoids re-scanning. Demo fixtures are rebuilt locally on demand.
// Nothing here is a source of truth: chain state is.

import type { OathRecord } from './records'
import { buildDemoSet } from './demo'

const DEMO_CACHE_KEY = 'oathfold.demo.v1'
const LIVE_CACHE_KEY = 'oathfold.live.v1'
const LIVE_META_KEY = 'oathfold.live.meta.v1'

export interface LiveMeta {
  fromBlock: string
  toBlock: string
  safeBlock: string | null
  scannedAt: number
  chunks: number
  discarded: { reason: string; count: number }[]
}

export function loadDemoRecords(): OathRecord[] {
  try {
    const raw = localStorage.getItem(DEMO_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.records) && parsed.records.length >= 5) {
        return parsed.records as OathRecord[]
      }
    }
  } catch {
    // fall through to rebuild
  }
  const set = buildDemoSet()
  try {
    localStorage.setItem(DEMO_CACHE_KEY, JSON.stringify(set))
  } catch {
    // storage may be unavailable; demo still works in memory
  }
  return set.records
}

export function rebuildDemoRecords(): OathRecord[] {
  try {
    localStorage.removeItem(DEMO_CACHE_KEY)
  } catch {
    // ignore
  }
  return loadDemoRecords()
}

export function loadLiveRecords(): { records: OathRecord[]; meta: LiveMeta | null } {
  try {
    const raw = localStorage.getItem(LIVE_CACHE_KEY)
    const metaRaw = localStorage.getItem(LIVE_META_KEY)
    if (raw) {
      return {
        records: JSON.parse(raw) as OathRecord[],
        meta: metaRaw ? (JSON.parse(metaRaw) as LiveMeta) : null,
      }
    }
  } catch {
    // ignore corrupt cache
  }
  return { records: [], meta: null }
}

export function saveLiveRecords(records: OathRecord[], meta: LiveMeta): void {
  try {
    localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(records))
    localStorage.setItem(LIVE_META_KEY, JSON.stringify(meta))
  } catch {
    // ignore
  }
}

export function clearLiveCache(): void {
  try {
    localStorage.removeItem(LIVE_CACHE_KEY)
    localStorage.removeItem(LIVE_META_KEY)
  } catch {
    // ignore
  }
}

/** Save a user-created demo fixture (from Create when live send is blocked). */
export function saveDemoRecord(record: OathRecord): OathRecord[] {
  const current = loadDemoRecords()
  const next = [record, ...current.filter((r) => r.commitmentId !== record.commitmentId)]
  try {
    localStorage.setItem(DEMO_CACHE_KEY, JSON.stringify({ builtAt: Math.floor(Date.now() / 1000), records: next, titles: {} }))
  } catch {
    // ignore
  }
  return next
}

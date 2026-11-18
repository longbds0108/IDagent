import type { HistoryPoint } from '@/lib/reputation'

const SERIES = [
  ['evidence', 'EVIDENCE', '#b9b0c6'],
  ['peer', 'PEER', '#c39bf5'],
  ['issuer', 'ISSUER', '#7db4ff'],
] as const

/** Step chart of the three components over time (0–100). Server-rendered SVG. */
export function ScoreChart({ points }: { points: HistoryPoint[] }) {
  if (points.length === 0) return <p className="text-[13px] text-ink-3">No history yet.</p>
  const W = 900
  const H = 240
  const pad = { l: 34, r: 12, t: 12, b: 26 }
  const t0 = points[0]!.t
  const t1 = Math.max(points[points.length - 1]!.t, t0 + 1)
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b)
  const path = (key: 'evidence' | 'peer' | 'issuer') => {
    let d = `M${pad.l},${y(0)}`
    for (const p of points) d += ` H${x(p.t).toFixed(1)} V${y(p[key]).toFixed(1)}`
    return `${d} H${W - pad.r}`
  }
  return (
    <figure className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Reputation component history">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#2a2438" strokeDasharray={v ? '2 4' : undefined} />
            <text x={pad.l - 8} y={y(v) + 3} textAnchor="end" fill="#776f82" fontSize="10" fontFamily="var(--font-mono)">
              {v}
            </text>
          </g>
        ))}
        {SERIES.map(([k, , c]) => (
          <path key={k} d={path(k)} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />
        ))}
        {points.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={H - pad.b + 8} r="2" fill="#776f82">
            <title>{`${new Date(p.t * 1000).toISOString().slice(0, 16).replace('T', ' ')} · ${p.event}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-5">
        {SERIES.map(([k, l, c]) => (
          <span key={k} className="sp-label flex items-center gap-2">
            <i className="h-0.5 w-5" style={{ background: c }} aria-hidden />
            {l}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

/* Deterministic identicon fallback; remote avatars load without referrer. */
export function Avatar({ url, seed, size = 40 }: { url?: string; seed: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-md border border-line object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  const h = parseInt(seed.slice(2, 8), 16)
  const cells: boolean[] = []
  for (let i = 0; i < 15; i++) cells.push(((h >> i) & 1) === 1)
  const hue = h % 360
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" className="shrink-0 rounded-md border border-line" aria-hidden>
      <rect width="5" height="5" fill={`hsl(${hue} 30% 92%)`} />
      {cells.map((on, i) => {
        if (!on) return null
        const x = i % 3
        const y = Math.floor(i / 3)
        return (
          <g key={i} fill={`hsl(${hue} 45% 38%)`}>
            <rect x={x} y={y} width="1" height="1" />
            <rect x={4 - x} y={y} width="1" height="1" />
          </g>
        )
      })}
    </svg>
  )
}

'use client'

import { useEffect, useRef } from 'react'

const CHARS = 'ATTESTED01.ai#+*◆:'

type Cell = { x: number; y: number; nx: number; ny: number; noise: number; ch: string; reveal: number; orbit: boolean }

function hash(x: number, y: number) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return v - Math.floor(v)
}

/**
 * Interactive character field: three overlapping discs for the three trust levels
 * (self-reported, peer attested, issuer credential) on a dotted orbit. Pointer adds parallax.
 */
export function AsciiField() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    let w = 0
    let h = 0
    let size = 11
    let cells: Cell[] = []
    let raf = 0
    let start = performance.now()
    let prev = start
    let visible = true
    let dirty = true

    const discs = [
      { cx: -0.2, cy: 0.12, rx: 0.27, ry: 0.35, color: [167, 157, 181] as const }, // self
      { cx: 0.13, cy: 0.14, rx: 0.27, ry: 0.35, color: [155, 93, 229] as const }, // peer
      { cx: -0.03, cy: -0.2, rx: 0.27, ry: 0.35, color: [63, 145, 255] as const }, // issuer
    ]

    const build = () => {
      size = w < 620 ? 9 : 11
      const cols = Math.ceil(w / size)
      const rows = Math.ceil(h / size)
      const min = Math.min(w, h)
      const ox = w * 0.2
      const oy = h * 0.7
      const max = Math.hypot(w, h)
      const next: Cell[] = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * size + size / 2
          const y = r * size + size / 2
          const nx = (x - w * 0.5) / min
          const ny = (y - h * 0.5) / min
          const ox2 = (nx + 0.03) / 0.56
          const oy2 = (ny - 0.02) / 0.2
          const od = Math.sqrt(ox2 * ox2 + oy2 * oy2)
          next.push({
            x,
            y,
            nx,
            ny,
            noise: hash(c, r),
            ch: CHARS[Math.floor(hash(c + 17, r + 31) * CHARS.length)]!,
            reveal: Math.hypot(x - ox, y - oy) / max,
            orbit: Math.abs(od - 1) < 0.018,
          })
        }
      }
      cells = next
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      build()
      start = performance.now()
      prev = start
      dirty = true
    }

    const move = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.tx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2))
      pointer.ty = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2))
      dirty = true
    }
    const leave = () => {
      pointer.tx = 0
      pointer.ty = 0
      dirty = true
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (!visible) {
        prev = now
        return
      }
      const reveal = reduced ? 1 : Math.min(1, (now - start) / 1450)
      const scale = Math.min(3, Math.max(0.25, (now - prev) / 16.667))
      const k = 1 - Math.pow(0.9, scale)
      prev = now
      pointer.x += (pointer.tx - pointer.x) * k
      pointer.y += (pointer.ty - pointer.y) * k
      const moving = Math.abs(pointer.tx - pointer.x) > 0.0005 || Math.abs(pointer.ty - pointer.y) > 0.0005
      if (!dirty && !moving && reveal >= 1) return
      dirty = false

      ctx.clearRect(0, 0, w, h)
      ctx.font = `${Math.max(8, size - 1)}px "JetBrains Mono", ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (const cell of cells) {
        let best = -1
        let color: readonly [number, number, number] | null = null
        let radius = 0
        let overlaps = 0
        for (const d of discs) {
          const lx = (cell.nx - d.cx) / d.rx
          const ly = (cell.ny - d.cy) / d.ry
          const rr = Math.sqrt(lx * lx + ly * ly)
          if (rr <= 1) {
            overlaps++
            const depth = Math.sqrt(1 - rr * rr)
            if (depth > best) {
              best = depth
              color = d.color
              radius = rr
            }
          }
        }
        if (!color && !cell.orbit) continue
        const a0 = Math.max(0, Math.min(1, (reveal * 1.45 - cell.reveal) * 4))
        if (a0 <= 0) continue
        if (color && cell.noise > 0.79 + best * 0.18) continue
        if (cell.orbit && cell.noise > 0.62) continue
        const depth = color ? best : 0.15
        const px = pointer.x * depth * 18
        const py = pointer.y * depth * 13
        const ch = cell.orbit && !color ? '·' : overlaps >= 3 ? '◆' : cell.ch
        const alpha = a0 * (cell.orbit && !color ? 0.38 : 0.28 + depth * 0.72)
        if (color) {
          const glow = radius > 0.88 ? 1.18 : 1
          ctx.fillStyle = overlaps >= 3 ? `rgba(245, 243, 247, ${Math.min(1, alpha)})` : `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Math.min(1, alpha * glow)})`
        } else ctx.fillStyle = `rgba(155, 93, 229, ${alpha})`
        ctx.fillText(ch, cell.x + px, cell.y + py)
      }
    }

    const ro = new ResizeObserver(resize)
    const io = new IntersectionObserver(
      ([e]) => {
        visible = !!e?.isIntersecting
        if (visible) dirty = true
      },
      { rootMargin: '100px' },
    )
    ro.observe(canvas)
    io.observe(canvas)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    resize()
    raf = requestAnimationFrame(draw)
    return () => {
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="sp-ascii" role="img" aria-label="A field of characters forming three overlapping discs: self-reported, peer attested and issuer credential">
      <canvas ref={ref} aria-hidden />
      <ul className="sp-ascii__legend" aria-hidden>
        <li><i className="is-self" />SELF</li>
        <li><i className="is-peer" />PEER</li>
        <li><i className="is-issuer" />ISSUER</li>
      </ul>
    </div>
  )
}

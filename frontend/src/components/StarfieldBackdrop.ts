/**
 * StarfieldBackdrop: Subtle Procedural Deep Space & Celestial Coordinate Backdrop
 *
 * Implements Phase 14 specifications:
 * - Near-black deep space background with extremely subtle procedural star field
 * - Distant nebula haze (cool cyan, deep navy, violet/indigo hues)
 * - Faint lunar orbital lines and technical coordinate grid with crosshairs
 * - Non-distracting, mathematically elegant, ultra-high performance (virtually 0% CPU)
 */

interface CelestialStar {
  x: number
  y: number
  radius: number
  baseAlpha: number
  currentAlpha: number
  twinkleSpeed: number
  phase: number
  color: string
}

export class StarfieldBackdrop {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private stars: CelestialStar[] = []
  private animId: number | null = null
  private width: number = 0
  private height: number = 0
  private lastTick: number = 0

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.id = 'celestial-starfield-backdrop'
    this.canvas.className = 'celestial-backdrop-canvas'
    this.canvas.style.position = 'fixed'
    this.canvas.style.top = '0'
    this.canvas.style.left = '0'
    this.canvas.style.width = '100vw'
    this.canvas.style.height = '100vh'
    this.canvas.style.pointerEvents = 'none'
    this.canvas.style.zIndex = '0'

    this.ctx = this.canvas.getContext('2d', { alpha: false })!
    document.body.prepend(this.canvas)

    this.handleResize()
    window.addEventListener('resize', this.onResize)
    this.startLoop()
  }

  private onResize = () => {
    this.handleResize()
  }

  private handleResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = window.innerWidth
    this.height = window.innerHeight

    this.canvas.width = Math.floor(this.width * dpr)
    this.canvas.height = Math.floor(this.height * dpr)
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.scale(dpr, dpr)

    this.generateStars()
    this.renderFrame(0)
  }

  private generateStars() {
    this.stars = []
    // Moderate density: ~140 stars across standard 1080p viewport
    const count = Math.floor((this.width * this.height) / 14000)

    const starColors = [
      '226, 232, 240', // Neutral lunar white
      '186, 230, 253', // Cool cyan blue
      '199, 210, 254', // Subtle indigo
      '254, 243, 199', // Faint warm yellow-white
    ]

    for (let i = 0; i < count; i++) {
      const isBright = Math.random() < 0.12
      const radius = isBright ? 1.2 + Math.random() * 0.6 : 0.6 + Math.random() * 0.5
      const baseAlpha = isBright ? 0.4 + Math.random() * 0.35 : 0.15 + Math.random() * 0.3

      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius,
        baseAlpha,
        currentAlpha: baseAlpha,
        twinkleSpeed: 0.4 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        color: starColors[Math.floor(Math.random() * starColors.length)]
      })
    }
  }

  private renderFrame(timestamp: number) {
    const ctx = this.ctx
    const w = this.width
    const h = this.height

    // 1. Base Deep Space Fill (Near-black space: #02040a to #040816)
    ctx.fillStyle = '#02040a'
    ctx.fillRect(0, 0, w, h)

    // 2. Distant Deep Space Nebula Haze (Extremely subtle, non-distracting)
    // Primary Navy/Indigo Nebula in top center
    const neb1 = ctx.createRadialGradient(w * 0.45, h * 0.2, 50, w * 0.45, h * 0.2, Math.max(w, h) * 0.65)
    neb1.addColorStop(0, 'rgba(15, 23, 58, 0.45)') // Deep Navy
    neb1.addColorStop(0.4, 'rgba(49, 46, 129, 0.14)') // Indigo Haze
    neb1.addColorStop(0.8, 'rgba(8, 16, 40, 0.08)')
    neb1.addColorStop(1, 'rgba(2, 4, 10, 0)')
    ctx.fillStyle = neb1
    ctx.fillRect(0, 0, w, h)

    // Secondary Cool Cyan Haze in lower right
    const neb2 = ctx.createRadialGradient(w * 0.85, h * 0.75, 40, w * 0.85, h * 0.75, Math.max(w, h) * 0.45)
    neb2.addColorStop(0, 'rgba(14, 116, 144, 0.12)') // Muted Deep Cyan
    neb2.addColorStop(0.6, 'rgba(8, 47, 73, 0.05)')
    neb2.addColorStop(1, 'rgba(2, 4, 10, 0)')
    ctx.fillStyle = neb2
    ctx.fillRect(0, 0, w, h)

    // 3. Technical Coordinate Grid with Subtle Crosshairs
    const gridSize = 80
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.022)'
    ctx.lineWidth = 1

    ctx.beginPath()
    for (let x = 0; x <= w; x += gridSize) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
    }
    for (let y = 0; y <= h; y += gridSize) {
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()

    // Fine Crosshair Reticles at Grid Intersections
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)'
    ctx.beginPath()
    const tick = 3
    for (let x = gridSize; x < w; x += gridSize * 2) {
      for (let y = gridSize; y < h; y += gridSize * 2) {
        ctx.moveTo(x - tick, y)
        ctx.lineTo(x + tick, y)
        ctx.moveTo(x, y - tick)
        ctx.lineTo(x, y + tick)
      }
    }
    ctx.stroke()

    // 4. Subtle Lunar Orbital Lines (Dashed celestial trajectory curves)
    ctx.save()
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.045)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 12])

    // Primary Polar Orbit Trajectory Arc
    ctx.beginPath()
    ctx.ellipse(w * 0.48, h * 0.35, w * 0.55, h * 0.65, Math.PI / 12, 0, Math.PI * 2)
    ctx.stroke()

    // Secondary Auxiliary Transfer Orbit Arc
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.035)'
    ctx.setLineDash([2, 16])
    ctx.beginPath()
    ctx.ellipse(w * 0.52, h * 0.42, w * 0.70, h * 0.80, -Math.PI / 8, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()

    // 5. Procedural Stars with Gentle Atmospheric-less Scintillation
    const timeSec = timestamp * 0.001
    for (const star of this.stars) {
      const alphaVar = Math.sin(timeSec * star.twinkleSpeed + star.phase) * 0.15
      const alpha = Math.max(0.05, Math.min(0.9, star.baseAlpha + alphaVar))

      ctx.fillStyle = `rgba(${star.color}, ${alpha})`
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private startLoop() {
    const loop = (timestamp: number) => {
      // Throttle rendering to ~24 fps for zero CPU impact while maintaining smooth twinkling
      if (timestamp - this.lastTick >= 40) {
        this.renderFrame(timestamp)
        this.lastTick = timestamp
      }
      this.animId = requestAnimationFrame(loop)
    }
    this.animId = requestAnimationFrame(loop)
  }

  public destroy() {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId)
    }
    window.removeEventListener('resize', this.onResize)
    this.canvas.remove()
  }
}

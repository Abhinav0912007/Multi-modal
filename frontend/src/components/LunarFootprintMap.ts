import type { DatasetFootprint } from '../types'

export class LunarFootprintMap {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private container: HTMLElement
  private footprint: DatasetFootprint | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'footprint-canvas'
    this.ctx = this.canvas.getContext('2d')!
    this.container.appendChild(this.canvas)
    this.initCanvas()
  }

  private initCanvas() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.container.getBoundingClientRect()
    const width = rect.width || 360
    const height = rect.height || 220

    this.canvas.width = width * dpr
    this.canvas.height = height * dpr
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`

    this.ctx.scale(dpr, dpr)
  }

  public setFootprint(footprint: DatasetFootprint) {
    this.footprint = footprint
    this.render()
  }

  public render() {
    this.initCanvas()
    const w = this.canvas.width / (window.devicePixelRatio || 1)
    const h = this.canvas.height / (window.devicePixelRatio || 1)

    // Clear
    this.ctx.fillStyle = '#030712'
    this.ctx.fillRect(0, 0, w, h)

    if (!this.footprint) return

    const fp = this.footprint
    const cx = w / 2
    const cy = h / 2
    const r = Math.min(w, h) * 0.42

    // 1. Draw Lunar Sphere Background Disk
    const moonGrad = this.ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 10, cx, cy, r)
    moonGrad.addColorStop(0, '#2d3748')
    moonGrad.addColorStop(0.7, '#1a202c')
    moonGrad.addColorStop(1, '#0f172a')

    this.ctx.save()
    this.ctx.beginPath()
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2)
    this.ctx.fillStyle = moonGrad
    this.ctx.fill()
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)'
    this.ctx.lineWidth = 1
    this.ctx.stroke()
    this.ctx.clip()

    // 2. Draw Lat/Lon Grid lines
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)'
    this.ctx.lineWidth = 1
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = cy - (lat / 90) * r * 0.95
      this.ctx.beginPath()
      this.ctx.moveTo(cx - r, y)
      this.ctx.lineTo(cx + r, y)
      this.ctx.stroke()
    }
    for (let lon = -90; lon <= 90; lon += 30) {
      const x = cx + (lon / 90) * r * 0.95
      this.ctx.beginPath()
      this.ctx.moveTo(x, cy - r)
      this.ctx.lineTo(x, cy + r)
      this.ctx.stroke()
    }

    // 3. Project Footprint Bounding Polygon
    // Convert lunar lat/lon to canvas coordinates relative to center
    const x1 = cx + (fp.lon_min / 90) * r * 0.95
    const x2 = cx + (fp.lon_max / 90) * r * 0.95
    const y1 = cy - (fp.lat_max / 90) * r * 0.95
    const y2 = cy - (fp.lat_min / 90) * r * 0.95

    const fpWidth = Math.max(12, Math.abs(x2 - x1))
    const fpHeight = Math.max(12, Math.abs(y2 - y1))
    const fpLeft = Math.min(x1, x2)
    const fpTop = Math.min(y1, y2)

    // Bounding Box Glow Fill
    this.ctx.fillStyle = 'rgba(245, 158, 11, 0.28)'
    this.ctx.fillRect(fpLeft, fpTop, fpWidth, fpHeight)

    // Bounding Box Outline
    this.ctx.strokeStyle = '#f59e0b'
    this.ctx.lineWidth = 2
    this.ctx.shadowColor = '#f59e0b'
    this.ctx.shadowBlur = 10
    this.ctx.strokeRect(fpLeft, fpTop, fpWidth, fpHeight)
    this.ctx.shadowBlur = 0

    // Center Crosshair
    const centerNormX = cx + (fp.center_lon / 90) * r * 0.95
    const centerNormY = cy - (fp.center_lat / 90) * r * 0.95

    this.ctx.strokeStyle = '#38bdf8'
    this.ctx.lineWidth = 1.5
    this.ctx.beginPath()
    this.ctx.arc(centerNormX, centerNormY, 4, 0, Math.PI * 2)
    this.ctx.stroke()

    this.ctx.beginPath()
    this.ctx.moveTo(centerNormX - 7, centerNormY)
    this.ctx.lineTo(centerNormX + 7, centerNormY)
    this.ctx.moveTo(centerNormX, centerNormY - 7)
    this.ctx.lineTo(centerNormX, centerNormY + 7)
    this.ctx.stroke()

    this.ctx.restore()

    // 4. Outer Coordinates & Region Banner
    this.ctx.font = '10px "JetBrains Mono", monospace'
    this.ctx.fillStyle = '#fef08a'
    this.ctx.fillText(fp.region_name, 12, 18)

    this.ctx.fillStyle = '#94a3b8'
    this.ctx.fillText(`Center: ${fp.center_lat >= 0 ? `${fp.center_lat.toFixed(2)}°N` : `${Math.abs(fp.center_lat).toFixed(2)}°S`}, ${fp.center_lon >= 0 ? `${fp.center_lon.toFixed(2)}°E` : `${Math.abs(fp.center_lon).toFixed(2)}°W`}`, 12, 32)
  }
}

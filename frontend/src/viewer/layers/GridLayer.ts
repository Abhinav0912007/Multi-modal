import { OverlayLayer } from './OverlayLayer'
import type { ViewportManager } from '../ViewportManager'

export class GridLayer extends OverlayLayer {
  public showDegreeLabels: boolean = true
  public showPixelGrid: boolean = true

  constructor(id: string = 'grid_layer', zIndex: number = 20) {
    super(id, zIndex)
  }

  public render(ctx: CanvasRenderingContext2D, viewport: ViewportManager): void {
    if (!this.visible || this.opacity <= 0) return

    ctx.save()
    ctx.globalAlpha = this.opacity
    ctx.globalCompositeOperation = this.blendMode

    const zoom = viewport.getZoom()
    const { width: screenW, height: screenH } = viewport.getScreenDimensions()
    const visibleWorld = viewport.getVisibleWorldRect()

    // Determine grid step interval dynamically based on screen pixel density
    const targetScreenStep = 100
    const rawWorldStep = targetScreenStep / zoom
    const step = this.getNiceStep(rawWorldStep)

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])

    // Vertical grid lines
    const startX = Math.floor(visibleWorld.x / step) * step
    const endX = Math.ceil((visibleWorld.x + visibleWorld.width) / step) * step

    for (let wx = startX; wx <= endX; wx += step) {
      const p = viewport.worldToScreen(wx, 0)
      ctx.beginPath()
      ctx.moveTo(p.x, 0)
      ctx.lineTo(p.x, screenH)
      ctx.stroke()

      if (this.showDegreeLabels && p.x >= 10 && p.x <= screenW - 10) {
        // Lunar Longitude approximation (100,000 px = 360 deg)
        const lonDeg = (wx - 50000) * 0.0036
        ctx.fillStyle = 'rgba(56, 189, 248, 0.5)'
        ctx.font = '9px "JetBrains Mono", monospace'
        ctx.fillText(`${lonDeg.toFixed(1)}°`, p.x + 4, 18)
      }
    }

    // Horizontal grid lines
    const startY = Math.floor(visibleWorld.y / step) * step
    const endY = Math.ceil((visibleWorld.y + visibleWorld.height) / step) * step

    for (let wy = startY; wy <= endY; wy += step) {
      const p = viewport.worldToScreen(0, wy)
      ctx.beginPath()
      ctx.moveTo(0, p.y)
      ctx.lineTo(screenW, p.y)
      ctx.stroke()

      if (this.showDegreeLabels && p.y >= 10 && p.y <= screenH - 10) {
        // Lunar Latitude approximation (75,000 px = 180 deg)
        const latDeg = (37500 - wy) * 0.0024
        ctx.fillStyle = 'rgba(56, 189, 248, 0.5)'
        ctx.font = '9px "JetBrains Mono", monospace'
        ctx.fillText(`${latDeg.toFixed(1)}°`, 8, p.y - 4)
      }
    }

    ctx.restore()
  }

  private getNiceStep(rawStep: number): number {
    const exp = Math.floor(Math.log10(rawStep))
    const frac = rawStep / Math.pow(10, exp)
    let niceFrac = 1
    if (frac > 5) niceFrac = 10
    else if (frac > 2) niceFrac = 5
    else if (frac > 1) niceFrac = 2
    return niceFrac * Math.pow(10, exp)
  }
}

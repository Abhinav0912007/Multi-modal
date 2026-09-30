import { OverlayLayer } from './OverlayLayer'
import type { ViewportManager } from '../ViewportManager'
import type { RoiBox, ScreenPoint } from '../types'

export class RoiLayer extends OverlayLayer {
  private rois: RoiBox[] = []
  private activeRoiId: string | null = null
  private pulsePhase: number = 0

  constructor(id: string = 'roi_layer', zIndex: number = 30) {
    super(id, zIndex)
  }

  public setActiveRoiId(id: string | null) {
    this.activeRoiId = id
  }

  public getActiveRoiId(): string | null {
    return this.activeRoiId
  }

  public setRois(rois: RoiBox[]) {
    this.rois = [...rois]
  }

  public addRoi(roi: RoiBox) {
    this.rois.push(roi)
  }

  public clearRois() {
    this.rois = []
  }

  public render(ctx: CanvasRenderingContext2D, viewport: ViewportManager): void {
    if (!this.visible || this.opacity <= 0 || this.rois.length === 0) return

    this.pulsePhase += 0.04
    ctx.save()
    ctx.globalAlpha = this.opacity
    ctx.globalCompositeOperation = this.blendMode

    for (const roi of this.rois) {
      const p0 = viewport.worldToScreen(roi.x, roi.y)
      const p1 = viewport.worldToScreen(roi.x + roi.width, roi.y + roi.height)

      const rx = Math.min(p0.x, p1.x)
      const ry = Math.min(p0.y, p1.y)
      const rw = Math.abs(p1.x - p0.x)
      const rh = Math.abs(p1.y - p0.y)

      const color = roi.color || '#38bdf8'

      // Semi-transparent glowing fill
      const pulseAlpha = 0.10 + Math.sin(this.pulsePhase) * 0.03
      ctx.fillStyle = `rgba(56, 189, 248, ${pulseAlpha})`
      ctx.fillRect(rx, ry, rw, rh)

      // Animated neon dashed border
      ctx.strokeStyle = color
      ctx.lineWidth = 1.8
      ctx.setLineDash([6, 4])
      ctx.lineDashOffset = -this.pulsePhase * 6
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.setLineDash([])

      // Center crosshair
      const cx = rx + rw / 2
      const cy = ry + rh / 2
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(cx - 8, cy)
      ctx.lineTo(cx + 8, cy)
      ctx.moveTo(cx, cy - 8)
      ctx.lineTo(cx, cy + 8)
      ctx.stroke()

      // Corner brackets
      this.drawCornerBrackets(ctx, rx, ry, rw, rh, 12, '#f59e0b')

      // Corner handles
      this.drawHandles(ctx, rx, ry, rw, rh, color)

      // Header Tag
      const labelText = roi.label || `ROI: ${Math.round(roi.width)} × ${Math.round(roi.height)} px`
      ctx.font = '10px "JetBrains Mono", monospace'
      const tagW = ctx.measureText(labelText).width + 12

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.rect(rx + rw / 2 - tagW / 2, ry - 20, tagW, 16)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = color
      ctx.fillText(labelText, rx + rw / 2 - tagW / 2 + 6, ry - 8)
    }

    ctx.restore()
  }

  private drawHandles(ctx: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number, color: string) {
    const points: ScreenPoint[] = [
      { x: rx, y: ry },
      { x: rx + rw / 2, y: ry },
      { x: rx + rw, y: ry },
      { x: rx + rw, y: ry + rh / 2 },
      { x: rx + rw, y: ry + rh },
      { x: rx + rw / 2, y: ry + rh },
      { x: rx, y: ry + rh },
      { x: rx, y: ry + rh / 2 },
    ]

    for (const p of points) {
      ctx.fillStyle = color
      ctx.strokeStyle = '#020617'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.rect(p.x - 4, p.y - 4, 8, 8)
      ctx.fill()
      ctx.stroke()
    }
  }

  private drawCornerBrackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, size: number, color: string) {
    ctx.strokeStyle = color
    ctx.lineWidth = 2

    // Top-left
    ctx.beginPath()
    ctx.moveTo(x, y + size)
    ctx.lineTo(x, y)
    ctx.lineTo(x + size, y)
    ctx.stroke()

    // Top-right
    ctx.beginPath()
    ctx.moveTo(x + w - size, y)
    ctx.lineTo(x + w, y)
    ctx.lineTo(x + w, y + size)
    ctx.stroke()

    // Bottom-left
    ctx.beginPath()
    ctx.moveTo(x, y + h - size)
    ctx.lineTo(x, y + h)
    ctx.lineTo(x + size, y + h)
    ctx.stroke()

    // Bottom-right
    ctx.beginPath()
    ctx.moveTo(x + w - size, y + h)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x + w, y + h - size)
    ctx.stroke()
  }
}

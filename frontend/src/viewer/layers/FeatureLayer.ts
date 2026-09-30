import { OverlayLayer } from './OverlayLayer'
import type { ViewportManager } from '../ViewportManager'
import type { FeaturePoint, FeatureMatch } from '../types'

export class FeatureLayer extends OverlayLayer {
  private features: FeaturePoint[] = []
  private matches: FeatureMatch[] = []
  public showKeypoints: boolean = true
  public showMatches: boolean = true
  public showOrientations: boolean = true
  public filterInliersOnly: boolean = false

  constructor(id: string = 'feature_layer', zIndex: number = 40) {
    super(id, zIndex)
  }

  public setFeatures(features: FeaturePoint[]) {
    this.features = [...features]
  }

  public setMatches(matches: FeatureMatch[]) {
    this.matches = [...matches]
  }

  public clear() {
    this.features = []
    this.matches = []
  }

  public render(ctx: CanvasRenderingContext2D, viewport: ViewportManager): void {
    if (!this.visible || this.opacity <= 0) return

    ctx.save()
    ctx.globalAlpha = this.opacity
    ctx.globalCompositeOperation = this.blendMode

    // 1. Render Matched Feature Lines
    if (this.showMatches) {
      for (const m of this.matches) {
        if (this.filterInliersOnly && !m.inlier) continue

        const pSrc = viewport.worldToScreen(m.src.x, m.src.y)
        const pRef = viewport.worldToScreen(m.ref.x, m.ref.y)

        ctx.strokeStyle = m.inlier ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.45)'
        ctx.lineWidth = m.inlier ? 1.5 : 1
        ctx.beginPath()
        ctx.moveTo(pSrc.x, pSrc.y)
        ctx.lineTo(pRef.x, pRef.y)
        ctx.stroke()
      }
    }

    // 2. Render Keypoints
    if (this.showKeypoints) {
      for (const f of this.features) {
        const p = viewport.worldToScreen(f.x, f.y)
        const scale = Math.max(3, (f.scale || 4) * viewport.getZoom() * 0.4)

        // Circle marker
        ctx.fillStyle = f.isRef ? '#f59e0b' : '#38bdf8'
        ctx.strokeStyle = '#020617'
        ctx.lineWidth = 1.5

        ctx.beginPath()
        ctx.arc(p.x, p.y, scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Orientation vector
        if (this.showOrientations && f.orientation !== undefined) {
          const rad = (f.orientation * Math.PI) / 180
          const armLen = scale * 1.8
          ctx.strokeStyle = f.isRef ? '#fef08a' : '#e0f2fe'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x + Math.cos(rad) * armLen, p.y + Math.sin(rad) * armLen)
          ctx.stroke()
        }
      }
    }

    ctx.restore()
  }
}

import { Layer } from './Layer'
import type { TileSource } from '../sources/TileSource'
import type { ViewportManager } from '../ViewportManager'
import type { RasterMetadata, TileCoord } from '../types'

export class ImageLayer extends Layer {
  private source: TileSource
  private metadata: RasterMetadata | null = null
  private onTileLoadedCallback?: () => void

  constructor(id: string, source: TileSource, zIndex: number = 0, onTileLoaded?: () => void) {
    super(id, zIndex)
    this.source = source
    this.onTileLoadedCallback = onTileLoaded

    this.source.getMetadata().then(meta => {
      this.metadata = meta
      if (this.onTileLoadedCallback) this.onTileLoadedCallback()
    })
  }

  public getSource(): TileSource {
    return this.source
  }

  public getMetadata(): RasterMetadata | null {
    return this.metadata
  }

  public render(ctx: CanvasRenderingContext2D, viewport: ViewportManager): void {
    if (!this.visible || !this.metadata || this.opacity <= 0) return

    ctx.save()
    ctx.globalAlpha = this.opacity

    const zoom = viewport.getZoom()
    const tileSize = this.metadata.tileSize
    const maxLevel = this.metadata.maxLevel

    // Compute optimal pyramid level Z based on zoom factor
    // Level maxLevel is 1 world unit = 1 pixel
    // When zoom is small, we need a lower level Z
    const idealLevel = Math.round(maxLevel + Math.log2(zoom))
    const z = Math.max(this.metadata.minLevel, Math.min(maxLevel, idealLevel))

    const scaleFactor = Math.pow(2, maxLevel - z)
    const tileWorldW = tileSize * scaleFactor
    const tileWorldH = tileSize * scaleFactor

    const visibleWorld = viewport.getVisibleWorldRect()

    // Bounding grid range of visible tiles
    const minTileX = Math.max(0, Math.floor(visibleWorld.x / tileWorldW))
    const maxTileX = Math.min(
      Math.ceil(this.metadata.width / tileWorldW) - 1,
      Math.floor((visibleWorld.x + visibleWorld.width) / tileWorldW)
    )

    const minTileY = Math.max(0, Math.floor(visibleWorld.y / tileWorldH))
    const maxTileY = Math.min(
      Math.ceil(this.metadata.height / tileWorldH) - 1,
      Math.floor((visibleWorld.y + visibleWorld.height) / tileWorldH)
    )

    const visibleKeys = new Set<string>()

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const coord: TileCoord = { z, x: tx, y: ty }
        const key = `${z}/${tx}/${ty}`
        visibleKeys.add(key)

        const tileWorldX = tx * tileWorldW
        const tileWorldY = ty * tileWorldH

        const p0 = viewport.worldToScreen(tileWorldX, tileWorldY)
        const p1 = viewport.worldToScreen(tileWorldX + tileWorldW, tileWorldY + tileWorldH)
        const screenW = p1.x - p0.x
        const screenH = p1.y - p0.y

        const cached = this.source.getCachedTile(coord)

        if (cached && cached.state === 'loaded') {
          // Draw tile directly
          ctx.drawImage(cached.image, p0.x, p0.y, screenW, screenH)
        } else {
          // Progressive fallback: search for loaded ancestor
          const ancestor = this.source.findLoadedAncestor(coord)
          if (ancestor) {
            const { sx, sy, sw, sh } = ancestor.subRect
            ctx.drawImage(ancestor.tile.image, sx, sy, sw, sh, p0.x, p0.y, screenW, screenH)
          }

          // Trigger asynchronous tile loading
          if (!cached || cached.state === 'error') {
            this.source.loadTile(coord)
              .then(() => {
                if (this.onTileLoadedCallback) this.onTileLoadedCallback()
              })
              .catch(() => {})
          }
        }
      }
    }

    // Cancel requests outside visible bounds
    this.source.cancelOutOfFrustumRequests(visibleKeys)

    ctx.restore()
  }

  public destroy(): void {
    this.source.destroy()
  }
}

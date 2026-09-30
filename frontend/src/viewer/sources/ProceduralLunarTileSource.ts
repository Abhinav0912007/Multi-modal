import { TileSource } from './TileSource'
import type { RasterMetadata, TileCoord, WorldRect } from '../types'

export class ProceduralLunarTileSource extends TileSource {
  public readonly id: string
  private metadata: RasterMetadata
  private isSourceStrip: boolean

  constructor(id: string = 'lro_wac_mosaic', isSourceStrip: boolean = false) {
    super()
    this.id = id
    this.isSourceStrip = isSourceStrip

    const width = isSourceStrip ? 4000 : 100000
    const height = isSourceStrip ? 52000 : 75000
    const tileSize = 512

    // Compute maxLevel: 2^maxLevel * tileSize >= max(width, height)
    const maxDim = Math.max(width, height)
    const maxLevel = Math.max(1, Math.ceil(Math.log2(maxDim / tileSize)))

    this.metadata = {
      id,
      name: isSourceStrip ? 'Chandrayaan-1 TMC Nadir Strip' : 'LRO WAC Global Morphologic Basemap',
      width,
      height,
      tileSize,
      minLevel: 0,
      maxLevel,
      gsd: isSourceStrip ? 5.0 : 100.0,
      projection: 'IAU2000:30100 (Moon 2000 Equidistant Cylindrical)',
      bands: 1,
      dtype: 'uint8',
      bounds: {
        latMin: -90,
        latMax: 90,
        lonMin: -180,
        lonMax: 180,
      }
    }
  }

  public async getMetadata(): Promise<RasterMetadata> {
    return { ...this.metadata }
  }

  public async getTile(coord: TileCoord, signal?: AbortSignal): Promise<HTMLCanvasElement> {
    // Artificial small microtask to allow UI breathing / asynchronous scheduling
    if (signal?.aborted) {
      throw new DOMException('Tile request aborted', 'AbortError')
    }

    const tileSize = this.metadata.tileSize
    const canvas = document.createElement('canvas')
    canvas.width = tileSize
    canvas.height = tileSize
    const ctx = canvas.getContext('2d')!

    // Determine world coordinates of this tile
    const scaleFactor = Math.pow(2, this.metadata.maxLevel - coord.z)
    const tileWorldW = tileSize * scaleFactor
    const tileWorldH = tileSize * scaleFactor
    const worldX0 = coord.x * tileWorldW
    const worldY0 = coord.y * tileWorldH

    // Base background shading
    ctx.fillStyle = this.isSourceStrip ? '#111827' : '#0a0f1d'
    ctx.fillRect(0, 0, tileSize, tileSize)

    // Albedo gradient across world space
    const normX = (worldX0 + tileWorldW / 2) / this.metadata.width
    const normY = (worldY0 + tileWorldH / 2) / this.metadata.height

    const baseAlbedo = 100 + Math.sin(normX * 12) * 20 + Math.cos(normY * 10) * 25
    ctx.fillStyle = `rgb(${Math.round(baseAlbedo * 0.9)}, ${Math.round(baseAlbedo)}, ${Math.round(baseAlbedo * 1.1)})`
    ctx.fillRect(0, 0, tileSize, tileSize)

    // Render multi-scale craters intersecting this tile
    this.renderCratersForTile(ctx, coord, worldX0, worldY0, tileWorldW, tileWorldH, tileSize)

    // Render subtle tile boundary debug / coordinates on high zoom if desired
    if (coord.z >= 6) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)'
      ctx.strokeRect(0, 0, tileSize, tileSize)
    }

    return canvas
  }

  private renderCratersForTile(
    ctx: CanvasRenderingContext2D,
    coord: TileCoord,
    tileX0: number,
    tileY0: number,
    tileWorldW: number,
    tileWorldH: number,
    tileSize: number
  ) {
    // List of major and synthetic regional craters
    const majorCraters = [
      { x: 0.25 * this.metadata.width, y: 0.35 * this.metadata.height, r: 0.08 * this.metadata.width, name: 'Apollo 11 Basin' },
      { x: 0.65 * this.metadata.width, y: 0.65 * this.metadata.height, r: 0.10 * this.metadata.width, name: 'Tycho Crater' },
      { x: 0.40 * this.metadata.width, y: 0.75 * this.metadata.height, r: 0.06 * this.metadata.width, name: 'Clavius' },
      { x: 0.75 * this.metadata.width, y: 0.25 * this.metadata.height, r: 0.07 * this.metadata.width, name: 'Copernicus' },
      { x: 0.15 * this.metadata.width, y: 0.55 * this.metadata.height, r: 0.05 * this.metadata.width, name: 'Ptolemaeus' },
      { x: 0.50 * this.metadata.width, y: 0.20 * this.metadata.height, r: 0.06 * this.metadata.width, name: 'Sinus Iridum' },
      { x: 0.85 * this.metadata.width, y: 0.80 * this.metadata.height, r: 0.12 * this.metadata.width, name: 'South Pole-Aitken' },
    ]

    // Render major craters if intersecting
    for (const c of majorCraters) {
      if (
        c.x + c.r >= tileX0 &&
        c.x - c.r <= tileX0 + tileWorldW &&
        c.y + c.r >= tileY0 &&
        c.y - c.r <= tileY0 + tileWorldH
      ) {
        const screenCX = ((c.x - tileX0) / tileWorldW) * tileSize
        const screenCY = ((c.y - tileY0) / tileWorldH) * tileSize
        const screenCR = (c.r / tileWorldW) * tileSize

        this.drawCrater(ctx, screenCX, screenCY, screenCR)
      }
    }

    // Micro-craters unique to this tile grid cell
    const seed = Math.abs(coord.x * 73856093 ^ coord.y * 19349663 ^ coord.z * 83492791)
    const numMicro = 4 + (seed % 6)

    for (let i = 0; i < numMicro; i++) {
      const pseudoX = ((seed * (i + 1) * 31) % 1000) / 1000
      const pseudoY = ((seed * (i + 1) * 47) % 1000) / 1000
      const pseudoR = 0.04 + (((seed * (i + 1) * 13) % 100) / 100) * 0.12

      const cx = pseudoX * tileSize
      const cy = pseudoY * tileSize
      const cr = pseudoR * tileSize

      this.drawCrater(ctx, cx, cy, cr)
    }
  }

  private drawCrater(ctx: CanvasRenderingContext2D, cx: number, cy: number, cr: number) {
    if (cr < 1) return

    // Crater depth shadow gradient
    const grad = ctx.createRadialGradient(cx - cr * 0.25, cy - cr * 0.25, cr * 0.1, cx, cy, cr)
    grad.addColorStop(0, '#040711')
    grad.addColorStop(0.65, '#0e1526')
    grad.addColorStop(0.85, '#475569')
    grad.addColorStop(1, '#94a3b8')

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, cr, 0, Math.PI * 2)
    ctx.fill()

    // Sunlit rim (Sun illumination from top-left ~315°)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.lineWidth = Math.max(1, cr * 0.08)
    ctx.beginPath()
    ctx.arc(cx, cy, cr, Math.PI * 0.75, Math.PI * 1.8)
    ctx.stroke()

    // Shadowed rim
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.7)'
    ctx.lineWidth = Math.max(1, cr * 0.08)
    ctx.beginPath()
    ctx.arc(cx, cy, cr, Math.PI * 1.8, Math.PI * 0.75)
    ctx.stroke()

    // Central peak for large impact structures
    if (cr > 30) {
      ctx.fillStyle = '#cbd5e1'
      ctx.beginPath()
      ctx.arc(cx - cr * 0.05, cy - cr * 0.05, cr * 0.14, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  public async getRegion(
    bbox: WorldRect,
    targetWidth: number,
    targetHeight: number
  ): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, targetWidth, targetHeight)

    // Render region preview
    const normX = bbox.x / this.metadata.width
    const normY = bbox.y / this.metadata.height

    ctx.fillStyle = `rgb(${Math.round(120 + Math.sin(normX * 10) * 30)}, ${Math.round(120 + Math.cos(normY * 10) * 30)}, 140)`
    ctx.fillRect(0, 0, targetWidth, targetHeight)

    // Draw central crater feature
    const cx = targetWidth / 2
    const cy = targetHeight / 2
    const cr = Math.min(targetWidth, targetHeight) * 0.35
    this.drawCrater(ctx, cx, cy, cr)

    return canvas
  }
}

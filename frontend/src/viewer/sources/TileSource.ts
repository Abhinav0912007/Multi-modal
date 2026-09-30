import { RasterSource } from './RasterSource'
import type { RasterMetadata, TileCoord, TileItem, WorldRect } from '../types'

export abstract class TileSource extends RasterSource {
  protected cache: Map<string, TileItem> = new Map()
  protected maxCacheSize: number = 128
  protected pendingRequests: Map<string, AbortController> = new Map()

  public static tileKey(coord: TileCoord): string {
    return `${coord.z}/${coord.x}/${coord.y}`
  }

  public getCachedTile(coord: TileCoord): TileItem | undefined {
    const key = TileSource.tileKey(coord)
    const item = this.cache.get(key)
    if (item) {
      item.lastUsed = Date.now()
    }
    return item
  }

  /**
   * Finds the closest available ancestor tile in the cache for progressive rendering.
   */
  public findLoadedAncestor(coord: TileCoord): { tile: TileItem; subRect: { sx: number; sy: number; sw: number; sh: number } } | null {
    let currentZ = coord.z - 1
    let curX = Math.floor(coord.x / 2)
    let curY = Math.floor(coord.y / 2)
    let factor = 2

    while (currentZ >= 0) {
      const key = `${currentZ}/${curX}/${curY}`
      const ancestor = this.cache.get(key)
      if (ancestor && ancestor.state === 'loaded') {
        const tileSize = ancestor.image.width || 256
        const subTileSize = tileSize / factor
        const offsetX = (coord.x % factor) * subTileSize
        const offsetY = (coord.y % factor) * subTileSize
        return {
          tile: ancestor,
          subRect: {
            sx: offsetX,
            sy: offsetY,
            sw: subTileSize,
            sh: subTileSize,
          }
        }
      }
      currentZ--
      curX = Math.floor(curX / 2)
      curY = Math.floor(curY / 2)
      factor *= 2
    }
    return null
  }

  /**
   * Loads a tile with LRU caching and abort management.
   */
  public async loadTile(coord: TileCoord): Promise<TileItem> {
    const key = TileSource.tileKey(coord)
    const existing = this.cache.get(key)
    if (existing && existing.state === 'loaded') {
      existing.lastUsed = Date.now()
      return existing
    }

    // Cancel previous inflight request if any
    const prevCtrl = this.pendingRequests.get(key)
    if (prevCtrl) {
      prevCtrl.abort()
    }

    const abortCtrl = new AbortController()
    this.pendingRequests.set(key, abortCtrl)

    const placeholder: TileItem = {
      coord,
      key,
      image: document.createElement('canvas'),
      state: 'loading',
      lastUsed: Date.now(),
    }
    this.cache.set(key, placeholder)

    try {
      const tileImage = await this.getTile(coord, abortCtrl.signal)
      placeholder.image = tileImage
      placeholder.state = 'loaded'
      placeholder.lastUsed = Date.now()
      this.evictCacheIfNeeded()
      return placeholder
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.cache.delete(key)
      } else {
        placeholder.state = 'error'
      }
      throw err
    } finally {
      this.pendingRequests.delete(key)
    }
  }

  /**
   * Cancel pending tile requests that are outside the visible world region.
   */
  public cancelOutOfFrustumRequests(visibleCoords: Set<string>) {
    for (const [key, ctrl] of this.pendingRequests.entries()) {
      if (!visibleCoords.has(key)) {
        ctrl.abort()
        this.pendingRequests.delete(key)
        this.cache.delete(key)
      }
    }
  }

  protected evictCacheIfNeeded() {
    if (this.cache.size <= this.maxCacheSize) return

    // Evict least-recently used loaded tiles
    const entries = Array.from(this.cache.entries())
      .filter(([_, item]) => item.state === 'loaded')
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)

    const toRemove = this.cache.size - this.maxCacheSize
    for (let i = 0; i < Math.min(toRemove, entries.length); i++) {
      this.cache.delete(entries[i][0])
    }
  }

  public destroy() {
    for (const ctrl of this.pendingRequests.values()) {
      ctrl.abort()
    }
    this.pendingRequests.clear()
    this.cache.clear()
  }

  public abstract getMetadata(): Promise<RasterMetadata>
  public abstract getRegion(bbox: WorldRect, targetWidth: number, targetHeight: number, signal?: AbortSignal): Promise<HTMLCanvasElement | ImageBitmap>
}

import type { RasterMetadata, TileCoord, WorldRect } from '../types'

export abstract class RasterSource {
  public abstract readonly id: string

  /**
   * Returns raster metadata including dimensions, tile size, bounds, and GSD.
   */
  public abstract getMetadata(): Promise<RasterMetadata>

  /**
   * Fetches or generates a specific tile at pyramid level z and tile coords (x, y).
   * Implementations should return an ImageBitmap or HTMLCanvasElement.
   */
  public abstract getTile(coord: TileCoord, signal?: AbortSignal): Promise<HTMLCanvasElement | ImageBitmap>

  /**
   * Extracts an arbitrary sub-region scaled to target dimensions.
   */
  public abstract getRegion(
    bbox: WorldRect,
    targetWidth: number,
    targetHeight: number,
    signal?: AbortSignal
  ): Promise<HTMLCanvasElement | ImageBitmap>

  /**
   * Clean up resources, caches, and pending network requests.
   */
  public abstract destroy(): void
}

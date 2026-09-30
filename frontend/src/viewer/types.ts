export interface WorldPoint {
  x: number
  y: number
}

export interface ScreenPoint {
  x: number
  y: number
}

export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TileCoord {
  z: number // Level of detail (0 is lowest resolution overview, higher = zoomed in)
  x: number // Column index in tile grid
  y: number // Row index in tile grid
}

export interface RasterMetadata {
  id: string
  name: string
  width: number
  height: number
  tileSize: number
  minLevel: number
  maxLevel: number
  gsd: number // Ground sampling distance in meters/pixel
  projection: string
  bands?: number
  dtype?: string
  nodata?: number
  bounds?: {
    latMin: number
    latMax: number
    lonMin: number
    lonMax: number
  }
}

export interface TileItem {
  coord: TileCoord
  key: string
  image: HTMLCanvasElement | ImageBitmap | HTMLImageElement
  state: 'loading' | 'loaded' | 'error'
  lastUsed: number
}

export interface FeaturePoint {
  id: string
  x: number
  y: number
  scale?: number
  orientation?: number
  response?: number
  isRef?: boolean
  label?: string
}

export interface FeatureMatch {
  id: string
  src: FeaturePoint
  ref: FeaturePoint
  residual?: number
  inlier: boolean
}

export interface RoiBox {
  x: number
  y: number
  width: number
  height: number
  label?: string
  color?: string
}

export type ComparisonMode = 'none' | 'split' | 'difference' | 'overlay'

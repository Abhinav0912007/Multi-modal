import type { WorldPoint, ScreenPoint, WorldRect, ScreenRect } from './types'

export class ViewportManager {
  private panX: number = 0
  private panY: number = 0
  private zoom: number = 1.0
  private minZoom: number = 0.0001
  private maxZoom: number = 50.0
  private screenWidth: number = 800
  private screenHeight: number = 600

  private listeners: (() => void)[] = []

  constructor(width: number, height: number) {
    this.screenWidth = width
    this.screenHeight = height
  }

  public setScreenDimensions(width: number, height: number) {
    if (this.screenWidth !== width || this.screenHeight !== height) {
      this.screenWidth = width
      this.screenHeight = height
      this.notify()
    }
  }

  public getScreenDimensions(): { width: number; height: number } {
    return { width: this.screenWidth, height: this.screenHeight }
  }

  public getZoom(): number {
    return this.zoom
  }

  public getPan(): { x: number; y: number } {
    return { x: this.panX, y: this.panY }
  }

  public setPan(x: number, y: number) {
    this.panX = x
    this.panY = y
    this.notify()
  }

  public panBy(dx: number, dy: number) {
    this.panX += dx
    this.panY += dy
    this.notify()
  }

  public setZoom(newZoom: number, anchorScreenX?: number, anchorScreenY?: number) {
    const clampedZoom = Math.min(this.maxZoom, Math.max(this.minZoom, newZoom))
    if (clampedZoom === this.zoom) return

    const ax = anchorScreenX ?? this.screenWidth / 2
    const ay = anchorScreenY ?? this.screenHeight / 2

    // Maintain anchor world coordinate fixed under cursor
    const worldAnchor = this.screenToWorld(ax, ay)
    this.zoom = clampedZoom
    this.panX = ax - worldAnchor.x * this.zoom
    this.panY = ay - worldAnchor.y * this.zoom

    this.notify()
  }

  public zoomBy(factor: number, anchorScreenX?: number, anchorScreenY?: number) {
    this.setZoom(this.zoom * factor, anchorScreenX, anchorScreenY)
  }

  public fitBounds(bounds: WorldRect, padding: number = 40) {
    const availW = Math.max(10, this.screenWidth - padding * 2)
    const availH = Math.max(10, this.screenHeight - padding * 2)

    const scaleX = availW / bounds.width
    const scaleY = availH / bounds.height
    this.zoom = Math.min(scaleX, scaleY)

    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2

    this.panX = this.screenWidth / 2 - centerX * this.zoom
    this.panY = this.screenHeight / 2 - centerY * this.zoom

    this.notify()
  }

  public screenToWorld(sx: number, sy: number): WorldPoint {
    return {
      x: (sx - this.panX) / this.zoom,
      y: (sy - this.panY) / this.zoom,
    }
  }

  public worldToScreen(wx: number, wy: number): ScreenPoint {
    return {
      x: wx * this.zoom + this.panX,
      y: wy * this.zoom + this.panY,
    }
  }

  public worldRectToScreen(rect: WorldRect): ScreenRect {
    const p = this.worldToScreen(rect.x, rect.y)
    return {
      x: p.x,
      y: p.y,
      width: rect.width * this.zoom,
      height: rect.height * this.zoom,
    }
  }

  public getVisibleWorldRect(): WorldRect {
    const topLeft = this.screenToWorld(0, 0)
    const bottomRight = this.screenToWorld(this.screenWidth, this.screenHeight)
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    }
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

import type { ViewportManager } from '../ViewportManager'

export abstract class Layer {
  public readonly id: string
  public visible: boolean = true
  public opacity: number = 1.0
  public zIndex: number = 0

  constructor(id: string, zIndex: number = 0) {
    this.id = id
    this.zIndex = zIndex
  }

  public setVisible(visible: boolean) {
    this.visible = visible
  }

  public setOpacity(opacity: number) {
    this.opacity = Math.max(0, Math.min(1, opacity))
  }

  public abstract render(ctx: CanvasRenderingContext2D, viewport: ViewportManager): void

  public destroy(): void {}
}

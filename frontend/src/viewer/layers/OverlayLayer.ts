import { Layer } from './Layer'

export abstract class OverlayLayer extends Layer {
  public blendMode: GlobalCompositeOperation = 'source-over'

  public setBlendMode(mode: GlobalCompositeOperation) {
    this.blendMode = mode
  }
}

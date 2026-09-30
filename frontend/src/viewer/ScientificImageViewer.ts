import { ViewportManager } from './ViewportManager'
import type { Layer } from './layers/Layer'
import { GridLayer } from './layers/GridLayer'
import { RoiLayer } from './layers/RoiLayer'
import { FeatureLayer } from './layers/FeatureLayer'
import type { ComparisonMode, WorldRect } from './types'

export class ScientificImageViewer {
  private container: HTMLElement
  private canvasWrap!: HTMLElement
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private topRulerCanvas!: HTMLCanvasElement
  private topRulerCtx!: CanvasRenderingContext2D
  private leftRulerCanvas!: HTMLCanvasElement
  private leftRulerCtx!: CanvasRenderingContext2D

  private viewport: ViewportManager
  private layers: Layer[] = []
  private isDestroyed: boolean = false
  private animFrameId: number | null = null

  // Interaction State
  private isPanning: boolean = false
  private panStartX: number = 0
  private panStartY: number = 0
  private mouseScreenX: number = 0
  private mouseScreenY: number = 0
  private isMouseInside: boolean = false

  // Comparison mode
  private comparisonMode: ComparisonMode = 'none'
  private splitRatio: number = 0.5
  private isDraggingSplitter: boolean = false

  // Built-in Overlay Layers
  public readonly gridLayer: GridLayer
  public readonly roiLayer: RoiLayer
  public readonly featureLayer: FeatureLayer

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'sci-viewer-component'
    parent.appendChild(this.container)

    this.viewport = new ViewportManager(800, 600)

    this.gridLayer = new GridLayer('default_grid', 20)
    this.roiLayer = new RoiLayer('default_roi', 30)
    this.featureLayer = new FeatureLayer('default_features', 40)

    this.addLayer(this.gridLayer)
    this.addLayer(this.roiLayer)
    this.addLayer(this.featureLayer)

    this.buildDom()
    this.initEvents()
    this.startRenderLoop()
  }

  public getViewport(): ViewportManager {
    return this.viewport
  }

  public addLayer(layer: Layer) {
    this.layers.push(layer)
    this.layers.sort((a, b) => a.zIndex - b.zIndex)
    this.requestRender()
  }

  public removeLayer(id: string) {
    const idx = this.layers.findIndex(l => l.id === id)
    if (idx !== -1) {
      this.layers[idx].destroy()
      this.layers.splice(idx, 1)
      this.requestRender()
    }
  }

  public getLayer<T extends Layer>(id: string): T | undefined {
    return this.layers.find(l => l.id === id) as T | undefined
  }

  public setComparisonMode(mode: ComparisonMode, splitRatio: number = 0.5) {
    this.comparisonMode = mode
    this.splitRatio = Math.max(0.05, Math.min(0.95, splitRatio))
    this.requestRender()
  }

  public fitBounds(bounds: WorldRect) {
    this.viewport.fitBounds(bounds)
    this.requestRender()
  }

  public zoomIn() {
    this.viewport.zoomBy(1.3)
    this.requestRender()
  }

  public zoomOut() {
    this.viewport.zoomBy(1 / 1.3)
    this.requestRender()
  }

  public resetView() {
    this.viewport.setPan(0, 0)
    this.viewport.setZoom(0.01)
    this.requestRender()
  }

  private buildDom() {
    this.container.innerHTML = `
      <div class="sci-viewer-stage">
        <!-- TOP-LEFT CORNER RULER ORIGIN -->
        <div class="sci-ruler-corner" title="Planetary IAU2000 Grid">
          <span>px</span>
        </div>

        <!-- TOP SCIENTIFIC COORDINATE RULER -->
        <div class="sci-ruler-top-wrap">
          <canvas id="sci-ruler-top" height="24"></canvas>
        </div>

        <!-- LEFT SCIENTIFIC COORDINATE RULER -->
        <div class="sci-ruler-left-wrap">
          <canvas id="sci-ruler-left" width="40"></canvas>
        </div>

        <!-- MAIN CANVAS VIEWPORT -->
        <div class="sci-canvas-wrap" id="sci-canvas-wrap">
          <canvas id="sci-main-canvas"></canvas>

          <!-- Split Comparison Wipe Slider Handle -->
          <div class="sci-split-handle" id="sci-split-handle" style="display:none;">
            <div class="split-line"></div>
            <div class="split-thumb">⇄</div>
          </div>

          <!-- FLOATING READOUT HUD (BOTTOM-LEFT) -->
          <div class="sci-telemetry-hud bottom-left">
            <div class="hud-item"><span class="k">PIXEL:</span> <span id="sci-hud-pixel" class="v">—</span></div>
            <div class="hud-item"><span class="k">LUNAR:</span> <span id="sci-hud-geo" class="v text-cyan">—</span></div>
          </div>

          <!-- FLOATING SCALE BAR (BOTTOM-RIGHT) -->
          <div class="sci-telemetry-hud bottom-right">
            <div class="sci-scale-display">
              <div class="sci-scale-line" id="sci-scale-line"></div>
              <div class="sci-scale-text" id="sci-scale-text">10.0 km</div>
            </div>
          </div>
        </div>
      </div>
    `

    this.canvasWrap = this.container.querySelector('#sci-canvas-wrap')!
    this.canvas = this.container.querySelector('#sci-main-canvas')!
    this.ctx = this.canvas.getContext('2d', { alpha: false })!

    this.topRulerCanvas = this.container.querySelector('#sci-ruler-top')!
    this.topRulerCtx = this.topRulerCanvas.getContext('2d')!

    this.leftRulerCanvas = this.container.querySelector('#sci-ruler-left')!
    this.leftRulerCtx = this.leftRulerCanvas.getContext('2d')!

    this.resizeCanvases()
  }

  private resizeCanvases() {
    const rect = this.canvasWrap.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    const w = Math.max(100, Math.floor(rect.width))
    const h = Math.max(100, Math.floor(rect.height))

    this.viewport.setScreenDimensions(w, h)

    this.canvas.width = w * dpr
    this.canvas.height = h * dpr
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.ctx.scale(dpr, dpr)

    this.topRulerCanvas.width = w * dpr
    this.topRulerCanvas.height = 24 * dpr
    this.topRulerCanvas.style.width = `${w}px`
    this.topRulerCanvas.style.height = `24px`
    this.topRulerCtx.scale(dpr, dpr)

    this.leftRulerCanvas.width = 40 * dpr
    this.leftRulerCanvas.height = h * dpr
    this.leftRulerCanvas.style.width = `40px`
    this.leftRulerCanvas.style.height = `${h}px`
    this.leftRulerCtx.scale(dpr, dpr)
  }

  private initEvents() {
    window.addEventListener('resize', () => {
      this.resizeCanvases()
      this.requestRender()
    })

    this.viewport.subscribe(() => {
      this.requestRender()
    })

    // Wheel Zoom
    this.canvasWrap.addEventListener('wheel', (e) => {
      e.preventDefault()
      const rect = this.canvasWrap.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25
      this.viewport.zoomBy(factor, mouseX, mouseY)
    }, { passive: false })

    // Pan & Mouse Movements
    this.canvasWrap.addEventListener('mousedown', (e) => {
      const rect = this.canvasWrap.getBoundingClientRect()
      const mouseX = e.clientX - rect.left

      if (this.comparisonMode === 'split') {
        const splitX = rect.width * this.splitRatio
        if (Math.abs(mouseX - splitX) < 12) {
          this.isDraggingSplitter = true
          return
        }
      }

      this.isPanning = true
      this.panStartX = e.clientX
      this.panStartY = e.clientY
      this.canvasWrap.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvasWrap.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      this.mouseScreenX = mouseX
      this.mouseScreenY = mouseY

      const isInside = mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height
      this.isMouseInside = isInside

      if (this.isDraggingSplitter) {
        this.splitRatio = Math.max(0.05, Math.min(0.95, mouseX / rect.width))
        this.updateSplitterPos()
        this.requestRender()
        return
      }

      if (this.isPanning) {
        const dx = e.clientX - this.panStartX
        const dy = e.clientY - this.panStartY
        this.panStartX = e.clientX
        this.panStartY = e.clientY
        this.viewport.panBy(dx, dy)
        return
      }

      if (isInside) {
        this.updateTelemetry(mouseX, mouseY)
        this.requestRender()
      }
    })

    window.addEventListener('mouseup', () => {
      if (this.isPanning || this.isDraggingSplitter) {
        this.isPanning = false
        this.isDraggingSplitter = false
        this.canvasWrap.style.cursor = 'grab'
      }
    })
  }

  private updateSplitterPos() {
    const handle = this.container.querySelector<HTMLElement>('#sci-split-handle')
    if (!handle) return

    if (this.comparisonMode === 'split') {
      handle.style.display = 'block'
      handle.style.left = `${this.splitRatio * 100}%`
    } else {
      handle.style.display = 'none'
    }
  }

  private updateTelemetry(sx: number, sy: number) {
    const world = this.viewport.screenToWorld(sx, sy)
    const pxEl = this.container.querySelector('#sci-hud-pixel')
    const geoEl = this.container.querySelector('#sci-hud-geo')
    const scaleLine = this.container.querySelector<HTMLElement>('#sci-scale-line')
    const scaleText = this.container.querySelector('#sci-scale-text')

    if (pxEl) {
      pxEl.textContent = `X: ${Math.round(world.x).toLocaleString()} | Y: ${Math.round(world.y).toLocaleString()}`
    }

    if (geoEl) {
      const latDeg = (37500 - world.y) * 0.0024
      const lonDeg = (world.x - 50000) * 0.0036
      const latD = Math.abs(latDeg).toFixed(2)
      const lonD = Math.abs(lonDeg).toFixed(2)
      geoEl.textContent = `Lat: ${latD}° ${latDeg >= 0 ? 'N' : 'S'} | Lon: ${lonD}° ${lonDeg >= 0 ? 'E' : 'W'}`
    }

    // Scale Bar (100 px width)
    const zoom = this.viewport.getZoom()
    const meters = (100 / zoom) * 5.0
    if (scaleText) {
      scaleText.textContent = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
    }
    if (scaleLine) {
      scaleLine.style.width = '100px'
    }
  }

  private needsRender: boolean = false

  private startRenderLoop() {
    this.requestRender()
  }

  public requestRender() {
    if (this.isDestroyed || (this.canvas && this.canvas.offsetParent === null)) return
    if (this.needsRender) return
    this.needsRender = true
    this.animFrameId = requestAnimationFrame(() => {
      this.needsRender = false
      if (this.isDestroyed) return
      this.render()
      this.drawRulers()
      if (this.isPanning || this.isDraggingSplitter) {
        this.requestRender()
      }
    })
  }

  private render() {
    const { width: w, height: h } = this.viewport.getScreenDimensions()
    const ctx = this.ctx

    ctx.fillStyle = '#02050e'
    ctx.fillRect(0, 0, w, h)

    // Render layers
    if (this.comparisonMode === 'split') {
      this.renderSplitComparison(ctx, w, h)
    } else {
      for (const layer of this.layers) {
        if (layer.visible) {
          layer.render(ctx, this.viewport)
        }
      }
    }

    // Render Cursor Reticle
    if (this.isMouseInside) {
      ctx.save()
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(this.mouseScreenX, this.mouseScreenY, 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  private renderSplitComparison(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const splitX = w * this.splitRatio

    // Clip left side for Reference layer
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, splitX, h)
    ctx.clip()

    for (const layer of this.layers) {
      if (layer.visible) {
        layer.render(ctx, this.viewport)
      }
    }
    ctx.restore()

    // Clip right side for overlay/difference
    ctx.save()
    ctx.beginPath()
    ctx.rect(splitX, 0, w - splitX, h)
    ctx.clip()

    // Render secondary layers with tint
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)'
    ctx.fillRect(splitX, 0, w - splitX, h)

    for (const layer of this.layers) {
      if (layer.visible && layer !== this.layers[0]) {
        layer.render(ctx, this.viewport)
      }
    }
    ctx.restore()
  }

  private drawRulers() {
    const { width: screenW, height: screenH } = this.viewport.getScreenDimensions()
    const zoom = this.viewport.getZoom()
    const pan = this.viewport.getPan()

    // Top Ruler
    const topCtx = this.topRulerCtx
    topCtx.fillStyle = '#050c1e'
    topCtx.fillRect(0, 0, screenW, 24)
    topCtx.strokeStyle = 'rgba(56, 189, 248, 0.3)'
    topCtx.beginPath()
    topCtx.moveTo(0, 23.5)
    topCtx.lineTo(screenW, 23.5)
    topCtx.stroke()

    const step = 100 / zoom
    const niceStep = this.gridLayer['getNiceStep'] ? this.gridLayer['getNiceStep'](step) : 1000

    topCtx.font = '9px "JetBrains Mono", monospace'
    topCtx.fillStyle = '#94a3b8'

    const startX = Math.floor(-pan.x / (zoom * niceStep)) * niceStep
    const endX = Math.ceil((screenW - pan.x) / (zoom * niceStep)) * niceStep

    for (let wx = startX; wx <= endX; wx += niceStep) {
      const sx = wx * zoom + pan.x
      topCtx.beginPath()
      topCtx.moveTo(sx, 12)
      topCtx.lineTo(sx, 24)
      topCtx.stroke()
      topCtx.fillText(Math.round(wx).toLocaleString(), sx + 3, 11)
    }

    // Left Ruler
    const leftCtx = this.leftRulerCtx
    leftCtx.fillStyle = '#050c1e'
    leftCtx.fillRect(0, 0, 40, screenH)
    leftCtx.strokeStyle = 'rgba(56, 189, 248, 0.3)'
    leftCtx.beginPath()
    leftCtx.moveTo(39.5, 0)
    leftCtx.lineTo(39.5, screenH)
    leftCtx.stroke()

    leftCtx.font = '8px "JetBrains Mono", monospace'
    leftCtx.fillStyle = '#94a3b8'

    const startY = Math.floor(-pan.y / (zoom * niceStep)) * niceStep
    const endY = Math.ceil((screenH - pan.y) / (zoom * niceStep)) * niceStep

    for (let wy = startY; wy <= endY; wy += niceStep) {
      const sy = wy * zoom + pan.y
      leftCtx.beginPath()
      leftCtx.moveTo(26, sy)
      leftCtx.lineTo(40, sy)
      leftCtx.stroke()
      leftCtx.fillText(Math.round(wy).toLocaleString(), 3, sy - 3)
    }
  }

  public destroy() {
    this.isDestroyed = true
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
    }
    for (const layer of this.layers) {
      layer.destroy()
    }
    this.layers = []
  }
}
